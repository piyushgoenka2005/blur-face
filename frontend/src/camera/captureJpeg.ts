/**
 * Capture one video frame to a JPEG ArrayBuffer (no AI / no blur).
 */
export function captureFrameAsJpeg(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  quality = 0.72
): Promise<ArrayBuffer | null> {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height || video.readyState < 2) {
    return Promise.resolve(null);
  }

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return Promise.resolve(null);

  ctx.drawImage(video, 0, 0, width, height);

  return new Promise((resolve) => {
    canvas.toBlob(
      async (blob) => {
        if (!blob) {
          resolve(null);
          return;
        }
        resolve(await blob.arrayBuffer());
      },
      'image/jpeg',
      quality
    );
  });
}
