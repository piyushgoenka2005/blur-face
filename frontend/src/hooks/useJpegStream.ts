import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConnectionStatus, FrameData, MetricsData, SourceStatus } from '../types';
import { websocketUrl } from '../config';

interface UseJpegStreamOptions {
  enabled?: boolean;
}

interface UseJpegStreamReturn {
  frames: FrameData[];
  metrics: MetricsData | null;
  sourceStatus: SourceStatus | null;
  status: ConnectionStatus;
  reconnect: () => void;
}

/**
 * Cloud-friendly transport: blurred JPEG frames over WebSocket.
 * Works on Render + Vercel where WebRTC UDP media usually fails.
 */
export function useJpegStream(options: UseJpegStreamOptions = {}): UseJpegStreamReturn {
  const { enabled = true } = options;
  const [frames, setFrames] = useState<FrameData[]>([]);
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [sourceStatus, setSourceStatus] = useState<SourceStatus | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stoppedRef = useRef(false);

  const cleanup = useCallback(() => {
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        // ignore
      }
      wsRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (stoppedRef.current) return;
    cleanup();
    setStatus('connecting');

    const ws = new WebSocket(`${websocketUrl}/ws/stream`);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = () => {
      if (!stoppedRef.current) setStatus('connected');
    };

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer || event.data instanceof Blob) {
        const blob = new Blob([event.data], { type: 'image/jpeg' });
        setFrames(prev => [...prev, { blob, timestamp: Date.now() }].slice(-3));
        return;
      }

      if (typeof event.data === 'string') {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'metrics') {
            setMetrics(msg.data);
            if (msg.data?.connection_status) {
              setSourceStatus({
                source_type: msg.data.source_type ?? null,
                camera_name: msg.data.camera_name ?? null,
                connection_status: msg.data.connection_status,
                source_active: msg.data.backend_status === 'running',
                message: msg.data.message ?? null,
              });
            }
          } else if (msg.type === 'source_status') {
            setSourceStatus(msg.data);
          }
        } catch {
          // ignore
        }
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
      if (stoppedRef.current) return;
      setStatus('disconnected');
      reconnectRef.current = setTimeout(connect, 1500);
    };

    ws.onerror = () => {
      setStatus('error');
      try {
        ws.close();
      } catch {
        // ignore
      }
    };
  }, [cleanup]);

  const reconnect = useCallback(() => {
    if (reconnectRef.current) {
      clearTimeout(reconnectRef.current);
      reconnectRef.current = null;
    }
    connect();
  }, [connect]);

  useEffect(() => {
    if (!enabled) {
      stoppedRef.current = true;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      cleanup();
      setStatus('disconnected');
      setFrames([]);
      setMetrics(null);
      setSourceStatus(null);
      return;
    }

    stoppedRef.current = false;
    connect();

    return () => {
      stoppedRef.current = true;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      cleanup();
    };
  }, [enabled, connect, cleanup]);

  return { frames, metrics, sourceStatus, status, reconnect };
}
