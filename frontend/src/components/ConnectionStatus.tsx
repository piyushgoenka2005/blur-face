import type { PipelineStats } from '../canvas/BrowserBlurPipeline';
import type { PipelineStatus } from '../hooks/useBrowserBlurPipeline';

interface ConnectionStatusProps {
  status: PipelineStatus;
  stats: PipelineStats | null;
  engine: string;
}

export function ConnectionStatus({ status, stats, engine }: ConnectionStatusProps) {
  const label =
    status === 'running'
      ? 'Connected'
      : status === 'requesting'
        ? 'Requesting permission'
        : status === 'loading'
          ? 'Loading model'
          : status === 'error'
            ? 'Error'
            : 'Idle';

  const color =
    status === 'running'
      ? 'text-green-400'
      : status === 'error'
        ? 'text-red-400'
        : 'text-yellow-400';

  return (
    <div className="bg-white/5 rounded-2xl p-4 border border-white/10 backdrop-blur-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Stream Status</h3>
        <span className={`px-2 py-1 rounded text-xs font-medium ${color} bg-black/20`}>
          {label}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <div className="text-gray-500">Source Type</div>
          <div className="font-mono text-white">Laptop Webcam</div>
        </div>
        <div>
          <div className="text-gray-500">Inference Engine</div>
          <div className="font-mono text-white">{engine || '—'}</div>
        </div>
        <div>
          <div className="text-gray-500">FPS</div>
          <div className="font-mono text-white">{stats ? stats.fps.toFixed(1) : '—'}</div>
        </div>
        <div>
          <div className="text-gray-500">Faces</div>
          <div className="font-mono text-white">{stats ? stats.facesDetected : '—'}</div>
        </div>
      </div>
    </div>
  );
}
