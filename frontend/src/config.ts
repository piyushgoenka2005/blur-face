/**
 * Backend base URL for REST / WebRTC / metrics WebSocket.
 *
 * Local (Vite DEV): defaults to http://127.0.0.1:8001
 * Production (Vercel): set VITE_BACKEND_URL to the Render URL WITHOUT a trailing slash
 *   e.g. https://blur-face-api.onrender.com
 */
function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

const env = (import.meta as ImportMeta & { env: Record<string, string> }).env || {};
const envUrl = env.VITE_BACKEND_URL?.trim();

const isDev = Boolean(env.DEV);

const raw =
  envUrl ||
  (isDev
    ? 'http://127.0.0.1:8001'
    : typeof window !== 'undefined'
      ? window.location.origin
      : '');

export const backendBaseUrl = normalizeBaseUrl(raw);

export const websocketUrl = backendBaseUrl.replace(/^http/, 'ws');

/**
 * Stream transport:
 * - jpeg: WebSocket JPEG (works on Render/Vercel) — default for remote backends
 * - webrtc: aiortc peer connection — best for local LAN
 */
const streamModeEnv = (env.VITE_STREAM_MODE || '').toLowerCase();
const looksRemote =
  Boolean(backendBaseUrl) &&
  !/localhost|127\.0\.0\.1/i.test(backendBaseUrl);

export const streamMode: 'jpeg' | 'webrtc' =
  streamModeEnv === 'webrtc' || streamModeEnv === 'jpeg'
    ? (streamModeEnv as 'jpeg' | 'webrtc')
    : looksRemote
      ? 'jpeg'
      : 'webrtc';
