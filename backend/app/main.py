import asyncio
import json
import logging
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from .config import settings
from .core.detector import SCRFDDetector
from .core.pipeline import FramePipeline
from .streaming import WebRTCManager
from .api import routes

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

pipeline: Optional[FramePipeline] = None
webrtc_manager: Optional[WebRTCManager] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global pipeline, webrtc_manager

    logger.info("Starting Face Blur System (WebRTC transport)...")

    detector = SCRFDDetector(
        model_name=settings.det_model_name,
        input_size=settings.det_input_size,
        conf_threshold=settings.det_conf_threshold,
        nms_threshold=settings.det_nms_threshold,
    )

    pipeline = FramePipeline(
        detector=detector,
        video_source=None,
        blur_method=settings.blur_method,
        blur_kernel_size=settings.blur_kernel_size,
        blur_sigma=settings.blur_sigma,
        blur_pixelation_block=settings.blur_pixelation_block,
        blur_margin=settings.blur_margin,
        jpeg_quality=settings.jpeg_quality,
        target_fps=settings.webrtc_target_fps,
    )

    stun_urls = [u.strip() for u in settings.webrtc_stun_urls.split(",") if u.strip()]
    webrtc_manager = WebRTCManager(
        frame_provider=pipeline,
        stun_urls=stun_urls,
        target_fps=settings.webrtc_target_fps,
    )

    routes.pipeline = pipeline
    routes.webrtc_manager = webrtc_manager

    try:
        detector.warmup()
        pipeline._detector_warmed = True
        logger.info("Detector ready — waiting for video source selection")
    except Exception as exc:
        logger.exception("Detector warmup failed; will retry on connect: %s", exc)

    yield

    logger.info("Shutting down...")
    if webrtc_manager:
        await webrtc_manager.close_all()
    if pipeline:
        pipeline.stop()
    logger.info("Shutdown complete")


app = FastAPI(
    title="Real-Time Face Blur API",
    version="2.0.0",
    lifespan=lifespan,
)

_cors_origins = [
    o.strip().rstrip("/")
    for o in settings.cors_origins.split(",")
    if o.strip()
]
# Allow any Vercel deploy / preview URL without listing each one.
_cors_origin_regex = r"https://.*\.vercel\.app"

logger.info("CORS allow_origins=%s regex=%s", _cors_origins, _cors_origin_regex)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins or ["http://localhost:5173"],
    allow_origin_regex=_cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(routes.router, prefix="/api")


@app.websocket("/ws/metrics")
async def metrics_websocket(websocket: WebSocket):
    """Lightweight metrics channel (no video — video is WebRTC)."""
    await websocket.accept()
    logger.info("Metrics WebSocket client connected")

    try:
        while True:
            if pipeline is None:
                await asyncio.sleep(0.5)
                continue

            payload = {
                "type": "metrics",
                "data": pipeline.build_metrics_payload(),
            }
            await websocket.send_text(json.dumps(payload))

            # Also push source status for RTSP reconnect UI.
            source_info = pipeline.get_source_info()
            await websocket.send_text(
                json.dumps({"type": "source_status", "data": source_info})
            )

            await asyncio.sleep(1.0)
    except WebSocketDisconnect:
        logger.info("Metrics WebSocket client disconnected")
    except Exception as e:
        msg = str(e).strip() or type(e).__name__
        logger.warning("Metrics WebSocket closed: %s", msg)
    finally:
        logger.info("Metrics WebSocket connection closed")


def run():
    import os

    # Render (and most PaaS) inject PORT; local default stays 8001.
    port = int(os.environ.get("PORT", "8001"))
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=port,
        reload=False,
        log_level="info",
    )


if __name__ == "__main__":
    run()
