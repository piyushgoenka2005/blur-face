# Real-Time Face Blur System (Browser AI)

Meet-style webcam privacy: **camera permission, face detection, and blur all run in the browser**.
Nothing is sent to a server for webcam mode. Deploy the frontend on **Vercel only**.

## Architecture

```
Browser
  → getUserMedia (permission + capture)
  → Face detection (SCRFD ONNX Web → fallback MediaPipe)
  → Canvas blur (Gaussian / Pixelation)
  → Dashboard preview
```

- **No WebSocket** for webcam mode  
- **No FastAPI** involved for webcam mode  
- **`backend/`** is kept untouched for a future CCTV / RTSP implementation  

## Quick start

```bash
cd frontend
npm install
npm run dev
```

Open http://127.0.0.1:5173 → **Laptop Webcam** → allow camera.

## Detection engines

| Priority | Engine | Notes |
|----------|--------|--------|
| Preferred | SCRFD via ONNX Runtime Web | Place `frontend/public/models/scrfd.onnx` |
| Fallback | MediaPipe Face Detection | Used automatically if SCRFD is missing/slow to load |

## Blur

Canvas-side **Gaussian** and **Pixelation**; switch live from the dashboard.

## Target performance

- 640×480  
- ~25–30 FPS (device dependent)  
- `requestAnimationFrame` loop, reused canvas contexts / detector session  

## Deploy (Vercel)

1. Import this repo in Vercel.  
2. Root `vercel.json` builds `frontend/` only.  
3. **No** `VITE_BACKEND_URL` needed for webcam mode.  
4. Site must be served over **HTTPS** (or localhost) for `getUserMedia`.

## CCTV / RTSP

Selecting **CCTV / RTSP** shows a placeholder. The Python backend under `backend/` remains for a later release.

## Backup

A snapshot of the previous full-stack project is stored as:

`face-blur-prototype-backup.zip`

## Scripts

```bash
cd frontend
npm run build    # production build
npm run preview  # preview build
```

## License

MIT
