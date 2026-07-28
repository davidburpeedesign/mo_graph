# mo_graph — architecture

> A lightweight browser tool for dithering, noise, diffusion and artifacting.
> Drop an image, stack a few effects, export. One screen.
> Chrome follows `MORPHXGEN-visual-language.md`.

The target is a single-purpose tool, not an editor. Everything below is sized
to that: **one file per effect, a core small enough to read in a sitting, and
JS as the default way to write an algorithm.**

---

## 1. Scope

**In:** load an image, apply an ordered chain of effects, tune parameters live,
export a PNG. Effects are the product; everything else is plumbing that should
stay out of the way.

**Out, deliberately:** layer blend modes, masks, undo/redo history, document
persistence, tiled export, multi-image projects, a design-system component
library. Each of those is a week of work that makes the dithering no better.

**The one concession to "stacking":** the chain is a flat ordered list, and each
entry has an enable toggle and a single `mix` slider (0–1, blends the effect's
output back toward its input). That covers most of what layer opacity and blend
modes were doing, in one number.

---

## 2. Two backends, JS first

Effects are written in TypeScript against `ImageData` by default. That is the
right medium for this problem: dithering is a per-pixel operation on 8-bit
RGBA, the code reads like the algorithm it implements, and it is debuggable
with a breakpoint instead of a screenshot.

WebGL exists as an **opt-in accelerator for the minority of effects where JS is
genuinely too slow** — not as the pipeline everything is forced through.

### When an effect earns a GL implementation

Write it in JS unless it hits one of these:

- **Iterated.** The effect runs the same kernel tens or hundreds of times per
  frame (reaction-diffusion, curl advection). JS cost scales with iteration
  count and blows the frame budget immediately.
- **Superlinear in radius, with no summed-area trick available.** Naive
  large-radius work is O(radius²) per pixel — but check first, because the
  usual suspects turn out not to qualify. A separable box blur with a running
  sum is O(1) per pixel at *any* radius, and Kuwahara over integral images is
  O(1) per quadrant. Both `bloom` and `anisotropic` were planned as GL for
  this reason and both shipped as JS once the constant-time formulation was
  used. Measured: radius 120 bloom costs the same as radius 2.
- **Measured slow.** It profiles over ~8ms on a 1400px preview. Measure before
  assuming — most of the catalog is nowhere near this.

Everything else stays JS. Ordered dithering, threshold, posterize, palette
mapping, RGB shift, scanlines, grain and bit-crush are all single-pass O(1)
per pixel and run in low single-digit milliseconds at preview resolution.
Moving them to GL would trade readable code for no perceptible gain.

**Error diffusion must stay JS regardless.** Floyd–Steinberg propagates
quantization error to pixels that have not been processed yet — pixel N depends
on pixel N-1. It is sequential by definition, and GPU approximations of it look
wrong to anyone who knows the algorithm.

### What the GL layer costs

One file, `core/gl.ts`: context acquisition, a fullscreen quad, a program
cache, a ping-pong pair of textures, upload and readback. Shaders live as
inline template strings in the effect file that owns them, so there is no GLSL
build plugin and no separate shader directory to keep in sync.

Textures are 8-bit `RGBA/UNSIGNED_BYTE` by default, which needs no extensions
and matches the JS path's precision exactly — the two backends produce
interchangeable results. An effect that genuinely needs more (Gray–Scott
accumulates tiny concentration deltas and posterizes badly at 8-bit) sets
`float: true`, which requests a half-float target and **falls back to the
effect's JS implementation if the extension is missing.** That is the entire
capability story: one flag, one fallback.

### Color space

The pipeline works in 8-bit sRGB throughout, both backends. That is *correct*
for dithering and posterizing, which target display levels, and slightly wrong
for blur-type effects, which physically want linear light. For an aesthetic
tool the difference is not visible enough to justify a float pipeline
everywhere. Revisit only if blurs start looking muddy.

---

## 3. The effect contract

An effect is one file exporting one object: a description of its knobs, plus
either a JS function or a fragment shader.

```ts
// src/core/types.ts

export interface EffectBase {
  id: string;                    // 'ordered_dither' — stable, used in presets/URLs
  name: string;                  // 'ordered dither' — lowercase, brand voice
  category: 'dither' | 'noise' | 'diffusion' | 'artifact' | 'color';
  params: ParamSchema;           // drives the UI and the defaults
}

export interface JsEffect extends EffectBase {
  kind?: 'js';                   // default
  apply(src: ImageData, p: Params, ctx: Ctx): ImageData;
}

export interface GlEffect extends EffectBase {
  kind: 'gl';
  fragment: string;              // inline GLSL template string
  uniforms(p: Params, ctx: Ctx): Record<string, number | number[]>;
  passes?: number;               // >1 for iterated effects (ping-pong)
  float?: boolean;               // request half-float target
  apply?(src: ImageData, p: Params, ctx: Ctx): ImageData;  // fallback path
}

export type Effect = JsEffect | GlEffect;

export type Param =
  | { type: 'float'; min: number; max: number; step: number; default: number; label: string }
  | { type: 'int';   min: number; max: number; default: number; label: string }
  | { type: 'enum';  options: string[]; default: string; label: string }
  | { type: 'bool';  default: boolean; label: string }
  | { type: 'color'; default: string; label: string };

export interface Ctx {
  scale: number;   // preview 0..1 vs export 1 — for size-dependent effects
  seed: number;    // deterministic randomness
}
```

Four consequences worth noticing:

1. **The backend is invisible above the contract.** The chain, the UI, the
   export path and the preset format do not know or care whether an entry is
   JS or GL. Promoting an effect from JS to GL later is a change to one file.
2. **Controls are generated, never written.** The inspector reads `params` and
   renders a slider, stepper, dropdown or toggle. Adding an effect never
   involves touching UI code.
3. **`scale` keeps the preview honest.** Anything measured in pixels — halftone
   cell size, grain size, block size — multiplies by `ctx.scale` so the preview
   is a true representation of the export instead of a lie at a different
   frequency.
4. **`seed` makes renders reproducible.** No `Math.random()` in an effect;
   noise comes from a seeded PRNG (and its GLSL twin) so export matches
   preview.

Adding an effect = write one file, add one line to `registry.ts`.

---

## 4. Folder structure

```
mo_graph/
├── MORPHXGEN-visual-language.md
├── ARCHITECTURE.md
├── index.html
├── package.json
├── vite.config.ts
└── src/
    ├── main.tsx
    ├── App.tsx                  # the one screen: canvas + chain + controls
    │
    ├── core/                    # ~6 files, the whole engine
    │   ├── types.ts             # Effect, Param, ParamSchema, Ctx
    │   ├── registry.ts          # imports every effect → id-keyed map
    │   ├── pipeline.ts          # run(chain, src, ctx); groups GL runs, handles mix
    │   ├── gl.ts                # context, quad, program cache, ping-pong, readback
    │   ├── image.ts             # file → ImageData, downscale for preview, → PNG blob
    │   └── rng.ts               # seeded PRNG (+ matching GLSL hash in glsl.ts)
    │
    ├── effects/                 # ⭐ one file per effect
    │   ├── lib.ts               # shared JS: luma, clamp, bayer matrices, palettes
    │   ├── glsl.ts              # shared GLSL snippets: hash, luma, srgb helpers
    │   │
    │   ├── dither/              # all JS
    │   │   ├── ordered.ts       # bayer 2×2…16×16
    │   │   ├── errorDiffusion.ts# floyd-steinberg / atkinson / stucki / jjn, serpentine
    │   │   ├── blueNoise.ts
    │   │   ├── halftone.ts      # dot / line / crosshatch
    │   │   └── threshold.ts
    │   │
    │   ├── noise/               # all JS
    │   │   ├── grain.ts         # luma-weighted film grain
    │   │   ├── valueNoise.ts    # fbm overlay
    │   │   └── chromaNoise.ts
    │   │
    │   ├── diffusion/
    │   │   ├── bloom.ts               # JS — threshold + running-sum box blur
    │   │   ├── anisotropic.ts         # JS — kuwahara over integral images
    │   │   └── reactionDiffusion.ts   # GL — gray-scott, passes: 40+, float: true
    │   │
    │   ├── artifact/            # JS unless noted
    │   │   ├── blockCrush.ts    # jpeg-style block averaging + ringing
    │   │   ├── rgbShift.ts
    │   │   ├── scanlines.ts
    │   │   ├── pixelSort.ts     # JS — sequential span sorting
    │   │   └── bitCrush.ts
    │   │
    │   └── color/               # all JS
    │       ├── palette.ts       # map to a fixed palette (incl. MORPHXGEN data scheme)
    │       ├── posterize.ts
    │       ├── levels.ts        # brightness / contrast / gamma
    │       └── duotone.ts
    │
    ├── ui/                      # ~6 components, no design-system layer
    │   ├── Canvas.tsx           # renders ImageData, fit-to-view, before/after hold
    │   ├── Chain.tsx            # ordered list: reorder, toggle, mix, remove
    │   ├── AddEffect.tsx        # grouped dropdown, built from the registry
    │   ├── Controls.tsx         # generates inputs from a ParamSchema
    │   ├── Field.tsx            # slider / stepper / select / toggle / swatch
    │   └── Toolbar.tsx          # open, export, reset
    │
    └── styles/
        ├── tokens.css           # copied verbatim from the visual language doc
        └── app.css              # layout; ~150 lines, no framework
```

Roughly **35 files**, 20 of which are effects. As built, **19 are JS and none
are GL yet** — the backend rule was expected to push about three onto the GPU,
but two of those three (`bloom`, `anisotropic`) turned out to have constant-time
formulations. Only `reactionDiffusion`, which is genuinely iterative, still
needs the GL layer.

**Stack:** Vite + TypeScript + React. React earns its place because the
parameter UI is genuinely a data-driven render; if bundle size matters later,
Preact is a drop-in alias. No state library — a single `useState` holding
`{ source, chain, selected }` in `App.tsx` is sufficient at this size.

---

## 5. Data flow

```
file drop
   ↓  image.ts: decode → downscale to ≤1400px → ImageData (the "source")
   ↓
chain: [{ effectId, params, enabled, mix }, ...]
   ↓  pipeline.ts folds the chain over the source
   ↓
      js  js  gl  gl  js        ← chain
      │   │   └───┬──┘  │
      │   │    one GL group     ← consecutive GL effects share an upload
      │   │    (upload, N       and a readback; ping-pong between them
      │   │     draws, readback)
      ↓   ↓       ↓      ↓
      out = effect result; cur = mix < 1 ? lerp(cur, out, mix) : out
   ↓
Canvas.tsx: putImageData
```

The only scheduling rule is that **consecutive GL effects are batched**. A run
of three GL effects costs one upload and one readback, not three of each. With
GL effects being a small minority and usually sitting alone in a chain, this is
about twenty lines in `pipeline.ts` — worth it because the readback is the
expensive part, not the draws.

Export is the same call with the full-resolution source and `scale: 1`, then
`canvas.toBlob()`. There is no second code path — which is the main reason to
keep the pipeline this plain. GL export is bounded by `MAX_TEXTURE_SIZE`
(≥4096 everywhere, typically 16384); above that the GL effect falls back to its
JS path for the export render, which is slow but correct and runs once.

State shape:

```ts
{
  source: { full: ImageData, preview: ImageData, name: string },
  chain: ChainEntry[],
  selected: number | null,
}
```

The chain serializes to JSON on its own (ids and numbers), so presets and
shareable URLs are nearly free later — but neither is built in v1.

---

## 6. UI

One screen, three regions, no panels-within-panels:

```
┌─────────────────────────────────────────────────┐
│ MORPHXGEN            open   export               │  toolbar
├──────────────────────────────┬──────────────────┤
│                              │  chain           │
│                              │  ─────────────   │
│          canvas              │  ▸ ordered dither│
│                              │  ▸ film grain    │
│                              │  + add effect    │
│                              │ ─────────────────│
│                              │  params for the  │
│                              │  selected effect │
└──────────────────────────────┴──────────────────┘
```

Brand application is literal and cheap: `#222222` ground, `#e4e3df` ink, coral
`#e48484` on the selected chain row and focus rings only, hairline rules
instead of cards, square corners, Intel One Mono, all copy lowercase. Corner-
tick brackets frame the canvas and the export button — the two places the motif
earns its keep. `tokens.css` is pasted from the visual language doc so that file
stays authoritative.

No component library. These are six components; abstracting them into a design
system would be more code than the components.

---

## 7. Build order

Each step is independently useful and leaves the tool working.

1. **Skeleton** — Vite app, drop an image, show it on a canvas. No effects.
2. **Core + first effect** — `types.ts`, `pipeline.ts`, `registry.ts`, and
   `ordered.ts`. Hardcode the chain to one effect. Confirm the shape is right
   before building on it.
3. **Generated controls** — `Controls.tsx` + `Field.tsx` reading the schema.
   The leverage point: every effect after this ships with a UI free.
4. **The chain** — add/remove/reorder/toggle/mix.
5. **Export** — full-res re-run, PNG download.
6. **Brand pass** — tokens, layout, type.
7. **JS effect fill-out** — error diffusion, halftone, grain, palette, block
   crush, and the rest. One file at a time.
8. **GL layer** — `gl.ts` plus `reactionDiffusion`, the one effect that cannot
   be made constant-time in JS. Only worth building when that effect is wanted.

Steps 1–6 are a working tool. **GL lands last on purpose:** by then the effect
contract has been exercised by a dozen JS effects, so the GL variant slots into
a shape that is known to be right rather than one guessed at up front.

---

## Open question

`pixelSort.ts` is marked JS because span sorting is sequential per row. At
full-resolution export on a large image it may be the slowest thing in the
tool. If it profiles badly it does not go to GL — sorting is a poor fit — it
goes to a Web Worker. Worth measuring at step 7 before deciding.
