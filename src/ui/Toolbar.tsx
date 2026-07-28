interface Props {
  filename: string | null;
  status: string;
  busy: boolean;
  canExport: boolean;
  onOpen: (file: File) => void;
  onExport: () => void;
  onReset: () => void;
  onCompareDown: () => void;
  onCompareUp: () => void;
}

export function Toolbar({
  filename,
  status,
  busy,
  canExport,
  onOpen,
  onExport,
  onReset,
  onCompareDown,
  onCompareUp,
}: Props) {
  return (
    <header className="toolbar">
      <div className="toolbar__brand">
        <span className="wordmark">MORPHXGEN</span>
        <span className="toolbar__tool">mo_graph</span>
      </div>

      <div className="toolbar__status">
        {filename && <span className="muted">{filename}</span>}
        <span className={busy ? 'status status--busy' : 'status'}>{status}</span>
      </div>

      <div className="toolbar__actions">
        <label className="btn">
          open
          <input
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onOpen(f);
              e.target.value = '';
            }}
          />
        </label>

        <button
          className="btn"
          disabled={!canExport}
          onMouseDown={onCompareDown}
          onMouseUp={onCompareUp}
          onMouseLeave={onCompareUp}
        >
          compare
        </button>

        <button className="btn" disabled={!canExport} onClick={onReset}>
          reset
        </button>

        <button className="btn btn--primary" disabled={!canExport || busy} onClick={onExport}>
          export
        </button>
      </div>
    </header>
  );
}
