import type { ChainEntry } from '../core/types';
import { getEffect } from '../core/registry';
import { AddEffect } from './AddEffect';

interface Props {
  chain: ChainEntry[];
  selected: string | null;
  onSelect: (uid: string) => void;
  onAdd: (effectId: string) => void;
  onRemove: (uid: string) => void;
  onToggle: (uid: string) => void;
  onMove: (uid: string, delta: number) => void;
}

/**
 * The effect chain, bottom entry applied first. Reordering is by explicit
 * up/down controls rather than drag — order matters enormously here (a dither
 * before a levels adjustment is a different image than after), and discrete
 * steps make that relationship easier to explore than dragging does.
 */
export function Chain({ chain, selected, onSelect, onAdd, onRemove, onToggle, onMove }: Props) {
  return (
    <div className="chain">
      <div className="chain__head">
        <span>chain</span>
        <span className="muted">{chain.length}</span>
      </div>

      <div className="chain__list">
        {chain.length === 0 && <p className="muted chain__empty">no effects</p>}

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

      <AddEffect onAdd={onAdd} />
    </div>
  );
}
