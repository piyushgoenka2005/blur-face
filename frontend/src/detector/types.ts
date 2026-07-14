/** Shared face box in canvas / image pixel coordinates. */
export interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
  score: number;
}

export type InferenceEngine = 'SCRFD (Web)' | 'MediaPipe';

export interface Detector {
  readonly engine: InferenceEngine;
  initialize(): Promise<void>;
  detect(source: HTMLVideoElement | HTMLCanvasElement, timestampMs: number): Promise<FaceBox[]>;
  dispose(): void;
}

export type BlurMethod = 'gaussian' | 'pixelation';
