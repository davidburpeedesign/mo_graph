import type { JsEffect } from '../../core/types';
import { cloneImageData, luma } from '../lib';

/**
 * Pixel sorting.
 *
 * Walks each row (or column), finds runs of pixels whose luma falls inside a
 * threshold band, and sorts each run by brightness. The threshold band is what
 * makes it look intentional rather than like a broken image — it confines the
 * smearing to shadows or highlights and leaves the rest of the frame intact.
 *
 * Sequential by nature, so it stays in JS. It is the slowest effect here at
 * export resolution; if that becomes a problem the answer is a worker, not a
 * shader, since sorting is a poor fit for a fragment program.
 */
export const pixelSort: JsEffect = {
  id: 'pixel_sort',
  name: 'pixel sort',
  category: 'artifact',
  description: 'sort runs of pixels by brightness within a luma band',
  params: {
    low: { type: 'float', min: 0, max: 1, step: 0.01, default: 0.25, label: 'low' },
    high: { type: 'float', min: 0, max: 1, step: 0.01, default: 0.8, label: 'high' },
    maxSpan: { type: 'float', min: 0.01, max: 1, step: 0.01, default: 1, label: 'max span' },
    vertical: { type: 'bool', default: false, label: 'vertical' },
    reverse: { type: 'bool', default: false, label: 'reverse' },
  },

  apply(src, p) {
    const low = (p.low as number) * 255;
    const high = (p.high as number) * 255;
    const vertical = p.vertical as boolean;
    const reverse = p.reverse as boolean;

    const w = src.width;
    const h = src.height;
    const out = cloneImageData(src);
    const O = out.data;

    const lines = vertical ? w : h;
    const len = vertical ? h : w;
    const stride = vertical ? w * 4 : 4;
    const maxSpan = Math.max(2, Math.round((p.maxSpan as number) * len));

    const lum = new Float32Array(len);
    const bucket: { l: number; r: number; g: number; b: number }[] = [];

    for (let line = 0; line < lines; line++) {
      const base = vertical ? line * 4 : line * w * 4;

      for (let i = 0; i < len; i++) {
        const j = base + i * stride;
        lum[i] = luma(O[j], O[j + 1], O[j + 2]);
      }

      let i = 0;
      while (i < len) {
        if (lum[i] < low || lum[i] > high) {
          i++;
          continue;
        }
        let j = i;
        while (j < len && lum[j] >= low && lum[j] <= high && j - i < maxSpan) j++;

        if (j - i > 1) {
          bucket.length = 0;
          for (let k = i; k < j; k++) {
            const o = base + k * stride;
            bucket.push({ l: lum[k], r: O[o], g: O[o + 1], b: O[o + 2] });
          }
          bucket.sort((a, b) => (reverse ? b.l - a.l : a.l - b.l));
          for (let k = i; k < j; k++) {
            const o = base + k * stride;
            const px = bucket[k - i];
            O[o] = px.r;
            O[o + 1] = px.g;
            O[o + 2] = px.b;
          }
        }
        i = j;
      }
    }
    return out;
  },
};
