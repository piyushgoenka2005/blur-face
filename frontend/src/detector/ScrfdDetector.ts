/**
 * Preferred SCRFD path via ONNX Runtime Web.
 *
 * Place a SCRFD ONNX file at `public/models/scrfd.onnx` to enable.
 * If the model is missing or fails to load, `createDetector()` falls back to MediaPipe.
 */
import * as ort from 'onnxruntime-web';
import type { Detector, FaceBox } from './types';

const DEFAULT_MODEL_URL = '/models/scrfd.onnx';

export class ScrfdDetector implements Detector {
  readonly engine = 'SCRFD (Web)' as const;

  private session: ort.InferenceSession | null = null;
  private inputName = 'input.1';
  private readonly modelUrl: string;
  private readonly inputSize = 640;

  constructor(modelUrl: string = DEFAULT_MODEL_URL) {
    this.modelUrl = modelUrl;
  }

  async initialize(): Promise<void> {
    // Prefer WASM; avoid recreating sessions after success.
    ort.env.wasm.numThreads = Math.min(4, navigator.hardwareConcurrency || 2);
    ort.env.wasm.simd = true;

    try {
      this.session = await ort.InferenceSession.create(this.modelUrl, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      });
    } catch (err) {
      throw new Error(
        `SCRFD model unavailable at ${this.modelUrl}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }

    // Common SCRFD export names — adopt first input if present.
    if (this.session.inputNames.length > 0) {
      this.inputName = this.session.inputNames[0];
    }
  }

  async detect(source: HTMLVideoElement | HTMLCanvasElement, _timestampMs: number): Promise<FaceBox[]> {
    if (!this.session) {
      throw new Error('SCRFD session not initialized');
    }

    const { tensor, scaleX, scaleY } = this.preprocess(source);
    const feeds: Record<string, ort.Tensor> = { [this.inputName]: tensor };
    const output = await this.session.run(feeds);
    return this.postprocess(output, scaleX, scaleY, source);
  }

  dispose(): void {
    // onnxruntime-web sessions are GC'd; drop reference.
    this.session = null;
  }

  private preprocess(source: HTMLVideoElement | HTMLCanvasElement): {
    tensor: ort.Tensor;
    scaleX: number;
    scaleY: number;
  } {
    const size = this.inputSize;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('2D context unavailable');

    const srcW = source instanceof HTMLVideoElement ? source.videoWidth : source.width;
    const srcH = source instanceof HTMLVideoElement ? source.videoHeight : source.height;
    ctx.drawImage(source, 0, 0, size, size);

    const { data } = ctx.getImageData(0, 0, size, size);
    // NCHW float32 RGB normalized to [0,1] — common SCRFD layout.
    const float = new Float32Array(3 * size * size);
    let p = 0;
    for (let i = 0; i < data.length; i += 4) {
      float[p] = data[i] / 255;
      float[size * size + p] = data[i + 1] / 255;
      float[2 * size * size + p] = data[i + 2] / 255;
      p += 1;
    }

    return {
      tensor: new ort.Tensor('float32', float, [1, 3, size, size]),
      scaleX: srcW / size,
      scaleY: srcH / size,
    };
  }

  /**
   * Best-effort SCRFD output decode. Real exports vary (scores/bboxes per stride).
   * If decoding fails, return [] so the pipeline stays stable and MediaPipe can take over.
   */
  private postprocess(
    output: ort.InferenceSession.ReturnType,
    scaleX: number,
    scaleY: number,
    source: HTMLVideoElement | HTMLCanvasElement
  ): FaceBox[] {
    const values = Object.values(output);
    if (values.length === 0) return [];

    // Heuristic: find a tensor that looks like [N,4] or [1,N,4] boxes and scores.
    const boxes: FaceBox[] = [];
    const srcW = source instanceof HTMLVideoElement ? source.videoWidth : source.width;
    const srcH = source instanceof HTMLVideoElement ? source.videoHeight : source.height;

    for (const tensor of values) {
      const data = tensor.data as Float32Array;
      const dims = tensor.dims;
      if (dims.length === 2 && dims[1] === 5) {
        // [N, 5] = x1,y1,x2,y2,score in model space
        for (let i = 0; i < dims[0]; i++) {
          const o = i * 5;
          const score = data[o + 4];
          if (score < 0.5) continue;
          const x1 = Math.max(0, data[o] * scaleX);
          const y1 = Math.max(0, data[o + 1] * scaleY);
          const x2 = Math.min(srcW, data[o + 2] * scaleX);
          const y2 = Math.min(srcH, data[o + 3] * scaleY);
          boxes.push({ x: x1, y: y1, width: x2 - x1, height: y2 - y1, score });
        }
      }
    }

    return boxes;
  }
}
