import type { RefObject } from 'react';
import type { PipelineStatus } from '../hooks/useBrowserBlurPipeline';

interface VideoCanvasProps {
  canvasRef: RefObject<HTMLCanvasElement>;
  status: PipelineStatus;
}

export function VideoCanvas({ canvasRef, status }: VideoCanvasProps) {
  const showOverlay = status !== 'running';

  const label =
    status === 'requesting'
      ? 'Waiting for camera permission...'
      : status === 'loading'
        ? 'Loading face detector...'
        : status === 'error'
          ? 'Camera / detector error'
          : status === 'stopped'
            ? 'Stopped'
            : 'Starting...';

  return (
    <div className="relative w-full max-w-4xl mx-auto">
      <div className="aspect-video bg-slate-950 rounded-3xl overflow-hidden relative border border-white/10 shadow-2xl shadow-cyan-950/20">
        <canvas
          ref={canvasRef}
          className="w-full h-full object-cover"
          width={640}
          height={480}
        />

        {showOverlay && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm">
            <div className="text-center px-6">
              <div className="text-2xl font-mono mb-2 text-cyan-200">{label}</div>
              <div className="text-sm text-gray-400">
                {status === 'requesting'
                  ? 'Your browser will prompt for webcam access'
                  : 'All processing stays in this tab'}
              </div>
            </div>
          </div>
        )}

        {status === 'running' && (
          <div className="absolute top-3 right-3 flex items-center gap-2 text-green-400 text-sm font-mono">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            LIVE · Browser
          </div>
        )}
      </div>
    </div>
  );
}
