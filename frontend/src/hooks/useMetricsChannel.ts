import { useCallback, useEffect, useRef, useState } from 'react';
import type { MetricsData, SourceStatus } from '../types';
import { backendBaseUrl, websocketUrl } from '../config';

interface UseMetricsChannelOptions {
  enabled?: boolean;
}

interface UseMetricsChannelReturn {
  metrics: MetricsData | null;
  sourceStatus: SourceStatus | null;
}

export function useMetricsChannel(options: UseMetricsChannelOptions = {}): UseMetricsChannelReturn {
  const { enabled = true } = options;
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [sourceStatus, setSourceStatus] = useState<SourceStatus | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const applyMetrics = useCallback((data: MetricsData) => {
    setMetrics(data);
    if (data.connection_status || data.source_type || data.camera_name) {
      setSourceStatus({
        source_type: data.source_type ?? null,
        camera_name: data.camera_name ?? null,
        connection_status: data.connection_status ?? 'idle',
        source_active: data.backend_status === 'running',
        message: (data as MetricsData & { message?: string }).message ?? null,
      });
    }
  }, []);

  const pollOnce = useCallback(async () => {
    try {
      const res = await fetch(`${backendBaseUrl}/api/metrics`);
      if (res.ok) {
        applyMetrics(await res.json());
      }
      const src = await fetch(`${backendBaseUrl}/api/source`);
      if (src.ok) {
        setSourceStatus(await src.json());
      }
    } catch {
      // ignore transient poll errors
    }
  }, [applyMetrics]);

  useEffect(() => {
    if (!enabled) {
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setMetrics(null);
      setSourceStatus(null);
      return;
    }

    let stopped = false;

    const connectWs = () => {
      if (stopped) return;
      const ws = new WebSocket(`${websocketUrl}/ws/metrics`);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        if (typeof event.data !== 'string') return;
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'metrics') {
            applyMetrics(msg.data);
          } else if (msg.type === 'source_status') {
            setSourceStatus(msg.data);
          }
        } catch {
          // ignore
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        if (!stopped) {
          reconnectRef.current = setTimeout(connectWs, 1500);
        }
      };

      ws.onerror = () => {
        try {
          ws.close();
        } catch {
          // ignore
        }
      };
    };

    connectWs();
    void pollOnce();
    pollRef.current = setInterval(() => {
      void pollOnce();
    }, 2000);

    return () => {
      stopped = true;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [enabled, applyMetrics, pollOnce]);

  return { metrics, sourceStatus };
}
