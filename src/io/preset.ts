import type { BlendMode, ChainEntry, Param, ParamSchema, Params } from '../core/types';
import { defaultParams } from '../core/types';
import { getEffect } from '../core/registry';
import { BLEND_MODES } from '../core/blend';

export const PRESET_FORMAT = 'mo_graph.preset';
export const PRESET_VERSION = 1;

export interface PresetEntry {
  effectId: string;
  params: Params;
  enabled: boolean;
  blend: BlendMode;
  mix: number;
  seed: number;
}

export interface Preset {
  format: typeof PRESET_FORMAT;
  version: number;
  created: string;
  chain: PresetEntry[];
}

export function exportPreset(chain: ChainEntry[]): Preset {
  return {
    format: PRESET_FORMAT,
    version: PRESET_VERSION,
    created: new Date().toISOString(),
    chain: chain.map(({ effectId, params, enabled, blend, mix, seed }) => ({
      effectId,
      params,
      enabled,
      blend,
      mix,
      seed,
    })),
  };
}

function clampNum(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Coerce one incoming value against its schema entry.
 *
 * Presets are user-editable JSON and may come from an older build, so every
 * value is validated rather than trusted: wrong types, out-of-range numbers,
 * enum options that no longer exist, and missing keys all fall back to the
 * effect's default instead of reaching an effect and producing NaN pixels.
 */
function coerceParam(spec: Param, v: unknown): number | string | boolean | undefined {
  switch (spec.type) {
    case 'int':
    case 'float': {
      const n = typeof v === 'number' ? v : Number(v);
      if (!Number.isFinite(n)) return undefined;
      return clampNum(spec.type === 'int' ? Math.round(n) : n, spec.min, spec.max);
    }
    case 'bool':
      return typeof v === 'boolean' ? v : undefined;
    case 'enum':
      return typeof v === 'string' && spec.options.includes(v) ? v : undefined;
    case 'color':
      return typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v) ? v : undefined;
  }
}

function coerceParams(schema: ParamSchema, incoming: unknown): Params {
  const out = defaultParams(schema);
  if (!incoming || typeof incoming !== 'object') return out;
  const src = incoming as Record<string, unknown>;

  for (const [key, spec] of Object.entries(schema)) {
    if (!(key in src)) continue;
    const v = coerceParam(spec, src[key]);
    if (v !== undefined) out[key] = v;
  }
  return out;
}

export interface ImportResult {
  chain: Omit<ChainEntry, 'uid'>[];
  warnings: string[];
}

export function importPreset(raw: unknown): ImportResult {
  const warnings: string[] = [];

  if (!raw || typeof raw !== 'object') {
    throw new Error('not a preset file');
  }
  const p = raw as Partial<Preset>;

  if (p.format !== PRESET_FORMAT) {
    throw new Error('not a mo_graph preset');
  }
  if (typeof p.version === 'number' && p.version > PRESET_VERSION) {
    warnings.push(`preset is version ${p.version}, this build reads ${PRESET_VERSION}`);
  }
  if (!Array.isArray(p.chain)) {
    throw new Error('preset has no chain');
  }

  const chain: Omit<ChainEntry, 'uid'>[] = [];

  for (const item of p.chain) {
    if (!item || typeof item !== 'object') continue;
    const entry = item as Partial<PresetEntry>;
    const effect = typeof entry.effectId === 'string' ? getEffect(entry.effectId) : undefined;

    if (!effect) {
      warnings.push(`unknown effect "${String(entry.effectId)}"`);
      continue;
    }

    chain.push({
      effectId: effect.id,
      params: coerceParams(effect.params, entry.params),
      enabled: typeof entry.enabled === 'boolean' ? entry.enabled : true,
      // Presets written before blend modes existed simply have no key here,
      // and normal is the mode that reproduces their original render.
      blend:
        typeof entry.blend === 'string' && (BLEND_MODES as string[]).includes(entry.blend)
          ? (entry.blend as BlendMode)
          : 'normal',
      mix: typeof entry.mix === 'number' && Number.isFinite(entry.mix) ? clampNum(entry.mix, 0, 1) : 1,
      seed:
        typeof entry.seed === 'number' && Number.isFinite(entry.seed)
          ? Math.abs(Math.round(entry.seed))
          : 0,
    });
  }

  return { chain, warnings };
}

export function presetToBlob(preset: Preset): Blob {
  return new Blob([JSON.stringify(preset, null, 2)], { type: 'application/json' });
}
