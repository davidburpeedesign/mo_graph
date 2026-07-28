import type { JsEffect } from '../../core/types';
import { NOISE_TYPES, curlNoise, noiseField, sampleBilinear, scaled } from '../lib';
import type { NoiseType } from '../lib';

/**
 * Displacement warp driven by a choice of noise field.
 *
 * The field type changes the character completely:
 *   value      soft blobby drift
 *   perlin     smoother, more even than value
 *   ridged     sharp creases along the ridges
 *   cellular   worley F1 — rounded cell-shaped pushes
 *   alligator  worley F2-F1 — scaly webbing along cell edges
 *   curl       divergence-free swirl; the only one that cannot pool or pinch,
 *              because a curl field has no sources or sinks
 *
 * Placed before a dither it warps the source and the dither stays on the pixel
 * grid; placed after, it drags the dither texture itself into ribbons.
 */
export const displace: JsEffect = {
  id: 'displace',
  name: 'displace',
  category: 'geometry',
  description: 'warp along a noise field — value, perlin, curl, alligator',
  stochastic: true,
  params: {
    noise: { type: 'enum', options: [...NOISE_TYPES, 'curl'], default: 'perlin', label: 'noise' },
    amount: { type: 'float', min: 0, max: 200, step: 0.5, default: 20, label: 'amount' },
    scale: { type: 'int', min: 4, max: 512, default: 96, label: 'scale' },
    octaves: { type: 'int', min: 1, max: 6, default: 3, label: 'octaves' },
    axis: {
      type: 'enum',
      options: ['both', 'horizontal', 'vertical'],
      default: 'both',
      label: 'axis',
      // Curl produces a genuine 2D vector; constraining it to one axis would
      // discard the property that makes it worth having.
      visibleWhen: { key: 'noise', equals: [...NOISE_TYPES] },
    },
  },

  apply(src, p, ctx) {
    const kind = p.noise as string;
    const amount = (p.amount as number) * ctx.scale;
    const scale = scaled(p.scale as number, ctx.scale);
    const octaves = p.octaves as number;
    const axis = p.axis as string;

    const w = src.width;
    const h = src.height;
    const S = src.data;
    const out = new ImageData(w, h);
    const O = out.data;

    const rgb: [number, number, number] = [0, 0, 0];
    const vec: [number, number] = [0, 0];

    const isCurl = kind === 'curl';
    const type = (isCurl ? 'perlin' : kind) as NoiseType;
    const doX = isCurl || axis !== 'vertical';
    const doY = isCurl || axis !== 'horizontal';

    for (let y = 0, i = 0; y < h; y++) {
      for (let x = 0; x < w; x++, i += 4) {
        let dx = 0;
        let dy = 0;

        if (isCurl) {
          curlNoise(x / scale, y / scale, ctx.seed, octaves, vec);
          dx = vec[0] * amount;
          dy = vec[1] * amount;
        } else {
          // Two decorrelated fields, so x and y offsets are independent.
          if (doX) dx = (noiseField(type, x / scale, y / scale, ctx.seed, octaves) - 0.5) * 2 * amount;
          if (doY) {
            dy = (noiseField(type, x / scale, y / scale, ctx.seed ^ 0x51ed270b, octaves) - 0.5) * 2 * amount;
          }
        }

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
