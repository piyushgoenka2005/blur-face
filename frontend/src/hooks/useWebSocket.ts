import { useState, useEffect, useRef, useCallback } from 'react';
import type { FrameData, MetricsData, ConfigData, ConnectionStatus, SourceStatus } from '../types';

const isDev = typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env.DEV;
const backendBaseUrl = isDev ? 'http://127.0.0.1:8001' : window.location.origin;
const websocketUrl = backendBaseUrl.replace(/^http/, 'ws');

interface UseWebSocketOptions {
  /** Only open the WebSocket after a video source has been connected. */
  enabled?: boolean;
}

interface UseWebSocketReturn {
  frames: FrameData[];
  metrics: MetricsData | null;
  sourceStatus: SourceStatus | null;
  status: ConnectionStatus;
  sendConfig: (config: Partial<ConfigData>) => void;
  sendControl: (action: 'start' | 'stop') => void;
  clearFrames: () => void;
}

export function useWebSocket(options: UseWebSocketOptions = {}): UseWebSocketReturn {
  const { enabled = true } = options;

  const [frames, setFrames] = useState<FrameData[]>([]);
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [sourceStatus, setSourceStatus] = useState<SourceStatus | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const demoIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasEverConnectedRef = useRef(false);

  const clearFrames = useCallback(() => {
    setFrames([]);
  }, []);

  const sendConfig = useCallback((config: Partial<ConfigData>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'config', data: config }));
    }
  }, []);

  const sendControl = useCallback((action: 'start' | 'stop') => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'control', data: { action } }));
    }
  }, []);

  const defaultMetrics = useCallback((): MetricsData => ({
    fps: 24,
    faces_detected: 3,
    latency_ms: {
      detection_p50: 6.2,
      detection_p95: 9.8,
      detection_p99: 12.4,
      blur_p50: 2.1,
      blur_p95: 4.3,
      blur_p99: 6.1,
      encode_p50: 3.0,
      encode_p95: 5.5,
      encode_p99: 7.4,
      total_p50: 14.1,
      total_p95: 22.0,
      total_p99: 31.9,
    },
    backend_status: 'demo',
    compute_mode: 'cpu',
    blur_method: 'pixelation',
    source_type: 'Demo',
    camera_name: 'Demo Source',
    connection_status: 'connected',
  }), []);

  const makeDemoFrame = useCallback((index: number) => {
    const faces = [
      { x: 14, y: 18, size: 26 },
      { x: 52, y: 32, size: 22 },
      { x: 74, y: 16, size: 18 },
    ];

    const faceMarkup = faces.map((face, faceIndex) => {
      const pulse = 1 + ((index + faceIndex) % 6) * 0.06;
      return `
        <g transform="translate(${face.x}, ${face.y}) scale(${pulse})">
          <rect x="0" y="0" width="${face.size}" height="${face.size}" rx="7" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.45)" stroke-width="1.2" />
          <rect x="4" y="5" width="${face.size - 8}" height="${face.size - 10}" rx="4" fill="rgba(255,193,7,0.34)" />
          <circle cx="${Math.max(7, face.size * 0.34)}" cy="${face.size * 0.4}" r="1.4" fill="#fff" />
          <circle cx="${Math.min(face.size - 7, face.size * 0.66)}" cy="${face.size * 0.4}" r="1.4" fill="#fff" />
        </g>
      `;
    }).join('');

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
        <defs>
          <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#0b1020" />
            <stop offset="55%" stop-color="#111827" />
            <stop offset="100%" stop-color="#1f2937" />
          </linearGradient>
          <linearGradient id="scan" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="rgba(255,255,255,0)" />
            <stop offset="50%" stop-color="rgba(96,165,250,0.5)" />
            <stop offset="100%" stop-color="rgba(255,255,255,0)" />
          </linearGradient>
        </defs>
        <rect width="1280" height="720" fill="url(#bg)" />
        <circle cx="220" cy="160" r="120" fill="rgba(14,165,233,0.10)" />
        <circle cx="1080" cy="540" r="160" fill="rgba(34,197,94,0.08)" />
        <path d="M0 520 Q 180 470 320 500 T 640 520 T 960 500 T 1280 530" stroke="rgba(148,163,184,0.35)" stroke-width="3" fill="none" />
        <rect x="80" y="70" width="1120" height="580" rx="28" fill="rgba(15,23,42,0.72)" stroke="rgba(148,163,184,0.20)" />
        <rect x="80" y="${(index * 18) % 520}" width="1120" height="56" fill="url(#scan)" opacity="0.45" />
        ${faceMarkup}
        <text x="120" y="126" fill="#f8fafc" font-family="ui-sans-serif, system-ui" font-size="34" font-weight="700">Real-Time Face Blur Prototype</text>
        <text x="120" y="164" fill="#cbd5e1" font-family="ui-monospace, monospace" font-size="18">Demo mode active - edge redaction before egress - frame ${index.toString().padStart(4, '0')}</text>
      </svg>
    `;

    return new Blob([svg], { type: 'image/svg+xml' });
  }, []);

  const stopDemoMode = useCallback(() => {
    if (demoIntervalRef.current) {
      clearInterval(demoIntervalRef.current);
      demoIntervalRef.current = null;
    }
  }, []);

  const startDemoMode = useCallback(() => {
    if (demoIntervalRef.current) return;

    setStatus('demo');
    setMetrics(defaultMetrics());
    setSourceStatus({
      source_type: 'Demo',
      camera_name: 'Demo Source',
      connection_status: 'connected',
      source_active: true,
    });

    let index = 0;
    demoIntervalRef.current = setInterval(() => {
      index += 1;
      setFrames(prev => [...prev, { blob: makeDemoFrame(index), timestamp: Date.now() }].slice(-5));
      setMetrics(prev => ({
        ...(prev ?? defaultMetrics()),
        fps: 18 + (index % 6),
        faces_detected: 2 + (index % 4),
        backend_status: 'demo',
        compute_mode: 'cpu',
        blur_method: index % 2 === 0 ? 'pixelation' : 'gaussian',
        source_type: 'Demo',
        camera_name: 'Demo Source',
        connection_status: 'connected',
        latency_ms: {
          detection_p50: 5.8 + (index % 4) * 0.2,
          detection_p95: 9.1 + (index % 4) * 0.3,
          detection_p99: 11.7 + (index % 4) * 0.4,
          blur_p50: 1.8 + (index % 3) * 0.1,
          blur_p95: 3.9 + (index % 3) * 0.2,
          blur_p99: 5.5 + (index % 3) * 0.2,
          encode_p50: 2.7 + (index % 5) * 0.1,
          encode_p95: 4.8 + (index % 5) * 0.2,
          encode_p99: 6.6 + (index % 5) * 0.2,
          total_p50: 12.9 + (index % 4) * 0.5,
          total_p95: 20.8 + (index % 4) * 0.7,
          total_p99: 29.4 + (index % 4) * 0.9,
        },
      }));
    }, 700);
  }, [defaultMetrics, makeDemoFrame]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setStatus('connecting');
    const ws = new WebSocket(`${websocketUrl}/ws`);
    ws.binaryType = 'arraybuffer';

    const fallbackTimer = setTimeout(() => {
      if (!hasEverConnectedRef.current && ws.readyState !== WebSocket.OPEN) {
        try {
          ws.close();
        } catch {
          // ignore
        }
        wsRef.current = null;
        startDemoMode();
      }
    }, 2500);

    ws.onopen = () => {
      clearTimeout(fallbackTimer);
      stopDemoMode();
      setStatus('connected');
      hasEverConnectedRef.current = true;
    };

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer || event.data instanceof Blob) {
        const blob = new Blob([event.data], { type: 'image/jpeg' });
        setFrames(prev => [...prev, { blob, timestamp: Date.now() }].slice(-5));
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
                source_active: true,
                message: msg.data.message ?? null,
              });
            }
          } else if (msg.type === 'source_status') {
            setSourceStatus(msg.data);
          }
        } catch {
          // ignore malformed JSON in prototype mode
        }
      }
    };

    ws.onclose = () => {
      clearTimeout(fallbackTimer);
      wsRef.current = null;

      if (demoIntervalRef.current && !hasEverConnectedRef.current) {
        setStatus('demo');
        return;
      }

      if (hasEverConnectedRef.current) {
        setStatus('disconnected');
        reconnectTimeoutRef.current = setTimeout(connect, 1500);
      } else {
        startDemoMode();
      }
    };

    ws.onerror = () => {
      clearTimeout(fallbackTimer);
      if (demoIntervalRef.current && !hasEverConnectedRef.current) {
        setStatus('demo');
        return;
      }

      setStatus('error');
      if (!hasEverConnectedRef.current) {
        startDemoMode();
      }
    };

    wsRef.current = ws;
  }, [startDemoMode, stopDemoMode]);

  useEffect(() => {
    if (!enabled) {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      stopDemoMode();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setStatus('disconnected');
      setFrames([]);
      setMetrics(null);
      setSourceStatus(null);
      hasEverConnectedRef.current = false;
      return;
    }

    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      stopDemoMode();
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [enabled, connect, stopDemoMode]);

  return {
    frames,
    metrics,
    sourceStatus,
    status,
    sendConfig,
    sendControl,
    clearFrames,
  };
}
