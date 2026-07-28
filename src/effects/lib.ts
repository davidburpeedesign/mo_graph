/** Shared primitives for JS effects. */

export { makeRng, hash2 } from '../core/rng';

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
