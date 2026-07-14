import { useEffect, useState } from 'react';
import type { ConfigData } from '../types';

interface ControlsProps {
  config: ConfigData | null;
  onConfigChange: (config: Partial<ConfigData>) => void;
  onControl: (action: 'start' | 'stop') => void;
  isRunning: boolean;
}

const fallbackConfig: ConfigData = {
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
  compute_mode: 'cpu'
};

export function Controls({ config, onConfigChange, onControl, isRunning }: ControlsProps) {
  const [localConfig, setLocalConfig] = useState<ConfigData>(config ?? fallbackConfig);

  useEffect(() => {
    if (config) {
      setLocalConfig(config);
    }
  }, [config]);

  const handleBlurMethodChange = (method: 'gaussian' | 'pixelation') => {
    const newConfig = { ...localConfig, blur_method: method };
    setLocalConfig(newConfig);
    onConfigChange({ blur_method: method });
  };

  const handleSliderChange = (key: keyof ConfigData, value: number) => {
    const newConfig = { ...localConfig, [key]: value };
    setLocalConfig(newConfig);
    onConfigChange({ [key]: value });
  };

  return (
    <div className="bg-white/5 rounded-2xl p-5 border border-white/10 space-y-6 backdrop-blur-sm">
      <div className="flex items-center gap-4">
        <button
          onClick={() => onControl(isRunning ? 'stop' : 'start')}
          className={`px-4 py-2 rounded-xl font-semibold transition-colors ${isRunning ? 'bg-rose-500 hover:bg-rose-400 text-white' : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950'}`}
        >
          {isRunning ? 'Stop Stream' : 'Start Stream'}
        </button>
        <span className={`px-2 py-1 rounded text-xs font-medium ${isRunning ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-500/20 text-slate-300'}`}>
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
              value="gaussian"
              checked={localConfig.blur_method === 'gaussian'}
              onChange={() => handleBlurMethodChange('gaussian')}
              className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 focus:ring-blue-500"
            />
            <span className="text-white">Gaussian Blur</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="blur-method"
              value="pixelation"
              checked={localConfig.blur_method === 'pixelation'}
              onChange={() => handleBlurMethodChange('pixelation')}
              className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 focus:ring-blue-500"
            />
            <span className="text-white">Pixelation</span>
          </label>
        </div>
      </div>

      {localConfig.blur_method === 'gaussian' && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Blur Strength (Kernel Size): {localConfig.blur_kernel_size}
            </label>
            <input
              type="range"
              min="3"
              max="101"
              step="2"
              value={localConfig.blur_kernel_size}
              onChange={(e) => handleSliderChange('blur_kernel_size', parseInt(e.target.value, 10))}
              className="slider"
            />
            <div className="text-xs text-gray-500 flex justify-between">
              <span>Low (3)</span>
              <span>High (101)</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Gaussian Sigma: {localConfig.blur_sigma.toFixed(1)}
            </label>
            <input
              type="range"
              min="5"
              max="100"
              step="0.5"
              value={localConfig.blur_sigma}
              onChange={(e) => handleSliderChange('blur_sigma', parseFloat(e.target.value))}
              className="slider"
            />
            <div className="text-xs text-gray-500 flex justify-between">
              <span>5</span>
              <span>100</span>
            </div>
          </div>
        </div>
      )}

      {localConfig.blur_method === 'pixelation' && (
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Pixelation Block Size: {localConfig.blur_pixelation_block}
          </label>
          <input
            type="range"
            min="4"
            max="64"
            step="2"
            value={localConfig.blur_pixelation_block}
            onChange={(e) => handleSliderChange('blur_pixelation_block', parseInt(e.target.value, 10))}
            className="slider"
          />
          <div className="text-xs text-gray-500 flex justify-between">
            <span>Fine (4)</span>
            <span>Coarse (64)</span>
          </div>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          Detection Confidence: {localConfig.det_conf_threshold.toFixed(2)}
        </label>
        <input
          type="range"
          min="0.1"
          max="0.9"
          step="0.05"
          value={localConfig.det_conf_threshold}
          onChange={(e) => handleSliderChange('det_conf_threshold', parseFloat(e.target.value))}
          className="slider"
        />
        <div className="text-xs text-gray-500 flex justify-between">
          <span>Low (0.1)</span>
          <span>High (0.9)</span>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          JPEG Quality: {localConfig.jpeg_quality}
        </label>
        <input
          type="range"
          min="10"
          max="100"
          step="5"
          value={localConfig.jpeg_quality}
          onChange={(e) => handleSliderChange('jpeg_quality', parseInt(e.target.value, 10))}
          className="slider"
        />
        <div className="text-xs text-gray-500 flex justify-between">
          <span>Low (10)</span>
          <span>High (100)</span>
        </div>
      </div>
    </div>
  );
}
