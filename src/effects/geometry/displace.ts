import type { JsEffect } from '../../core/types';
import { fbm, sampleBilinear, scaled } from '../lib';

/**
 * Displacement warp driven by fractal noise.
 *
 * Two independent noise fields drive the x and y offsets. Placed before a
 * dither it warps the source and the dither pattern stays on the pixel grid;
 * placed after, it drags the dither texture itself into ribbons, which is the
 * more interesting of the two.
 */
export const displace: JsEffect = {
  id: 'displace',
  name: 'displace',
  category: 'geometry',
  description: 'warp along a fractal noise field',
  stochastic: true,
  params: {
    amount: { type: 'float', min: 0, max: 200, step: 0.5, default: 20, label: 'amount' },
    scale: { type: 'int', min: 4, max: 512, default: 96, label: 'scale' },
    octaves: { type: 'int', min: 1, max: 6, default: 3, label: 'octaves' },
    axis: { type: 'enum', options: ['both', 'horizontal', 'vertical'], default: 'both', label: 'axis' },
  },

  apply(src, p, ctx) {
    const amount = (p.amount as number) * ctx.scale;
    const scale = scaled(p.scale as number, ctx.scale);
    const octaves = p.octaves as number;
    const axis = p.axis as string;

    const w = src.width;
    const h = src.height;
    const S = src.data;
    const out = new ImageData(w, h);
    const O = out.data;

    const doX = axis !== 'vertical';
    const doY = axis !== 'horizontal';
    const rgb: [number, number, number] = [0, 0, 0];

    for (let y = 0, i = 0; y < h; y++) {
      for (let x = 0; x < w; x++, i += 4) {
        const dx = doX ? (fbm(x / scale, y / scale, ctx.seed, octaves) - 0.5) * 2 * amount : 0;
        const dy = doY ? (fbm(x / scale, y / scale, ctx.seed ^ 0x51ed270b, octaves) - 0.5) * 2 * amount : 0;

        sampleBilinear(S, w, h, x + dx, y + dy, rgb);
        O[i] = rgb[0];
        O[i + 1] = rgb[1];
        O[i + 2] = rgb[2];
        O[i + 3] = S[i + 3];
      }
    }
    return out;
  },
};
