import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

type SourceOption = 'webcam' | 'rtsp';

/**
 * Landing page — choose webcam (cloud processing) or CCTV/RTSP.
 * Does not start any camera; navigation only.
 */
export function SourceSelection() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<SourceOption | null>(null);

  const continueToSource = () => {
    if (selected === 'webcam') {
      navigate('/webcam');
      return;
    }
    if (selected === 'rtsp') {
      navigate('/rtsp');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.22),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(16,185,129,0.12),_transparent_36%),linear-gradient(180deg,_rgba(2,6,23,1),_rgba(15,23,42,1))]" />

      <div className="relative max-w-xl mx-auto px-4 py-12 md:px-8 md:py-20">
        <div className="text-center mb-10">
          <h1 className="text-4xl md:text-5xl font-semibold tracking-tight">
            Real-Time Face Blur System
          </h1>
          <p className="mt-4 text-slate-300 text-base md:text-lg">Choose Input Source</p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 md:p-8 space-y-5 backdrop-blur-sm">
          <label
            className={`flex cursor-pointer items-start gap-4 rounded-2xl border px-4 py-4 transition ${
              selected === 'webcam'
                ? 'border-cyan-400/50 bg-cyan-400/10'
                : 'border-white/10 bg-white/[0.03] hover:border-white/20'
            }`}
          >
            <input
              type="radio"
              name="input-source"
              value="webcam"
              checked={selected === 'webcam'}
              onChange={() => setSelected('webcam')}
              className="mt-1 h-4 w-4 accent-cyan-400"
            />
            <div>
              <div className="text-lg font-semibold">Laptop Webcam (Cloud Processing)</div>
              <p className="mt-1 text-sm text-slate-400">
                Capture frames in the browser and process faces on the FastAPI backend.
              </p>
            </div>
          </label>

          <label
            className={`flex cursor-pointer items-start gap-4 rounded-2xl border px-4 py-4 transition ${
              selected === 'rtsp'
                ? 'border-emerald-400/50 bg-emerald-400/10'
                : 'border-white/10 bg-white/[0.03] hover:border-white/20'
            }`}
          >
            <input
              type="radio"
              name="input-source"
              value="rtsp"
              checked={selected === 'rtsp'}
              onChange={() => setSelected('rtsp')}
              className="mt-1 h-4 w-4 accent-emerald-400"
            />
            <div>
              <div className="text-lg font-semibold">CCTV / RTSP Camera</div>
              <p className="mt-1 text-sm text-slate-400">
                Connect an IP camera stream and run SCRFD blur on the server.
              </p>
            </div>
          </label>

          <button
            type="button"
            disabled={!selected}
            onClick={continueToSource}
            className="w-full rounded-2xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
