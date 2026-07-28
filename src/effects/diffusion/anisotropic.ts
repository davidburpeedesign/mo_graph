import type { JsEffect } from '../../core/types';
import { luma } from '../lib';

/**
 * Kuwahara filter — edge-preserving smoothing that reads as painterly.
 *
 * For each pixel it splits the neighbourhood into four overlapping quadrants,
 * measures luma variance in each, and outputs the mean colour of the flattest
 * one. Flat regions get averaged; edges survive because the quadrant that
 * straddles the edge always loses.
 *
 * Implemented over integral images so each quadrant's mean and variance are
 * four array lookups regardless of radius — otherwise this would be O(r²) per
 * pixel and genuinely too slow for JS.
 */
export const anisotropic: JsEffect = {
  id: 'anisotropic',
  name: 'anisotropic',
  category: 'diffusion',
  description: 'kuwahara edge-preserving smoothing — painterly flattening',
  params: {
    radius: { type: 'int', min: 1, max: 24, default: 4, label: 'radius' },
  },

  apply(src, p, ctx) {
    const r = Math.max(1, Math.round((p.radius as number) * ctx.scale));
    const w = src.width;
    const h = src.height;
    const S = src.data;

    const iw = w + 1;
    const ih = h + 1;
    const n = iw * ih;

    // Float64 throughout: sums reach 255 * pixel-count, well past the range
    // Float32 represents exactly, and a rounding error here shows up as
    // blocking artifacts in flat areas.
    const sR = new Float64Array(n);
    const sG = new Float64Array(n);
    const sB = new Float64Array(n);
    const sL = new Float64Array(n);
    const sL2 = new Float64Array(n);

    for (let y = 0; y < h; y++) {
      let rowR = 0;
      let rowG = 0;
      let rowB = 0;
      let rowL = 0;
      let rowL2 = 0;
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const l = luma(S[i], S[i + 1], S[i + 2]);
        rowR += S[i];
        rowG += S[i + 1];
        rowB += S[i + 2];
        rowL += l;
        rowL2 += l * l;

        const k = (y + 1) * iw + (x + 1);
        const up = y * iw + (x + 1);
        sR[k] = sR[up] + rowR;
        sG[k] = sG[up] + rowG;
        sB[k] = sB[up] + rowB;
        sL[k] = sL[up] + rowL;
        sL2[k] = sL2[up] + rowL2;
      }
    }

    // Inclusive box sum over [x0..x1] x [y0..y1].
    const box = (t: Float64Array, x0: number, y0: number, x1: number, y1: number) =>
      t[(y1 + 1) * iw + (x1 + 1)] - t[y0 * iw + (x1 + 1)] - t[(y1 + 1) * iw + x0] + t[y0 * iw + x0];

    const out = new ImageData(w, h);
    const O = out.data;

    for (let y = 0, i = 0; y < h; y++) {
      for (let x = 0; x < w; x++, i += 4) {
        const xa = Math.max(0, x - r);
        const xb = Math.min(w - 1, x + r);
        const ya = Math.max(0, y - r);
        const yb = Math.min(h - 1, y + r);

        let bestVar = Infinity;
        let bR = 0;
        let bG = 0;
        let bB = 0;

        // The four quadrants all include the centre pixel, which is what makes
        // the filter continuous across quadrant boundaries.
        for (let q = 0; q < 4; q++) {
          const qx0 = q & 1 ? x : xa;
          const qx1 = q & 1 ? xb : x;
          const qy0 = q & 2 ? y : ya;
          const qy1 = q & 2 ? yb : y;

          const count = (qx1 - qx0 + 1) * (qy1 - qy0 + 1);
          const mL = box(sL, qx0, qy0, qx1, qy1) / count;
          const variance = box(sL2, qx0, qy0, qx1, qy1) / count - mL * mL;

          if (variance < bestVar) {
            bestVar = variance;
            bR = box(sR, qx0, qy0, qx1, qy1) / count;
            bG = box(sG, qx0, qy0, qx1, qy1) / count;
            bB = box(sB, qx0, qy0, qx1, qy1) / count;
          }
        }

        O[i] = bR;
        O[i + 1] = bG;
        O[i + 2] = bB;
        O[i + 3] = S[i + 3];
      }
    }
    return out;
  },
};
