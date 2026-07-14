# Real-Time Face Blur System

Webcam / RTSP → SCRFD face detect → blur → **WebRTC** stream to a React dashboard.

## Deploy on Vercel (frontend)

Vercel hosts the **React dashboard only**. The FastAPI + OpenCV + WebRTC backend needs a
long-running host (Railway, Render, Fly.io, VPS, or your laptop) — not Vercel serverless.

1. Push this repo to GitHub.
2. In [Vercel](https://vercel.com) → **New Project** → import this repo.
3. Root `vercel.json` builds `frontend/`.
4. Add env var:

| Name | Value |
|------|--------|
| `VITE_BACKEND_URL` | Your backend base URL, e.g. `https://your-api.example.com` |

5. On the backend host, set:

```env
CORS_ORIGINS=https://your-app.vercel.app,http://localhost:5173
```

6. Redeploy the frontend after changing `VITE_BACKEND_URL`.

## Features

- Real-time face detection (InsightFace SCRFD) from webcam or RTSP/CCTV
- Gaussian / pixelation blur before egress
- WebRTC blurred video (H264 preferred, VP8 fallback)
- Live metrics: FPS, latency, faces, compute mode, source status
- Source selection UI + RTSP auto-reconnect

## Architecture

```
Video Source (Webcam | RTSP)
  → SCRFD Detector → Blur Engine → WebRTC Publisher → React Dashboard
```

## Quick Start

### Backend

```bash
cd backend
python -m venv venv
# Windows: venv\Scripts\activate
# Linux/Mac: source venv/bin/activate
pip install -r requirements.txt
python run.py
```

API: http://127.0.0.1:8001

### Frontend

```bash
cd frontend
npm install
npm run dev
```

UI: http://127.0.0.1:5173

## Configuration

See `backend/.env.example` and `frontend/.env.example`.

```env
# backend/.env
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173

# frontend/.env.local
VITE_BACKEND_URL=http://127.0.0.1:8001
```

## Useful API routes

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET/POST | `/api/config` | Read / update blur settings |
| POST | `/api/source/connect` | Connect webcam or RTSP |
| POST | `/api/source/disconnect` | Release source |
| POST | `/api/webrtc/offer` | WebRTC SDP offer/answer |
| WS | `/ws/metrics` | Metrics channel |

## License

MIT
