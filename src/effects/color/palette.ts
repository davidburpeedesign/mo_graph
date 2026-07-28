import type { JsEffect } from '../../core/types';
import { PALETTES, PALETTE_NAMES, getBayer, clamp255, nearestColor } from '../lib';

/**
 * Map every pixel to the nearest entry in a fixed palette.
 *
 * The optional bayer offset is what makes this usable on photographs: without
 * it, a small palette produces hard banding, because nearest-color is a step
 * function. Perturbing the lookup position by a threshold matrix trades that
 * banding for texture — the same trade ordered dithering makes, applied in
 * palette space instead of level space.
 */
export const palette: JsEffect = {
  id: 'palette_map',
  name: 'palette map',
  category: 'color',
  description: 'snap to a fixed palette, optionally dithered',
  params: {
    palette: { type: 'enum', options: PALETTE_NAMES, default: 'morphxgen', label: 'palette' },
    dither: { type: 'float', min: 0, max: 1, step: 0.01, default: 0.5, label: 'dither' },
    matrix: { type: 'enum', options: ['2', '4', '8', '16'], default: '8', label: 'matrix' },
  },

  apply(src, p) {
    const pal = PALETTES[p.palette as string] ?? PALETTES.mono;
    const amount = p.dither as number;
    const size = parseInt(p.matrix as string, 10);
    const m = getBayer(size);

    // Scale the offset by the palette's average spacing, so a 2-color palette
    // gets a large kick and a 9-color palette gets a subtle one.
    const spread = (255 / Math.max(1, pal.length - 1)) * amount;

    const w = src.width;
    const out = new ImageData(w, src.height);
    const S = src.data;
    const O = out.data;

    for (let y = 0, i = 0; y < src.height; y++) {
      const row = (y % size) * size;
      for (let x = 0; x < w; x++, i += 4) {
        const t = amount > 0 ? (m[row + (x % size)] - 0.5) * spread : 0;
        const c = nearestColor(pal, clamp255(S[i] + t), clamp255(S[i + 1] + t), clamp255(S[i + 2] + t));
        O[i] = c[0];
        O[i + 1] = c[1];
        O[i + 2] = c[2];
        O[i + 3] = S[i + 3];
      }
    }
    return out;
  },
};
