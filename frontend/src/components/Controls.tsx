import type { BlurMethod } from '../detector/types';

interface ControlsProps {
  blurMethod: BlurMethod;
  onBlurMethodChange: (method: BlurMethod) => void;
  onStop: () => void;
  onRestart: () => void;
  isRunning: boolean;
}

export function Controls({
  blurMethod,
  onBlurMethodChange,
  onStop,
  onRestart,
  isRunning,
}: ControlsProps) {
  return (
    <div className="bg-white/5 rounded-2xl p-5 border border-white/10 space-y-6 backdrop-blur-sm">
      <div className="flex flex-wrap items-center gap-3">
        {isRunning ? (
          <button
            type="button"
            onClick={onStop}
            className="px-4 py-2 rounded-xl font-semibold bg-rose-500 hover:bg-rose-400 text-white"
          >
            Stop Camera
          </button>
        ) : (
          <button
            type="button"
            onClick={onRestart}
            className="px-4 py-2 rounded-xl font-semibold bg-cyan-500 hover:bg-cyan-400 text-slate-950"
          >
            Start Camera
          </button>
        )}
        <span
          className={`px-2 py-1 rounded text-xs font-medium ${
            isRunning ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-500/20 text-slate-300'
          }`}
        >
          {isRunning ? 'RUNNING' : 'STOPPED'}
        </span>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">Blur Method</label>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="blur-method"
              checked={blurMethod === 'gaussian'}
              onChange={() => onBlurMethodChange('gaussian')}
              className="w-4 h-4"
            />
            <span>Gaussian Blur</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="blur-method"
              checked={blurMethod === 'pixelation'}
              onChange={() => onBlurMethodChange('pixelation')}
              className="w-4 h-4"
            />
            <span>Pixelation</span>
          </label>
        </div>
      </div>
    </div>
  );
}
