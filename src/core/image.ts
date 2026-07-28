/** Image IO: file in, ImageData out, PNG back out. */

export const PREVIEW_MAX = 1400;

function scratch(w: number, h: number): CanvasRenderingContext2D {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2d context unavailable');
  return ctx;
}

export async function fileToImageData(file: File | Blob): Promise<ImageData> {
  const bitmap = await createImageBitmap(file);
  const ctx = scratch(bitmap.width, bitmap.height);
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
}

/**
 * Downscale for the preview buffer. Returns the source untouched when it is
 * already under the cap, so small images are edited at full fidelity.
 */
export function downscale(src: ImageData, maxDim = PREVIEW_MAX): ImageData {
  const longEdge = Math.max(src.width, src.height);
  if (longEdge <= maxDim) return src;

  const k = maxDim / longEdge;
  const w = Math.max(1, Math.round(src.width * k));
  const h = Math.max(1, Math.round(src.height * k));

  const from = scratch(src.width, src.height);
  from.putImageData(src, 0, 0);

  const to = scratch(w, h);
  to.imageSmoothingEnabled = true;
  to.imageSmoothingQuality = 'high';
  to.drawImage(from.canvas, 0, 0, w, h);
  return to.getImageData(0, 0, w, h);
}

/** Scale of a preview buffer relative to its full-resolution source. */
export function previewScale(full: ImageData, preview: ImageData): number {
  return preview.width / full.width;
}

export function toBlob(img: ImageData, type = 'image/png', quality?: number): Promise<Blob> {
  const ctx = scratch(img.width, img.height);
  ctx.putImageData(img, 0, 0);
  return new Promise((resolve, reject) => {
    ctx.canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('encode failed'))),
      type,
      quality,
    );
  });
}

export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  // Revoke on the next tick; revoking synchronously can cancel the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
