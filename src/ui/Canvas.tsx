import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

interface Props {
  image: ImageData | null;
  /** Shown while the compare control is held. */
  original: ImageData | null;
  comparing: boolean;
  onDrop: (file: File) => void;
}

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 32;

export function Canvas({ image, original, comparing, onDrop }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);

  const [zoom, setZoom] = useState(1);
  const [fit, setFit] = useState(true);
  const [fitZoom, setFitZoom] = useState(1);

  const w = image?.width ?? 0;
  const h = image?.height ?? 0;

  // Recompute the fit scale whenever the viewport or the image changes.
  useLayoutEffect(() => {
    const el = viewRef.current;
    if (!el || !w || !h) return;

    const measure = () => {
      const pad = 48;
      const cw = Math.max(1, el.clientWidth - pad);
      const ch = Math.max(1, el.clientHeight - pad);
      // Never magnify to fit. Upscaling by a fractional factor with
      // nearest-neighbour doubles some dither pixels and not others, which
      // misrepresents the pattern — the one thing this tool must show truly.
      setFitZoom(Math.min(cw / w, ch / h, 1));
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [w, h]);

  // A newly opened image starts fitted rather than at whatever the last zoom was.
  useEffect(() => {
    setFit(true);
  }, [w, h]);

  const effective = fit ? fitZoom : zoom;

  useEffect(() => {
    const shown = comparing && original ? original : image;
    const canvas = canvasRef.current;
    if (!canvas || !shown) return;

    if (canvas.width !== shown.width || canvas.height !== shown.height) {
      canvas.width = shown.width;
      canvas.height = shown.height;
    }
    canvas.getContext('2d')?.putImageData(shown, 0, 0);
  }, [image, original, comparing]);

  const applyZoom = useCallback(
    (next: number, anchorX?: number, anchorY?: number) => {
      const el = viewRef.current;
      const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
      const prev = fit ? fitZoom : zoom;

      setFit(false);
      setZoom(clamped);

      // Keep the point under the cursor stationary, otherwise zooming past
      // 100% walks the image off screen and feels broken.
      if (el && anchorX !== undefined && anchorY !== undefined && prev > 0) {
        const rect = el.getBoundingClientRect();
        const cx = anchorX - rect.left;
        const cy = anchorY - rect.top;
        const ratio = clamped / prev;
        const sl = (el.scrollLeft + cx) * ratio - cx;
        const st = (el.scrollTop + cy) * ratio - cy;
        requestAnimationFrame(() => {
          el.scrollLeft = sl;
          el.scrollTop = st;
        });
      }
    },
    [fit, fitZoom, zoom],
  );

  // Wheel zoom needs a non-passive listener to be able to preventDefault,
  // which React's onWheel does not guarantee.
  useEffect(() => {
    const el = viewRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const prev = fit ? fitZoom : zoom;
      applyZoom(prev * Math.exp(-e.deltaY * 0.0025), e.clientX, e.clientY);
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [applyZoom, fit, fitZoom, zoom]);

  // Drag to pan. Scrollbars alone are awkward once you are past 100%.
  const drag = useRef<{ x: number; y: number; sl: number; st: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    const el = viewRef.current;
    if (!el) return;
    if (el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight) return;
    drag.current = { x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop };
    el.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const el = viewRef.current;
    if (!el || !drag.current) return;
    el.scrollLeft = drag.current.sl - (e.clientX - drag.current.x);
    el.scrollTop = drag.current.st - (e.clientY - drag.current.y);
  };

  const endDrag = (e: React.PointerEvent) => {
    const el = viewRef.current;
    drag.current = null;
    el?.releasePointerCapture?.(e.pointerId);
  };

  const step = (dir: number) => applyZoom((fit ? fitZoom : zoom) * (dir > 0 ? 1.4 : 1 / 1.4));

  return (
    <div
      className="canvas"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file) onDrop(file);
      }}
    >
      <div
        className={`canvas__view${drag.current ? ' canvas__view--dragging' : ''}`}
        ref={viewRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {image ? (
          <div
            className="canvas__frame"
            style={{ width: w * effective, height: h * effective }}
          >
            <canvas
              ref={canvasRef}
              style={{
                width: w * effective,
                height: h * effective,
                // Show real pixels when magnified — the dither pattern is the
                // point. Below 100%, let the browser resample so the pattern
                // does not alias into moire.
                imageRendering: effective >= 1 ? 'pixelated' : 'auto',
              }}
            />
            <span className="tick tick--tl" />
            <span className="tick tick--tr" />
            <span className="tick tick--bl" />
            <span className="tick tick--br" />
          </div>
        ) : (
          <div className="canvas__empty">
            <p>drop an image</p>
            <p className="muted">png · jpg · webp</p>
          </div>
        )}
      </div>

      {image && (
        <div className="zoom">
          <button onClick={() => step(-1)} title="zoom out">
            −
          </button>
          <button
            className="zoom__level"
            onClick={() => applyZoom(1)}
            title="zoom to 100%"
          >
            {Math.round(effective * 100)}%
          </button>
          <button onClick={() => step(1)} title="zoom in">
            +
          </button>
          <button
            className={fit ? 'zoom__fit zoom__fit--on' : 'zoom__fit'}
            onClick={() => setFit(true)}
            title="fit to window"
          >
            fit
          </button>
        </div>
      )}
    </div>
  );
}
