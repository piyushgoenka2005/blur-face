export interface ConfigData {
  blur_method: 'gaussian' | 'pixelation';
  blur_kernel_size: number;
  blur_sigma: number;
  blur_pixelation_block: number;
  blur_margin: number;
  det_conf_threshold: number;
  det_nms_threshold: number;
  jpeg_quality: number;
  camera_width: number;
  camera_height: number;
  det_model_name: string;
  det_input_size: [number, number];
  compute_mode: string;
}

export interface LatencyData {
  detection_p50: number;
  detection_p95: number;
  detection_p99: number;
  blur_p50: number;
  blur_p95: number;
  blur_p99: number;
  encode_p50: number;
  encode_p95: number;
  encode_p99: number;
  total_p50: number;
  total_p95: number;
  total_p99: number;
}

export type SourceConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'reconnecting';

export interface MetricsData {
  fps: number;
  faces_detected: number;
  latency_ms: LatencyData;
  backend_status: string;
  compute_mode: string;
  blur_method: string;
  source_type?: string | null;
  camera_name?: string | null;
  connection_status?: SourceConnectionStatus | string | null;
  message?: string | null;
}

export interface FrameData {
  blob: Blob;
  timestamp: number;
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error' | 'demo';

export type AppView = 'source' | 'dashboard';

export type VideoSourceKind = 'webcam' | 'rtsp';

export interface SourceStatus {
  source_type: string | null;
  camera_name: string | null;
  connection_status: SourceConnectionStatus | string;
  source_active: boolean;
  message?: string | null;
  rtsp_url?: string | null;
}

export interface RtspConnectForm {
  camera_name: string;
  mode: 'url' | 'fields';
  rtsp_url: string;
  ip_address: string;
  port: string;
  username: string;
  password: string;
  stream_path: string;
}
