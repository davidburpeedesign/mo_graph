/**
 * The effect contract. Everything the tool knows about an effect lives here.
 *
 * An effect is one file exporting one object: a description of its knobs plus
 * an implementation. The UI, the chain, the export path and the preset format
 * all read from this and nothing else.
 */

export type Category = 'dither' | 'noise' | 'diffusion' | 'artifact' | 'color' | 'geometry';

export type Param =
  | { type: 'float'; min: number; max: number; step: number; default: number; label: string }
  | { type: 'int'; min: number; max: number; default: number; label: string }
  | { type: 'enum'; options: string[]; default: string; label: string }
  | { type: 'bool'; default: boolean; label: string }
  | { type: 'color'; default: string; label: string };

export type ParamSchema = Record<string, Param>;

/** Concrete values for a schema — what the user has dialed in. */
export type Params = Record<string, number | string | boolean>;

export interface Ctx {
  /**
   * Preview scale, 0..1. Export renders at 1. Any effect measuring in pixels
   * (cell size, grain size, block size) must multiply by this so the preview
   * is a true representation of the export rather than the same pattern at a
   * different frequency.
   */
  scale: number;
  /** Deterministic randomness. Effects never call Math.random(). */
  seed: number;
}

interface EffectBase {
  /** Stable id, used in presets and URLs. Never rename after release. */
  id: string;
  /** Display name — lowercase, per the brand voice. */
  name: string;
  category: Category;
  /** One line, shown in the add-effect menu. */
  description: string;
  params: ParamSchema;
  /** Uses ctx.seed — the inspector offers a reseed button for these. */
  stochastic?: boolean;
}

export interface JsEffect extends EffectBase {
  kind?: 'js';
  apply(src: ImageData, p: Params, ctx: Ctx): ImageData;
}

export interface GlEffect extends EffectBase {
  kind: 'gl';
  fragment: string;
  uniforms(p: Params, ctx: Ctx): Record<string, number | number[]>;
  passes?: number;
  float?: boolean;
  /** Fallback used when GL is unavailable or the export exceeds MAX_TEXTURE_SIZE. */
  apply?(src: ImageData, p: Params, ctx: Ctx): ImageData;
}

export type Effect = JsEffect | GlEffect;

/** One entry in the chain. Serializes to JSON on its own. */
export interface ChainEntry {
  uid: string;
  effectId: string;
  params: Params;
  enabled: boolean;
  /** 0..1 — blends the effect's output back toward its input. */
  mix: number;
  seed: number;
}

export function defaultParams(schema: ParamSchema): Params {
  const out: Params = {};
  for (const key of Object.keys(schema)) out[key] = schema[key].default;
  return out;
}
