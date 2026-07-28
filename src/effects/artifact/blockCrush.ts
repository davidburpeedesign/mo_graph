import type { JsEffect } from '../../core/types';
import { clamp255, scaled } from '../lib';

/**
 * JPEG-style block degradation.
 *
 * Averages each block toward its mean and quantizes the result, which
 * reproduces the two artifacts that read as "compressed": flat blocking, and
 * the color bleed you get when chroma is crushed harder than luma. Not a real
 * DCT — a real one buys accuracy nobody looking at this can see.
 */
export const blockCrush: JsEffect = {
  id: 'block_crush',
  name: 'block crush',
  category: 'artifact',
  description: 'jpeg-style blocking and color bleed',
  params: {
    block: { type: 'int', min: 2, max: 64, default: 8, label: 'block size' },
    flatten: { type: 'float', min: 0, max: 1, step: 0.01, default: 0.7, label: 'flatten' },
    levels: { type: 'int', min: 2, max: 64, default: 12, label: 'levels' },
    chromaBleed: { type: 'float', min: 0, max: 1, step: 0.01, default: 0.5, label: 'chroma bleed' },
  },

  apply(src, p, ctx) {
    const block = scaled(p.block as number, ctx.scale);
    const flatten = p.flatten as number;
    const levels = p.levels as number;
    const bleed = p.chromaBleed as number;

    const w = src.width;
    const h = src.height;
    const S = src.data;
    const out = new ImageData(w, h);
    const O = out.data;

    const step = 255 / (levels - 1);

    for (let by = 0; by < h; by += block) {
      const yEnd = Math.min(by + block, h);
      for (let bx = 0; bx < w; bx += block) {
        const xEnd = Math.min(bx + block, w);

        let sr = 0;
        let sg = 0;
        let sb = 0;
        let n = 0;
        for (let y = by; y < yEnd; y++) {
          for (let x = bx; x < xEnd; x++) {
            const i = (y * w + x) * 4;
            sr += S[i];
            sg += S[i + 1];
            sb += S[i + 2];
            n++;
          }
        }
        const mr = sr / n;
        const mg = sg / n;
        const mb = sb / n;

        for (let y = by; y < yEnd; y++) {
          for (let x = bx; x < xEnd; x++) {
            const i = (y * w + x) * 4;

            // Pull toward the block mean, harder on chroma than on luma.
            const lf = flatten;
            const cf = Math.min(1, flatten + bleed * (1 - flatten));

            let r = S[i] + (mr - S[i]) * (lf + (cf - lf) * 0.5);
            let g = S[i + 1] + (mg - S[i + 1]) * lf;
            let b = S[i + 2] + (mb - S[i + 2]) * (lf + (cf - lf) * 0.5);

            r = Math.round(r / step) * step;
            g = Math.round(g / step) * step;
            b = Math.round(b / step) * step;

            O[i] = clamp255(r);
            O[i + 1] = clamp255(g);
            O[i + 2] = clamp255(b);
            O[i + 3] = S[i + 3];
          }
        }
      }
    }
    return out;
  },
};
