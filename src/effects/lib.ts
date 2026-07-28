/** Shared primitives for JS effects. */

import { hash2, makeRng } from '../core/rng';

export { makeRng, hash2 };

export function cloneImageData(src: ImageData): ImageData {
  const out = new ImageData(src.width, src.height);
  out.data.set(src.data);
  return out;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

/** Rec. 709 luma, on 0..255 channels. */
export function luma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Quantize to `levels` evenly spaced steps across 0..255.
 * levels=2 gives pure black and white, which is what most dithering wants.
 */
export function quantize(v: number, levels: number): number {
  const n = levels - 1;
  return clamp255(Math.round((v / 255) * n) * (255 / n));
}

/**
 * Recursive Bayer threshold matrix, normalized to 0..1 (exclusive of 1).
 *
 * M(2n) = [ 4M+0  4M+2 ]
 *         [ 4M+3  4M+1 ]
 */
export function bayerMatrix(size: number): Float32Array {
  let m = new Float32Array([0]);
  let n = 1;
  while (n < size) {
    const next = new Float32Array(n * n * 4);
    const w = n * 2;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const v = m[y * n + x] * 4;
        next[y * w + x] = v;
        next[y * w + (x + n)] = v + 2;
        next[(y + n) * w + x] = v + 3;
        next[(y + n) * w + (x + n)] = v + 1;
      }
    }
    m = next;
    n = w;
  }
  const total = size * size;
  const out = new Float32Array(total);
  for (let i = 0; i < total; i++) out[i] = m[i] / total;
  return out;
}

const bayerCache = new Map<number, Float32Array>();

export function getBayer(size: number): Float32Array {
  let m = bayerCache.get(size);
  if (!m) {
    m = bayerMatrix(size);
    bayerCache.set(size, m);
  }
  return m;
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export type Palette = [number, number, number][];

/**
 * Named palettes. `morphxgen` is the data scheme from the visual language
 * document — the one place the brand's imagery colors are allowed to appear.
 */
export const PALETTES: Record<string, Palette> = {
  mono: [
    [0, 0, 0],
    [255, 255, 255],
  ],
  bone: [
    [26, 26, 26],
    [34, 34, 34],
    [43, 43, 43],
    [217, 217, 217],
    [228, 227, 223],
  ],
  morphxgen: [
    [34, 34, 34],
    [49, 47, 74],
    [76, 88, 173],
    [107, 149, 194],
    [71, 43, 49],
    [141, 62, 70],
    [221, 125, 86],
    [228, 132, 132],
    [228, 227, 223],
  ],
  gameboy: [
    [15, 56, 15],
    [48, 98, 48],
    [139, 172, 15],
    [155, 188, 15],
  ],
  cga: [
    [0, 0, 0],
    [85, 255, 255],
    [255, 85, 255],
    [255, 255, 255],
  ],
  amber: [
    [20, 12, 0],
    [120, 66, 0],
    [217, 130, 20],
    [255, 200, 90],
  ],
};

export const PALETTE_NAMES = Object.keys(PALETTES);

/** Nearest palette entry by squared euclidean distance in RGB. */
export function nearestColor(pal: Palette, r: number, g: number, b: number): [number, number, number] {
  let best = pal[0];
  let bestD = Infinity;
  for (let i = 0; i < pal.length; i++) {
    const c = pal[i];
    const dr = r - c[0];
    const dg = g - c[1];
    const db = b - c[2];
    const d = dr * dr + dg * dg + db * db;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

/**
 * Round a pixel-measured parameter into preview space.
 * Never returns 0 — a cell size of 0 is a divide-by-zero, and a 1px cell is
 * the honest floor.
 */
export function scaled(px: number, scale: number): number {
  return Math.max(1, Math.round(px * scale));
}

/** Pack an ImageData's RGB into a float buffer for multi-pass work. */
export function toFloatRGB(src: ImageData): Float32Array {
  const out = new Float32Array(src.width * src.height * 3);
  const S = src.data;
  for (let i = 0, j = 0; j < out.length; i += 4, j += 3) {
    out[j] = S[i];
    out[j + 1] = S[i + 1];
    out[j + 2] = S[i + 2];
  }
  return out;
}

/**
 * Separable box blur, run `passes` times.
 *
 * Uses a running sum, so cost per pixel is constant regardless of radius —
 * a 200px blur costs the same as a 2px one. Three passes approximate a
 * gaussian closely enough that the difference is invisible at 8-bit.
 *
 * This is why the blur-driven effects stayed in JS: the O(radius²) argument
 * for putting them on the GPU does not apply to a running-sum box blur.
 */
export function blurRGB(buf: Float32Array, w: number, h: number, radius: number, passes = 3): Float32Array {
  if (radius < 1) return buf;
  let src = buf;
  let dst = new Float32Array(buf.length);

  for (let p = 0; p < passes; p++) {
    boxPass(src, dst, w, h, radius, true);
    boxPass(dst, src, w, h, radius, false);
  }
  return src;
}

function boxPass(
  src: Float32Array,
  dst: Float32Array,
  w: number,
  h: number,
  r: number,
  horizontal: boolean,
): void {
  const lines = horizontal ? h : w;
  const len = horizontal ? w : h;
  const step = horizontal ? 3 : w * 3;
  const norm = 1 / (2 * r + 1);
  const clampI = (i: number) => (i < 0 ? 0 : i >= len ? len - 1 : i);

  for (let line = 0; line < lines; line++) {
    const base = horizontal ? line * w * 3 : line * 3;
    for (let c = 0; c < 3; c++) {
      let sum = 0;
      for (let i = -r; i <= r; i++) sum += src[base + clampI(i) * step + c];

      for (let i = 0; i < len; i++) {
        dst[base + i * step + c] = sum * norm;
        sum += src[base + clampI(i + r + 1) * step + c] - src[base + clampI(i - r) * step + c];
      }
    }
  }
}

/** Smooth-interpolated value noise, 0..1. */
export function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  // Smoothstep the interpolant, otherwise the lattice grid is visible.
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);

  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);

  const top = a + (b - a) * u;
  const bot = c + (d - c) * u;
  return top + (bot - top) * v;
}

/** Fractal brownian motion over value noise, normalized to 0..1. */
export function fbm(x: number, y: number, seed: number, octaves: number, gain = 0.5): number {
  let sum = 0;
  let amp = 1;
  let total = 0;
  let fx = x;
  let fy = y;

  for (let o = 0; o < octaves; o++) {
    sum += valueNoise(fx, fy, seed + o * 7919) * amp;
    total += amp;
    amp *= gain;
    fx *= 2;
    fy *= 2;
  }
  return sum / total;
}

/** Bilinear sample of an ImageData at fractional coordinates. */
export function sampleBilinear(
  S: Uint8ClampedArray,
  w: number,
  h: number,
  x: number,
  y: number,
  out: [number, number, number],
): void {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;

  const cx0 = clamp(x0, 0, w - 1);
  const cy0 = clamp(y0, 0, h - 1);
  const cx1 = clamp(x0 + 1, 0, w - 1);
  const cy1 = clamp(y0 + 1, 0, h - 1);

  const i00 = (cy0 * w + cx0) * 4;
  const i10 = (cy0 * w + cx1) * 4;
  const i01 = (cy1 * w + cx0) * 4;
  const i11 = (cy1 * w + cx1) * 4;

  for (let c = 0; c < 3; c++) {
    const top = S[i00 + c] + (S[i10 + c] - S[i00 + c]) * fx;
    const bot = S[i01 + c] + (S[i11 + c] - S[i01 + c]) * fx;
    out[c] = top + (bot - top) * fy;
  }
}

/**
 * Void-and-cluster blue noise tile, values 0..1.
 *
 * Blue noise has no low-frequency content, so using it as a dither threshold
 * scatters error at frequencies the eye is least sensitive to. The result
 * looks like fine even grain rather than Bayer's visible crosshatch, without
 * error diffusion's serial cost.
 *
 * Generation is O(n^4) in the tile edge, so tiles are small and cached. A
 * 64x64 tile takes a few hundred ms once, then never again.
 */
export function blueNoiseTile(n: number, seed = 1): Float32Array {
  const N = n * n;
  const sigma = 1.5;
  const kr = 6;

  const kernel: number[] = [];
  for (let dy = -kr; dy <= kr; dy++) {
    for (let dx = -kr; dx <= kr; dx++) {
      kernel.push(Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma)));
    }
  }

  const energy = new Float32Array(N);

  // Wrap-around splat: the tile must be seamless when repeated.
  const splat = (idx: number, sign: number) => {
    const x = idx % n;
    const y = (idx / n) | 0;
    let k = 0;
    for (let dy = -kr; dy <= kr; dy++) {
      const yy = (((y + dy) % n) + n) % n;
      for (let dx = -kr; dx <= kr; dx++, k++) {
        const xx = (((x + dx) % n) + n) % n;
        energy[yy * n + xx] += sign * kernel[k];
      }
    }
  };

  const tightestCluster = (mask: Uint8Array) => {
    let best = -Infinity;
    let at = -1;
    for (let i = 0; i < N; i++) if (mask[i] && energy[i] > best) ((best = energy[i]), (at = i));
    return at;
  };
  const largestVoid = (mask: Uint8Array) => {
    let worst = Infinity;
    let at = -1;
    for (let i = 0; i < N; i++) if (!mask[i] && energy[i] < worst) ((worst = energy[i]), (at = i));
    return at;
  };

  // Seed with a sparse random pattern.
  const rng = makeRng(seed);
  const count = Math.max(1, Math.round(N * 0.1));
  const pool = Array.from({ length: N }, (_, i) => i);
  const ones = new Uint8Array(N);
  for (let i = 0; i < count; i++) {
    const j = i + ((rng() * (N - i)) | 0);
    const t = pool[i];
    pool[i] = pool[j];
    pool[j] = t;
    ones[pool[i]] = 1;
    splat(pool[i], 1);
  }

  // Relax it until moving the tightest cluster into the largest void is a no-op.
  for (let guard = 0; guard < N * 4; guard++) {
    const tc = tightestCluster(ones);
    ones[tc] = 0;
    splat(tc, -1);
    const lv = largestVoid(ones);
    if (lv === tc) {
      ones[tc] = 1;
      splat(tc, 1);
      break;
    }
    ones[lv] = 1;
    splat(lv, 1);
  }

  const initial = ones.slice();
  const rank = new Int32Array(N).fill(-1);

  // Phase 1 — strip ones out, ranking them count-1 down to 0.
  {
    const mask = initial.slice();
    for (let r = count - 1; r >= 0; r--) {
      const tc = tightestCluster(mask);
      mask[tc] = 0;
      splat(tc, -1);
      rank[tc] = r;
    }
  }

  // Phase 2 — fill voids back in, ranking count up to N-1.
  {
    const mask = initial.slice();
    energy.fill(0);
    for (let i = 0; i < N; i++) if (mask[i]) splat(i, 1);
    for (let r = count; r < N; r++) {
      const lv = largestVoid(mask);
      mask[lv] = 1;
      splat(lv, 1);
      rank[lv] = r;
    }
  }

  const out = new Float32Array(N);
  for (let i = 0; i < N; i++) out[i] = (rank[i] + 0.5) / N;
  return out;
}

const blueNoiseCache = new Map<number, Float32Array>();

export function getBlueNoise(size: number): Float32Array {
  let t = blueNoiseCache.get(size);
  if (!t) {
    t = blueNoiseTile(size);
    blueNoiseCache.set(size, t);
  }
  return t;
}
