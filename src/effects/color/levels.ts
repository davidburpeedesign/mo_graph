import type { JsEffect } from '../../core/types';
import { clamp255, luma } from '../lib';

/**
 * Brightness / contrast / gamma / saturation.
 *
 * Almost always wants to sit *above* a dither in the chain: pushing contrast
 * into the source is how you control where a 2-level dither puts its edge.
 * Built as a 256-entry LUT, so cost is independent of the parameter values.
 */
export const levels: JsEffect = {
  id: 'levels',
  name: 'levels',
  category: 'color',
  description: 'brightness, contrast, gamma — shape the input to a dither',
  params: {
    brightness: { type: 'float', min: -1, max: 1, step: 0.01, default: 0, label: 'brightness' },
    contrast: { type: 'float', min: -1, max: 1, step: 0.01, default: 0, label: 'contrast' },
    shadows: { type: 'float', min: -1, max: 1, step: 0.01, default: 0, label: 'shadows' },
    highlights: { type: 'float', min: -1, max: 1, step: 0.01, default: 0, label: 'highlights' },
    gamma: { type: 'float', min: 0.1, max: 4, step: 0.01, default: 1, label: 'gamma' },
    saturation: { type: 'float', min: 0, max: 2, step: 0.01, default: 1, label: 'saturation' },
    invert: { type: 'bool', default: false, label: 'invert' },
  },

  apply(src, p) {
    const brightness = (p.brightness as number) * 255;
    const contrast = p.contrast as number;
    const shadows = p.shadows as number;
    const highlights = p.highlights as number;
    const gamma = p.gamma as number;
    const saturation = p.saturation as number;
    const invert = p.invert as boolean;

    // Standard contrast slope: -1 flattens to mid gray, +1 approaches a step.
    const slope = contrast >= 0 ? 1 / Math.max(1e-3, 1 - contrast) : 1 + contrast;

    const lut = new Uint8ClampedArray(256);
    for (let v = 0; v < 256; v++) {
      let x = v + brightness;
      x = (x - 128) * slope + 128;

      /**
       * Shadows and highlights are weighted lifts, not curve reshapes: each
       * acts through a mask that falls off toward the opposite end of the
       * range, so lifting shadows leaves the highlights where they are. The
       * squared falloff keeps the two from meeting in the midtones and
       * cancelling.
       */
      if (shadows !== 0 || highlights !== 0) {
        const t = Math.min(1, Math.max(0, x / 255));
        const shadowMask = (1 - t) * (1 - t);
        const highlightMask = t * t;
        x += shadows * 127 * shadowMask + highlights * 127 * highlightMask;
      }

      x = 255 * Math.pow(Math.max(0, x) / 255, 1 / gamma);
      if (invert) x = 255 - x;
      lut[v] = clamp255(x);
    }

    const out = new ImageData(src.width, src.height);
    const S = src.data;
    const O = out.data;

    for (let i = 0; i < O.length; i += 4) {
      let r = lut[S[i]];
      let g = lut[S[i + 1]];
      let b = lut[S[i + 2]];

      if (saturation !== 1) {
        const l = luma(r, g, b);
        r = clamp255(l + (r - l) * saturation);
        g = clamp255(l + (g - l) * saturation);
        b = clamp255(l + (b - l) * saturation);
      }

      O[i] = r;
      O[i + 1] = g;
      O[i + 2] = b;
      O[i + 3] = S[i + 3];
    }
    return out;
  },
};
