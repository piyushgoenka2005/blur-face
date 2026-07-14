import { useState, useCallback, useEffect } from 'react';
import { VideoStream } from './components/VideoStream';
import { MetricsPanel } from './components/MetricsPanel';
import { ConnectionStatus } from './components/ConnectionStatus';
import { Controls } from './components/Controls';
import { SourceSelection } from './components/SourceSelection';
import { useWebRTC } from './hooks/useWebRTC';
import { useJpegStream } from './hooks/useJpegStream';
import { useMetricsChannel } from './hooks/useMetricsChannel';
import type { AppView, ConfigData, VideoSourceKind } from './types';
import { backendBaseUrl, streamMode } from './config';

const defaultConfig: ConfigData = {
  blur_method: 'pixelation',
  blur_kernel_size: 51,
  blur_sigma: 30,
  blur_pixelation_block: 16,
  blur_margin: 16,
  det_conf_threshold: 0.5,
  det_nms_threshold: 0.4,
  jpeg_quality: 80,
  camera_width: 1280,
  camera_height: 720,
  det_model_name: 'SCRFD-500MF',
  det_input_size: [640, 480],
  compute_mode: 'cpu',
};

function App() {
  const [view, setView] = useState<AppView>('source');
  const [selectedSource, setSelectedSource] = useState<VideoSourceKind | null>(null);
  const [selectedCameraName, setSelectedCameraName] = useState<string>('');
  const [config, setConfig] = useState<ConfigData>(defaultConfig);
  const [isRunning, setIsRunning] = useState(true);
  const [health, setHealth] = useState<{
    status: string;
    camera_running: boolean;
    compute_mode: string;
    source_type?: string | null;
    camera_name?: string | null;
    connection_status?: string | null;
  } | null>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [isChangingSource, setIsChangingSource] = useState(false);

  const streamEnabled = view === 'dashboard';
  const useJpeg = streamMode === 'jpeg';

  const webrtc = useWebRTC({ enabled: streamEnabled && !useJpeg });
  const jpeg = useJpegStream({ enabled: streamEnabled && useJpeg });
  // Metrics WS only needed when using WebRTC (JPEG stream already embeds metrics).
  const metricsOnly = useMetricsChannel({ enabled: streamEnabled && !useJpeg });

  const status = useJpeg ? jpeg.status : webrtc.status;
  const metrics = useJpeg ? jpeg.metrics : metricsOnly.metrics;
  const sourceStatus = useJpeg ? jpeg.sourceStatus : metricsOnly.sourceStatus;
  const reconnect = useJpeg ? jpeg.reconnect : webrtc.reconnect;

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [configResponse, healthResponse, sourceResponse] = await Promise.all([
          fetch(`${backendBaseUrl}/api/config`),
          fetch(`${backendBaseUrl}/api/health`),
          fetch(`${backendBaseUrl}/api/source`),
        ]);

        if (configResponse.ok) {
          const remoteConfig = await configResponse.json();
          if (!cancelled) {
            setConfig(prev => ({ ...prev, ...remoteConfig }));
          }
        }

        if (healthResponse.ok) {
          const remoteHealth = await healthResponse.json();
          if (!cancelled) {
            setHealth(remoteHealth);
          }
        }

        if (sourceResponse.ok) {
          const source = await sourceResponse.json();
          if (!cancelled && source.source_active) {
            setSelectedSource(
              source.source_type?.toLowerCase().includes('rtsp') ? 'rtsp' : 'webcam'
            );
            setSelectedCameraName(source.camera_name || '');
            setView('dashboard');
          }
        }
      } catch {
        if (!cancelled) {
          setHealth({ status: 'offline', camera_running: false, compute_mode: 'cpu' });
        }
      } finally {
        if (!cancelled) {
          setIsLoadingConfig(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleConfigChange = useCallback(async (newConfig: Partial<ConfigData>) => {
    setConfig(prev => ({ ...prev, ...newConfig }));
    try {
      const res = await fetch(`${backendBaseUrl}/api/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig),
      });
      if (res.ok) {
        const remote = await res.json();
        setConfig(prev => ({ ...prev, ...remote }));
      }
    } catch {
      // keep optimistic local config
    }
  }, []);

  const handleControl = useCallback((action: 'start' | 'stop') => {
    setIsRunning(action === 'start');
  }, []);

  const handleSourceConnected = useCallback((sourceType: VideoSourceKind, cameraName: string) => {
    setSelectedSource(sourceType);
    setSelectedCameraName(cameraName);
    setView('dashboard');
    setIsRunning(true);
  }, []);

  const handleChangeSource = useCallback(async () => {
    setIsChangingSource(true);
    try {
      await fetch(`${backendBaseUrl}/api/source/disconnect`, { method: 'POST' });
    } catch {
      // Still return to selection even if disconnect fails.
    } finally {
      setSelectedSource(null);
      setSelectedCameraName('');
      setView('source');
      setIsChangingSource(false);
    }
  }, []);

  if (view === 'source') {
    return (
      <SourceSelection
        backendBaseUrl={backendBaseUrl}
        onConnected={handleSourceConnected}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.20),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(16,185,129,0.12),_transparent_35%),linear-gradient(180deg,_rgba(2,6,23,1),_rgba(15,23,42,1))]" />
      <div className="relative max-w-7xl mx-auto px-4 py-6 md:px-8 md:py-8 space-y-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-cyan-200">
              Live blur dashboard
            </div>
            <h1 className="mt-4 text-3xl md:text-5xl font-semibold tracking-tight text-white">
              Real-Time Face-Blur System
            </h1>
            <p className="mt-3 max-w-3xl text-sm md:text-base text-slate-300">
              Processing runs on the backend. Browser receives blurred video only
              ({useJpeg ? 'WebSocket JPEG — cloud compatible' : 'WebRTC'}).
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm text-slate-300">
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="text-slate-400">Transport</div>
              <div className="font-mono text-white">{useJpeg ? 'JPEG WS' : 'WebRTC'}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="text-slate-400">Stream</div>
              <div className="font-mono text-white">{status}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="text-slate-400">Source</div>
              <div className="font-mono text-white truncate">
                {sourceStatus?.camera_name
                  || selectedCameraName
                  || sourceStatus?.source_type
                  || (selectedSource === 'rtsp' ? 'RTSP Camera' : 'Laptop Webcam')}
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="text-slate-400">Mode</div>
              <div className="font-mono text-white">{health?.compute_mode || metrics?.compute_mode || 'cpu'}</div>
            </div>
          </div>
        </header>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleChangeSource}
            disabled={isChangingSource}
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-white/10 transition-colors disabled:opacity-60"
          >
            {isChangingSource ? 'Switching...' : 'Change Source'}
          </button>
          <button
            type="button"
            onClick={reconnect}
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-white/10 transition-colors"
          >
            Reconnect Stream
          </button>
          {isLoadingConfig && (
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300">
              Loading backend configuration...
            </div>
          )}
        </div>

        <section>
          <VideoStream
            stream={useJpeg ? null : webrtc.stream}
            frames={useJpeg ? jpeg.frames : []}
            status={status}
            sourceStatus={sourceStatus}
            transportLabel={useJpeg ? 'JPEG' : 'WebRTC'}
          />
        </section>

        <section>
          <MetricsPanel
            metrics={metrics}
            frontendFps={metrics?.fps ?? 0}
            sourceStatus={sourceStatus}
          />
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-4">
            <ConnectionStatus
              status={status}
              metrics={metrics}
              sourceStatus={sourceStatus}
            />
            <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-xs text-amber-100/90 space-y-1">
              <div className="font-semibold text-amber-200">Cloud note</div>
              <p>
                Render has no physical laptop webcam. Choosing “Laptop Webcam” shows
                synthetic demo frames on the server. Use an RTSP/IP camera for real video,
                or run the backend on your PC for a real webcam.
              </p>
            </div>
          </div>
          <div className="lg:col-span-2">
            <Controls
              config={config}
              onConfigChange={handleConfigChange}
              onControl={handleControl}
              isRunning={isRunning}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

export default App;
