import type { ConnectionStatus as WsStatus, MetricsData, SourceStatus } from '../types';

interface ConnectionStatusProps {
  status: WsStatus;
  metrics: MetricsData | null;
  sourceStatus?: SourceStatus | null;
}

const formatSourceStatus = (value?: string | null) => {
  if (!value) return 'Unknown';
  return value.charAt(0).toUpperCase() + value.slice(1);
};

export function ConnectionStatus({ status, metrics, sourceStatus }: ConnectionStatusProps) {
  const getStatusColor = () => {
    switch (status) {
      case 'connected': return 'text-green-400';
      case 'connecting': return 'text-yellow-400';
      case 'disconnected': return 'text-gray-400';
      case 'error': return 'text-red-400';
      case 'demo': return 'text-cyan-300';
      default: return 'text-gray-400';
    }
  };

  const getStatusLabel = () => {
    switch (status) {
      case 'connected': return 'Connected';
      case 'connecting': return 'Connecting...';
      case 'disconnected': return 'Disconnected';
      case 'error': return 'Error';
      case 'demo': return 'Demo Mode';
      default: return 'Unknown';
    }
  };

  const cameraStatus = sourceStatus?.connection_status || metrics?.connection_status || 'idle';
  const cameraStatusColor =
    cameraStatus === 'connected'
      ? 'text-green-400'
      : cameraStatus === 'reconnecting'
        ? 'text-yellow-400'
        : cameraStatus === 'connecting'
          ? 'text-yellow-400'
          : 'text-slate-400';

  return (
    <div className="bg-white/5 rounded-2xl p-4 border border-white/10 backdrop-blur-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Stream Status</h3>
        <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor()} bg-black/20`}>
          {getStatusLabel()}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <div className="text-gray-500">Source Type</div>
          <div className="font-mono text-white">
            {sourceStatus?.source_type || metrics?.source_type || '—'}
          </div>
        </div>
        <div>
          <div className="text-gray-500">Camera Name</div>
          <div className="font-mono text-white">
            {sourceStatus?.camera_name || metrics?.camera_name || '—'}
          </div>
        </div>
        <div>
          <div className="text-gray-500">Camera Status</div>
          <div className={`font-mono capitalize ${cameraStatusColor}`}>
            {formatSourceStatus(String(cameraStatus))}
          </div>
        </div>
        <div>
          <div className="text-gray-500">Compute Mode</div>
          <div className="font-mono text-white uppercase">
            {metrics?.compute_mode || 'unknown'}
          </div>
        </div>
        <div>
          <div className="text-gray-500">Current FPS</div>
          <div className="font-mono text-white">
            {metrics ? metrics.fps.toFixed(1) : '—'}
          </div>
        </div>
        <div>
          <div className="text-gray-500">Current Latency</div>
          <div className="font-mono text-white">
            {metrics ? `${metrics.latency_ms.total_p50.toFixed(1)} ms` : '—'}
          </div>
        </div>
      </div>

      {cameraStatus === 'reconnecting' && (
        <div className="mt-4 rounded-xl border border-yellow-400/20 bg-yellow-400/10 px-3 py-2 text-sm text-yellow-200 animate-pulse">
          Reconnecting... retrying every 3 seconds
        </div>
      )}

      {sourceStatus?.message && cameraStatus !== 'connected' && (
        <div className="mt-4 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-300">
          {sourceStatus.message}
        </div>
      )}
    </div>
  );
}
