/**
 * MediaPipe Face Detection (Tasks Vision) — reliable browser detector.
 * Uses full-range BlazeFace so faces still track when farther from the camera.
 * Holds last boxes briefly when motion blur temporarily drops detections.
 */
import { FaceDetector, FilesetResolver, type Detection } from '@mediapipe/tasks-vision';
import type { Detector, FaceBox } from './types';

const WASM_ROOT =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';
// Full-range model: better when the face moves away or is smaller in frame.
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_full_range/float16/1/blaze_face_full_range.tflite';

const HOLD_MS = 550;
const SMOOTH = 0.55; // higher = stickier boxes under camera shake

export class MediaPipeDetector implements Detector {
  readonly engine = 'MediaPipe' as const;

  private detector: FaceDetector | null = null;
  private lastBoxes: FaceBox[] = [];
  private lastDetectAt = 0;

  async initialize(): Promise<void> {
    const vision = await FilesetResolver.forVisionTasks(WASM_ROOT);

    const options = {
      baseOptions: {
        modelAssetPath: MODEL_URL,
        delegate: 'GPU' as const,
      },
      // IMAGE mode: call detect() every frame — avoids VIDEO timestamp quirks.
      runningMode: 'IMAGE' as const,
      minDetectionConfidence: 0.25,
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

  async detect(source: HTMLVideoElement | HTMLCanvasElement, timestampMs: number): Promise<FaceBox[]> {
    if (!this.detector) {
      throw new Error('MediaPipe detector not initialized');
    }

    const width =
      source instanceof HTMLVideoElement ? source.videoWidth : source.width;
    const height =
      source instanceof HTMLVideoElement ? source.videoHeight : source.height;

    if (!width || !height) return this.heldBoxes(timestampMs);
    if (source instanceof HTMLVideoElement && source.readyState < 2) {
      return this.heldBoxes(timestampMs);
    }

    try {
      const result = this.detector.detect(source);
      const boxes = this.mapDetections(result.detections, width, height);
      if (boxes.length > 0) {
        this.lastBoxes = this.smoothBoxes(boxes, this.lastBoxes);
        this.lastDetectAt = timestampMs || performance.now();
      }
    } catch (err) {
      console.warn('[MediaPipe] detect failed:', err);
    }

    return this.heldBoxes(timestampMs || performance.now());
  }

  dispose(): void {
    this.detector?.close();
    this.detector = null;
    this.lastBoxes = [];
    this.lastDetectAt = 0;
  }

  /** Keep last boxes for HOLD_MS after a miss (shake / brief dropout). */
  private heldBoxes(now: number): FaceBox[] {
    if (this.lastBoxes.length === 0) return [];
    if (now - this.lastDetectAt > HOLD_MS) {
      this.lastBoxes = [];
      return [];
    }
    // Slightly enlarge held boxes so blur still covers the face while moving.
    const age = now - this.lastDetectAt;
    if (age > 40) {
      const grow = 1 + Math.min(0.35, age / HOLD_MS);
      return this.lastBoxes.map((b) => expandBox(b, grow));
    }
    return this.lastBoxes;
  }

  private smoothBoxes(next: FaceBox[], prev: FaceBox[]): FaceBox[] {
    if (prev.length === 0) return next;
    return next.map((box, i) => {
      const p = prev[Math.min(i, prev.length - 1)];
      if (!p) return box;
      return {
        x: p.x * SMOOTH + box.x * (1 - SMOOTH),
        y: p.y * SMOOTH + box.y * (1 - SMOOTH),
        width: p.width * SMOOTH + box.width * (1 - SMOOTH),
        height: p.height * SMOOTH + box.height * (1 - SMOOTH),
        score: box.score,
      };
    });
  }

  private mapDetections(detections: Detection[], width: number, height: number): FaceBox[] {
    const boxes: FaceBox[] = [];
    for (const det of detections) {
      const box = det.boundingBox;
      if (!box) continue;
      const score = det.categories?.[0]?.score ?? 0;
      if (score < 0.2) continue;

      // Generous margin so blur covers forehead / chin / cheeks under motion.
      const marginX = box.width * 0.32;
      const marginY = box.height * 0.38;
      let x = box.originX - marginX;
      let y = box.originY - marginY;
      let w = box.width + marginX * 2;
      let h = box.height + marginY * 2;

      x = Math.max(0, x);
      y = Math.max(0, y);
      w = Math.min(width - x, w);
      h = Math.min(height - y, h);
      if (w < 6 || h < 6) continue;

      boxes.push({ x, y, width: w, height: h, score });
    }
    return boxes;
  }
}

function expandBox(box: FaceBox, grow: number): FaceBox {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const width = box.width * grow;
  const height = box.height * grow;
  return {
    x: cx - width / 2,
    y: cy - height / 2,
    width,
    height,
    score: box.score,
  };
}
