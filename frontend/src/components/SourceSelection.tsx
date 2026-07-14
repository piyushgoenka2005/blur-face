import { useEffect, useMemo, useState } from 'react';
import type { RtspConnectForm, VideoSourceKind } from '../types';

interface SourceSelectionProps {
  onConnected: (sourceType: VideoSourceKind, cameraName: string) => void;
  backendBaseUrl: string;
}

const initialRtspForm: RtspConnectForm = {
  camera_name: '',
  mode: 'url',
  rtsp_url: '',
  ip_address: '',
  port: '554',
  username: '',
  password: '',
  stream_path: '',
};

export function SourceSelection({ onConnected, backendBaseUrl }: SourceSelectionProps) {
  const [step, setStep] = useState<'choose' | 'rtsp'>('choose');
  const [form, setForm] = useState<RtspConnectForm>(initialRtspForm);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previewUrl = useMemo(() => {
    if (form.mode === 'url') {
      return form.rtsp_url.trim() || 'rtsp://user:pass@ip:554/path';
    }
    const ip = form.ip_address.trim() || 'ip';
    const port = form.port.trim() || '554';
    const path = form.stream_path.trim().replace(/^\//, '');
    const user = form.username.trim();
    const pass = form.password ? '••••' : '';
    const auth = user || pass ? `${user || 'user'}:${pass || 'pass'}@` : '';
    return `rtsp://${auth}${ip}:${port}/${path}`;
  }, [form]);

  useEffect(() => {
    setError(null);
  }, [step, form.mode]);

  const connectWebcam = async () => {
    setIsConnecting(true);
    setError(null);
    try {
      const response = await fetch(`${backendBaseUrl}/api/source/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_type: 'webcam',
          camera_name: 'Laptop Webcam',
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.detail || 'Failed to open laptop webcam.');
      }

      onConnected('webcam', payload.camera_name || 'Laptop Webcam');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open laptop webcam.');
    } finally {
      setIsConnecting(false);
    }
  };

  const connectRtsp = async () => {
    setIsConnecting(true);
    setError(null);

    const body =
      form.mode === 'url'
        ? {
            source_type: 'rtsp' as const,
            camera_name: form.camera_name.trim() || 'RTSP Camera',
            rtsp_url: form.rtsp_url.trim(),
          }
        : {
            source_type: 'rtsp' as const,
            camera_name: form.camera_name.trim() || 'RTSP Camera',
            ip_address: form.ip_address.trim(),
            port: Number(form.port) || 554,
            username: form.username,
            password: form.password,
            stream_path: form.stream_path.trim(),
          };

    try {
      const response = await fetch(`${backendBaseUrl}/api/source/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = payload.detail;
        throw new Error(
          typeof detail === 'string'
            ? detail
            : Array.isArray(detail)
              ? detail.map((d: { msg?: string }) => d.msg).filter(Boolean).join(' ')
              : 'Failed to connect to RTSP camera.'
        );
      }

      onConnected('rtsp', payload.camera_name || 'RTSP Camera');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to RTSP camera.');
    } finally {
      setIsConnecting(false);
    }
  };

  const updateField = <K extends keyof RtspConnectForm>(key: K, value: RtspConnectForm[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.22),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(16,185,129,0.12),_transparent_36%),linear-gradient(180deg,_rgba(2,6,23,1),_rgba(15,23,42,1))]" />

      <div className="relative max-w-3xl mx-auto px-4 py-10 md:px-8 md:py-16">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-cyan-200">
            Input source
          </div>
          <h1 className="mt-5 text-4xl md:text-5xl font-semibold tracking-tight">
            Real-Time Face Blur System
          </h1>
          <p className="mt-4 text-slate-300 text-base md:text-lg">
            Choose Input Source
          </p>
        </div>

        {step === 'choose' && (
          <div className="grid gap-4 md:grid-cols-2">
            <button
              type="button"
              disabled={isConnecting}
              onClick={connectWebcam}
              className="group rounded-3xl border border-white/10 bg-white/5 p-6 text-left transition hover:border-cyan-400/40 hover:bg-cyan-400/10 disabled:opacity-60"
            >
              <div className="text-3xl mb-4">📷</div>
              <div className="text-xl font-semibold">Laptop Webcam</div>
              <p className="mt-2 text-sm text-slate-400">
                Use the default built-in or USB webcam with the existing blur pipeline.
              </p>
              {isConnecting && (
                <div className="mt-4 text-sm text-cyan-300 animate-pulse">Opening webcam...</div>
              )}
            </button>

            <button
              type="button"
              disabled={isConnecting}
              onClick={() => setStep('rtsp')}
              className="group rounded-3xl border border-white/10 bg-white/5 p-6 text-left transition hover:border-emerald-400/40 hover:bg-emerald-400/10 disabled:opacity-60"
            >
              <div className="text-3xl mb-4">📹</div>
              <div className="text-xl font-semibold">CCTV / RTSP Camera</div>
              <p className="mt-2 text-sm text-slate-400">
                Connect an IP camera by pasting an RTSP URL or entering host credentials.
              </p>
            </button>
          </div>
        )}

        {step === 'rtsp' && (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 md:p-8 space-y-6 backdrop-blur-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold">CCTV / RTSP Camera</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Paste a full URL or build one from IP credentials.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setStep('choose');
                  setError(null);
                }}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 hover:bg-white/10"
                disabled={isConnecting}
              >
                Back
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Camera Name <span className="text-slate-500">(optional)</span>
              </label>
              <input
                type="text"
                value={form.camera_name}
                onChange={e => updateField('camera_name', e.target.value)}
                placeholder="Lobby Cam 1"
                className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none focus:border-cyan-400/50"
              />
            </div>

            <div className="flex gap-2 rounded-2xl border border-white/10 bg-slate-950/40 p-1">
              <button
                type="button"
                onClick={() => updateField('mode', 'url')}
                className={`flex-1 rounded-xl px-4 py-2 text-sm font-medium transition ${
                  form.mode === 'url'
                    ? 'bg-cyan-500 text-slate-950'
                    : 'text-slate-300 hover:bg-white/5'
                }`}
              >
                Paste RTSP URL
              </button>
              <button
                type="button"
                onClick={() => updateField('mode', 'fields')}
                className={`flex-1 rounded-xl px-4 py-2 text-sm font-medium transition ${
                  form.mode === 'fields'
                    ? 'bg-cyan-500 text-slate-950'
                    : 'text-slate-300 hover:bg-white/5'
                }`}
              >
                Build from IP
              </button>
            </div>

            {form.mode === 'url' ? (
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">RTSP URL</label>
                <input
                  type="text"
                  value={form.rtsp_url}
                  onChange={e => updateField('rtsp_url', e.target.value)}
                  placeholder="rtsp://admin:password@192.168.1.100:554/Streaming/Channels/101"
                  className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 font-mono text-sm text-white outline-none focus:border-cyan-400/50"
                />
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-300 mb-2">IP Address</label>
                  <input
                    type="text"
                    value={form.ip_address}
                    onChange={e => updateField('ip_address', e.target.value)}
                    placeholder="192.168.1.100"
                    className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 font-mono text-sm text-white outline-none focus:border-cyan-400/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Port</label>
                  <input
                    type="text"
                    value={form.port}
                    onChange={e => updateField('port', e.target.value)}
                    placeholder="554"
                    className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 font-mono text-sm text-white outline-none focus:border-cyan-400/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Stream Path <span className="text-slate-500">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={form.stream_path}
                    onChange={e => updateField('stream_path', e.target.value)}
                    placeholder="Streaming/Channels/101"
                    className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 font-mono text-sm text-white outline-none focus:border-cyan-400/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Username</label>
                  <input
                    type="text"
                    value={form.username}
                    onChange={e => updateField('username', e.target.value)}
                    placeholder="admin"
                    className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none focus:border-cyan-400/50"
                    autoComplete="username"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Password</label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={e => updateField('password', e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none focus:border-cyan-400/50"
                    autoComplete="current-password"
                  />
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3">
              <div className="text-xs uppercase tracking-wider text-slate-500 mb-1">Generated URL</div>
              <div className="font-mono text-sm text-cyan-200 break-all">{previewUrl}</div>
            </div>

            {error && (
              <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={connectRtsp}
              disabled={isConnecting}
              className="w-full rounded-2xl bg-cyan-500 px-4 py-3 text-base font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-60 transition"
            >
              {isConnecting ? (
                <span className="inline-flex items-center gap-2 justify-center">
                  <span className="h-4 w-4 rounded-full border-2 border-slate-950/30 border-t-slate-950 animate-spin" />
                  Connecting...
                </span>
              ) : (
                'Connect'
              )}
            </button>
          </div>
        )}

        {error && step === 'choose' && (
          <div className="mt-6 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
