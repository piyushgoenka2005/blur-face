import { useEffect } from 'react';
import { VideoCanvas } from '../components/VideoCanvas';
import { MetricsPanel } from '../components/MetricsPanel';
import { Controls } from '../components/Controls';
import { ConnectionStatus } from '../components/ConnectionStatus';
import { useBrowserBlurPipeline } from '../hooks/useBrowserBlurPipeline';

interface WebcamDashboardProps {
  onChangeSource: () => void;
}

export function WebcamDashboard({ onChangeSource }: WebcamDashboardProps) {
  const {
    status,
    error,
    stats,
    engine,
    displayRef,
    start,
    stop,
    setBlurMethod,
    blurMethod,
  } = useBrowserBlurPipeline();

  useEffect(() => {
    void start();
    // Mount-only: start camera once when the dashboard opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-white overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.20),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(16,185,129,0.12),_transparent_35%),linear-gradient(180deg,_rgba(2,6,23,1),_rgba(15,23,42,1))]" />
      <div className="relative max-w-7xl mx-auto px-4 py-6 md:px-8 md:py-8 space-y-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-cyan-200">
              Browser-local blur
            </div>
            <h1 className="mt-4 text-3xl md:text-5xl font-semibold tracking-tight">
              Real-Time Face Blur System
            </h1>
            <p className="mt-3 max-w-3xl text-sm md:text-base text-slate-300">
              Webcam → on-device detection → canvas blur. No frames leave this browser tab.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm text-slate-300">
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="text-slate-400">Engine</div>
              <div className="font-mono text-white">{engine}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="text-slate-400">Status</div>
              <div className="font-mono text-white">{status}</div>
            </div>
          </div>
        </header>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => {
              stop();
              onChangeSource();
            }}
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium hover:bg-white/10"
          >
            Change Source
          </button>
        </div>

        {error && (
          <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        )}

        <section>
          <VideoCanvas canvasRef={displayRef} status={status} />
        </section>

        <section>
          <MetricsPanel
            stats={stats}
            status={status}
            blurMethod={blurMethod}
            engine={engine}
          />
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <ConnectionStatus status={status} stats={stats} engine={engine} />
          </div>
          <div className="lg:col-span-2">
            <Controls
              blurMethod={blurMethod}
              onBlurMethodChange={setBlurMethod}
              onStop={stop}
              onRestart={() => void start()}
              isRunning={status === 'running'}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
