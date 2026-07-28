import type { JsEffect } from '../../core/types';
import { clamp255, getBayer, luma, quantize } from '../lib';

/**
 * Ordered (Bayer) dithering.
 *
 * Adds a position-dependent threshold offset before quantizing, so flat areas
 * break into the characteristic crosshatch instead of banding. The matrix is
 * deliberately not scaled by ctx.scale: the pattern is defined in output
 * pixels, and stretching it would make the preview lie about the texture.
 */
export const ordered: JsEffect = {
  id: 'ordered_dither',
  name: 'ordered dither',
  category: 'dither',
  description: 'bayer matrix threshold — regular crosshatch texture',
  params: {
    matrix: { type: 'enum', options: ['2', '4', '8', '16'], default: '8', label: 'matrix' },
    levels: { type: 'int', min: 2, max: 16, default: 2, label: 'levels' },
    strength: { type: 'float', min: 0, max: 2, step: 0.01, default: 1, label: 'strength' },
    mono: { type: 'bool', default: true, label: 'monochrome' },
  },

  apply(src, p) {
    const size = parseInt(p.matrix as string, 10);
    const levels = p.levels as number;
    const strength = p.strength as number;
    const mono = p.mono as boolean;

    const m = getBayer(size);
    const out = new ImageData(src.width, src.height);
    const S = src.data;
    const O = out.data;
    const w = src.width;

    // Spread of one quantization step; the threshold offset must stay inside
    // it or the dither turns into posterized noise.
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
