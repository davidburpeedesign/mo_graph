import type { JsEffect } from '../../core/types';
import { clamp, hash2, luma } from '../lib';

/**
 * Hard threshold, with optional random jitter.
 *
 * The plain version is the baseline every dither is measured against — it is
 * what quantizing without error distribution looks like. Jitter turns it into
 * white-noise dithering, which is noisier than Bayer but has no visible grid.
 */
export const threshold: JsEffect = {
  id: 'threshold',
  name: 'threshold',
  category: 'dither',
  description: 'hard cut to black and white, optional noise jitter',
  stochastic: true,
  params: {
    level: { type: 'float', min: 0, max: 1, step: 0.005, default: 0.5, label: 'level' },
    jitter: { type: 'float', min: 0, max: 1, step: 0.01, default: 0, label: 'noise' },
    invert: { type: 'bool', default: false, label: 'invert' },
  },

  apply(src, p, ctx) {
    const level = (p.level as number) * 255;
    const jitter = (p.jitter as number) * 255;
    const invert = p.invert as boolean;

    const w = src.width;
    const S = src.data;
    const out = new ImageData(w, src.height);
    const O = out.data;

    for (let y = 0, i = 0; y < src.height; y++) {
      for (let x = 0; x < w; x++, i += 4) {
        const t = jitter > 0 ? level + (hash2(x, y, ctx.seed) - 0.5) * jitter : level;
        const on = luma(S[i], S[i + 1], S[i + 2]) > clamp(t, 0, 255);
        const val = on !== invert ? 255 : 0;
        O[i] = O[i + 1] = O[i + 2] = val;
        O[i + 3] = S[i + 3];
      }
    }
    return out;
  },
};
