/**
 * Backend base URL for REST / WebRTC / metrics WebSocket.
 *
 * Local (Vite DEV): defaults to http://127.0.0.1:8001
 * Production (Vercel): set VITE_BACKEND_URL in the Vercel project env
 *   e.g. https://your-backend.example.com
 */
const envUrl = (import.meta as ImportMeta & { env: Record<string, string> }).env
  ?.VITE_BACKEND_URL?.trim();

const isDev =
  typeof import.meta !== 'undefined' &&
  (import.meta as ImportMeta & { env: { DEV?: boolean } }).env?.DEV;

export const backendBaseUrl =
  envUrl ||
  (isDev ? 'http://127.0.0.1:8001' : (typeof window !== 'undefined' ? window.location.origin : ''));

export const websocketUrl = backendBaseUrl.replace(/^http/, 'ws');
