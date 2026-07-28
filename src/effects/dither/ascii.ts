import type { JsEffect } from '../../core/types';
import { clamp255, hexToRgb, luma } from '../lib';
import { FONT, GLYPH_H, GLYPH_W, RAMPS, RAMP_NAMES } from './asciiFont';

/**
 * ASCII rendering with a threshold mask.
 *
 * The image is divided into character cells, each cell's mean luma picks a
 * glyph from a density ramp, and the glyph is stamped at integer scale so it
 * stays pixel-crisp.
 *
 * The low/high thresholds gate which cells get converted: only cells whose
 * mean luma falls inside the band become type. Everything else either passes
 * the original image through or drops to background, which is what lets you
 * put ASCII into just the shadows or just the highlights instead of flattening
 * the whole frame.
 */
export const ascii: JsEffect = {
  id: 'ascii',
  name: 'ascii',
  category: 'dither',
  description: 'glyph density ramp with a threshold mask',
  params: {
    scale: { type: 'int', min: 1, max: 8, default: 2, label: 'cell scale' },
    ramp: { type: 'enum', options: RAMP_NAMES, default: 'standard', label: 'ramp' },
    low: { type: 'float', min: 0, max: 1, step: 0.01, default: 0, label: 'low threshold' },
    high: { type: 'float', min: 0, max: 1, step: 0.01, default: 1, label: 'high threshold' },
    outside: {
      type: 'enum',
      options: ['source', 'background'],
      default: 'source',
      label: 'outside band',
    },
    invert: { type: 'bool', default: false, label: 'invert ramp' },
    colorFromSource: { type: 'bool', default: false, label: 'sample source colour' },
    ink: { type: 'color', default: '#e4e3df', label: 'ink', visibleWhen: { key: 'colorFromSource', equals: [false] } },
    background: { type: 'color', default: '#222222', label: 'background' },
  },

  apply(src, p, ctx) {
    // Integer scale only — a fractional glyph scale would need resampling and
    // the type would go soft, which defeats the point.
    const scale = Math.max(1, Math.round((p.scale as number) * ctx.scale));
    const ramp = RAMPS[p.ramp as string] ?? RAMPS.standard;
    const low = (p.low as number) * 255;
    const high = (p.high as number) * 255;
    const keepSource = p.outside === 'source';
    const invert = p.invert as boolean;
    const fromSource = p.colorFromSource as boolean;
    const [ir, ig, ib] = hexToRgb(p.ink as string);
    const [br, bg, bb] = hexToRgb(p.background as string);

    const cellW = (GLYPH_W + 1) * scale;
    const cellH = (GLYPH_H + 1) * scale;

    const w = src.width;
    const h = src.height;
    const S = src.data;
    const out = new ImageData(w, h);
    const O = out.data;

    for (let cy = 0; cy < h; cy += cellH) {
      const yEnd = Math.min(cy + cellH, h);
      for (let cx = 0; cx < w; cx += cellW) {
        const xEnd = Math.min(cx + cellW, w);

        let sr = 0;
        let sg = 0;
        let sb = 0;
        let n = 0;
        for (let y = cy; y < yEnd; y++) {
          for (let x = cx; x < xEnd; x++) {
            const i = (y * w + x) * 4;
            sr += S[i];
            sg += S[i + 1];
            sb += S[i + 2];
            n++;
          }
        }
        const mr = sr / n;
        const mg = sg / n;
        const mb = sb / n;
        const l = luma(mr, mg, mb);

        if (l < low || l > high) {
          for (let y = cy; y < yEnd; y++) {
            for (let x = cx; x < xEnd; x++) {
              const i = (y * w + x) * 4;
              O[i] = keepSource ? S[i] : br;
              O[i + 1] = keepSource ? S[i + 1] : bg;
              O[i + 2] = keepSource ? S[i + 2] : bb;
              O[i + 3] = S[i + 3];
            }
          }
          continue;
        }

        let t = l / 255;
        if (invert) t = 1 - t;
        const glyph = FONT[ramp[Math.min(ramp.length - 1, Math.floor(t * ramp.length))]] ?? FONT[' '];

        const r = fromSource ? mr : ir;
        const g = fromSource ? mg : ig;
        const b = fromSource ? mb : ib;

        for (let y = cy; y < yEnd; y++) {
          const gy = ((y - cy) / scale) | 0;
          const row = gy < GLYPH_H ? glyph[gy] : 0;
          for (let x = cx; x < xEnd; x++) {
            const gx = ((x - cx) / scale) | 0;
            const on = gx < GLYPH_W && (row >> (GLYPH_W - 1 - gx)) & 1;
            const i = (y * w + x) * 4;
            O[i] = on ? clamp255(r) : br;
            O[i + 1] = on ? clamp255(g) : bg;
            O[i + 2] = on ? clamp255(b) : bb;
            O[i + 3] = S[i + 3];
          }
        }
      }
    }
    return out;
  },
};
