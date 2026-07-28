# mo_graph

A browser tool for dithering, noise and artifacting. Drop an image, stack
effects, export. Everything runs client-side — images never leave the machine.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the design and
[MORPHXGEN-visual-language.md](./MORPHXGEN-visual-language.md) for the visual
system.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production bundle
```

## Effects

| category | effects |
|---|---|
| dither | ordered (bayer), error diffusion, halftone, threshold |
| noise | film grain |
| artifact | block crush, rgb shift, scanlines |
| color | levels, posterize, palette map, duotone |

`error diffusion` ships six kernels — floyd-steinberg, atkinson, stucki,
jarvis-judice-ninke, burkes, sierra — with serpentine scanning.

Order matters: `levels` before a dither shapes where the quantizer puts its
edge, `film grain` before a dither breaks up banding, and either one after
just sits on top of the result.

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

Two rules for the `ctx` argument:

- **Multiply pixel-measured params by `ctx.scale`.** The preview renders at up
  to 1400px while export renders at full size; without this the preview shows a
  different texture frequency than the file you get.
- **Use `ctx.seed`, never `Math.random()`.** Renders must be reproducible or the
  export will not match the preview.

## Keyboard

- `space` (hold) — compare against the unprocessed source
