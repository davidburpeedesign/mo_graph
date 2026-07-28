import type { JsEffect } from '../../core/types';
import {
  PALETTES,
  PALETTE_NAMES,
  clamp255,
  getBayer,
  gradientPalette,
  hexToRgb,
  nearestColor,
} from '../lib';

const CUSTOM = 'custom';
const showCustom = { key: 'palette', equals: [CUSTOM] };

/**
 * Map every pixel to the nearest entry in a palette.
 *
 * The optional bayer offset is what makes this usable on photographs: without
 * it, a small palette produces hard banding, because nearest-colour is a step
 * function. Perturbing the lookup position by a threshold matrix trades that
 * banding for texture — the same trade ordered dithering makes, applied in
 * palette space instead of level space.
 *
 * `custom` builds the palette by walking a gradient through two to four stops
 * and sampling it at `steps` even intervals, so you get a controlled ramp
 * rather than an arbitrary set of swatches.
 */
export const palette: JsEffect = {
  id: 'palette_map',
  name: 'palette map',
  category: 'color',
  description: 'snap to a fixed or gradient-built palette, optionally dithered',
  params: {
    palette: {
      type: 'enum',
      options: [...PALETTE_NAMES, CUSTOM],
      default: 'morphxgen',
      label: 'palette',
    },
    stops: { type: 'int', min: 2, max: 4, default: 3, label: 'gradient stops', visibleWhen: showCustom },
    steps: { type: 'int', min: 2, max: 32, default: 6, label: 'colours', visibleWhen: showCustom },
    c1: { type: 'color', default: '#222222', label: 'stop 1', visibleWhen: showCustom },
    c2: { type: 'color', default: '#8d3e46', label: 'stop 2', visibleWhen: showCustom },
    c3: { type: 'color', default: '#dd7d56', label: 'stop 3', visibleWhen: showCustom },
    c4: { type: 'color', default: '#e4e3df', label: 'stop 4', visibleWhen: showCustom },
    dither: { type: 'float', min: 0, max: 1, step: 0.01, default: 0.5, label: 'dither' },
    matrix: { type: 'enum', options: ['2', '4', '8', '16'], default: '8', label: 'matrix' },
  },

  apply(src, p) {
    const name = p.palette as string;

    const pal =
      name === CUSTOM
        ? gradientPalette(
            [p.c1, p.c2, p.c3, p.c4]
              .slice(0, p.stops as number)
              .map((c) => hexToRgb(c as string)),
            p.steps as number,
          )
        : (PALETTES[name] ?? PALETTES.mono);

    const amount = p.dither as number;
    const size = parseInt(p.matrix as string, 10);
    const m = getBayer(size);

    // Scale the offset by the palette's average spacing, so a 2-colour palette
    // gets a large kick and a 9-colour palette gets a subtle one.
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
