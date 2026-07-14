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
  const { blurRadius = 0, pixelBlock = 0 } = options;
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

/**
 * Max-strength mosaic pixelation.
 * Scales block size to the face so features collapse into a few large tiles
 * (~5 cells across), instead of a fine grid that still looks identifiable.
 */
function pixelateRegion(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  cellsHint: number
): void {
  const faceScale = Math.min(w, h);
  // Coarse TV-style mosaic: 4–6 tiles on the short edge.
  const cells = Math.max(
    4,
    Math.min(6, cellsHint > 0 ? cellsHint : Math.round(faceScale / 36))
  );
  const bw = Math.max(2, Math.round((w / faceScale) * cells));
  const bh = Math.max(2, Math.round((h / faceScale) * cells));

  const tmp = document.createElement('canvas');
  tmp.width = bw;
  tmp.height = bh;
  const tctx = tmp.getContext('2d');
  if (!tctx) return;

  // Average colors into each mosaic cell on downsample.
  tctx.imageSmoothingEnabled = true;
  tctx.imageSmoothingQuality = 'medium';
  tctx.drawImage(ctx.canvas, x, y, w, h, 0, 0, bw, bh);

  // Nearest-neighbor upscale → hard square mosaic, no soft bleed.
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tmp, 0, 0, bw, bh, x, y, w, h);
  ctx.restore();
  ctx.imageSmoothingEnabled = true;
}

/**
 * Max-strength Gaussian redaction.
 *
 * CSS `filter: blur()` alone leaks alpha at the edges, so the original face
 * shows through and looks only faintly blurred. Fix:
 * 1) Opaque smooth downscale/upscale (base soft blur)
 * 2) Extra CSS blur on a padded crop
 * 3) Clip + opaque replace so nothing sharp remains underneath
 */
function gaussianRegion(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radiusHint: number
): void {
  // Radius scales with face size so features (eyes/nose/mouth) fully dissolve.
  const faceScale = Math.min(w, h);
  const r = Math.max(
    radiusHint || 0,
    Math.floor(faceScale * 0.55),
    64
  );

  // --- Pass A: extreme smooth downscale → upscale (opaque, soft) ---
  const tiny = Math.max(2, Math.round(faceScale * 0.06));
  const tinyW = Math.max(2, Math.round((w / faceScale) * tiny));
  const tinyH = Math.max(2, Math.round((h / faceScale) * tiny));

  const down = document.createElement('canvas');
  down.width = tinyW;
  down.height = tinyH;
  const dctx = down.getContext('2d');
  if (!dctx) return;
  dctx.imageSmoothingEnabled = true;
  dctx.imageSmoothingQuality = 'high';
  dctx.drawImage(ctx.canvas, x, y, w, h, 0, 0, tinyW, tinyH);

  const soft = document.createElement('canvas');
  soft.width = w;
  soft.height = h;
  const sctx = soft.getContext('2d');
  if (!sctx) return;
  sctx.imageSmoothingEnabled = true;
  sctx.imageSmoothingQuality = 'high';
  sctx.drawImage(down, 0, 0, tinyW, tinyH, 0, 0, w, h);

  // --- Pass B: CSS gaussian on padded soft crop (extra wipe of detail) ---
  const pad = Math.ceil(r);
  const padded = document.createElement('canvas');
  padded.width = w + pad * 2;
  padded.height = h + pad * 2;
  const pctx = padded.getContext('2d');
  if (!pctx) {
    paintOpaque(ctx, soft, x, y, w, h);
    return;
  }

  // Fill pad with edge colors so blur doesn't fade to transparent.
  pctx.drawImage(soft, 0, 0, w, h, pad, pad, w, h);
  pctx.drawImage(soft, 0, 0, w, 1, pad, 0, w, pad); // top
  pctx.drawImage(soft, 0, h - 1, w, 1, pad, pad + h, w, pad); // bottom
  pctx.drawImage(soft, 0, 0, 1, h, 0, pad, pad, h); // left
  pctx.drawImage(soft, w - 1, 0, 1, h, pad + w, pad, pad, h); // right
  // Corners
  pctx.drawImage(soft, 0, 0, 1, 1, 0, 0, pad, pad);
  pctx.drawImage(soft, w - 1, 0, 1, 1, pad + w, 0, pad, pad);
  pctx.drawImage(soft, 0, h - 1, 1, 1, 0, pad + h, pad, pad);
  pctx.drawImage(soft, w - 1, h - 1, 1, 1, pad + w, pad + h, pad, pad);

  const blurred = document.createElement('canvas');
  blurred.width = padded.width;
  blurred.height = padded.height;
  const bctx = blurred.getContext('2d');
  if (!bctx) {
    paintOpaque(ctx, soft, x, y, w, h);
    return;
  }

  bctx.filter = `blur(${r}px)`;
  bctx.drawImage(padded, 0, 0);

  // Second CSS pass for near-total anonymity.
  const blurred2 = document.createElement('canvas');
  blurred2.width = padded.width;
  blurred2.height = padded.height;
  const b2 = blurred2.getContext('2d');
  if (b2) {
    b2.filter = `blur(${Math.floor(r * 0.85)}px)`;
    b2.drawImage(blurred, 0, 0);
  }

  const finalSrc = b2 ? blurred2 : blurred;

  // Replace face pixels (no alpha show-through of the sharp original).
  paintOpaqueCrop(ctx, finalSrc, pad, pad, w, h, x, y);
}

function paintOpaque(
  ctx: CanvasRenderingContext2D,
  src: HTMLCanvasElement,
  x: number,
  y: number,
  w: number,
  h: number
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.globalCompositeOperation = 'copy';
  ctx.drawImage(src, 0, 0, w, h, x, y, w, h);
  ctx.restore();
}

function paintOpaqueCrop(
  ctx: CanvasRenderingContext2D,
  src: HTMLCanvasElement,
  sx: number,
  sy: number,
  w: number,
  h: number,
  dx: number,
  dy: number
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(dx, dy, w, h);
  ctx.clip();
  // Source-over after covering with an opaque base prevents faint bleed.
  ctx.fillStyle = '#6b6b6b';
  ctx.fillRect(dx, dy, w, h);
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(src, sx, sy, w, h, dx, dy, w, h);
  // Draw again to thicken residual translucency if any.
  ctx.drawImage(src, sx, sy, w, h, dx, dy, w, h);
  ctx.restore();
}
