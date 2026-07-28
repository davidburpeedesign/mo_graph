import { useEffect, useRef } from 'react';

interface Props {
  image: ImageData | null;
  /** Shown while the compare control is held. */
  original: ImageData | null;
  comparing: boolean;
  onDrop: (file: File) => void;
}

export function Canvas({ image, original, comparing, onDrop }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const shown = comparing && original ? original : image;
    const canvas = ref.current;
    if (!canvas || !shown) return;

    if (canvas.width !== shown.width || canvas.height !== shown.height) {
      canvas.width = shown.width;
      canvas.height = shown.height;
    }
    canvas.getContext('2d')?.putImageData(shown, 0, 0);
  }, [image, original, comparing]);

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
      {image ? (
        <div className="canvas__frame">
          <canvas ref={ref} />
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
  );
}
