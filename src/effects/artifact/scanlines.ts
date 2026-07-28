import type { JsEffect } from '../../core/types';
import { clamp255, scaled } from '../lib';

/**
 * CRT scanlines. Period is in output pixels and scales with the preview —
 * without that, a 3px line spacing previews as a moiré field and exports as
 * something entirely different.
 */
export const scanlines: JsEffect = {
  id: 'scanlines',
  name: 'scanlines',
  category: 'artifact',
  description: 'crt line darkening, horizontal or vertical',
  params: {
    period: { type: 'int', min: 2, max: 32, default: 3, label: 'period' },
    strength: { type: 'float', min: 0, max: 1, step: 0.01, default: 0.4, label: 'strength' },
    thickness: { type: 'float', min: 0.05, max: 0.95, step: 0.05, default: 0.5, label: 'thickness' },
    vertical: { type: 'bool', default: false, label: 'vertical' },
  },

  apply(src, p, ctx) {
    const period = scaled(p.period as number, ctx.scale);
    const strength = p.strength as number;
    const thickness = p.thickness as number;
    const vertical = p.vertical as boolean;

    const w = src.width;
    const h = src.height;
    const S = src.data;
    const out = new ImageData(w, h);
    const O = out.data;

    const cut = Math.max(1, Math.round(period * thickness));

    for (let y = 0, i = 0; y < h; y++) {
      const rowDark = !vertical && y % period < cut;
      for (let x = 0; x < w; x++, i += 4) {
        const dark = vertical ? x % period < cut : rowDark;
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
