import { useEffect, useRef, useState } from 'react';
import { byCategory } from '../core/registry';

interface Props {
  onAdd: (effectId: string) => void;
}

export function AddEffect({ onAdd }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div className="add" ref={ref}>
      <button className="btn btn--add" onClick={() => setOpen((o) => !o)}>
        + add effect
      </button>

      {open && (
        <div className="add__menu">
          {byCategory().map(([category, effects]) => (
            <div key={category} className="add__group">
              <div className="add__cat">{category}</div>
              {effects.map((e) => (
                <button
                  key={e.id}
                  className="add__item"
                  onClick={() => {
                    onAdd(e.id);
                    setOpen(false);
                  }}
                >
                  <span className="add__name">{e.name}</span>
                  <span className="add__desc">{e.description}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
