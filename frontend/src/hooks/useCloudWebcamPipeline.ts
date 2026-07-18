import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { WebcamCamera } from '../camera/WebcamCamera';
import { captureFrameAsJpeg } from '../camera/captureJpeg';
import { websocketUrl } from '../config';

export type CloudPipelineStatus =
  | 'idle'
  | 'requesting'
  | 'connecting'
  | 'running'
  | 'error'
  | 'stopped';

export type BlurMethod = 'gaussian' | 'pixelation';

export interface CloudPipelineStats {
  fps: number;
  latencyMs: number;
  detectionLatencyMs: number;
  facesDetected: number;
  backendStatus: string;
  connectionStatus: string;
  blurMethod: BlurMethod;
  computeMode: string;
  width: number;
  height: number;
}

export interface UseCloudWebcamPipelineReturn {
  status: CloudPipelineStatus;
  error: string | null;
  stats: CloudPipelineStats | null;
  displayRef: RefObject<HTMLCanvasElement>;
  start: () => Promise<void>;
  stop: () => void;
  setBlurMethod: (method: BlurMethod) => void;
  blurMethod: BlurMethod;
}

/** Target capture cadence for cloud processing (15–20 FPS). */
const TARGET_FPS = 18;
const FRAME_INTERVAL_MS = 1000 / TARGET_FPS;
const JPEG_QUALITY = 0.85;
const WS_RECONNECT_MS = 1500;

const defaultStats = (blurMethod: BlurMethod): CloudPipelineStats => ({
  fps: 0,
  latencyMs: 0,
  detectionLatencyMs: 0,
  facesDetected: 0,
  backendStatus: 'idle',
  connectionStatus: 'disconnected',
  blurMethod,
  computeMode: '—',
  width: 640,
  height: 480,
});

/**
 * Laptop Webcam (Cloud Processing):
 * getUserMedia → JPEG → WS /ws/process → blurred JPEG → canvas.
 * No face detection or blur in the browser.
 */
export function useCloudWebcamPipeline(): UseCloudWebcamPipelineReturn {
  const displayRef = useRef<HTMLCanvasElement>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraRef = useRef<WebcamCamera | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const runningRef = useRef(false);
  const intentionalStopRef = useRef(false);
  const inFlightRef = useRef(false);
  const sendStartedAtRef = useRef(0);
  const blurMethodRef = useRef<BlurMethod>('gaussian');
  const rafRef = useRef(0);
  const lastCaptureAtRef = useRef(0);
  const fpsWindowRef = useRef({ count: 0, start: 0 });
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attachWsHandlersRef = useRef<(ws: WebSocket) => void>(() => undefined);

  const [status, setStatus] = useState<CloudPipelineStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<CloudPipelineStats | null>(null);
  const [blurMethod, setBlurMethodState] = useState<BlurMethod>('gaussian');

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const drawJpegToDisplay = useCallback(async (buffer: ArrayBuffer) => {
    const canvas = displayRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const blob = new Blob([buffer], { type: 'image/jpeg' });
    const bitmap = await createImageBitmap(blob);
    if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
    }
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
  }, []);

  const stopCaptureLoop = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
  }, []);

  const stop = useCallback(() => {
    intentionalStopRef.current = true;
    runningRef.current = false;
    inFlightRef.current = false;
    clearReconnectTimer();
    stopCaptureLoop();
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        // ignore
      }
      wsRef.current = null;
    }
    cameraRef.current?.stop();
    cameraRef.current = null;
    videoRef.current = null;
    setStatus((prev) => (prev === 'idle' ? prev : 'stopped'));
  }, [clearReconnectTimer, stopCaptureLoop]);

  const setBlurMethod = useCallback((method: BlurMethod) => {
    blurMethodRef.current = method;
    setBlurMethodState(method);
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: 'config',
          data: { blur_method: method },
        })
      );
    }
    setStats((prev) => (prev ? { ...prev, blurMethod: method } : prev));
  }, []);

  const startCaptureLoop = useCallback(() => {
    stopCaptureLoop();
    const tick = async (now: number) => {
      if (!runningRef.current) return;
      rafRef.current = requestAnimationFrame(tick);

      const video = videoRef.current;
      if (!video || !captureCanvasRef.current) return;
      if (inFlightRef.current) return;
      if (now - lastCaptureAtRef.current < FRAME_INTERVAL_MS) return;
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

      lastCaptureAtRef.current = now;
      const jpeg = await captureFrameAsJpeg(video, captureCanvasRef.current, JPEG_QUALITY);
      if (!jpeg || !runningRef.current) return;
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

      inFlightRef.current = true;
      sendStartedAtRef.current = performance.now();
      wsRef.current.send(jpeg);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [stopCaptureLoop]);

  const openSocket = useCallback((): Promise<WebSocket> => {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${websocketUrl}/ws/process`);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      const timer = window.setTimeout(() => {
        reject(new Error('Backend WebSocket timed out'));
        try {
          ws.close();
        } catch {
          // ignore
        }
      }, 12000);

      ws.onopen = () => {
        window.clearTimeout(timer);
        resolve(ws);
      };
      ws.onerror = () => {
        window.clearTimeout(timer);
        reject(new Error('Failed to connect to backend /ws/process'));
      };
    });
  }, []);

  const scheduleReconnectRef = useRef<() => void>(() => undefined);

  const scheduleReconnect = useCallback(() => {
    if (intentionalStopRef.current || !runningRef.current) return;
    clearReconnectTimer();
    setStatus('connecting');
    setStats((prev) =>
      prev ? { ...prev, connectionStatus: 'reconnecting', backendStatus: 'idle' } : prev
    );
    reconnectTimerRef.current = setTimeout(() => {
      void (async () => {
        if (intentionalStopRef.current || !runningRef.current) return;
        try {
          const ws = await openSocket();
          attachWsHandlersRef.current(ws);
          ws.send(
            JSON.stringify({
              type: 'config',
              data: { blur_method: blurMethodRef.current },
            })
          );
          inFlightRef.current = false;
          setError(null);
          setStatus('running');
          setStats((prev) =>
            prev
              ? { ...prev, connectionStatus: 'connected', backendStatus: 'running' }
              : prev
          );
          startCaptureLoop();
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Reconnect failed';
          setError(message);
          scheduleReconnectRef.current();
        }
      })();
    }, WS_RECONNECT_MS);
  }, [clearReconnectTimer, openSocket, startCaptureLoop]);

  scheduleReconnectRef.current = scheduleReconnect;

  attachWsHandlersRef.current = (ws: WebSocket) => {
    ws.onmessage = (event) => {
      if (typeof event.data === 'string') {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'metrics' && msg.data) {
            const d = msg.data;
            setStats((prev) => ({
              ...(prev ?? defaultStats(blurMethodRef.current)),
              fps: typeof d.fps === 'number' ? d.fps : prev?.fps ?? 0,
              facesDetected:
                typeof d.faces_detected === 'number' ? d.faces_detected : prev?.facesDetected ?? 0,
              backendStatus: d.backend_status ?? prev?.backendStatus ?? 'running',
              connectionStatus: d.connection_status ?? 'connected',
              computeMode: d.compute_mode ?? prev?.computeMode ?? '—',
              blurMethod: (d.blur_method as BlurMethod) || blurMethodRef.current,
              latencyMs:
                typeof d.latency_ms?.total_p50 === 'number'
                  ? d.latency_ms.total_p50
                  : prev?.latencyMs ?? 0,
              detectionLatencyMs:
                typeof d.latency_ms?.detection_p50 === 'number'
                  ? d.latency_ms.detection_p50
                  : prev?.detectionLatencyMs ?? 0,
            }));
          } else if (msg.type === 'error') {
            setError(typeof msg.data === 'string' ? msg.data : 'Backend error');
          }
        } catch {
          // ignore malformed text
        }
        return;
      }

      const handleBuffer = async (buf: ArrayBuffer) => {
        const rtt = performance.now() - sendStartedAtRef.current;
        inFlightRef.current = false;
        await drawJpegToDisplay(buf);

        const fpsWindow = fpsWindowRef.current;
        fpsWindow.count += 1;
        const elapsed = performance.now() - fpsWindow.start;
        let displayFps = 0;
        if (elapsed >= 1000) {
          displayFps = (fpsWindow.count * 1000) / elapsed;
          fpsWindow.count = 0;
          fpsWindow.start = performance.now();
        }

        setStats((prev) => {
          const base = prev ?? defaultStats(blurMethodRef.current);
          return {
            ...base,
            latencyMs: Math.round(rtt),
            fps: displayFps > 0 ? displayFps : base.fps,
            connectionStatus: 'connected',
            backendStatus: 'running',
          };
        });
      };

      if (event.data instanceof ArrayBuffer) {
        void handleBuffer(event.data);
      } else if (event.data instanceof Blob) {
        void event.data.arrayBuffer().then(handleBuffer);
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
      inFlightRef.current = false;
      stopCaptureLoop();
      if (!intentionalStopRef.current && runningRef.current) {
        setError('Backend connection lost — reconnecting…');
        scheduleReconnect();
      }
    };
  };

  const start = useCallback(async () => {
    setError(null);
    setStats(null);
    intentionalStopRef.current = true;
    stop();
    intentionalStopRef.current = false;

    try {
      setStatus('requesting');
      const camera = new WebcamCamera();
      cameraRef.current = camera;
      const video = await camera.start({ width: 640, height: 480 });
      videoRef.current = video;
      const { width, height } = camera.getResolution();

      if (!captureCanvasRef.current) {
        captureCanvasRef.current = document.createElement('canvas');
      }

      setStatus('connecting');
      const ws = await openSocket();
      attachWsHandlersRef.current(ws);

      ws.send(
        JSON.stringify({
          type: 'config',
          data: { blur_method: blurMethodRef.current },
        })
      );

      runningRef.current = true;
      inFlightRef.current = false;
      fpsWindowRef.current = { count: 0, start: performance.now() };
      lastCaptureAtRef.current = 0;
      setStatus('running');
      setStats({
        ...defaultStats(blurMethodRef.current),
        connectionStatus: 'connected',
        backendStatus: 'running',
        width: width || 640,
        height: height || 480,
      });

      startCaptureLoop();
    } catch (err) {
      intentionalStopRef.current = true;
      stop();
      const message = err instanceof Error ? err.message : 'Failed to start cloud webcam pipeline';
      setError(
        /Permission|NotAllowed|denied/i.test(message)
          ? 'Camera permission denied. Allow webcam access and try again.'
          : message
      );
      setStatus('error');
    }
  }, [openSocket, startCaptureLoop, stop]);

  useEffect(() => {
    return () => stop();
  }, [stop]);

  return {
    status,
    error,
    stats,
    displayRef,
    start,
    stop,
    setBlurMethod,
    blurMethod,
  };
}
