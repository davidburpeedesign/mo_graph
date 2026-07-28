import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChainEntry } from './core/types';
import { defaultParams } from './core/types';
import { getEffect } from './core/registry';
import { runChain, timed } from './core/pipeline';
import { download, downscale, fileToImageData, previewScale, toBlob } from './core/image';
import { Canvas } from './ui/Canvas';
import { Chain } from './ui/Chain';
import { Controls } from './ui/Controls';
import { Toolbar } from './ui/Toolbar';

interface Source {
  full: ImageData;
  preview: ImageData;
  name: string;
}

let uidCounter = 0;
const nextUid = () => `e${++uidCounter}`;

export function App() {
  const [source, setSource] = useState<Source | null>(null);
  const [chain, setChain] = useState<ChainEntry[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [rendered, setRendered] = useState<ImageData | null>(null);
  const [status, setStatus] = useState('no image');
  const [busy, setBusy] = useState(false);
  const [comparing, setComparing] = useState(false);

  const scale = useMemo(
    () => (source ? previewScale(source.full, source.preview) : 1),
    [source],
  );

  /**
   * Re-render on a rAF tick rather than on every input event. A slider drag
   * fires far faster than the pipeline can run; coalescing to one render per
   * frame is the difference between a responsive tool and a stuttering one.
   */
  const frame = useRef(0);
  useEffect(() => {
    if (!source) return;

    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const [out, ms] = timed(() => runChain(chain, source.preview, scale));
      setRendered(out);
      const active = chain.filter((c) => c.enabled).length;
      setStatus(`${source.preview.width}×${source.preview.height} · ${active} active · ${ms.toFixed(0)}ms`);
    });

    return () => cancelAnimationFrame(frame.current);
  }, [source, chain, scale]);

  const open = useCallback(async (file: File) => {
    setStatus('decoding...');
    setBusy(true);
    try {
      const full = await fileToImageData(file);
      setSource({ full, preview: downscale(full), name: file.name });
    } catch {
      setStatus('could not read that file');
    } finally {
      setBusy(false);
    }
  }, []);

  const addEffect = (effectId: string) => {
    const effect = getEffect(effectId);
    if (!effect) return;
    const entry: ChainEntry = {
      uid: nextUid(),
      effectId,
      params: defaultParams(effect.params),
      enabled: true,
      mix: 1,
      seed: (Math.random() * 1e9) | 0,
    };
    setChain((c) => [...c, entry]);
    setSelected(entry.uid);
  };

  const patchSelected = (patch: Partial<ChainEntry>) =>
    setChain((c) => c.map((e) => (e.uid === selected ? { ...e, ...patch } : e)));

  const move = (uid: string, delta: number) =>
    setChain((c) => {
      const i = c.findIndex((e) => e.uid === uid);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= c.length) return c;
      const next = [...c];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const exportImage = async () => {
    if (!source) return;
    setBusy(true);
    setStatus('rendering at full size...');

    // Yield once so the status paints before the main thread blocks.
    await new Promise((r) => setTimeout(r, 16));

    try {
      const [out, ms] = timed(() => runChain(chain, source.full, 1));
      const blob = await toBlob(out);
      const base = source.name.replace(/\.[^.]+$/, '');
      download(blob, `${base}_mograph.png`);
      setStatus(`exported ${out.width}×${out.height} · ${ms.toFixed(0)}ms`);
    } catch {
      setStatus('export failed');
    } finally {
      setBusy(false);
    }
  };

  // Hold space to compare against the untouched source.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && (e.target as HTMLElement)?.tagName !== 'INPUT') {
        e.preventDefault();
        setComparing(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setComparing(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const selectedEntry = chain.find((e) => e.uid === selected) ?? null;

  return (
    <div className="app">
      <Toolbar
        filename={source?.name ?? null}
        status={status}
        busy={busy}
        canExport={!!source}
        onOpen={open}
        onExport={exportImage}
        onReset={() => setChain([])}
        onCompareDown={() => setComparing(true)}
        onCompareUp={() => setComparing(false)}
      />

      <main className="main">
        <Canvas
          image={rendered}
          original={source?.preview ?? null}
          comparing={comparing}
          onDrop={open}
        />

        <aside className="panel">
          <Chain
            chain={chain}
            selected={selected}
            onSelect={setSelected}
            onAdd={addEffect}
            onRemove={(uid) => {
              setChain((c) => c.filter((e) => e.uid !== uid));
              if (selected === uid) setSelected(null);
            }}
            onToggle={(uid) =>
              setChain((c) => c.map((e) => (e.uid === uid ? { ...e, enabled: !e.enabled } : e)))
            }
            onMove={move}
          />
          <Controls entry={selectedEntry} onChange={patchSelected} />
        </aside>
      </main>
    </div>
  );
}
