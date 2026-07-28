import type { JsEffect } from '../../core/types';
import { clamp255, getBlueNoise, luma, quantize } from '../lib';

/**
 * Blue-noise ordered dithering.
 *
 * Same structure as Bayer — a per-pixel threshold offset from a tiled matrix —
 * but the matrix is void-and-cluster blue noise instead of a recursive grid.
 * Blue noise has no low-frequency energy, so the texture reads as fine even
 * grain with no visible crosshatch, and it tiles seamlessly.
 *
 * The practical difference from error diffusion: this is order-independent, so
 * it does not smear detail along the scan direction the way Floyd-Steinberg
 * can on hard edges.
 */
export const blueNoise: JsEffect = {
  id: 'blue_noise_dither',
  name: 'blue noise dither',
  category: 'dither',
  description: 'void-and-cluster threshold — even grain, no visible grid',
  params: {
    tile: { type: 'enum', options: ['32', '64'], default: '64', label: 'tile' },
    levels: { type: 'int', min: 2, max: 16, default: 2, label: 'levels' },
    strength: { type: 'float', min: 0, max: 2, step: 0.01, default: 1, label: 'strength' },
    mono: { type: 'bool', default: true, label: 'monochrome' },
  },

  apply(src, p) {
    const size = parseInt(p.tile as string, 10);
    const levels = p.levels as number;
    const strength = p.strength as number;
    const mono = p.mono as boolean;

    const m = getBlueNoise(size);
    const w = src.width;
    const S = src.data;
    const out = new ImageData(w, src.height);
    const O = out.data;

    const step = 255 / (levels - 1);

    for (let y = 0, i = 0; y < src.height; y++) {
      const row = (y % size) * size;
      for (let x = 0; x < w; x++, i += 4) {
        const t = (m[row + (x % size)] - 0.5) * step * strength;

        if (mono) {
          const v = quantize(clamp255(luma(S[i], S[i + 1], S[i + 2]) + t), levels);
          O[i] = O[i + 1] = O[i + 2] = v;
        } else {
          O[i] = quantize(clamp255(S[i] + t), levels);
          O[i + 1] = quantize(clamp255(S[i + 1] + t), levels);
          O[i + 2] = quantize(clamp255(S[i + 2] + t), levels);
        }
        O[i + 3] = S[i + 3];
      }
    }
    return out;
  },
};
