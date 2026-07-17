# Deployment Guide — Real-Time Face Blur

Frontend → **Vercel** · Backend → **Render**

Webcam mode does **not** use a camera on the Render host. The browser captures
frames (`getUserMedia`) and sends JPEGs to `/ws/process`. RTSP mode opens the
stream on the backend (camera must be reachable from Render’s network).

```
Vercel (React)
  Webcam: getUserMedia → WS /ws/process → SCRFD + blur → JPEG back
  RTSP:   form → POST /api/source/connect → WS /ws/stream → JPEG
                ↓
         Render (FastAPI + InsightFace SCRFD)
```

---

## 1. Deploy backend (Render)

1. [Render Dashboard](https://dashboard.render.com) → **New** → **Web Service**.
2. Connect this GitHub repo.
3. Settings:
   - **Root Directory:** `backend`
   - **Runtime:** Python 3
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `python run.py`
   - **Health Check Path:** `/api/health`
4. Paste the **Render environment variables** below.
5. Deploy. Note the service URL, e.g. `https://blur-face-api.onrender.com`  
   (no trailing slash).

### Verify health

```bash
curl https://YOUR-API.onrender.com/api/health
```

Expect JSON with `"status":"ok"`.

First boot downloads InsightFace weights — cold starts on free/starter can take
1–3 minutes.

Optional: use the repo [`render.yaml`](render.yaml) blueprint instead of the UI.

---

## 2. Deploy frontend (Vercel)

1. [Vercel](https://vercel.com) → **Add New Project** → import this repo.
2. **Preferred:** set **Root Directory** to `frontend`  
   (uses [`frontend/vercel.json`](frontend/vercel.json) for SPA rewrites).
3. Framework: Vite · Build: `npm run build` · Output: `dist`.
4. Add **Vercel environment variables** below (Production + Preview).
5. Deploy. Site URL example: `https://blur-face.vercel.app`.

`getUserMedia` requires **HTTPS** (Vercel provides this).

---

## 3. Vercel environment variables

| Name | Value | Notes |
|------|--------|--------|
| `VITE_BACKEND_URL` | `https://blur-face-api.onrender.com` | **Required.** No trailing slash. |
| `VITE_STREAM_MODE` | `jpeg` | Recommended for Render (WebRTC UDP often blocked). |

After changing env vars, **redeploy** the frontend so Vite bakes them into the build.

---

## 4. Render environment variables

| Name | Example / recommended | Notes |
|------|------------------------|--------|
| `PYTHON_VERSION` | `3.10.13` | Matches blueprint |
| `PORT` | *(Render sets automatically)* | Do not hardcode |
| `CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173,https://blur-face.vercel.app` | Comma-separated, no trailing slash |
| `DISABLE_SERVER_WEBCAM` | `true` | **Required on Render** — blocks server `cv2` webcam |
| `WEBRTC_TARGET_FPS` | `15` | Pipeline / stream pacing |
| `WEBRTC_STUN_URLS` | `stun:stun.l.google.com:19302` | Optional if using JPEG only |
| `CAMERA_WIDTH` | `640` | Browser frame sizing hint |
| `CAMERA_HEIGHT` | `480` | |
| `JPEG_QUALITY` | `75` | Lower = less bandwidth |
| `BLUR_METHOD` | `gaussian` | Default blur |
| `BLUR_KERNEL_SIZE` | `51` | Odd integer |
| `BLUR_SIGMA` | `30.0` | |
| `BLUR_PIXELATION_BLOCK` | `16` | |
| `BLUR_MARGIN` | `0.12` | |
| `DET_MODEL_NAME` | `det_10g` | InsightFace SCRFD |
| `DET_CONF_THRESHOLD` | `0.5` | |
| `DET_NMS_THRESHOLD` | `0.4` | |
| `RTSP_RECONNECT_INTERVAL` | `3.0` | Seconds |
| `RTSP_OPEN_TIMEOUT` | `8.0` | Seconds |
| `WS_METRICS_INTERVAL` | `10` | Metrics every N frames |

**CORS note:** The API also allows any `https://*.vercel.app` origin via regex
in [`backend/app/main.py`](backend/app/main.py), so preview deployments work
without listing each URL. Still set `CORS_ORIGINS` to your production frontend.

---

## 5. Remote verification checklist

### Health
- [ ] `GET https://YOUR-API.onrender.com/api/health` → `status: ok`
- [ ] `GET https://YOUR-API.onrender.com/` → service map JSON

### Webcam (no Render camera)
- [ ] Open Vercel site over HTTPS
- [ ] Choose **Laptop Webcam (Cloud Processing)** → Continue
- [ ] **Start Camera** → allow browser permission
- [ ] Blurred video appears; metrics (FPS, latency, faces) update
- [ ] Confirm Network tab: WebSocket to `wss://YOUR-API.../ws/process`
- [ ] Confirm Render logs show browser process connect (not `VideoCapture` device)

### RTSP
- [ ] Choose **CCTV / RTSP** → fill URL or fields → **Connect**
- [ ] Camera must be reachable from the public internet (or a tunnel) — private LAN-only RTSP will **not** work from Render
- [ ] `/cctv` shows blurred JPEG stream via `/ws/stream`
- [ ] Disconnect / reconnect works; source status shows reconnecting on drop

### No local webcam dependency
- [ ] `DISABLE_SERVER_WEBCAM=true` on Render
- [ ] `POST /api/source/connect` with `"source_type":"webcam"` returns **400** with cloud message
- [ ] Production webcam path only uses browser capture + `/ws/process`

---

## 6. Local development (optional)

```bash
# Backend
cd backend
python -m venv venv
# Windows: .\venv\Scripts\activate
pip install -r requirements.txt
# leave DISABLE_SERVER_WEBCAM unset/false for local server-webcam tests
python run.py

# Frontend
cd frontend
cp .env.example .env.local
# VITE_BACKEND_URL=http://127.0.0.1:8001
npm install
npm run dev
```

---

## 7. Troubleshooting

| Symptom | Fix |
|---------|-----|
| CORS errors in browser | Add exact Vercel URL to `CORS_ORIGINS`; ensure no trailing slash on API URL |
| Frontend calls wrong host | Set `VITE_BACKEND_URL` and redeploy Vercel |
| WS fails on cloud | Use `VITE_STREAM_MODE=jpeg`; confirm `wss://` (HTTPS page) |
| Render sleep / cold start | Free tier sleeps; first request wakes API (wait 1–2 min) |
| RTSP connect fails | Camera not public from Render; try ngrok/VPN or a public test stream |
| Health 503 / crash on boot | Check InsightFace/onnxruntime install logs; ensure `opencv-python-headless` |

---

## License

MIT
