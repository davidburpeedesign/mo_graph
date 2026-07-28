import type { JsEffect } from '../../core/types';
import { clamp255, hexToRgb, luma, scaled } from '../lib';

/**
 * Aperture-grille raster.
 *
 * Draws the image as a field of evenly spaced lines whose position is pushed
 * sideways by local brightness. The subject emerges from where the lines bunch
 * and splay rather than from any tonal variation, which is what gives it the
 * oscilloscope / shadow-mask look.
 *
 * Rasterized forward — background fill, then each line segment stamped as
 * whole pixels — so lines stay hard-edged at any displacement. Sampling per
 * output pixel instead would need interpolation and soften every line.
 */
export const crtRaster: JsEffect = {
  id: 'crt_raster',
  name: 'crt raster',
  category: 'artifact',
  description: 'aperture-grille lines displaced by brightness',
  params: {
    spacing: { type: 'int', min: 2, max: 64, default: 8, label: 'spacing' },
    lineWidth: { type: 'int', min: 1, max: 32, default: 2, label: 'line width' },
    amount: { type: 'float', min: -128, max: 128, step: 0.5, default: 18, label: 'displacement' },
    step: { type: 'int', min: 1, max: 64, default: 2, label: 'step' },
    vertical: { type: 'bool', default: true, label: 'vertical lines' },
    modulate: { type: 'bool', default: false, label: 'fade dark lines' },
    colorFromSource: { type: 'bool', default: false, label: 'sample source colour' },
    ink: { type: 'color', default: '#b6a8ff', label: 'line', visibleWhen: { key: 'colorFromSource', equals: [false] } },
    background: { type: 'color', default: '#1a1030', label: 'background' },
  },

  apply(src, p, ctx) {
    const spacing = scaled(p.spacing as number, ctx.scale);
    const lineWidth = scaled(p.lineWidth as number, ctx.scale);
    const amount = (p.amount as number) * ctx.scale;
    const step = scaled(p.step as number, ctx.scale);
    const vertical = p.vertical as boolean;
    const modulate = p.modulate as boolean;
    const fromSource = p.colorFromSource as boolean;
    const [ir, ig, ib] = hexToRgb(p.ink as string);
    const [br, bg, bb] = hexToRgb(p.background as string);

    const w = src.width;
    const h = src.height;
    const S = src.data;
    const out = new ImageData(w, h);
    const O = out.data;

    for (let i = 0; i < O.length; i += 4) {
      O[i] = br;
      O[i + 1] = bg;
      O[i + 2] = bb;
      O[i + 3] = S[i + 3];
    }

    // `along` runs down each line; `across` is the axis lines are spaced on.
    const alongLen = vertical ? h : w;
    const acrossLen = vertical ? w : h;
    const lineCount = Math.ceil(acrossLen / spacing) + 1;

    for (let a = 0; a < alongLen; a += step) {
      const aEnd = Math.min(a + step, alongLen);
      // Sample at the middle of the step band so the jog is centred on it.
      const aSample = Math.min(alongLen - 1, a + (step >> 1));

      for (let k = 0; k < lineCount; k++) {
        const home = k * spacing + (spacing >> 1);
        if (home >= acrossLen) continue;

        const sx = vertical ? home : aSample;
        const sy = vertical ? aSample : home;
        const si = (sy * w + sx) * 4;
        const l = luma(S[si], S[si + 1], S[si + 2]) / 255;

        const centre = home + (l - 0.5) * 2 * amount;
        const start = Math.round(centre - lineWidth / 2);

        const gain = modulate ? l : 1;
        const r = fromSource ? S[si] * gain : ir * gain;
        const g = fromSource ? S[si + 1] * gain : ig * gain;
        const b = fromSource ? S[si + 2] * gain : ib * gain;

        for (let d = 0; d < lineWidth; d++) {
          const c = start + d;
          if (c < 0 || c >= acrossLen) continue;
          for (let t = a; t < aEnd; t++) {
            const x = vertical ? c : t;
            const y = vertical ? t : c;
            const i = (y * w + x) * 4;
            O[i] = clamp255(r);
            O[i + 1] = clamp255(g);
            O[i + 2] = clamp255(b);
          }
        }
      }
    }

    return out;
  },
};
