import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { LiveDashboard } from '../components/LiveDashboard';
import { VideoCanvas } from '../components/VideoCanvas';
import { useCloudWebcamPipeline } from '../hooks/useCloudWebcamPipeline';
import type { DashboardViewModel } from '../types/dashboard';

/**
 * Laptop Webcam route — feeds the shared LiveDashboard.
 */
export function WebcamDashboard() {
  const navigate = useNavigate();
  const {
    status,
    error,
    stats,
    displayRef,
    start,
    stop,
    setBlurMethod,
    blurMethod,
  } = useCloudWebcamPipeline();

  const reconnecting =
    stats?.connectionStatus === 'reconnecting' ||
    (status === 'connecting' && Boolean(stats));

  const connectionStatus = reconnecting
    ? 'Reconnecting'
    : status === 'running'
      ? 'Connected'
      : status === 'connecting'
        ? 'Connecting'
        : status === 'requesting'
          ? 'Requesting permission'
          : status === 'error'
            ? 'Error'
            : status === 'stopped'
              ? 'Disconnected'
              : 'Idle';

  // Keep Stop visible while permission / WS / reconnect are in flight.
  const sessionActive =
    status === 'running' ||
    status === 'connecting' ||
    status === 'requesting' ||
    reconnecting;

  const model = useMemo<DashboardViewModel>(
    () => ({
      video: <VideoCanvas canvasRef={displayRef} status={status} />,
      badge: 'Laptop Webcam · Cloud Processing',
      sourceTypeLabel: 'Laptop Webcam',
      fps: stats?.fps ?? null,
      detectionLatencyMs: stats?.detectionLatencyMs ?? stats?.latencyMs ?? null,
      faces: stats?.facesDetected ?? null,
      blurMode: blurMethod,
      backendStatus: stats?.backendStatus ?? (status === 'running' ? 'running' : 'idle'),
      connectionStatus,
      error,
      isRunning: sessionActive,
      onChangeSource: () => {
        stop();
        navigate('/');
      },
      onBlurMethodChange: setBlurMethod,
      onStart: () => void start(),
      onStop: stop,
    }),
    [
      blurMethod,
      connectionStatus,
      displayRef,
      error,
      navigate,
      sessionActive,
      setBlurMethod,
      start,
      stats,
      status,
      stop,
    ]
  );

  return <LiveDashboard model={model} />;
}
