import type { Detector } from './types';
import { MediaPipeDetector } from './MediaPipeDetector';

const SCRFD_MODEL_URL = '/models/scrfd.onnx';

async function scrfdModelPresent(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'GET', cache: 'no-store' });
    // Missing model is usually a 404 HTML/JSON page from the SPA.
    if (!res.ok) return false;
    const type = res.headers.get('content-type') || '';
    if (type.includes('text/html') || type.includes('application/json')) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Preferred: SCRFD (ONNX Runtime Web) when `public/models/scrfd.onnx` exists.
 * Fallback: MediaPipe Face Detection — used by default on Vercel today.
 */
export async function createDetector(): Promise<Detector> {
  if (await scrfdModelPresent(SCRFD_MODEL_URL)) {
    try {
      const { ScrfdDetector } = await import('./ScrfdDetector');
      const scrfd = new ScrfdDetector(SCRFD_MODEL_URL);
      await scrfd.initialize();
      console.info('[detector] Using SCRFD (ONNX Runtime Web)');
      return scrfd;
    } catch (err) {
      console.info('[detector] SCRFD failed, falling back to MediaPipe:', err);
    }
  } else {
    console.info('[detector] No SCRFD model in /models — using MediaPipe');
  }

  const mediapipe = new MediaPipeDetector();
  await mediapipe.initialize();
  console.info('[detector] Using MediaPipe Face Detection');
  return mediapipe;
}

export type { Detector, FaceBox, InferenceEngine, BlurMethod } from './types';
