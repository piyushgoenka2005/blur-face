/**
 * Build an RTSP URL from discrete form fields (mirrors backend build_rtsp_url).
 */
export function buildRtspUrl(fields: {
  ip_address: string;
  port: string;
  username: string;
  password: string;
  stream_path: string;
}): string {
  const ip = fields.ip_address.trim();
  if (!ip) return '';

  const portNum = Number(fields.port || '554');
  const port = Number.isFinite(portNum) && portNum > 0 ? portNum : 554;
  const path = fields.stream_path.trim().replace(/^\/+/, '');
  const user = encodeURIComponent(fields.username.trim());
  const pass = encodeURIComponent(fields.password);
  const auth = user || pass ? `${user}:${pass}@` : '';

  return path
    ? `rtsp://${auth}${ip}:${port}/${path}`
    : `rtsp://${auth}${ip}:${port}/`;
}

/** Redact password for on-screen preview. */
export function redactRtspUrl(url: string): string {
  return url.replace(/:([^:@/]+)@/, ':****@');
}
