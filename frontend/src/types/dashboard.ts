import type { ReactNode } from 'react';

export type BlurMethod = 'gaussian' | 'pixelation';

/** Normalized metrics shown on the shared live dashboard. */
export interface DashboardViewModel {
  /** Live video region (canvas or JPEG stream). */
  video: ReactNode;
  /** Primary source label in the header badge. */
  badge: string;
  /** Shown under Source Type — "Laptop Webcam" or RTSP camera name. */
  sourceTypeLabel: string;
  fps: number | null;
  detectionLatencyMs: number | null;
  faces: number | null;
  blurMode: BlurMethod | string;
  backendStatus: string;
  connectionStatus: string;
  error?: string | null;
  isRunning: boolean;
  onChangeSource: () => void;
  onBlurMethodChange: (method: BlurMethod) => void;
  /** Optional start/stop for webcam; omit for always-on RTSP stream. */
  onStart?: () => void;
  onStop?: () => void;
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
}
