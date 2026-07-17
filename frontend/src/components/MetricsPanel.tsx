import type { DashboardViewModel, BlurMethod } from '../types/dashboard';

interface MetricsPanelProps {
  model: Pick<
    DashboardViewModel,
    | 'fps'
    | 'detectionLatencyMs'
    | 'faces'
    | 'blurMode'
    | 'backendStatus'
    | 'sourceTypeLabel'
    | 'connectionStatus'
  >;
}

/**
 * Shared metrics strip for webcam + RTSP dashboards.
 */
export function MetricsPanel({ model }: MetricsPanelProps) {
  const items = [
    { label: 'FPS', value: model.fps != null ? model.fps.toFixed(1) : '—' },
    {
      label: 'Detection Latency',
      value:
        model.detectionLatencyMs != null
          ? `${Math.round(model.detectionLatencyMs)} ms`
          : '—',
    },
    { label: 'Faces', value: model.faces != null ? String(model.faces) : '—' },
    { label: 'Blur Mode', value: model.blurMode || '—' },
    { label: 'Backend Status', value: model.backendStatus || 'idle' },
    { label: 'Source Type', value: model.sourceTypeLabel || '—' },
    { label: 'Connection Status', value: model.connectionStatus || '—' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3 md:gap-4">
      {items.map((item) => (
        <div
          key={item.label}
          className="bg-white/5 rounded-2xl p-4 border border-white/10 backdrop-blur-sm min-w-0"
        >
          <div className="text-xs text-gray-400 uppercase tracking-wider mb-1 truncate">
            {item.label}
          </div>
          <div className="text-lg md:text-xl font-mono font-bold text-white truncate">
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}

export type { BlurMethod };
