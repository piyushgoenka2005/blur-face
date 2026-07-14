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

const envUrl = (import.meta as ImportMeta & { env: Record<string, string> }).env
  ?.VITE_BACKEND_URL?.trim();

const isDev =
  typeof import.meta !== 'undefined' &&
  (import.meta as ImportMeta & { env: { DEV?: boolean } }).env?.DEV;

const raw =
  envUrl ||
  (isDev
    ? 'http://127.0.0.1:8001'
    : typeof window !== 'undefined'
      ? window.location.origin
      : '');

export const backendBaseUrl = normalizeBaseUrl(raw);

export const websocketUrl = backendBaseUrl.replace(/^http/, 'ws');
