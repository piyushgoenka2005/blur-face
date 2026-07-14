import type { Detector } from './types';
import { MediaPipeDetector } from './MediaPipeDetector';

/**
 * Preferred: SCRFD (ONNX Runtime Web).
 * Fallback: MediaPipe Face Detection — seamless for the user.
 */
export async function createDetector(): Promise<Detector> {
  try {
    const { ScrfdDetector } = await import('./ScrfdDetector');
    const scrfd = new ScrfdDetector();
    try {
      await scrfd.initialize();
      console.info('[detector] Using SCRFD (ONNX Runtime Web)');
      return scrfd;
    } catch (err) {
      console.info('[detector] SCRFD unavailable, falling back to MediaPipe:', err);
      scrfd.dispose();
    }
  } catch (err) {
    console.info('[detector] SCRFD module failed to load:', err);
  }

  const mediapipe = new MediaPipeDetector();
  await mediapipe.initialize();
  console.info('[detector] Using MediaPipe Face Detection');
  return mediapipe;
}

export type { Detector, FaceBox, InferenceEngine, BlurMethod } from './types';
