/**
 * MediaPipe Face Detection (Tasks Vision) — reliable browser detector.
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
  private lastBoxes: FaceBox[] = [];

  async initialize(): Promise<void> {
    const vision = await FilesetResolver.forVisionTasks(WASM_ROOT);

    const options = {
      baseOptions: {
        modelAssetPath: MODEL_URL,
        delegate: 'GPU' as const,
      },
      // IMAGE mode: call detect() every frame — avoids VIDEO timestamp quirks.
      runningMode: 'IMAGE' as const,
      minDetectionConfidence: 0.4,
    };

    try {
      this.detector = await FaceDetector.createFromOptions(vision, options);
    } catch {
      this.detector = await FaceDetector.createFromOptions(vision, {
        ...options,
        baseOptions: { ...options.baseOptions, delegate: 'CPU' },
      });
    }
  }

  async detect(source: HTMLVideoElement | HTMLCanvasElement, _timestampMs: number): Promise<FaceBox[]> {
    if (!this.detector) {
      throw new Error('MediaPipe detector not initialized');
    }

    const width =
      source instanceof HTMLVideoElement ? source.videoWidth : source.width;
    const height =
      source instanceof HTMLVideoElement ? source.videoHeight : source.height;

    if (!width || !height) return this.lastBoxes;
    if (source instanceof HTMLVideoElement && source.readyState < 2) {
      return this.lastBoxes;
    }

    try {
      const result = this.detector.detect(source);
      this.lastBoxes = this.mapDetections(result.detections, width, height);
    } catch (err) {
      console.warn('[MediaPipe] detect failed:', err);
    }

    return this.lastBoxes;
  }

  dispose(): void {
    this.detector?.close();
    this.detector = null;
    this.lastBoxes = [];
  }

  private mapDetections(detections: Detection[], width: number, height: number): FaceBox[] {
    const boxes: FaceBox[] = [];
    for (const det of detections) {
      const box = det.boundingBox;
      if (!box) continue;
      const score = det.categories?.[0]?.score ?? 0;
      if (score < 0.35) continue;

      // Expand so blur covers forehead / chin / cheeks.
      const marginX = box.width * 0.22;
      const marginY = box.height * 0.28;
      let x = box.originX - marginX;
      let y = box.originY - marginY;
      let w = box.width + marginX * 2;
      let h = box.height + marginY * 2;

      // Clamp to frame.
      x = Math.max(0, x);
      y = Math.max(0, y);
      w = Math.min(width - x, w);
      h = Math.min(height - y, h);
      if (w < 8 || h < 8) continue;

      boxes.push({ x, y, width: w, height: h, score });
    }
    return boxes;
  }
}
