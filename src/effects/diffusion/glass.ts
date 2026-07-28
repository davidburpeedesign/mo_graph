import type { JsEffect } from '../../core/types';
import { blurAxisRGB, clamp, clamp255, scaled } from '../lib';

/**
 * Fluted (ribbed) glass.
 *
 * The pane is divided into parallel ribs, each acting as a cylindrical lens:
 * within a rib, the sampling position is pulled toward the rib's centre, so
 * each rib shows a compressed — and past strength 1, mirrored — slice of what
 * is behind it. That discontinuity at every rib boundary is what produces the
 * hard vertical seams real fluted glass has.
 *
 * Frost then blurs *along* the rib axis only. Blurring across the ribs would
 * wash out the seams that make it read as glass.
 */
export const glass: JsEffect = {
  id: 'glass',
  name: 'glass',
  category: 'diffusion',
  description: 'fluted glass — ribbed refraction with directional frost',
  params: {
    band: { type: 'int', min: 2, max: 256, default: 28, label: 'rib width' },
    strength: { type: 'float', min: 0, max: 4, step: 0.01, default: 1.6, label: 'refraction' },
    frost: { type: 'int', min: 0, max: 120, default: 14, label: 'frost' },
    seam: { type: 'float', min: 0, max: 1, step: 0.01, default: 0.35, label: 'seam' },
    vertical: { type: 'bool', default: true, label: 'vertical ribs' },
  },

  apply(src, p, ctx) {
    const band = scaled(p.band as number, ctx.scale);
    const strength = p.strength as number;
    const frost = Math.round((p.frost as number) * ctx.scale);
    const seam = p.seam as number;
    const vertical = p.vertical as boolean;

    const w = src.width;
    const h = src.height;
    const S = src.data;

    const refracted = new Float32Array(w * h * 3);

    for (let y = 0, j = 0; y < h; y++) {
      for (let x = 0; x < w; x++, j += 3) {
        const pos = vertical ? x : y;
        // -0.5..0.5 across the rib.
        const u = (((pos % band) + band) % band) / band - 0.5;
        const offset = u * band * strength;

        const sx = vertical ? clamp(Math.round(x - offset), 0, w - 1) : x;
        const sy = vertical ? y : clamp(Math.round(y - offset), 0, h - 1);
        const i = (sy * w + sx) * 4;

        refracted[j] = S[i];
        refracted[j + 1] = S[i + 1];
        refracted[j + 2] = S[i + 2];
      }
    }

    // Frost runs along the ribs: vertical ribs blur vertically.
    const blurred = frost > 0 ? blurAxisRGB(refracted, w, h, frost, !vertical, 3) : refracted;

    const out = new ImageData(w, h);
    const O = out.data;

    for (let y = 0, i = 0, j = 0; y < h; y++) {
      for (let x = 0; x < w; x++, i += 4, j += 3) {
        let k = 1;
        if (seam > 0) {
          const pos = vertical ? x : y;
          const u = (((pos % band) + band) % band) / band - 0.5;
          // Bright hairline where adjacent ribs meet.
          const edge = Math.max(0, 1 - Math.abs(u) * 2 * band * 0.5);
          k = 1 + seam * edge * 0.9;
        }
        O[i] = clamp255(blurred[j] * k);
        O[i + 1] = clamp255(blurred[j + 1] * k);
        O[i + 2] = clamp255(blurred[j + 2] * k);
        O[i + 3] = S[i + 3];
      }
    }
    return out;
  },
};
