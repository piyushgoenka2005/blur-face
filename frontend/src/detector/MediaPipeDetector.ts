/**
 * MediaPipe Face Detection (Tasks Vision) — reliable browser fallback.
 */
import { FaceDetector, FilesetResolver, type Detection } from '@mediapipe/tasks-vision';
import type { Detector, FaceBox } from './types';

const WASM_ROOT =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';

export class MediaPipeDetector implements Detector {
  readonly engine = 'MediaPipe' as const;

  private detector: FaceDetector | null = null;
  private lastVideoTime = -1;

  async initialize(): Promise<void> {
    const vision = await FilesetResolver.forVisionTasks(WASM_ROOT);
    this.detector = await FaceDetector.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: MODEL_URL,
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      minDetectionConfidence: 0.5,
    });
  }

  async detect(source: HTMLVideoElement | HTMLCanvasElement, timestampMs: number): Promise<FaceBox[]> {
    if (!this.detector) {
      throw new Error('MediaPipe detector not initialized');
    }

    // For VIDEO mode, MediaPipe prefers HTMLVideoElement with advancing currentTime.
    if (source instanceof HTMLVideoElement) {
      if (source.currentTime === this.lastVideoTime) {
        return [];
      }
      this.lastVideoTime = source.currentTime;
      const result = this.detector.detectForVideo(source, timestampMs);
      return this.mapDetections(result.detections, source.videoWidth, source.videoHeight);
    }

    // Canvas fallback: IMAGE mode isn't switched; draw is not supported in VIDEO-only session.
    // Callers should pass the HTMLVideoElement when using MediaPipe.
    return [];
  }

  dispose(): void {
    this.detector?.close();
    this.detector = null;
  }

  private mapDetections(detections: Detection[], width: number, height: number): FaceBox[] {
    const boxes: FaceBox[] = [];
    for (const det of detections) {
      const box = det.boundingBox;
      if (!box) continue;
      const score = det.categories?.[0]?.score ?? 0;
      // Expand slightly for fuller face coverage (margin ~12%).
      const marginX = box.width * 0.12;
      const marginY = box.height * 0.12;
      const x = Math.max(0, box.originX - marginX);
      const y = Math.max(0, box.originY - marginY);
      const w = Math.min(width - x, box.width + marginX * 2);
      const h = Math.min(height - y, box.height + marginY * 2);
      boxes.push({ x, y, width: w, height: h, score });
    }
    return boxes;
  }
}
