import type { Category, Effect } from './types';

import { ordered } from '../effects/dither/ordered';
import { errorDiffusion } from '../effects/dither/errorDiffusion';
import { halftone } from '../effects/dither/halftone';
import { threshold } from '../effects/dither/threshold';

import { grain } from '../effects/noise/grain';

import { blockCrush } from '../effects/artifact/blockCrush';
import { rgbShift } from '../effects/artifact/rgbShift';
import { scanlines } from '../effects/artifact/scanlines';

import { duotone } from '../effects/color/duotone';
import { levels } from '../effects/color/levels';
import { palette } from '../effects/color/palette';
import { posterize } from '../effects/color/posterize';

/**
 * Every effect in the tool. Adding one is a file plus a line here — nothing
 * else in the codebase needs to learn it exists.
 */
export const EFFECTS: Effect[] = [
  ordered,
  errorDiffusion,
  halftone,
  threshold,
  grain,
  blockCrush,
  rgbShift,
  scanlines,
  levels,
  posterize,
  palette,
  duotone,
];

const byId = new Map(EFFECTS.map((e) => [e.id, e]));

export function getEffect(id: string): Effect | undefined {
  return byId.get(id);
}

export const CATEGORY_ORDER: Category[] = ['dither', 'noise', 'diffusion', 'artifact', 'color'];

export function byCategory(): [Category, Effect[]][] {
  return CATEGORY_ORDER.map((c) => [c, EFFECTS.filter((e) => e.category === c)] as [Category, Effect[]]).filter(
    ([, list]) => list.length > 0,
  );
}
