import type { FaceBox, BlurMethod } from '../detector/types';

/**
 * Canvas blur engine — applies privacy redaction to face regions only.
 */
export function blurFaces(
  ctx: CanvasRenderingContext2D,
  faces: FaceBox[],
  method: BlurMethod = 'pixelation',
  options: { kernelSize?: number; pixelBlock?: number } = {}
): void {
  const { kernelSize = 24, pixelBlock = 16 } = options;
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
      gaussianRegion(ctx, x, y, w, h, kernelSize);
    }

    // Optional debug outline (subtle).
    ctx.strokeStyle = 'rgba(34, 197, 94, 0.55)';
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
  const bw = Math.max(1, Math.floor(w / block));
  const bh = Math.max(1, Math.floor(h / block));

  // Downscale into temp then upscale with nearest-neighbor for mosaic look.
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

function gaussianRegion(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  kernelSize: number
): void {
  // Approximate gaussian via stacked down/up scales (cheap on CPU).
  const passes = Math.max(2, Math.min(6, Math.floor(kernelSize / 8)));
  const tmp = document.createElement('canvas');
  tmp.width = w;
  tmp.height = h;
  const tctx = tmp.getContext('2d');
  if (!tctx) return;

  tctx.drawImage(ctx.canvas, x, y, w, h, 0, 0, w, h);

  let sw = w;
  let sh = h;
  for (let i = 0; i < passes; i++) {
    sw = Math.max(1, Math.floor(sw * 0.5));
    sh = Math.max(1, Math.floor(sh * 0.5));
  }

  const small = document.createElement('canvas');
  small.width = sw;
  small.height = sh;
  const sctx = small.getContext('2d');
  if (!sctx) return;

  sctx.imageSmoothingEnabled = true;
  sctx.drawImage(tmp, 0, 0, w, h, 0, 0, sw, sh);

  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(small, 0, 0, sw, sh, x, y, w, h);
}
