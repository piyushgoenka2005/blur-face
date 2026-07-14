import { MetricsData, SourceStatus } from '../types';

interface MetricsPanelProps {
  metrics: MetricsData | null;
  frontendFps: number;
  sourceStatus?: SourceStatus | null;
}

const getLatencyColor = (value: number) => {
  if (value < 30) return 'text-green-400';
  if (value < 50) return 'text-yellow-400';
  return 'text-red-400';
};

const formatMs = (ms: number) => `${ms.toFixed(1)} ms`;

export function MetricsPanel({ metrics, frontendFps, sourceStatus }: MetricsPanelProps) {
  if (!metrics) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="bg-white/5 rounded-2xl p-4 border border-white/10 backdrop-blur-sm">
            <div className="text-2xl font-mono text-gray-500 animate-pulse">--</div>
            <div className="text-xs text-gray-500 mt-1">Loading...</div>
          </div>
        ))}
      </div>
    );
  }

  const cameraStatus = sourceStatus?.connection_status || metrics.connection_status || 'connected';

  const metricsToShow = [
    {
      label: 'Source Type',
      value: sourceStatus?.source_type || metrics.source_type || '—',
      color: 'text-cyan-300',
      unit: '',
    },
    {
      label: 'Camera Name',
      value: sourceStatus?.camera_name || metrics.camera_name || '—',
      color: 'text-slate-100',
      unit: '',
    },
    {
      label: 'Connection Status',
      value: String(cameraStatus).charAt(0).toUpperCase() + String(cameraStatus).slice(1),
      color:
        cameraStatus === 'connected'
          ? 'text-green-400'
          : cameraStatus === 'reconnecting'
            ? 'text-yellow-400'
            : 'text-slate-300',
      unit: '',
    },
    {
      label: 'Current FPS',
      value: metrics.fps.toFixed(1),
      color: getLatencyColor(30 - metrics.fps * 0.5),
      unit: 'fps',
    },
    {
      label: 'Current Latency',
      value: formatMs(metrics.latency_ms.total_p50),
      color: getLatencyColor(metrics.latency_ms.total_p50),
      unit: 'ms (p50)',
    },
    {
      label: 'FPS (Frontend)',
      value: frontendFps.toFixed(1),
      color: getLatencyColor(30 - frontendFps * 0.5),
      unit: 'fps',
    },
    {
      label: 'Faces Detected',
      value: String(metrics.faces_detected),
      color: 'text-blue-400',
      unit: 'faces',
    },
    {
      label: 'Total Latency p99',
      value: formatMs(metrics.latency_ms.total_p99),
      color: getLatencyColor(metrics.latency_ms.total_p99),
      unit: 'ms (p99)',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {metricsToShow.map((metric, i) => (
        <div key={i} className="bg-white/5 rounded-2xl p-4 border border-white/10 backdrop-blur-sm">
          <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">
            {metric.label}
          </div>
          <div className={`text-2xl font-mono font-bold truncate ${metric.color}`}>
            {metric.value}
          </div>
          {metric.unit && (
            <div className="text-xs text-gray-500 mt-1">{metric.unit}</div>
          )}
        </div>
      ))}
    </div>
  );
}
