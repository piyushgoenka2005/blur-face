import type { Detector, FaceBox, BlurMethod } from '../detector/types';
import { blurFaces } from '../blur/blurFaces';

export interface PipelineStats {
  fps: number;
  detectionMs: number;
  facesDetected: number;
  blurMethod: BlurMethod;
  engine: string;
  width: number;
  height: number;
}

export interface BrowserBlurPipelineOptions {
  processCanvas: HTMLCanvasElement;
  displayCanvas: HTMLCanvasElement;
  video: HTMLVideoElement;
  detector: Detector;
  getBlurMethod: () => BlurMethod;
  onStats?: (stats: PipelineStats) => void;
  targetWidth?: number;
  targetHeight?: number;
}

/**
 * Capture → detect → blur → present, driven by requestAnimationFrame.
 * Reuses canvas contexts; never sends frames to a backend.
 */
export class BrowserBlurPipeline {
  private readonly processCanvas: HTMLCanvasElement;
  private readonly displayCanvas: HTMLCanvasElement;
  private readonly processCtx: CanvasRenderingContext2D;
  private readonly displayCtx: CanvasRenderingContext2D;
  private readonly video: HTMLVideoElement;
  private readonly detector: Detector;
  private readonly getBlurMethod: () => BlurMethod;
  private readonly onStats?: (stats: PipelineStats) => void;

  private rafId = 0;
  private running = false;
  private busy = false;
  private frameCount = 0;
  private fpsWindowStart = 0;
  private fps = 0;
  private lastDetectionMs = 0;
  private lastFaces = 0;

  constructor(options: BrowserBlurPipelineOptions) {
    this.processCanvas = options.processCanvas;
    this.displayCanvas = options.displayCanvas;
    this.video = options.video;
    this.detector = options.detector;
    this.getBlurMethod = options.getBlurMethod;
    this.onStats = options.onStats;

    const width = options.targetWidth ?? 640;
    const height = options.targetHeight ?? 480;

    const pctx = this.processCanvas.getContext('2d', { willReadFrequently: false });
    const dctx = this.displayCanvas.getContext('2d', { willReadFrequently: false });
    if (!pctx || !dctx) {
      throw new Error('Could not acquire 2D canvas contexts');
    }
    this.processCtx = pctx;
    this.displayCtx = dctx;

    this.processCanvas.width = width;
    this.processCanvas.height = height;
    this.displayCanvas.width = width;
    this.displayCanvas.height = height;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.fpsWindowStart = performance.now();
    this.frameCount = 0;
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  private tick = (now: number): void => {
    if (!this.running) return;

    if (this.busy) {
      this.rafId = requestAnimationFrame(this.tick);
      return;
    }

    this.busy = true;
    void this.processFrame(now).finally(() => {
      this.busy = false;
      if (this.running) {
        this.rafId = requestAnimationFrame(this.tick);
      }
    });
  };

  private async processFrame(now: number): Promise<void> {
    if (this.video.readyState < 2) return;

    this.processCtx.drawImage(
      this.video,
      0,
      0,
      this.processCanvas.width,
      this.processCanvas.height
    );

    const t0 = performance.now();
    let faces: FaceBox[] = [];
    try {
      faces = await this.detector.detect(this.video, now);
      const vw = this.video.videoWidth || this.processCanvas.width;
      const vh = this.video.videoHeight || this.processCanvas.height;
      const sx = this.processCanvas.width / vw;
      const sy = this.processCanvas.height / vh;
      faces = faces.map((f) => ({
        ...f,
        x: f.x * sx,
        y: f.y * sy,
        width: f.width * sx,
        height: f.height * sy,
      }));
    } catch {
      faces = [];
    }
    this.lastDetectionMs = performance.now() - t0;
    this.lastFaces = faces.length;

    blurFaces(this.processCtx, faces, this.getBlurMethod());
    this.displayCtx.drawImage(this.processCanvas, 0, 0);

    this.frameCount += 1;
    const elapsed = now - this.fpsWindowStart;
    if (elapsed >= 1000) {
      this.fps = (this.frameCount * 1000) / elapsed;
      this.frameCount = 0;
      this.fpsWindowStart = now;
      this.onStats?.({
        fps: this.fps,
        detectionMs: this.lastDetectionMs,
        facesDetected: this.lastFaces,
        blurMethod: this.getBlurMethod(),
        engine: this.detector.engine,
        width: this.processCanvas.width,
        height: this.processCanvas.height,
      });
    }
  }
}
