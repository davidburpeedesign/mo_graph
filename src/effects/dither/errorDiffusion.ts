import type { JsEffect } from '../../core/types';
import { clamp255, luma, quantize } from '../lib';

/**
 * Error-diffusion dithering.
 *
 * Quantizes each pixel and pushes the resulting error onto neighbors that have
 * not been visited yet. This is sequential by definition — pixel N depends on
 * the error left by pixel N-1 — which is why it stays in JS permanently rather
 * than moving to a fragment shader.
 *
 * Kernels are [dx, dy, weight]; weights are divided by the kernel's divisor.
 */
type Kernel = { div: number; taps: [number, number, number][] };

const KERNELS: Record<string, Kernel> = {
  'floyd-steinberg': {
    div: 16,
    taps: [
      [1, 0, 7],
      [-1, 1, 3],
      [0, 1, 5],
      [1, 1, 1],
    ],
  },
  atkinson: {
    // Divides by 8 but only distributes 6/8 — the missing eighth is why
    // Atkinson blows out highlights and crushes shadows. That is the look.
    div: 8,
    taps: [
      [1, 0, 1],
      [2, 0, 1],
      [-1, 1, 1],
      [0, 1, 1],
      [1, 1, 1],
      [0, 2, 1],
    ],
  },
  stucki: {
    div: 42,
    taps: [
      [1, 0, 8],
      [2, 0, 4],
      [-2, 1, 2],
      [-1, 1, 4],
      [0, 1, 8],
      [1, 1, 4],
      [2, 1, 2],
      [-2, 2, 1],
      [-1, 2, 2],
      [0, 2, 4],
      [1, 2, 2],
      [2, 2, 1],
    ],
  },
  'jarvis-judice-ninke': {
    div: 48,
    taps: [
      [1, 0, 7],
      [2, 0, 5],
      [-2, 1, 3],
      [-1, 1, 5],
      [0, 1, 7],
      [1, 1, 5],
      [2, 1, 3],
      [-2, 2, 1],
      [-1, 2, 3],
      [0, 2, 5],
      [1, 2, 3],
      [2, 2, 1],
    ],
  },
  burkes: {
    div: 32,
    taps: [
      [1, 0, 8],
      [2, 0, 4],
      [-2, 1, 2],
      [-1, 1, 4],
      [0, 1, 8],
      [1, 1, 4],
      [2, 1, 2],
    ],
  },
  sierra: {
    div: 32,
    taps: [
      [1, 0, 5],
      [2, 0, 3],
      [-2, 1, 2],
      [-1, 1, 4],
      [0, 1, 5],
      [1, 1, 4],
      [2, 1, 2],
      [-1, 2, 2],
      [0, 2, 3],
      [1, 2, 2],
    ],
  },
};

export const errorDiffusion: JsEffect = {
  id: 'error_diffusion',
  name: 'error diffusion',
  category: 'dither',
  description: 'floyd-steinberg and friends — organic, grain-free gradients',
  params: {
    kernel: {
      type: 'enum',
      options: Object.keys(KERNELS),
      default: 'floyd-steinberg',
      label: 'kernel',
    },
    levels: { type: 'int', min: 2, max: 16, default: 2, label: 'levels' },
    strength: { type: 'float', min: 0, max: 1.5, step: 0.01, default: 1, label: 'diffusion' },
    serpentine: { type: 'bool', default: true, label: 'serpentine' },
    mono: { type: 'bool', default: true, label: 'monochrome' },
  },

  apply(src, p) {
    const kernel = KERNELS[p.kernel as string] ?? KERNELS['floyd-steinberg'];
    const levels = p.levels as number;
    const strength = p.strength as number;
    const serpentine = p.serpentine as boolean;
    const mono = p.mono as boolean;

    const w = src.width;
    const h = src.height;
    const S = src.data;

    // Float working buffer: error accumulates well past 0..255 and clamping it
    // mid-diffusion is what produces the muddy look in naive implementations.
    const buf = new Float32Array(w * h * 3);
    for (let i = 0, j = 0; j < buf.length; i += 4, j += 3) {
      if (mono) {
        const l = luma(S[i], S[i + 1], S[i + 2]);
        buf[j] = buf[j + 1] = buf[j + 2] = l;
      } else {
        buf[j] = S[i];
        buf[j + 1] = S[i + 1];
        buf[j + 2] = S[i + 2];
      }
    }

    const taps = kernel.taps;
    const div = kernel.div;
    const channels = mono ? 1 : 3;

    for (let y = 0; y < h; y++) {
      const rightward = !serpentine || y % 2 === 0;
      const xStart = rightward ? 0 : w - 1;
      const xEnd = rightward ? w : -1;
      const xStep = rightward ? 1 : -1;

      for (let x = xStart; x !== xEnd; x += xStep) {
        const base = (y * w + x) * 3;

        for (let c = 0; c < channels; c++) {
          const old = buf[base + c];
          const next = quantize(clamp255(old), levels);
          const err = (old - next) * strength;
          buf[base + c] = next;

          for (let t = 0; t < taps.length; t++) {
            // Mirror the kernel horizontally on right-to-left rows, otherwise
            // serpentine scanning diffuses error backwards into finished pixels.
            const dx = taps[t][0] * xStep;
            const dy = taps[t][1];
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx >= w || ny >= h) continue;
            buf[(ny * w + nx) * 3 + c] += (err * taps[t][2]) / div;
          }
        }
      }
    }

    const out = new ImageData(w, h);
    const O = out.data;
    for (let i = 0, j = 0; i < O.length; i += 4, j += 3) {
      if (mono) {
        O[i] = O[i + 1] = O[i + 2] = clamp255(buf[j]);
      } else {
        O[i] = clamp255(buf[j]);
        O[i + 1] = clamp255(buf[j + 1]);
        O[i + 2] = clamp255(buf[j + 2]);
      }
      O[i + 3] = S[i + 3];
    }
    return out;
  },
};
