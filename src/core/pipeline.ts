import type { ChainEntry, Ctx, Effect } from './types';
import { getEffect } from './registry';
import { composite } from './blend';

/**
 * Fold the chain over a source image.
 *
 * The only rule beyond "run each effect in order" is `mix`: an effect's output
 * is blended back toward its input, which is what stands in for layer opacity.
 *
 * GL effects are not yet implemented (build order step 8). Until then an entry
 * declaring `kind: 'gl'` runs its `apply` fallback if it has one, and is
 * skipped if it does not — the same path that will handle a missing extension.
 */
export function runChain(chain: ChainEntry[], src: ImageData, scale: number): ImageData {
  let cur = src;

  for (const entry of chain) {
    if (!entry.enabled || entry.mix <= 0) continue;

    const effect = getEffect(entry.effectId);
    if (!effect) continue;

    const ctx: Ctx = { scale, seed: entry.seed };
    const out = applyEffect(effect, cur, entry, ctx);
    if (!out) continue;

    cur = composite(cur, out, entry.blend ?? 'normal', entry.mix);
  }

  return cur;
}

function applyEffect(effect: Effect, src: ImageData, entry: ChainEntry, ctx: Ctx): ImageData | null {
  const fn = effect.apply;
  if (!fn) return null;
  return fn(src, entry.params, ctx);
}

/** Timing helper for the status readout. */
export function timed<T>(fn: () => T): [T, number] {
  const t0 = performance.now();
  const result = fn();
  return [result, performance.now() - t0];
}
