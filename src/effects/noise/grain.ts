import type { JsEffect } from '../../core/types';
import { clamp255, hash2, luma, scaled } from '../lib';

/**
 * Film grain.
 *
 * Weighted toward midtones and shadows by default, because real grain lives in
 * the emulsion's exposed regions and dies in blown highlights — uniform noise
 * across the frame is the giveaway of fake grain.
 *
 * Placed *before* a dither, it perturbs the quantization decision and breaks
 * up banding. Placed after, it just adds speckle on top.
 */
export const grain: JsEffect = {
  id: 'film_grain',
  name: 'film grain',
  category: 'noise',
  description: 'luma-weighted noise — sits in the shadows like emulsion',
  stochastic: true,
  params: {
    amount: { type: 'float', min: 0, max: 1, step: 0.01, default: 0.25, label: 'amount' },
    size: { type: 'int', min: 1, max: 16, default: 1, label: 'grain size' },
    shadowBias: { type: 'float', min: 0, max: 1, step: 0.01, default: 0.6, label: 'shadow bias' },
    mono: { type: 'bool', default: true, label: 'monochrome' },
  },

  apply(src, p, ctx) {
    const amount = (p.amount as number) * 255;
    const size = scaled(p.size as number, ctx.scale);
    const bias = p.shadowBias as number;
    const mono = p.mono as boolean;

    const w = src.width;
    const S = src.data;
    const out = new ImageData(w, src.height);
    const O = out.data;

    for (let y = 0, i = 0; y < src.height; y++) {
      const gy = (y / size) | 0;
      for (let x = 0; x < w; x++, i += 4) {
        const gx = (x / size) | 0;

        // Triangular distribution (two uniforms summed) — closer to the look of
        // photographic grain than a flat uniform, and cheaper than gaussian.
        const n = hash2(gx, gy, ctx.seed) + hash2(gx, gy, ctx.seed ^ 0x5bf03635) - 1;

        // Weight: full strength at black, tapering off toward white.
        const l = luma(S[i], S[i + 1], S[i + 2]) / 255;
        const weight = 1 - bias * l;
        const d = n * amount * weight;

        if (mono) {
          O[i] = clamp255(S[i] + d);
          O[i + 1] = clamp255(S[i + 1] + d);
          O[i + 2] = clamp255(S[i + 2] + d);
        } else {
          O[i] = clamp255(S[i] + d);
          O[i + 1] = clamp255(S[i + 1] + (hash2(gx, gy, ctx.seed ^ 0x1234) - 0.5) * 2 * amount * weight);
          O[i + 2] = clamp255(S[i + 2] + (hash2(gx, gy, ctx.seed ^ 0x9876) - 0.5) * 2 * amount * weight);
        }
        O[i + 3] = S[i + 3];
      }
    }
    return out;
  },
};
