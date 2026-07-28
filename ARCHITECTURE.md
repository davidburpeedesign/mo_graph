# mo_graph — system outline

> A browser-based image processing tool for dithering, noise, diffusion and
> artifacting. Load an image, stack effects non-destructively, export.
> Shell and chrome follow `MORPHXGEN-visual-language.md` exactly.

This document is the architectural plan: what gets built, where every file
lives, and what contract holds it together. No code has been written yet —
this is the map that comes first.

---

## 1. Product shape

A single-page editor with three regions:

- **Canvas** — the live render of the effect stack, pan/zoom, before/after split.
- **Stack** — an ordered list of effect layers. Each has a toggle, opacity,
  blend mode, and optional mask. Reorderable. This is the core interaction.
- **Inspector** — parameter controls for the selected layer, generated
  automatically from that effect's parameter schema.

Plus an export dialog, a preset browser, and a document sidebar for source
image swapping.

Everything runs client-side. No server, no upload, no account. The tool is a
static bundle; images never leave the machine. That constraint is worth
holding onto — it makes the tool trivially deployable and privacy-safe by
construction.

---

## 2. Stack decisions

| Concern | Choice | Why |
|---|---|---|
| Build | Vite + TypeScript | Fast HMR, first-class GLSL and worker imports |
| UI | React 18 | Component model matches the MORPHXGEN design-system inventory already specified |
| State | Zustand + Immer | Small, un-opinionated, easy to snapshot for undo/redo |
| GPU | WebGL2 | Universally available; float render targets via `EXT_color_buffer_float` |
| CPU passes | Web Worker + (later) WASM | Error diffusion is inherently sequential and does not belong on the GPU |
| Shaders | `.glsl` files + `vite-plugin-glsl` | `#include` support so effects share a common GLSL library |
| Persistence | IndexedDB (documents), JSON (presets) | Large image blobs need IDB; presets should be copy-pasteable text |

**WebGPU is deliberately not the initial target.** It buys compute shaders
(useful for pixel sorting and reaction-diffusion) but costs universal support.
The renderer is written behind a backend interface so a WebGPU path can be
added later without touching a single effect definition.

---

## 3. Rendering architecture

### 3.1 The hybrid problem

Most effects here are embarrassingly parallel — ordered dithering, noise,
chroma shift, posterize — and belong in a fragment shader. But **error
diffusion is not**. Floyd–Steinberg propagates quantization error to
not-yet-processed neighbors; pixel N depends on pixel N-1. Faking it on the
GPU produces something that looks wrong to anyone who knows the algorithm.

So the pipeline supports two pass kinds, and the effect declares which it is:

- `gpu` — a fragment shader over a full-screen quad. Default.
- `cpu` — a function over an `ImageData`-shaped buffer, run in a worker.

The scheduler groups consecutive GPU passes into a single ping-pong chain and
only reads back to CPU when a `cpu` pass appears, then re-uploads. A stack of
eight GPU effects costs one readback at export time, not eight.

### 3.2 Pass flow

```
source image
    ↓ decode → RGBA16F linear texture
    ↓
  [layer 1] ─ gpu pass ─┐
  [layer 2] ─ gpu pass ─┤ ping-pong FBO chain (no readback)
  [layer 3] ─ gpu pass ─┘
    ↓ readback
  [layer 4] ─ cpu pass (worker, error diffusion)
    ↓ upload
  [layer 5] ─ gpu pass
    ↓
  compositor (blend each layer result against its input, per layer opacity/mask)
    ↓
  view transform (linear → sRGB, exposure, zoom) → canvas
```

### 3.3 Color space

The working buffer is **linear-light RGBA16F**. This is correct for blurs,
blooms and diffusion, which are physically averaging operations and look wrong
in gamma space.

But quantizing effects are the opposite: dithering and posterizing target
*display* levels, so they must run in sRGB. Each effect therefore declares
`colorSpace: 'linear' | 'srgb'`, and the pass scheduler inserts
decode/encode nodes automatically. Consecutive effects in the same space cost
nothing; the conversion is only emitted at a boundary.

This single field prevents the most common class of bug in tools like this —
a dither pattern that subtly shifts brightness because the quantizer ran
against linear values.

### 3.4 Resolution and export

The canvas renders a **preview-resolution** proxy (capped, e.g. 2048px on the
long edge) for interactive editing. Export re-runs the identical pipeline at
full resolution, tiled if the image exceeds max texture size, with an overlap
margin for effects that sample neighbors.

Effects declare `neighborhood: number` (in pixels, at scale 1) so the tiler
knows how much overlap to allocate. Effects that are resolution-dependent —
halftone cell size, grain size — declare `scaleWithResolution: true` so the
preview matches the export instead of showing a lie.

---

## 4. The effect contract

This is the extensibility seam. Every effect is a self-describing module. The
UI, the serializer, and the scheduler all read from the same manifest — adding
an effect means adding one folder and one registry line, and controls appear
for free.

```ts
// src/effects/types.ts  (sketch)

export interface EffectDefinition<P extends ParamValues = ParamValues> {
  id: string;                  // 'dither.ordered_bayer' — stable, serialized
  name: string;                // 'ordered / bayer' — lowercase, brand voice
  category: EffectCategory;    // 'dither' | 'noise' | 'diffusion' | ...
  description: string;

  params: ParamSchema<P>;      // drives both UI and defaults
  colorSpace: 'linear' | 'srgb';
  neighborhood?: number;       // px of neighbor sampling, for tiling overlap
  scaleWithResolution?: boolean;

  backend:
    | { kind: 'gpu'; fragment: string; uniforms(p: P, ctx: PassContext): UniformMap;
        passes?: number }      // >1 for multi-pass (e.g. separable blur)
    | { kind: 'cpu'; run(src: Float32Array, dst: Float32Array,
                         w: number, h: number, p: P): void };
}
```

Parameter schema entries carry everything the inspector needs: type, range,
step, default, unit, and an optional `dependsOn` for conditional visibility
(e.g. palette size only shows when palette mode is `custom`).

```ts
params: {
  levels:   { type: 'int',    min: 2, max: 32, step: 1, default: 4, label: 'levels' },
  matrix:   { type: 'enum',   options: ['2x2','4x4','8x8','16x16'], default: '8x8' },
  strength: { type: 'float',  min: 0, max: 2, step: 0.01, default: 1, label: 'strength' },
  serpentine: { type: 'bool', default: true, dependsOn: { matrix: '!=2x2' } },
}
```

---

## 5. Folder structure

```
mo_graph/
├── MORPHXGEN-visual-language.md    # brand source of truth (existing)
├── ARCHITECTURE.md                 # this file
├── README.md
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── public/
│   ├── samples/                    # bundled test images
│   └── noise/
│       └── blue-noise-256.png      # precomputed void-and-cluster tile
└── src/
    ├── main.tsx
    ├── app/
    │   ├── App.tsx                 # three-region shell
    │   ├── shortcuts.ts            # keyboard map
    │   └── bootstrap.ts            # engine init, capability probe, error boundary
    │
    ├── engine/                     # rendering core — knows nothing about specific effects
    │   ├── index.ts
    │   ├── Renderer.ts             # top-level: document in, canvas out
    │   ├── gl/
    │   │   ├── context.ts          # WebGL2 acquisition, extension checks
    │   │   ├── capabilities.ts     # float targets, max texture size, precision
    │   │   ├── Program.ts          # compile/link/cache, uniform introspection
    │   │   ├── Framebuffer.ts
    │   │   ├── PingPongTarget.ts   # double-buffered RGBA16F pair
    │   │   ├── textures.ts         # upload, sampler config, LUT helpers
    │   │   └── quad.ts             # the one VAO everything draws with
    │   ├── pipeline/
    │   │   ├── Pipeline.ts         # builds a pass list from the layer stack
    │   │   ├── PassScheduler.ts    # GPU/CPU grouping, colorspace node insertion
    │   │   ├── compositor.ts       # per-layer blend + opacity + mask
    │   │   ├── blendModes.glsl     # normal, screen, lighten, multiply, overlay…
    │   │   └── colorSpace.ts       # linear ⇄ sRGB transfer functions
    │   ├── cpu/
    │   │   ├── CpuPassHost.ts      # dispatch to worker, transferable buffers
    │   │   ├── effect.worker.ts    # worker entry; imports cpu effect fns
    │   │   └── transfer.ts         # Float32 ⇄ texture marshalling
    │   ├── tiling/
    │   │   ├── TileRenderer.ts     # full-res export in overlapping tiles
    │   │   └── bounds.ts
    │   └── sources/
    │       ├── bayer.ts            # generate ordered matrices 2×2…16×16
    │       ├── blueNoise.ts        # load/sample the precomputed tile
    │       └── rng.ts              # deterministic seeded PRNG (repeatable renders)
    │
    ├── effects/                    # ⭐ all effects live here, one folder each
    │   ├── registry.ts             # imports every effect, exports the map
    │   ├── types.ts                # EffectDefinition, ParamSchema, PassContext
    │   ├── defineEffect.ts         # typed identity helper for authoring
    │   ├── shared/
    │   │   ├── lib.glsl            # srgb<->linear, luma, hash, remap
    │   │   ├── sampling.glsl       # texel fetch helpers, wrap modes
    │   │   ├── noise.glsl          # value/perlin/simplex/curl
    │   │   └── palette.ts          # palette definitions + nearest-color search
    │   │
    │   ├── dither/
    │   │   ├── index.ts            # re-exports the category
    │   │   ├── ordered-bayer/      { index.ts, bayer.frag.glsl }
    │   │   ├── blue-noise/         { index.ts, blueNoise.frag.glsl }
    │   │   ├── error-diffusion/    { index.ts, kernels.ts, diffuse.cpu.ts }
    │   │   ├── halftone/           { index.ts, halftone.frag.glsl }
    │   │   ├── threshold/          { index.ts, threshold.frag.glsl }
    │   │   └── ascii/              { index.ts, ascii.frag.glsl, atlas.ts }
    │   │
    │   ├── noise/
    │   │   ├── index.ts
    │   │   ├── film-grain/         { index.ts, grain.frag.glsl }
    │   │   ├── fbm/                { index.ts, fbm.frag.glsl }
    │   │   ├── chroma-noise/       { index.ts, chromaNoise.frag.glsl }
    │   │   └── dust-scratches/     { index.ts, dust.frag.glsl }
    │   │
    │   ├── diffusion/
    │   │   ├── index.ts
    │   │   ├── reaction-diffusion/ { index.ts, grayScott.frag.glsl }   # multi-pass
    │   │   ├── anisotropic/        { index.ts, kuwahara.frag.glsl }
    │   │   ├── curl-advect/        { index.ts, advect.frag.glsl }
    │   │   └── bloom/              { index.ts, downsample.frag.glsl, upsample.frag.glsl }
    │   │
    │   ├── artifact/
    │   │   ├── index.ts
    │   │   ├── block-dct/          { index.ts, dct.frag.glsl }         # jpeg-style
    │   │   ├── chroma-subsample/   { index.ts, subsample.frag.glsl }
    │   │   ├── datamosh/           { index.ts, mosh.frag.glsl }
    │   │   ├── pixel-sort/         { index.ts, sort.cpu.ts }           # CPU
    │   │   ├── rgb-shift/          { index.ts, rgbShift.frag.glsl }
    │   │   ├── scanlines/          { index.ts, scanlines.frag.glsl }
    │   │   └── bit-crush/          { index.ts, bitCrush.frag.glsl }
    │   │
    │   ├── color/
    │   │   ├── index.ts
    │   │   ├── palette-map/        { index.ts, paletteMap.frag.glsl }
    │   │   ├── posterize/          { index.ts, posterize.frag.glsl }
    │   │   ├── levels/             { index.ts, levels.frag.glsl }
    │   │   └── duotone/            { index.ts, duotone.frag.glsl }
    │   │
    │   └── geometry/
    │       ├── index.ts
    │       ├── displace/           { index.ts, displace.frag.glsl }
    │       ├── warp/               { index.ts, warp.frag.glsl }
    │       └── tile-mirror/        { index.ts, tileMirror.frag.glsl }
    │
    ├── state/
    │   ├── document.ts             # source image, canvas size, metadata
    │   ├── stack.ts                # layers: add/remove/reorder/toggle/params
    │   ├── selection.ts
    │   ├── history.ts              # undo/redo over serialized snapshots
    │   ├── viewport.ts             # zoom, pan, before/after split
    │   └── types.ts
    │
    ├── ui/
    │   ├── design-system/          # MORPHXGEN components, per §7 of the brand doc
    │   │   ├── tokens.css          # verbatim from the visual language file
    │   │   ├── Button.tsx  CornerFrame.tsx  Tag.tsx
    │   │   ├── Logo.tsx  Wordmark.tsx
    │   │   ├── NavBar.tsx  ScrollCue.tsx
    │   │   ├── GridRule.tsx  RenderFrame.tsx
    │   │   └── StatusReadout.tsx
    │   ├── canvas/
    │   │   ├── CanvasView.tsx       # the <canvas> + pan/zoom + split handle
    │   │   └── ViewportControls.tsx
    │   ├── stack/
    │   │   ├── LayerStack.tsx       # ordered list, drag to reorder
    │   │   ├── LayerRow.tsx
    │   │   └── AddEffectMenu.tsx    # grouped by category, from the registry
    │   ├── inspector/
    │   │   ├── Inspector.tsx        # renders controls from a ParamSchema
    │   │   └── controls/            { Slider, IntStepper, EnumCells, Toggle,
    │   │                              ColorField, CurveEditor, SeedField }
    │   ├── export/
    │   │   └── ExportDialog.tsx
    │   └── presets/
    │       └── PresetBrowser.tsx
    │
    ├── io/
    │   ├── import.ts               # file/drop/paste → decoded bitmap
    │   ├── export.ts               # full-res render → PNG/WebP/JPEG blob
    │   ├── serialize.ts            # document ⇄ JSON (.mograph)
    │   └── storage.ts              # IndexedDB persistence
    │
    ├── presets/
    │   ├── index.ts
    │   └── *.json                  # shipped starting points
    │
    └── styles/
        ├── reset.css
        └── global.css
```

### Where effects live, in one sentence

`src/effects/<category>/<effect-name>/` — each effect folder holds an
`index.ts` exporting a single `EffectDefinition`, plus its `.frag.glsl` shader
(GPU effects) or `.cpu.ts` implementation (CPU effects). Nothing else in the
codebase needs to know it exists except one import line in
`src/effects/registry.ts`.

---

## 6. Effect catalog

Effect ids follow the brand's file-handle naming: lowercase, underscored,
namespaced by category.

**dither** — `ordered_bayer`, `blue_noise`, `error_diffusion`
(Floyd–Steinberg / Jarvis–Judice–Ninke / Stucki / Atkinson / Sierra, selected
by kernel param, serpentine toggle), `halftone` (dot / line / crosshatch),
`threshold`, `ascii`.

**noise** — `film_grain` (luma-weighted, so it sits in shadows the way real
grain does), `fbm`, `chroma_noise`, `dust_scratches`.

**diffusion** — `reaction_diffusion` (Gray–Scott, iterated multi-pass),
`anisotropic` (Kuwahara), `curl_advect`, `bloom`.

**artifact** — `block_dct` (JPEG-style blocking and ringing),
`chroma_subsample`, `datamosh`, `pixel_sort`, `rgb_shift`, `scanlines`,
`bit_crush`.

**color** — `palette_map` (nearest-color against a palette, including the
MORPHXGEN data scheme), `posterize`, `levels`, `duotone`.

**geometry** — `displace`, `warp`, `tile_mirror`.

`error_diffusion` and `pixel_sort` are the two CPU-backed effects. Everything
else is a fragment shader.

---

## 7. State model

```ts
Document {
  source:  { bitmap, width, height, name }
  layers:  Layer[]            // index 0 = bottom
  canvas:  { width, height, background }
}

Layer {
  id, effectId, enabled, params: ParamValues,
  opacity: number, blend: BlendMode, mask?: MaskRef, seed: number
}
```

Undo/redo stores serialized `Document` snapshots (they are small — no pixel
data, just parameters), with slider drags coalesced into one history entry on
release. The whole document minus the source bitmap serializes to JSON, which
is also the preset format: a preset is a document with the source stripped.

Every stochastic effect takes an explicit `seed`. Renders are deterministic —
the same document produces the same pixels, which matters for export
reproducibility and for meaningful before/after comparison.

---

## 8. UI, per the visual language

The chrome is MORPHXGEN, applied literally: `#222222` void ground, `#e4e3df`
bone ink, coral `#e48484` reserved for the active layer marker and focus
rings, hairline grid rules instead of cards, square corners, corner-tick
brackets framing controls, Intel One Mono throughout, all copy lowercase.

Three details worth calling out:

- The **canvas frame** uses `RenderFrame` with corner ticks — the same motif
  the brand uses for product renders, which is exactly what the working image
  is here.
- Rendering status uses `StatusReadout` in machine-terse register:
  `rendering...`, `8 passes`, `2048×1365`.
- Layer rows use coral only for the selected row's marker. No hover glow, no
  scale-pop — brighten bone toward white per the motion rules, 120ms,
  `cubic-bezier(0.65,0,0.35,1)`.

The `tokens.css` file is a verbatim copy of the CSS blocks in the visual
language document. It is generated from that file, not hand-maintained, so
the brand doc stays the single source of truth.

---

## 9. Export

The export dialog offers format (PNG / WebP / JPEG), scale (1× / 2× / custom),
and an optional "render at source resolution" toggle when the preview is a
downscaled proxy.

Export re-runs the pipeline at target resolution through `TileRenderer`,
which:

1. Computes tile size from `MAX_TEXTURE_SIZE` and available memory.
2. Expands each tile by the maximum `neighborhood` in the stack.
3. Renders tiles sequentially, yielding to the event loop so the UI stays
   responsive and a progress readout can update.
4. Crops the overlap and composites into an `OffscreenCanvas`.
5. Encodes via `convertToBlob`.

CPU passes are the constraint on tiling: error diffusion propagates error
across the *whole* image, so a tiled error-diffusion pass would show seams.
Those passes run whole-image at export, which caps the practical export size
for stacks containing them. The export dialog surfaces that limit rather than
failing silently.

---

## 10. Build order

1. **Engine skeleton** — WebGL2 context, ping-pong targets, one pass-through
   shader on screen. Prove the plumbing with an image on the canvas.
2. **Effect contract + registry** — `defineEffect`, the param schema types, and
   two effects (`ordered_bayer`, `posterize`) to validate the shape.
3. **Auto-generated inspector** — controls rendered from schema. This is the
   payoff moment: every subsequent effect ships with a UI for free.
4. **Layer stack** — ordering, toggle, opacity, blend, the compositor.
5. **Design system pass** — MORPHXGEN tokens and components across the shell.
6. **CPU pass host** — worker, transfer, and `error_diffusion` as the proof.
7. **Effect fill-out** — the remaining catalog, roughly one per session.
8. **Export + tiling.**
9. **Persistence + presets.**

Steps 1–4 are the architecture. Everything after is content and polish against
a contract that no longer changes.

---

## Open questions

- **Masks** are in the layer model but unspecified. Simplest useful version is
  a luminance mask sampled from the layer's input; a paintable mask is a much
  larger surface and probably a later phase.
- **Animation / export to video** is out of scope for v1, but the deterministic
  seed plus a `time` uniform means a frame sequence export is a small addition
  later. Worth not painting into a corner: keep `time` in `PassContext` from
  the start even though nothing reads it yet.
- **WASM for CPU passes** — start with plain TypeScript in the worker, measure,
  and only reach for WASM if error diffusion on a 6000px image is actually too
  slow.
