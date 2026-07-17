import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LiveDashboard } from '../components/LiveDashboard';
import { VideoStream } from '../components/VideoStream';
import { useJpegStream } from '../hooks/useJpegStream';
import { apiUrl } from '../config';
import type { BlurMethod, DashboardViewModel } from '../types/dashboard';

/**
 * RTSP / CCTV route — feeds the same LiveDashboard as webcam.
 */
export function CctvDashboard() {
  const navigate = useNavigate();
  const { frames, metrics, sourceStatus, status } = useJpegStream({ enabled: true });
  const [blurMethod, setBlurMethod] = useState<BlurMethod>('gaussian');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (metrics?.blur_method === 'gaussian' || metrics?.blur_method === 'pixelation') {
      setBlurMethod(metrics.blur_method);
    }
  }, [metrics?.blur_method]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(apiUrl('/api/source'));
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!data.source_active && data.connection_status === 'idle') {
          navigate('/rtsp', { replace: true });
        }
      } catch {
        // backend offline — stay on dashboard
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const updateBlur = useCallback(async (method: BlurMethod) => {
    setBlurMethod(method);
    try {
      await fetch(apiUrl('/api/config'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blur_method: method }),
      });
    } catch {
      // metrics will resync
    }
  }, []);

  const disconnect = useCallback(async () => {
    setError(null);
    try {
      await fetch(apiUrl('/api/source/disconnect'), { method: 'POST' });
    } catch {
      // still leave
    } finally {
      navigate('/');
    }
  }, [navigate]);

  const cameraName =
    (sourceStatus?.camera_name || metrics?.camera_name || '').trim() || 'RTSP Camera';

  const connectionStatus =
    sourceStatus?.connection_status === 'reconnecting'
      ? 'Reconnecting'
      : status === 'connected'
        ? 'Connected'
        : status === 'connecting'
          ? 'Connecting'
          : status === 'error'
            ? 'Error'
            : 'Disconnected';

  const model = useMemo<DashboardViewModel>(
    () => ({
      video: (
        <VideoStream
          frames={frames}
          status={status}
          sourceStatus={sourceStatus}
          transportLabel="JPEG"
        />
      ),
      badge: 'CCTV / RTSP · Cloud SCRFD',
      sourceTypeLabel: cameraName,
      fps: metrics?.fps ?? null,
      detectionLatencyMs: metrics?.latency_ms?.detection_p50 ?? null,
      faces: metrics?.faces_detected ?? null,
      blurMode: blurMethod,
      backendStatus: metrics?.backend_status ?? 'idle',
      connectionStatus,
      error: error || sourceStatus?.message || null,
      isRunning: status === 'connected' && sourceStatus?.connection_status !== 'reconnecting',
      onChangeSource: () => void disconnect(),
      onBlurMethodChange: (method) => void updateBlur(method),
      secondaryAction: {
        label: 'Edit Connection',
        onClick: () => navigate('/rtsp'),
      },
    }),
    [
      blurMethod,
      cameraName,
      connectionStatus,
      disconnect,
      error,
      frames,
      metrics,
      navigate,
      sourceStatus,
      status,
      updateBlur,
    ]
  );

  return <LiveDashboard model={model} />;
}
