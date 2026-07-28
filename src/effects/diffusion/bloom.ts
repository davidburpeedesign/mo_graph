import type { JsEffect } from '../../core/types';
import { blurRGB, clamp255, luma, toFloatRGB } from '../lib';

/**
 * Bloom — extract the bright regions, blur them wide, add the glow back.
 *
 * Sits well after a dither: the quantized highlights bleed into the dark
 * areas and the hard 1-bit edges pick up a halo, which is close to how the
 * MORPHXGEN renders are described — light coming from screen/lighten
 * compositing rather than from a shadow.
 *
 * Runs in JS despite being a large-radius blur, because the separable box
 * blur in lib.ts uses a running sum: cost is independent of radius.
 */
export const bloom: JsEffect = {
  id: 'bloom',
  name: 'bloom',
  category: 'diffusion',
  description: 'threshold the highlights, blur wide, add the glow back',
  params: {
    threshold: { type: 'float', min: 0, max: 1, step: 0.01, default: 0.6, label: 'threshold' },
    knee: { type: 'float', min: 0, max: 1, step: 0.01, default: 0.3, label: 'knee' },
    radius: { type: 'int', min: 1, max: 200, default: 24, label: 'radius' },
    intensity: { type: 'float', min: 0, max: 3, step: 0.01, default: 1, label: 'intensity' },
    mode: { type: 'enum', options: ['add', 'screen'], default: 'screen', label: 'mode' },
  },

  apply(src, p, ctx) {
    const threshold = (p.threshold as number) * 255;
    const knee = Math.max(1e-3, (p.knee as number) * 255);
    const radius = Math.max(1, Math.round((p.radius as number) * ctx.scale));
    const intensity = p.intensity as number;
    const screen = p.mode === 'screen';

    const w = src.width;
    const h = src.height;
    const S = src.data;

    // Extract: soft knee above the threshold so the glow fades in rather than
    // switching on at a hard luma edge, which would band on gradients.
    const bright = toFloatRGB(src);
    for (let i = 0, j = 0; j < bright.length; i += 4, j += 3) {
      const l = luma(S[i], S[i + 1], S[i + 2]);
      const k = l <= threshold ? 0 : Math.min(1, (l - threshold) / knee);
      bright[j] *= k;
      bright[j + 1] *= k;
      bright[j + 2] *= k;
    }

    const glow = blurRGB(bright, w, h, radius, 3);

    const out = new ImageData(w, h);
    const O = out.data;
    for (let i = 0, j = 0; j < glow.length; i += 4, j += 3) {
      for (let c = 0; c < 3; c++) {
        const g = glow[j + c] * intensity;
        const base = S[i + c];
        O[i + c] = clamp255(screen ? 255 - ((255 - base) * (255 - Math.min(255, g))) / 255 : base + g);
      }
      O[i + 3] = S[i + 3];
    }
    return out;
  },
};
