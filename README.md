# Real-Time Face Blur System

Cloud face-blur: **Vercel frontend** + **Render FastAPI** (InsightFace SCRFD).

## Architecture

```
Browser (Vercel)
  ├── Laptop Webcam → getUserMedia → WS /ws/process → SCRFD + blur → display
  └── CCTV / RTSP   → POST /api/source/connect → WS /ws/stream → display

Backend (Render)
  VideoSource → SCRFD (once) → Blur → JPEG Encoder → Streamer
```

- **No AI in the browser** for production webcam mode.
- **No webcam on the Render host** — set `DISABLE_SERVER_WEBCAM=true`.
- Shared SCRFD detector for browser frames and RTSP.

## Quick start (local)

```bash
# Backend
cd backend
python -m venv venv && .\venv\Scripts\activate   # Windows
pip install -r requirements.txt
python run.py

# Frontend
cd frontend
cp .env.example .env.local
npm install && npm run dev
```

Open http://127.0.0.1:5173 → choose source.

## Deploy

See **[DEPLOYMENT.md](DEPLOYMENT.md)** for:

- Vercel + Render setup  
- Environment variable tables  
- Health check `/api/health`  
- Remote webcam / RTSP verification  

### Env at a glance

| Where | Variable | Example |
|-------|----------|---------|
| Vercel | `VITE_BACKEND_URL` | `https://blur-face-api.onrender.com` |
| Vercel | `VITE_STREAM_MODE` | `jpeg` |
| Render | `CORS_ORIGINS` | `https://blur-face.vercel.app,...` |
| Render | `DISABLE_SERVER_WEBCAM` | `true` |

## Health

```text
GET /api/health  →  { "status": "ok", ... }
```

## License

MIT
