import type { JsEffect } from '../../core/types';
import { clamp } from '../lib';

/**
 * Chromatic aberration — pull the red and blue channels apart along an axis.
 * Distance is in output pixels, so it scales with the preview.
 */
export const rgbShift: JsEffect = {
  id: 'rgb_shift',
  name: 'rgb shift',
  category: 'artifact',
  description: 'separate the color channels along an axis',
  params: {
    amount: { type: 'float', min: 0, max: 64, step: 0.5, default: 4, label: 'distance' },
    angle: { type: 'float', min: 0, max: 360, step: 1, default: 0, label: 'angle' },
    edgeOnly: { type: 'bool', default: false, label: 'radial' },
  },

  apply(src, p, ctx) {
    const amount = (p.amount as number) * ctx.scale;
    const rad = ((p.angle as number) * Math.PI) / 180;
    const radial = p.edgeOnly as boolean;

    const w = src.width;
    const h = src.height;
    const S = src.data;
    const out = new ImageData(w, h);
    const O = out.data;

    const dx = Math.cos(rad);
    const dy = Math.sin(rad);
    const cx = w / 2;
    const cy = h / 2;
    const maxR = Math.hypot(cx, cy);

    for (let y = 0, i = 0; y < h; y++) {
      for (let x = 0; x < w; x++, i += 4) {
        let ox = dx;
        let oy = dy;
        let scale = amount;

        if (radial) {
          // Real lens aberration grows toward the edge of the frame.
          const rx = x - cx;
          const ry = y - cy;
          const r = Math.hypot(rx, ry) || 1;
          ox = rx / r;
          oy = ry / r;
          scale = amount * (r / maxR);
        }

        const rx = clamp(Math.round(x + ox * scale), 0, w - 1);
        const ry = clamp(Math.round(y + oy * scale), 0, h - 1);
        const bx = clamp(Math.round(x - ox * scale), 0, w - 1);
        const by = clamp(Math.round(y - oy * scale), 0, h - 1);

        O[i] = S[(ry * w + rx) * 4];
        O[i + 1] = S[i + 1];
        O[i + 2] = S[(by * w + bx) * 4 + 2];
        O[i + 3] = S[i + 3];
      }
    }
    return out;
  },
};
