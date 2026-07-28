import type { JsEffect } from '../../core/types';
import { luma, quantize } from '../lib';

/**
 * Flat quantization with no dithering. The control case — useful on its own
 * for hard poster edges, and useful for seeing exactly what a dither is doing
 * by comparing against it at the same level count.
 */
export const posterize: JsEffect = {
  id: 'posterize',
  name: 'posterize',
  category: 'color',
  description: 'flat level quantization, no dither',
  params: {
    levels: { type: 'int', min: 2, max: 32, default: 4, label: 'levels' },
    mono: { type: 'bool', default: false, label: 'monochrome' },
  },

  apply(src, p) {
    const levels = p.levels as number;
    const mono = p.mono as boolean;

    const out = new ImageData(src.width, src.height);
    const S = src.data;
    const O = out.data;

    for (let i = 0; i < O.length; i += 4) {
      if (mono) {
        const v = quantize(luma(S[i], S[i + 1], S[i + 2]), levels);
        O[i] = O[i + 1] = O[i + 2] = v;
      } else {
        O[i] = quantize(S[i], levels);
        O[i + 1] = quantize(S[i + 1], levels);
        O[i + 2] = quantize(S[i + 2], levels);
      }
      O[i + 3] = S[i + 3];
    }
    return out;
  },
};
