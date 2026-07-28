import type { ChainEntry } from '../core/types';
import { getEffect } from '../core/registry';
import { Field } from './Field';

interface Props {
  entry: ChainEntry | null;
  onChange: (patch: Partial<ChainEntry>) => void;
}

/** Renders an effect's whole control surface straight from its param schema. */
export function Controls({ entry, onChange }: Props) {
  if (!entry) {
    return (
      <div className="controls controls--empty">
        <p className="muted">no effect selected</p>
      </div>
    );
  }

  const effect = getEffect(entry.effectId);
  if (!effect) return null;

  const setParam = (key: string, v: number | string | boolean) =>
    onChange({ params: { ...entry.params, [key]: v } });


  return (
    <div className="controls">
      <div className="controls__head">
        <span className="controls__name">{effect.name}</span>
        <span className="controls__cat">{effect.category}</span>
      </div>
      <p className="controls__desc muted">{effect.description}</p>

      {Object.entries(effect.params)
        .filter(([, param]) => {
          const cond = param.visibleWhen;
          if (!cond) return true;
          const v = entry.params[cond.key] as string | boolean | number;
          if (cond.equals && !cond.equals.includes(v)) return false;
          if (cond.notEquals && cond.notEquals.includes(v)) return false;
          return true;
        })
        .map(([key, param]) => (
          <Field
            key={key}
            name={key}
            param={param}
            value={entry.params[key] ?? param.default}
            onChange={(v) => setParam(key, v)}
          />
        ))}

      <div className="controls__foot">
        <div className="field">
          <div className="field__head">
            <span className="field__label">mix</span>
            <span className="field__value">{entry.mix.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={entry.mix}
            onChange={(e) => onChange({ mix: parseFloat(e.target.value) })}
          />
        </div>

        {effect.stochastic && (
          <button className="btn btn--ghost" onClick={() => onChange({ seed: (Math.random() * 1e9) | 0 })}>
            reseed
          </button>
        )}
      </div>
    </div>
  );
}
