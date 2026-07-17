import type { DashboardViewModel, BlurMethod } from '../types/dashboard';
import { MetricsPanel } from './MetricsPanel';

interface LiveDashboardProps {
  model: DashboardViewModel;
}

/**
 * One professional dark dashboard for Laptop Webcam and RTSP / CCTV.
 * Same layout for both sources — only Source Type label changes.
 */
export function LiveDashboard({ model }: LiveDashboardProps) {
  const {
    video,
    badge,
    sourceTypeLabel,
    blurMode,
    error,
    isRunning,
    onChangeSource,
    onBlurMethodChange,
    onStart,
    onStop,
    secondaryAction,
  } = model;

  return (
    <div className="min-h-screen bg-slate-950 text-white overflow-x-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.20),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(16,185,129,0.12),_transparent_35%),linear-gradient(180deg,_rgba(2,6,23,1),_rgba(15,23,42,1))]" />

      <div className="relative max-w-7xl mx-auto px-4 py-6 md:px-8 md:py-8 space-y-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-cyan-200">
              {badge}
            </div>
            <h1 className="mt-4 text-3xl md:text-5xl font-semibold tracking-tight">
              Real-Time Face Blur System
            </h1>
            <p className="mt-3 max-w-3xl text-sm md:text-base text-slate-300">
              Live blurred stream from the shared SCRFD backend pipeline.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm text-slate-300 w-full lg:w-auto lg:min-w-[280px]">
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 min-w-0">
              <div className="text-slate-400">Source Type</div>
              <div className="font-mono text-white truncate">{sourceTypeLabel}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 min-w-0">
              <div className="text-slate-400">Backend Status</div>
              <div className="font-mono text-white truncate">{model.backendStatus}</div>
            </div>
          </div>
        </header>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onChangeSource}
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium hover:bg-white/10"
          >
            Change Source
          </button>
          {secondaryAction && (
            <button
              type="button"
              onClick={secondaryAction.onClick}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium hover:bg-white/10"
            >
              {secondaryAction.label}
            </button>
          )}
        </div>

        {error && (
          <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        )}

        <section aria-label="Live Video">{video}</section>

        <section aria-label="Metrics">
          <MetricsPanel model={model} />
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm space-y-3">
            <h3 className="text-lg font-semibold">Stream Status</h3>
            <div className="grid grid-cols-1 gap-3 text-sm">
              <div>
                <div className="text-slate-500">Source Type</div>
                <div className="font-mono text-white">{sourceTypeLabel}</div>
              </div>
              <div>
                <div className="text-slate-500">Connection Status</div>
                <div className="font-mono text-white">{model.connectionStatus}</div>
              </div>
              <div>
                <div className="text-slate-500">Blur Mode</div>
                <div className="font-mono text-white">{blurMode}</div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm space-y-6">
            {(onStart || onStop) && (
              <div className="flex flex-wrap items-center gap-3">
                {isRunning && onStop ? (
                  <button
                    type="button"
                    onClick={onStop}
                    className="px-4 py-2 rounded-xl font-semibold bg-rose-500 hover:bg-rose-400 text-white"
                  >
                    Stop Camera
                  </button>
                ) : onStart ? (
                  <button
                    type="button"
                    onClick={onStart}
                    className="px-4 py-2 rounded-xl font-semibold bg-cyan-500 hover:bg-cyan-400 text-slate-950"
                  >
                    Start Camera
                  </button>
                ) : null}
                <span
                  className={`px-2 py-1 rounded text-xs font-medium ${
                    isRunning
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'bg-slate-500/20 text-slate-300'
                  }`}
                >
                  {isRunning ? 'RUNNING' : 'STOPPED'}
                </span>
              </div>
            )}

            <div>
              <div className="text-sm font-medium text-gray-300 mb-2">Blur Mode</div>
              <div className="flex flex-wrap gap-4">
                {(['gaussian', 'pixelation'] as BlurMethod[]).map((method) => (
                  <label key={method} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="shared-blur-mode"
                      checked={blurMode === method}
                      onChange={() => onBlurMethodChange(method)}
                      className="w-4 h-4 accent-cyan-400"
                    />
                    <span className="capitalize">
                      {method === 'gaussian' ? 'Gaussian Blur' : 'Pixelation'}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
