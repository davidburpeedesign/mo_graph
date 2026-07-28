# mo_graph

A browser tool for dithering, noise and artifacting. Drop an image, stack
effects, export. Everything runs client-side — images never leave the machine.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the design and
[MORPHXGEN-visual-language.md](./MORPHXGEN-visual-language.md) for the visual
system.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production bundle → dist/
npm run preview    # serve the built bundle locally
```

## Deploying

The tool is entirely client-side — no backend, no API, no server-side
rendering. Images are decoded and processed in the tab and never uploaded.
`dist/` is therefore a plain static folder that any host will serve.

`.github/workflows/deploy.yml` builds and publishes to GitHub Pages on every
push to `main`. The Pages source must be:

> **Settings → Pages → Build and deployment → Source: GitHub Actions**

**Not** "Deploy from a branch". That setting runs GitHub's legacy Jekyll
builder against the repo *root*, which publishes the dev `index.html` — a
`<script type="module" src="/src/main.tsx">` that no browser can execute —
and then overwrites this workflow's deploy a few seconds after it lands. The
symptom is a blank page with two green checkmarks, which is a confusing thing
to debug. `configure-pages` is set to `enablement: true` to correct the source
automatically, and `.nojekyll` ships in the artifact so Jekyll never processes
the build.

After that the site lives at `https://<owner>.github.io/mo_graph/`. Vite is
configured with `base: './'`, so the same build works at a domain root, in a
project subpath, or from `npm run preview` without rebuilding.

The build step exists only because browsers cannot execute TypeScript or JSX
directly — it is a compile, not a server.

## Effects

| category | effects |
|---|---|
| dither | ordered (bayer), blue noise, error diffusion, halftone, threshold, ascii |
| noise | film grain, fbm noise |
| diffusion | bloom, glass, anisotropic (kuwahara) |
| artifact | block crush, bit crush, crt raster, pixel sort, rgb shift, scanlines |
| color | levels, posterize, palette map, duotone |
| geometry | displace |

`error diffusion` ships six kernels — floyd-steinberg, atkinson, stucki,
jarvis-judice-ninke, burkes, sierra — with serpentine scanning. `blue noise`
generates a void-and-cluster tile on first use (~100ms for 64×64, then cached).

`glass` is fluted glass: each rib refracts like a cylindrical lens, and frost
blurs only *along* the ribs, because blurring across them would wash out the
seams that make it read as glass.

`crt raster` draws evenly spaced lines whose position is pushed sideways by
local brightness. It rasterizes forward — background fill, then each segment
stamped as whole pixels — so lines stay hard-edged at any displacement.

`ascii` uses an embedded 5×7 bitmap font rather than canvas text, so effects
stay pure functions over `ImageData` with no font-loading race. Its low/high
thresholds gate which cells become type; the rest pass the source through, so
you can put glyphs into only the shadows or only the highlights.

`displace` offers six noise fields — value, perlin, ridged, cellular,
alligator (worley F2−F1, the scaly one) and curl. Curl is the only field that
cannot pool or pinch, because a divergence-free field has no sources or sinks.

`scanlines` can warp. The offset is **rounded to a whole pixel** before use, so
lines go jagged without going soft — nothing is ever resampled.

`palette map` has a `custom` mode that walks a gradient through 2–4 stops and
samples it at N even intervals, for a controlled ramp instead of arbitrary
swatches.

Order matters, and it is most of the craft here:

- `levels` **before** a dither shapes where the quantizer puts its edge.
- `film grain` or `fbm noise` **before** a dither breaks up banding; **after**,
  it just sits on top as speckle.
- `bloom` **after** a dither gives the hard 1-bit highlights a halo, which is
  the screen/lighten look the visual language describes. **Before** a dither,
  it instead widens which areas survive thresholding.
- `anisotropic` **before** a dither flattens detail into posterish regions, so
  the dither has larger flat areas to work with.
- `displace` **after** a dither drags the dither texture itself into ribbons;
  before, it warps the source and the dither stays on the pixel grid.

## Adding an effect

One file, one registry line. Nothing else in the codebase needs to know it
exists.

```ts
// src/effects/artifact/myEffect.ts
import type { JsEffect } from '../../core/types';

export const myEffect: JsEffect = {
  id: 'my_effect',
  name: 'my effect',
  category: 'artifact',
  description: 'what it does, one line',
  params: {
    amount: { type: 'float', min: 0, max: 1, step: 0.01, default: 0.5, label: 'amount' },
  },
  apply(src, p, ctx) {
    const out = new ImageData(src.width, src.height);
    // ...
    return out;
  },
};
```

Then add it to `EFFECTS` in `src/core/registry.ts`. Controls are generated from
`params`, so there is no UI work.

A parameter may carry `visibleWhen: { key, equals }` or `{ key, notEquals }` to
hide a control unless another parameter has a given value. It is a UI hint
only — the value is always stored and always passed to the effect, so hiding a
control can never change what a chain renders.

Two rules for the `ctx` argument:

- **Multiply pixel-measured params by `ctx.scale`.** The preview renders at up
  to 1400px while export renders at full size; without this the preview shows a
  different texture frequency than the file you get.
- **Use `ctx.seed`, never `Math.random()`.** Renders must be reproducible or the
  export will not match the preview.

## Settings presets

`save settings` writes the whole chain — effect order, every parameter, mix,
enabled state and seeds — to a `.json` file. `load settings` replays it onto
whatever image is open, which is how you keep a look consistent across a set.

Seeds travel with the preset, so stochastic effects reproduce exactly rather
than re-rolling per image.

Preset files are plain JSON and safe to hand-edit. Every value is validated on
load against the effect's schema: unknown effects are skipped with a warning,
out-of-range numbers clamp, and bad types fall back to defaults — a malformed
file degrades rather than breaking the render.

## Keyboard and canvas

- `space` (hold) — compare against the unprocessed source
- `ctrl`/`cmd` + scroll — zoom around the cursor
- drag — pan, once magnified past the window
- `fit` never magnifies past 100%, so the dither pattern is always shown at
  true pixel scale or smaller. Above 100% the canvas renders nearest-neighbour;
  below, it resamples so the pattern does not alias into moiré.
