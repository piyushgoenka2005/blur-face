import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { WebcamCamera } from '../camera/WebcamCamera';
import { createDetector, type Detector, type BlurMethod } from '../detector';
import { BrowserBlurPipeline, type PipelineStats } from '../canvas/BrowserBlurPipeline';

export type PipelineStatus = 'idle' | 'requesting' | 'loading' | 'running' | 'error' | 'stopped';

export interface UseBrowserBlurPipelineReturn {
  status: PipelineStatus;
  error: string | null;
  stats: PipelineStats | null;
  engine: string;
  displayRef: RefObject<HTMLCanvasElement>;
  start: () => Promise<void>;
  stop: () => void;
  setBlurMethod: (method: BlurMethod) => void;
  blurMethod: BlurMethod;
}

const defaultStats: PipelineStats = {
  fps: 0,
  detectionMs: 0,
  facesDetected: 0,
  blurMethod: 'pixelation',
  engine: '—',
  width: 640,
  height: 480,
};

export function useBrowserBlurPipeline(): UseBrowserBlurPipelineReturn {
  const displayRef = useRef<HTMLCanvasElement>(null);
  const processCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraRef = useRef<WebcamCamera | null>(null);
  const detectorRef = useRef<Detector | null>(null);
  const pipelineRef = useRef<BrowserBlurPipeline | null>(null);
  const blurMethodRef = useRef<BlurMethod>('pixelation');

  const [status, setStatus] = useState<PipelineStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<PipelineStats | null>(null);
  const [engine, setEngine] = useState('—');
  const [blurMethod, setBlurMethodState] = useState<BlurMethod>('pixelation');

  const setBlurMethod = useCallback((method: BlurMethod) => {
    blurMethodRef.current = method;
    setBlurMethodState(method);
  }, []);

  const stop = useCallback(() => {
    pipelineRef.current?.stop();
    pipelineRef.current = null;
    detectorRef.current?.dispose();
    detectorRef.current = null;
    cameraRef.current?.stop();
    cameraRef.current = null;
    setStatus('stopped');
  }, []);

  const start = useCallback(async () => {
    setError(null);
    stop();

    try {
      setStatus('requesting');
      const camera = new WebcamCamera();
      cameraRef.current = camera;
      const video = await camera.start({ width: 640, height: 480 });

      setStatus('loading');
      const detector = await createDetector();
      detectorRef.current = detector;
      setEngine(detector.engine);

      if (!processCanvasRef.current) {
        processCanvasRef.current = document.createElement('canvas');
      }
      const display = displayRef.current;
      if (!display) {
        throw new Error('Display canvas is not mounted');
      }

      const pipeline = new BrowserBlurPipeline({
        processCanvas: processCanvasRef.current,
        displayCanvas: display,
        video,
        detector,
        getBlurMethod: () => blurMethodRef.current,
        onStats: (s) => setStats({ ...s }),
        targetWidth: 640,
        targetHeight: 480,
      });
      pipelineRef.current = pipeline;
      pipeline.start();
      setStatus('running');
      setStats({ ...defaultStats, engine: detector.engine, blurMethod: blurMethodRef.current });
    } catch (err) {
      stop();
      const message =
        err instanceof Error
          ? err.message
          : 'Failed to start camera / detector';
      setError(
        /Permission|NotAllowed|denied/i.test(message)
          ? 'Camera permission denied. Allow webcam access and try again.'
          : message
      );
      setStatus('error');
    }
  }, [stop]);

  useEffect(() => {
    return () => stop();
  }, [stop]);

  return {
    status,
    error,
    stats,
    engine,
    displayRef,
    start,
    stop,
    setBlurMethod,
    blurMethod,
  };
}
