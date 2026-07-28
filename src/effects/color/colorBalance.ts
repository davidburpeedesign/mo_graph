import type { JsEffect } from '../../core/types';
import { clamp255, luma } from '../lib';

/**
 * Saturation, temperature and tint.
 *
 * Temperature runs blue-to-amber and tint runs green-to-magenta — the two axes
 * a white balance control moves along. Both are applied as channel gains and
 * then **renormalized back to the original luma**, so shifting colour never
 * changes brightness. That matters more here than in a normal photo editor:
 * every dither downstream quantizes on luma, so a temperature slider that
 * quietly brightened the image would move the dither threshold too and the
 * pattern would change for no visible reason.
 *
 * Saturation is applied after balance, as a mix away from luma.
 */
export const colorBalance: JsEffect = {
  id: 'color_balance',
  name: 'color balance',
  category: 'color',
  description: 'saturation, temperature and tint — luma preserving',
  params: {
    saturation: { type: 'float', min: 0, max: 2, step: 0.01, default: 1, label: 'saturation' },
    temperature: { type: 'float', min: -1, max: 1, step: 0.01, default: 0, label: 'temperature' },
    tint: { type: 'float', min: -1, max: 1, step: 0.01, default: 0, label: 'tint' },
    preserveLuma: { type: 'bool', default: true, label: 'preserve luma' },
  },

  apply(src, p) {
    const saturation = p.saturation as number;
    const temperature = p.temperature as number;
    const tint = p.tint as number;
    const preserve = p.preserveLuma as boolean;

    // Positive temperature warms (red up, blue down); positive tint goes
    // magenta (green down, red and blue up).
    const rGain = 1 + temperature * 0.35 + tint * 0.12;
    const gGain = 1 - tint * 0.24;
    const bGain = 1 - temperature * 0.35 + tint * 0.12;

    const balancing = temperature !== 0 || tint !== 0;

    const out = new ImageData(src.width, src.height);
    const S = src.data;
    const O = out.data;

    for (let i = 0; i < O.length; i += 4) {
      let r = S[i];
      let g = S[i + 1];
      let b = S[i + 2];

      if (balancing) {
        const before = luma(r, g, b);
        r *= rGain;
        g *= gGain;
        b *= bGain;

        if (preserve && before > 0) {
          const after = luma(r, g, b);
          if (after > 0) {
            const k = before / after;
            r *= k;
            g *= k;
            b *= k;
          }
        }
      }

      if (saturation !== 1) {
        const l = luma(r, g, b);
        r = l + (r - l) * saturation;
        g = l + (g - l) * saturation;
        b = l + (b - l) * saturation;
      }

      O[i] = clamp255(r);
      O[i + 1] = clamp255(g);
      O[i + 2] = clamp255(b);
      O[i + 3] = S[i + 3];
    }
    return out;
  },
};
