import type { Param } from '../core/types';

interface Props {
  name: string;
  param: Param;
  value: number | string | boolean;
  onChange: (v: number | string | boolean) => void;
}

/**
 * One parameter control. This file and Controls.tsx are the only places that
 * know how a param becomes an input — which is why adding an effect never
 * requires touching UI code.
 */
export function Field({ name, param, value, onChange }: Props) {
  const id = `p-${name}`;

  if (param.type === 'bool') {
    return (
      <label className="field field--bool" htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          checked={value as boolean}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="field__label">{param.label}</span>
      </label>
    );
  }

  if (param.type === 'enum') {
    return (
      <div className="field">
        <label className="field__label" htmlFor={id}>
          {param.label}
        </label>
        <select id={id} value={value as string} onChange={(e) => onChange(e.target.value)}>
          {param.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (param.type === 'color') {
    return (
      <div className="field field--color">
        <label className="field__label" htmlFor={id}>
          {param.label}
        </label>
        <input id={id} type="color" value={value as string} onChange={(e) => onChange(e.target.value)} />
      </div>
    );
  }

  const step = param.type === 'int' ? 1 : param.step;
  const num = value as number;

  return (
    <div className="field">
      <div className="field__head">
        <label className="field__label" htmlFor={id}>
          {param.label}
        </label>
        <span className="field__value">{param.type === 'int' ? num : num.toFixed(2)}</span>
      </div>
      <input
        id={id}
        type="range"
        min={param.min}
        max={param.max}
        step={step}
        value={num}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  );
}
