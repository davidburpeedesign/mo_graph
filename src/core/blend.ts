/**
 * Blend modes, applied between an effect's input (base) and its output (top).
 *
 * This is what makes the destructive effects usable in a stack: `ascii` or
 * `crt raster` replace the frame outright, but screened or overlaid onto their
 * own input they become a texture layer instead of a substitution.
 */

export type BlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'soft-light'
  | 'hard-light'
  | 'lighten'
  | 'darken'
  | 'add'
  | 'subtract'
  | 'difference'
  | 'exclusion'
  | 'dodge'
  | 'burn';

export const BLEND_MODES: BlendMode[] = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'soft-light',
  'hard-light',
  'lighten',
  'darken',
  'add',
  'subtract',
  'difference',
  'exclusion',
  'dodge',
  'burn',
];

export function blendLabel(mode: BlendMode): string {
  return mode.replace('-', ' ');
}

type BlendFn = (b: number, t: number) => number;

const softLight: BlendFn = (b, t) => {
  const bn = b / 255;
  const tn = t / 255;
  // W3C soft-light: the piecewise d() keeps the dark end from going flat.
  const d = bn <= 0.25 ? ((16 * bn - 12) * bn + 4) * bn : Math.sqrt(bn);
  const r = tn <= 0.5 ? bn - (1 - 2 * tn) * bn * (1 - bn) : bn + (2 * tn - 1) * (d - bn);
  return r * 255;
};

const FNS: Record<BlendMode, BlendFn | null> = {
  normal: null,
  multiply: (b, t) => (b * t) / 255,
  screen: (b, t) => 255 - ((255 - b) * (255 - t)) / 255,
  overlay: (b, t) => (b < 128 ? (2 * b * t) / 255 : 255 - (2 * (255 - b) * (255 - t)) / 255),
  'soft-light': softLight,
  'hard-light': (b, t) => (t < 128 ? (2 * t * b) / 255 : 255 - (2 * (255 - t) * (255 - b)) / 255),
  lighten: (b, t) => (b > t ? b : t),
  darken: (b, t) => (b < t ? b : t),
  add: (b, t) => b + t,
  subtract: (b, t) => b - t,
  difference: (b, t) => (b > t ? b - t : t - b),
  exclusion: (b, t) => b + t - (2 * b * t) / 255,
  dodge: (b, t) => (t >= 255 ? 255 : Math.min(255, (b * 255) / (255 - t))),
  burn: (b, t) => (t <= 0 ? 0 : 255 - Math.min(255, ((255 - b) * 255) / t)),
};

/**
 * Blend `top` over `base` and mix the result back toward `base`.
 *
 * Both operations happen in one pass so a chain entry costs a single
 * allocation rather than one for the blend and another for the mix.
 */
export function composite(base: ImageData, top: ImageData, mode: BlendMode, mix: number): ImageData {
  // Fast path: an untouched normal blend at full strength is just the output.
  if (mode === 'normal' && mix >= 1) return top;

  const fn = FNS[mode];
  const out = new ImageData(base.width, base.height);
  const B = base.data;
  const T = top.data;
  const O = out.data;
  const full = mix >= 1;

  for (let i = 0; i < O.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const b = B[i + c];
      const t = T[i + c];
      const v = fn ? fn(b, t) : t;
      O[i + c] = full ? v : b + (v - b) * mix;
    }
    O[i + 3] = T[i + 3];
  }
  return out;
}
