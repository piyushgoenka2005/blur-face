import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { RtspConnectForm } from '../types';
import { apiUrl } from '../config';
import { buildRtspUrl, redactRtspUrl } from '../utils/rtspUrl';

const initialForm: RtspConnectForm = {
  camera_name: '',
  mode: 'url',
  rtsp_url: '',
  ip_address: '',
  port: '554',
  username: '',
  password: '',
  stream_path: '',
};

/**
 * CCTV / RTSP connection form.
 * Connect → POST /api/source/connect → navigate to live dashboard.
 * Does not start any camera until Connect is pressed.
 */
export function RtspConnection() {
  const navigate = useNavigate();
  const [form, setForm] = useState<RtspConnectForm>(initialForm);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = <K extends keyof RtspConnectForm>(key: K, value: RtspConnectForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const previewUrl = useMemo(() => {
    if (form.mode === 'url') return form.rtsp_url.trim();
    return buildRtspUrl(form);
  }, [form]);

  const canConnect =
    form.mode === 'url'
      ? form.rtsp_url.trim().toLowerCase().startsWith('rtsp://')
      : Boolean(form.ip_address.trim());

  const onConnect = async () => {
    setError(null);
    setConnecting(true);
    try {
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
              username: form.username.trim() || undefined,
              password: form.password || undefined,
              stream_path: form.stream_path.trim() || undefined,
            };

      const res = await fetch(apiUrl('/api/source/connect'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        let detail = `Connect failed (${res.status})`;
        try {
          const payload = await res.json();
          if (typeof payload.detail === 'string') detail = payload.detail;
        } catch {
          // ignore
        }
        throw new Error(detail);
      }

      navigate('/cctv');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect RTSP camera');
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.20),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(16,185,129,0.12),_transparent_35%),linear-gradient(180deg,_rgba(2,6,23,1),_rgba(15,23,42,1))]" />

      <div className="relative max-w-2xl mx-auto px-4 py-10 md:px-8 md:py-14 space-y-6">
        <header className="space-y-3">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium hover:bg-white/10"
          >
            ← Change Source
          </button>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
            CCTV / RTSP Camera
          </h1>
          <p className="text-slate-300 text-sm md:text-base">
            Connect an IP camera. Backend opens RTSP, runs shared SCRFD + blur, and streams results back.
          </p>
        </header>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 md:p-8 space-y-5 backdrop-blur-sm">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Camera Name</label>
            <input
              type="text"
              value={form.camera_name}
              onChange={(e) => update('camera_name', e.target.value)}
              placeholder="Lobby Cam"
              className="w-full rounded-xl border border-white/10 bg-slate-900/60 px-4 py-3 text-sm outline-none focus:border-cyan-400/50"
            />
          </div>

          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="radio"
                name="rtsp-mode"
                checked={form.mode === 'url'}
                onChange={() => update('mode', 'url')}
                className="accent-cyan-400"
              />
              RTSP URL
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="radio"
                name="rtsp-mode"
                checked={form.mode === 'fields'}
                onChange={() => update('mode', 'fields')}
                className="accent-cyan-400"
              />
              IP / Port / Credentials
            </label>
          </div>

          {form.mode === 'url' ? (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">RTSP URL</label>
              <input
                type="text"
                value={form.rtsp_url}
                onChange={(e) => update('rtsp_url', e.target.value)}
                placeholder="rtsp://user:pass@192.168.1.10:554/stream1"
                className="w-full rounded-xl border border-white/10 bg-slate-900/60 px-4 py-3 text-sm font-mono outline-none focus:border-cyan-400/50"
              />
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-300 mb-2">IP</label>
                <input
                  type="text"
                  value={form.ip_address}
                  onChange={(e) => update('ip_address', e.target.value)}
                  placeholder="192.168.1.10"
                  className="w-full rounded-xl border border-white/10 bg-slate-900/60 px-4 py-3 text-sm outline-none focus:border-cyan-400/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Port</label>
                <input
                  type="text"
                  value={form.port}
                  onChange={(e) => update('port', e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-slate-900/60 px-4 py-3 text-sm outline-none focus:border-cyan-400/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Stream Path</label>
                <input
                  type="text"
                  value={form.stream_path}
                  onChange={(e) => update('stream_path', e.target.value)}
                  placeholder="/stream1"
                  className="w-full rounded-xl border border-white/10 bg-slate-900/60 px-4 py-3 text-sm outline-none focus:border-cyan-400/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Username</label>
                <input
                  type="text"
                  value={form.username}
                  onChange={(e) => update('username', e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-slate-900/60 px-4 py-3 text-sm outline-none focus:border-cyan-400/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Password</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => update('password', e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-slate-900/60 px-4 py-3 text-sm outline-none focus:border-cyan-400/50"
                />
              </div>
            </div>
          )}

          {previewUrl && (
            <div className="rounded-xl border border-white/10 bg-slate-900/40 px-4 py-3">
              <div className="text-xs uppercase tracking-wider text-slate-500 mb-1">
                Generated RTSP URL
              </div>
              <div className="font-mono text-sm text-cyan-200 break-all">
                {redactRtspUrl(previewUrl)}
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          )}

          <button
            type="button"
            disabled={!canConnect || connecting}
            onClick={() => void onConnect()}
            className="w-full rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300"
          >
            {connecting ? 'Connecting…' : 'Connect'}
          </button>

          <p className="text-xs text-slate-500">
            Uses the same SCRFD detector and blur pipeline as webcam cloud mode. Stream loss auto-reconnects on the backend.
          </p>
        </div>
      </div>
    </div>
  );
}
