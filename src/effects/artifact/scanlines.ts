import type { JsEffect } from '../../core/types';
import { clamp255, noiseField, scaled } from '../lib';

/**
 * CRT scanlines, optionally warped.
 *
 * The warp shifts each column's scanline phase by a noise value that is
 * **rounded to a whole pixel** before use. Because the offset only ever
 * decides which output row is dark — nothing is resampled — the lines go
 * jagged without going soft. Warping by a fractional offset and interpolating
 * would smear the lines, which is the opposite of the intent.
 */
export const scanlines: JsEffect = {
  id: 'scanlines',
  name: 'scanlines',
  category: 'artifact',
  description: 'crt line darkening, optionally warped but never blurred',
  stochastic: true,
  params: {
    period: { type: 'int', min: 2, max: 32, default: 3, label: 'period' },
    strength: { type: 'float', min: 0, max: 1, step: 0.01, default: 0.4, label: 'strength' },
    thickness: { type: 'float', min: 0.05, max: 0.95, step: 0.05, default: 0.5, label: 'thickness' },
    warp: { type: 'int', min: 0, max: 64, default: 0, label: 'warp' },
    warpScale: { type: 'int', min: 2, max: 512, default: 64, label: 'warp scale' },
    warpNoise: {
      type: 'enum',
      options: ['perlin', 'value', 'ridged', 'cellular'],
      default: 'perlin',
      label: 'warp noise',
      visibleWhen: { key: 'warp', notEquals: [0] },
    },
    vertical: { type: 'bool', default: false, label: 'vertical' },
  },

  apply(src, p, ctx) {
    const period = scaled(p.period as number, ctx.scale);
    const strength = p.strength as number;
    const thickness = p.thickness as number;
    const warp = Math.round((p.warp as number) * ctx.scale);
    const warpScale = scaled(p.warpScale as number, ctx.scale);
    const noise = p.warpNoise as 'perlin' | 'value' | 'ridged' | 'cellular';
    const vertical = p.vertical as boolean;

    const w = src.width;
    const h = src.height;
    const S = src.data;
    const out = new ImageData(w, h);
    const O = out.data;

    const cut = Math.max(1, Math.round(period * thickness));

    // Offsets depend only on the across-axis coordinate, so precompute one per
    // column (or row) instead of evaluating noise per pixel.
    const acrossLen = vertical ? h : w;
    const offsets = new Int32Array(acrossLen);
    if (warp > 0) {
      for (let a = 0; a < acrossLen; a++) {
        const n = noiseField(noise, a / warpScale, 0, ctx.seed, 3);
        offsets[a] = Math.round((n - 0.5) * 2 * warp);
      }
    }

    for (let y = 0, i = 0; y < h; y++) {
      for (let x = 0; x < w; x++, i += 4) {
        // The line coordinate is the one being banded; the offset comes from
        // the perpendicular axis, which is what makes the lines wander.
        const line = vertical ? x : y;
        const across = vertical ? y : x;
        const shifted = line + offsets[across];
        const dark = (((shifted % period) + period) % period) < cut;

        const k = dark ? 1 - strength : 1;
        O[i] = clamp255(S[i] * k);
        O[i + 1] = clamp255(S[i + 1] * k);
        O[i + 2] = clamp255(S[i + 2] * k);
        O[i + 3] = S[i + 3];
      }
    }
    return out;
  },
};
