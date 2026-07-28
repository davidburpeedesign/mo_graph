import type { JsEffect } from '../../core/types';
import { hexToRgb, luma } from '../lib';

/**
 * Two-color ramp driven by luma. Placed after a dither, it tints the result
 * without reintroducing intermediate levels — the output still only contains
 * the colors the dither produced, remapped.
 */
export const duotone: JsEffect = {
  id: 'duotone',
  name: 'duotone',
  category: 'color',
  description: 'map luma onto a two-color ramp',
  params: {
    shadow: { type: 'color', default: '#222222', label: 'shadow' },
    highlight: { type: 'color', default: '#e4e3df', label: 'highlight' },
    bias: { type: 'float', min: 0.1, max: 4, step: 0.05, default: 1, label: 'bias' },
  },

  apply(src, p) {
    const [sr, sg, sb] = hexToRgb(p.shadow as string);
    const [hr, hg, hb] = hexToRgb(p.highlight as string);
    const bias = p.bias as number;

    const out = new ImageData(src.width, src.height);
    const S = src.data;
    const O = out.data;

    for (let i = 0; i < O.length; i += 4) {
      const t = Math.pow(luma(S[i], S[i + 1], S[i + 2]) / 255, bias);
      O[i] = sr + (hr - sr) * t;
      O[i + 1] = sg + (hg - sg) * t;
      O[i + 2] = sb + (hb - sb) * t;
      O[i + 3] = S[i + 3];
    }
    return out;
  },
};
