import { useState } from 'react';

type SourceChoice = 'choose' | 'cctv-info';

interface SourceSelectionProps {
  onWebcamSelected: () => void;
}

export function SourceSelection({ onWebcamSelected }: SourceSelectionProps) {
  const [step, setStep] = useState<SourceChoice>('choose');

  if (step === 'cctv-info') {
    return (
      <div className="min-h-screen bg-slate-950 text-white overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.22),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(16,185,129,0.12),_transparent_36%),linear-gradient(180deg,_rgba(2,6,23,1),_rgba(15,23,42,1))]" />
        <div className="relative max-w-2xl mx-auto px-4 py-16">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-8 space-y-6 backdrop-blur-sm">
            <h2 className="text-2xl font-semibold">CCTV / RTSP Camera</h2>
            <p className="text-slate-300 leading-relaxed">
              CCTV mode uses the backend implementation and will be enabled separately.
            </p>
            <p className="text-sm text-slate-400">
              The FastAPI / OpenCV / RTSP pipeline remains in the <code className="text-cyan-300">backend/</code> folder for a future release.
            </p>
            <button
              type="button"
              onClick={() => setStep('choose')}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium hover:bg-white/10"
            >
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.22),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(16,185,129,0.12),_transparent_36%),linear-gradient(180deg,_rgba(2,6,23,1),_rgba(15,23,42,1))]" />
      <div className="relative max-w-3xl mx-auto px-4 py-10 md:px-8 md:py-16">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-cyan-200">
            Browser AI
          </div>
          <h1 className="mt-5 text-4xl md:text-5xl font-semibold tracking-tight">
            Real-Time Face Blur System
          </h1>
          <p className="mt-4 text-slate-300 text-base md:text-lg">Choose Input Source</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <button
            type="button"
            onClick={onWebcamSelected}
            className="group rounded-3xl border border-white/10 bg-white/5 p-6 text-left transition hover:border-cyan-400/40 hover:bg-cyan-400/10"
          >
            <div className="text-3xl mb-4">📷</div>
            <div className="text-xl font-semibold">Laptop Webcam</div>
            <p className="mt-2 text-sm text-slate-400">
              Ask for camera permission, detect faces in the browser, and blur locally — nothing leaves your device.
            </p>
          </button>

          <button
            type="button"
            onClick={() => setStep('cctv-info')}
            className="group rounded-3xl border border-white/10 bg-white/5 p-6 text-left transition hover:border-emerald-400/40 hover:bg-emerald-400/10"
          >
            <div className="text-3xl mb-4">📹</div>
            <div className="text-xl font-semibold">CCTV / RTSP</div>
            <p className="mt-2 text-sm text-slate-400">
              Backend RTSP pipeline — coming separately.
            </p>
          </button>
        </div>
      </div>
    </div>
  );
}
