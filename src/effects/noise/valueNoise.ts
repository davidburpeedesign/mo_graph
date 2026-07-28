import type { JsEffect } from '../../core/types';
import { clamp255, fbm, scaled } from '../lib';

/**
 * Fractal noise overlay.
 *
 * Unlike film grain, which is per-pixel, this is a structured cloud with
 * scale — useful for mottling, paper texture, and for perturbing a dither's
 * threshold at low frequency so the pattern breaks up in organic patches
 * rather than uniformly. Put it before a dither for that; after, it just
 * sits on top as texture.
 */
export const valueNoiseEffect: JsEffect = {
  id: 'fbm_noise',
  name: 'fbm noise',
  category: 'noise',
  description: 'fractal cloud texture — structured, unlike per-pixel grain',
  stochastic: true,
  params: {
    scale: { type: 'int', min: 2, max: 512, default: 64, label: 'scale' },
    octaves: { type: 'int', min: 1, max: 8, default: 4, label: 'octaves' },
    gain: { type: 'float', min: 0.1, max: 0.9, step: 0.01, default: 0.5, label: 'gain' },
    amount: { type: 'float', min: 0, max: 1, step: 0.01, default: 0.3, label: 'amount' },
    mode: { type: 'enum', options: ['overlay', 'add', 'multiply'], default: 'overlay', label: 'mode' },
    mono: { type: 'bool', default: true, label: 'monochrome' },
  },

  apply(src, p, ctx) {
    const scale = scaled(p.scale as number, ctx.scale);
    const octaves = p.octaves as number;
    const gain = p.gain as number;
    const amount = p.amount as number;
    const mode = p.mode as string;
    const mono = p.mono as boolean;

    const w = src.width;
    const h = src.height;
    const S = src.data;
    const out = new ImageData(w, h);
    const O = out.data;

    for (let y = 0, i = 0; y < h; y++) {
      for (let x = 0; x < w; x++, i += 4) {
        const nBase = fbm(x / scale, y / scale, ctx.seed, octaves, gain);

        for (let c = 0; c < 3; c++) {
          const n = mono || c === 0 ? nBase : fbm(x / scale, y / scale, ctx.seed + c * 104729, octaves, gain);
          const base = S[i + c];
          let v: number;

          if (mode === 'add') {
            v = base + (n - 0.5) * 2 * 255 * amount;
          } else if (mode === 'multiply') {
            v = base * (1 - amount + n * amount * 2);
          } else {
            // Overlay: preserves the image's own tonal structure, unlike add.
            const b = base / 255;
            const o = b < 0.5 ? 2 * b * n : 1 - 2 * (1 - b) * (1 - n);
            v = base + (o * 255 - base) * amount;
          }
          O[i + c] = clamp255(v);
        }
        O[i + 3] = S[i + 3];
      }
    }
    return out;
  },
};
