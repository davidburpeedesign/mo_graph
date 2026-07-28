import type { JsEffect } from '../../core/types';
import { clamp, luma, scaled } from '../lib';

/**
 * Halftone screen.
 *
 * Samples the image on a rotated grid and draws a mark whose size tracks
 * local darkness — dots, lines, or crosshatch. Cell size is measured in
 * output pixels, so it scales with ctx.scale to keep the preview honest.
 */
export const halftone: JsEffect = {
  id: 'halftone',
  name: 'halftone',
  category: 'dither',
  description: 'rotated dot / line screen — print reproduction texture',
  params: {
    shape: { type: 'enum', options: ['dot', 'line', 'crosshatch'], default: 'dot', label: 'shape' },
    cell: { type: 'int', min: 2, max: 64, default: 8, label: 'cell size' },
    angle: { type: 'float', min: 0, max: 180, step: 1, default: 45, label: 'angle' },
    contrast: { type: 'float', min: 0.25, max: 4, step: 0.05, default: 1, label: 'contrast' },
    invert: { type: 'bool', default: false, label: 'invert' },
  },

  apply(src, p, ctx) {
    const shape = p.shape as string;
    const cell = scaled(p.cell as number, ctx.scale);
    const contrast = p.contrast as number;
    const invert = p.invert as boolean;

    const rad = ((p.angle as number) * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    const w = src.width;
    const h = src.height;
    const S = src.data;
    const out = new ImageData(w, h);
    const O = out.data;

    for (let y = 0, i = 0; y < h; y++) {
      for (let x = 0; x < w; x++, i += 4) {
        // Rotate into screen space, then find the offset within the cell.
        const u = x * cos + y * sin;
        const v = -x * sin + y * cos;
        const cu = ((u % cell) + cell) % cell;
        const cv = ((v % cell) + cell) % cell;

        // Sample coverage at the cell center rather than the pixel, so a mark
        // represents its whole cell instead of shimmering with local noise.
        const sx = clamp(Math.round(x - cu * cos + cv * sin + (cell / 2) * cos - (cell / 2) * sin), 0, w - 1);
        const sy = clamp(Math.round(y - cu * sin - cv * cos + (cell / 2) * sin + (cell / 2) * cos), 0, h - 1);
        const si = (sy * w + sx) * 4;

        let level = luma(S[si], S[si + 1], S[si + 2]) / 255;
        level = clamp(Math.pow(level, contrast), 0, 1);
        if (invert) level = 1 - level;

        // Darkness drives mark size.
        const coverage = 1 - level;
        let on = false;

        if (shape === 'dot') {
          const dx = cu - cell / 2;
          const dy = cv - cell / 2;
          const r = Math.sqrt(dx * dx + dy * dy);
          // Radius grows as sqrt of coverage so *area* is linear in darkness.
          on = r < Math.sqrt(coverage) * (cell * 0.72);
        } else if (shape === 'line') {
          on = Math.abs(cv - cell / 2) < (coverage * cell) / 2;
        } else {
          const a = Math.abs(cv - cell / 2) < (coverage * cell) / 2.4;
          const b = Math.abs(cu - cell / 2) < (coverage * cell) / 2.4;
          on = coverage > 0.5 ? a || b : a && b;
        }

        const val = on ? 0 : 255;
        O[i] = O[i + 1] = O[i + 2] = val;
        O[i + 3] = S[i + 3];
      }
    }
    return out;
  },
};
