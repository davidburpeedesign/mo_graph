import type { JsEffect } from '../../core/types';
import { clamp255 } from '../lib';

/**
 * Per-channel bit-depth reduction.
 *
 * Distinct from posterize in two ways that matter: bit depth is set per
 * channel, so you can reproduce specific hardware palettes (RGB565, or the
 * 3-3-2 of 8-bit VGA), and it truncates rather than rounds. Truncation biases
 * everything downward, which is the source of the slightly muddy, crunchy
 * look real low-depth hardware had.
 */
export const bitCrush: JsEffect = {
  id: 'bit_crush',
  name: 'bit crush',
  category: 'artifact',
  description: 'per-channel bit depth — rgb565, 3-3-2, 1-bit colour',
  params: {
    red: { type: 'int', min: 1, max: 8, default: 3, label: 'red bits' },
    green: { type: 'int', min: 1, max: 8, default: 3, label: 'green bits' },
    blue: { type: 'int', min: 1, max: 8, default: 2, label: 'blue bits' },
    round: { type: 'bool', default: false, label: 'round instead of truncate' },
  },

  apply(src, p) {
    const bits = [p.red as number, p.green as number, p.blue as number];
    const round = p.round as boolean;

    // Per-channel LUT — cheaper than recomputing the shift per pixel, and it
    // keeps the rescale to full range exact.
    const luts = bits.map((b) => {
      const levels = 1 << b;
      const stepIn = 256 / levels;
      const stepOut = levels > 1 ? 255 / (levels - 1) : 0;
      const lut = new Uint8ClampedArray(256);
      for (let v = 0; v < 256; v++) {
        const idx = round
          ? Math.min(levels - 1, Math.round((v / 255) * (levels - 1)))
          : Math.min(levels - 1, Math.floor(v / stepIn));
        lut[v] = clamp255(idx * stepOut);
      }
      return lut;
    });

    const out = new ImageData(src.width, src.height);
    const S = src.data;
    const O = out.data;

    for (let i = 0; i < O.length; i += 4) {
      O[i] = luts[0][S[i]];
      O[i + 1] = luts[1][S[i + 1]];
      O[i + 2] = luts[2][S[i + 2]];
      O[i + 3] = S[i + 3];
    }
    return out;
  },
};
