import type { PipelineStats } from '../canvas/BrowserBlurPipeline';
import type { PipelineStatus } from '../hooks/useBrowserBlurPipeline';

interface MetricsPanelProps {
  stats: PipelineStats | null;
  status: PipelineStatus;
  blurMethod: string;
  engine: string;
}

export function MetricsPanel({ stats, status, blurMethod, engine }: MetricsPanelProps) {
  const items = [
    { label: 'FPS', value: stats ? stats.fps.toFixed(1) : '—' },
    { label: 'Detection Time', value: stats ? `${stats.detectionMs.toFixed(1)} ms` : '—' },
    { label: 'Faces Detected', value: stats ? String(stats.facesDetected) : '—' },
    { label: 'Blur Mode', value: blurMethod },
    { label: 'Inference Engine', value: engine || stats?.engine || '—' },
    {
      label: 'Camera Resolution',
      value: stats ? `${stats.width}×${stats.height}` : '640×480',
    },
    {
      label: 'Connection Status',
      value: status === 'running' ? 'Connected' : status.charAt(0).toUpperCase() + status.slice(1),
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {items.map((item) => (
        <div
          key={item.label}
          className="bg-white/5 rounded-2xl p-4 border border-white/10 backdrop-blur-sm"
        >
          <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">{item.label}</div>
          <div className="text-xl font-mono font-bold text-white truncate">{item.value}</div>
        </div>
      ))}
    </div>
  );
}
