import { useMemo, useState } from 'react';
import { EFFECTS, byCategory } from '../core/registry';

interface Props {
  onAdd: (effectId: string) => void;
}

/**
 * Persistent effect library. Always visible, so the full catalogue is
 * browsable while building a chain rather than hidden behind a menu.
 */
export function Library({ onAdd }: Props) {
  const [query, setQuery] = useState('');

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return byCategory();
    return byCategory()
      .map(
        ([cat, list]) =>
          [
            cat,
            list.filter(
              (e) =>
                e.name.includes(q) || e.description.includes(q) || e.id.includes(q) || cat.includes(q),
            ),
          ] as const,
      )
      .filter(([, list]) => list.length > 0);
  }, [query]);

  const shown = groups.reduce((n, [, list]) => n + list.length, 0);

  return (
    <aside className="library">
      <div className="library__head">
        <span>effects</span>
        <span className="muted">{query ? `${shown}/${EFFECTS.length}` : EFFECTS.length}</span>
      </div>

      <input
        className="library__filter"
        type="search"
        value={query}
        placeholder="filter"
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="library__list">
        {groups.map(([category, effects]) => (
          <div key={category} className="library__group">
            <div className="library__cat">{category}</div>
            {effects.map((e) => (
              <button
                key={e.id}
                className="library__item"
                title={e.description}
                onClick={() => onAdd(e.id)}
              >
                <span className="library__name">{e.name}</span>
                <span className="library__desc">{e.description}</span>
              </button>
            ))}
          </div>
        ))}

        {shown === 0 && <p className="muted library__empty">no match</p>}
      </div>
    </aside>
  );
}
