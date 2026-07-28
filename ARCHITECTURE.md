# mo_graph — architecture

> A lightweight browser tool for dithering, noise and artifacting.
> Drop an image, stack a few effects, export. One screen.
> Chrome follows `MORPHXGEN-visual-language.md`.

The target is a single-purpose tool, not an editor. Everything below is sized
to that: **one file per effect, no build-time ceremony, and a core small enough
to read in a sitting.**

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

## 2. The core decision: no WebGL

Dithering is a per-pixel operation on 8-bit RGBA. That is exactly what
`ImageData` is. Running the whole pipeline on the CPU in plain TypeScript
deletes the largest chunk of the previous plan — GL context management, shader
compilation, ping-pong framebuffers, float textures, capability probing,
GPU/CPU readback scheduling, color-space conversion nodes — and costs almost
nothing in return.

Two things make it work:

- **Preview at reduced resolution.** Cap the working buffer at ~1400px on the
  long edge. A per-pixel effect over ~1.2M pixels runs in single-digit
  milliseconds in TypeScript. A four-effect chain re-renders well inside a
  frame. Export re-runs the same chain once at full resolution.
- **Recompute on a rAF tick, not per input event.** Slider drags mark the chain
  dirty; one render happens per frame at most.

If a specific effect turns out to be too slow (iterated diffusion is the likely
candidate), the fix is to move *that effect* into a worker or a small GL pass —
the effect interface below does not care which. That is a later, local change,
not something to design around now.

**Tradeoff being made knowingly:** the pipeline works in 8-bit sRGB throughout.
That is *correct* for dithering and posterizing, which target display levels,
and slightly wrong for blur-type effects, which physically want linear light.
For an aesthetic tool the difference is not visible enough to justify a float
pipeline. Revisit only if blurs start looking muddy.

---

## 3. The effect contract

This is the whole extensibility story. An effect is one file exporting one
object. It is a pure function plus a description of its knobs.

```ts
// src/core/types.ts

export interface Effect<P = any> {
  id: string;                    // 'ordered_dither' — stable, used in URLs/presets
  name: string;                  // 'ordered dither' — lowercase, brand voice
  category: 'dither' | 'noise' | 'artifact' | 'color';
  params: ParamSchema;           // drives the UI and the defaults
  apply(src: ImageData, p: P, ctx: Ctx): ImageData;
}

export type Param =
  | { type: 'float'; min: number; max: number; step: number; default: number; label: string }
  | { type: 'int';   min: number; max: number; default: number; label: string }
  | { type: 'enum';  options: string[]; default: string; label: string }
  | { type: 'bool';  default: boolean; label: string }
  | { type: 'color'; default: string; label: string };

export type ParamSchema = Record<string, Param>;

export interface Ctx {
  scale: number;   // preview 0..1 vs export 1 — for size-dependent effects
  seed: number;    // deterministic randomness
}
```

Three consequences worth noticing:

1. **Controls are generated, never written.** The inspector reads `params` and
   renders a slider, stepper, dropdown or toggle. Adding an effect never
   involves touching UI code.
2. **`scale` keeps the preview honest.** Anything measured in pixels — halftone
   cell size, grain size, block size — multiplies by `ctx.scale` so the preview
   is a true representation of the export instead of a lie at a different
   frequency.
3. **`seed` makes renders reproducible.** No `Math.random()` anywhere in an
   effect; noise comes from a seeded PRNG so the export matches the preview.

Adding an effect = write one file, add one line to `registry.ts`. That is the
entire contract.

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
    ├── core/                    # ~5 files, the whole engine
    │   ├── types.ts             # Effect, Param, ParamSchema, Ctx
    │   ├── registry.ts          # imports every effect → id-keyed map
    │   ├── pipeline.ts          # run(chain, src, ctx) → ImageData; handles mix/enabled
    │   ├── image.ts             # file → ImageData, downscale for preview, → PNG blob
    │   └── rng.ts               # seeded PRNG
    │
    ├── effects/                 # ⭐ one file per effect
    │   ├── lib.ts               # shared: luma, clamp, bayer matrices, palettes, nearest-color
    │   │
    │   ├── dither/
    │   │   ├── ordered.ts       # bayer 2×2…16×16
    │   │   ├── errorDiffusion.ts# floyd-steinberg / atkinson / stucki / jjn, serpentine
    │   │   ├── blueNoise.ts
    │   │   ├── halftone.ts      # dot / line / crosshatch
    │   │   └── threshold.ts
    │   │
    │   ├── noise/
    │   │   ├── grain.ts         # luma-weighted film grain
    │   │   ├── valueNoise.ts    # fbm overlay
    │   │   └── chromaNoise.ts
    │   │
    │   ├── artifact/
    │   │   ├── blockCrush.ts    # jpeg-style block averaging + ringing
    │   │   ├── rgbShift.ts
    │   │   ├── scanlines.ts
    │   │   ├── pixelSort.ts
    │   │   └── bitCrush.ts
    │   │
    │   └── color/
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

That is roughly **30 files**, of which 17 are effects. The core is five files.

**Stack:** Vite + TypeScript + React. React earns its place because the
parameter UI is genuinely a data-driven render; if bundle size matters later,
Preact is a drop-in alias with no code changes. No state library — a single
`useState` holding `{ source, chain, selected }` in `App.tsx` is sufficient at
this size, and reaching for Zustand before that hurts would be premature.

---

## 5. Data flow

```
file drop
   ↓  image.ts: decode → downscale to ≤1400px → ImageData (the "source")
   ↓
chain: [{ effectId, params, enabled, mix }, ...]
   ↓  pipeline.ts: fold effects over the source
   ↓     for each enabled entry: out = effect.apply(cur, params, ctx)
   ↓                             cur = mix < 1 ? lerp(cur, out, mix) : out
   ↓
Canvas.tsx: putImageData
```

Export is the same call with the full-resolution source and `scale: 1`, then
`canvas.toBlob()`. There is no second code path — which is the main reason to
keep the pipeline this plain.

State shape:

```ts
{
  source: { full: ImageData, preview: ImageData, name: string },
  chain: ChainEntry[],
  selected: number | null,
}
```

The chain serializes to JSON on its own (it is just ids and numbers), so
presets and shareable URLs are nearly free later — but neither is built in v1.

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
   This is the leverage point: every effect after this ships with a UI free.
4. **The chain** — add/remove/reorder/toggle/mix.
5. **Export** — full-res re-run, PNG download.
6. **Brand pass** — tokens, layout, type.

That is a working tool. Everything after is effects, added one file at a time:
error diffusion → halftone → grain → palette → block crush → the rest.

---

## Assumption to flag

I read "diffusion" in your original brief as **error diffusion** (the dithering
family — Floyd–Steinberg, Atkinson, Stucki) and have scoped accordingly. If you
meant *reaction-diffusion* — Gray–Scott patterning, iterated hundreds of times
per frame — that single effect is genuinely GPU work and would need one small
WebGL escape hatch inside `apply()`. It does not change anything else in this
document, but it is the one item that would reintroduce shaders, so worth
settling before step 2.
