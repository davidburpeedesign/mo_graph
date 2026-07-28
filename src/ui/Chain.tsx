import type { BlendMode, ChainEntry } from '../core/types';
import { getEffect } from '../core/registry';
import { BLEND_MODES, blendLabel } from '../core/blend';

interface Props {
  chain: ChainEntry[];
  selected: string | null;
  onSelect: (uid: string) => void;
  onRemove: (uid: string) => void;
  onToggle: (uid: string) => void;
  onMove: (uid: string, delta: number) => void;
  onBlend: (uid: string, blend: BlendMode) => void;
  onSavePreset: () => void;
  onLoadPreset: (file: File) => void;
}

/**
 * The effect chain, top entry applied first. Reordering is by explicit
 * up/down controls rather than drag — order matters enormously here (a dither
 * before a levels adjustment is a different image than after), and discrete
 * steps make that relationship easier to explore than dragging does.
 */
export function Chain({
  chain,
  selected,
  onSelect,
  onRemove,
  onToggle,
  onMove,
  onBlend,
  onSavePreset,
  onLoadPreset,
}: Props) {
  return (
    <div className="chain">
      <div className="chain__head">
        <span>chain</span>
        <span className="muted">{chain.length}</span>
      </div>

      <div className="chain__list">
        {chain.length === 0 && <p className="muted chain__empty">pick an effect from the library</p>}

        {chain.map((entry, i) => {
          const effect = getEffect(entry.effectId);
          if (!effect) return null;
          const isSelected = entry.uid === selected;

          return (
            <div
              key={entry.uid}
              className={`row${isSelected ? ' row--selected' : ''}${entry.enabled ? '' : ' row--off'}`}
              onClick={() => onSelect(entry.uid)}
            >
              <span className="row__marker" />
              <button
                className="row__toggle"
                title={entry.enabled ? 'disable' : 'enable'}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle(entry.uid);
                }}
              >
                {entry.enabled ? '■' : '□'}
              </button>

              <span className="row__name">{effect.name}</span>

              {entry.mix < 1 && <span className="row__mix">{Math.round(entry.mix * 100)}%</span>}

              <select
                className={`row__blend${entry.blend !== 'normal' ? ' row__blend--set' : ''}`}
                value={entry.blend}
                title="blend mode"
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => onBlend(entry.uid, e.target.value as BlendMode)}
              >
                {BLEND_MODES.map((m) => (
                  <option key={m} value={m}>
                    {blendLabel(m)}
                  </option>
                ))}
              </select>

              <span className="row__actions">
                <button
                  disabled={i === 0}
                  title="move earlier"
                  onClick={(e) => {
                    e.stopPropagation();
                    onMove(entry.uid, -1);
                  }}
                >
                  ⌃
                </button>
                <button
                  disabled={i === chain.length - 1}
                  title="move later"
                  onClick={(e) => {
                    e.stopPropagation();
                    onMove(entry.uid, 1);
                  }}
                >
                  ⌄
                </button>
                <button
                  title="remove"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(entry.uid);
                  }}
                >
                  ×
                </button>
              </span>
            </div>
          );
        })}
      </div>

      <div className="chain__presets">
        <button className="btn btn--ghost" disabled={chain.length === 0} onClick={onSavePreset}>
          save settings
        </button>
        <label className="btn btn--ghost">
          load settings
          <input
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onLoadPreset(f);
              e.target.value = '';
            }}
          />
        </label>
      </div>
    </div>
  );
}
