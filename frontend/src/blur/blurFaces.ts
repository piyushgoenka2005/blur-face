import type { FaceBox, BlurMethod } from '../detector/types';

/**
 * Canvas blur engine — applies privacy redaction to face regions only.
 * Default method is strong Gaussian blur.
 */
export function blurFaces(
  ctx: CanvasRenderingContext2D,
  faces: FaceBox[],
  method: BlurMethod = 'gaussian',
  options: { blurRadius?: number; pixelBlock?: number } = {}
): void {
  // Max-strength defaults for strong anonymization.
  const { blurRadius = 48, pixelBlock = 8 } = options;
  const canvas = ctx.canvas;

  for (const face of faces) {
    const x = Math.max(0, Math.floor(face.x));
    const y = Math.max(0, Math.floor(face.y));
    const w = Math.min(canvas.width - x, Math.ceil(face.width));
    const h = Math.min(canvas.height - y, Math.ceil(face.height));
    if (w <= 1 || h <= 1) continue;

    if (method === 'pixelation') {
      pixelateRegion(ctx, x, y, w, h, pixelBlock);
    } else {
      gaussianRegion(ctx, x, y, w, h, blurRadius);
    }

    ctx.strokeStyle = 'rgba(34, 197, 94, 0.45)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
  }
}

function pixelateRegion(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  block: number
): void {
  // Coarse mosaic (smaller block size => larger pixels).
  const bw = Math.max(1, Math.floor(w / Math.max(4, block)));
  const bh = Math.max(1, Math.floor(h / Math.max(4, block)));

  const tmp = document.createElement('canvas');
  tmp.width = Math.max(1, bw);
  tmp.height = Math.max(1, bh);
  const tctx = tmp.getContext('2d');
  if (!tctx) return;

  tctx.imageSmoothingEnabled = true;
  tctx.drawImage(ctx.canvas, x, y, w, h, 0, 0, tmp.width, tmp.height);

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tmp, 0, 0, tmp.width, tmp.height, x, y, w, h);
  ctx.imageSmoothingEnabled = true;
}

/**
 * Strong Gaussian-style blur via Canvas2D `filter: blur()`.
 * Applied twice for maximum redaction without looking like pixelation.
 */
function gaussianRegion(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number
): void {
  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  const octx = off.getContext('2d');
  if (!octx) return;

  const r = Math.max(24, Math.min(80, radius));

  // Pass 1 — heavy CSS gaussian blur into offscreen buffer.
  octx.filter = `blur(${r}px)`;
  octx.drawImage(ctx.canvas, x, y, w, h, 0, 0, w, h);

  // Pass 2 — blur again into a second buffer for stronger anonymization.
  const off2 = document.createElement('canvas');
  off2.width = w;
  off2.height = h;
  const octx2 = off2.getContext('2d');
  if (!octx2) {
    ctx.drawImage(off, 0, 0, w, h, x, y, w, h);
    return;
  }
  octx2.filter = `blur(${Math.floor(r * 0.75)}px)`;
  octx2.drawImage(off, 0, 0);

  ctx.drawImage(off2, 0, 0, w, h, x, y, w, h);
}
