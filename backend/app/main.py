"""FastAPI entry — wires VideoSource → Pipeline → Streamer.

Architecture
------------
VideoSource (BrowserWebcamSource | RTSPSource | WebcamSource)
    → FramePipeline (shared SCRFD + blur + JpegEncoder)
    → JpegFrameStreamer / WebRTC
"""

import asyncio
import json
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from . import runtime
from .config import settings
from .core.detector import SCRFDDetector
from .core.pipeline import FramePipeline
from .core.streamer import JpegFrameStreamer
from .streaming import WebRTCManager
from .video_sources import BrowserWebcamSource
from .api import routes

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load SCRFD once; reuse for every VideoSource."""
    logger.info("Starting Face Blur System (VideoSource → SCRFD → Blur → Encoder)...")

    detector = SCRFDDetector(
        model_name=settings.det_model_name,
        input_size=settings.det_input_size,
        conf_threshold=settings.det_conf_threshold,
        nms_threshold=settings.det_nms_threshold,
    )
    runtime.detector = detector

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
    runtime.pipeline = pipeline

    stun_urls = [u.strip() for u in settings.webrtc_stun_urls.split(",") if u.strip()]
    webrtc_manager = WebRTCManager(
        frame_provider=pipeline,
        stun_urls=stun_urls,
        target_fps=settings.webrtc_target_fps,
    )
    runtime.webrtc_manager = webrtc_manager

    routes.pipeline = pipeline
    routes.webrtc_manager = webrtc_manager

    try:
        detector.warmup()
        pipeline._detector_warmed = True
        logger.info("SCRFD loaded once — ready for BrowserWebcamSource / RTSPSource")
    except Exception as exc:
        logger.exception("Detector warmup failed; will retry on first use: %s", exc)

    yield

    logger.info("Shutting down...")
    if runtime.webrtc_manager:
        await runtime.webrtc_manager.close_all()
    if runtime.pipeline:
        runtime.pipeline.stop()
    runtime.webrtc_manager = None
    runtime.pipeline = None
    runtime.detector = None
    logger.info("Shutdown complete")


app = FastAPI(
    title="Real-Time Face Blur API",
    version="2.2.0",
    lifespan=lifespan,
)

_cors_origins = [
    o.strip().rstrip("/")
    for o in settings.cors_origins.split(",")
    if o.strip()
]
for _origin in (
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://blur-face.vercel.app",
):
    if _origin not in _cors_origins:
        _cors_origins.append(_origin)

_cors_origin_regex = r"https://.*\.vercel\.app"
logger.info("CORS allow_origins=%s regex=%s", _cors_origins, _cors_origin_regex)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_origin_regex=_cors_origin_regex,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(routes.router, prefix="/api")


@app.get("/")
async def root():
    return {
        "service": "Real-Time Face Blur API",
        "status": "ok",
        "architecture": "VideoSource → SCRFD → Blur → Encoder → Streamer",
        "docs": "/docs",
        "health": "/api/health",
        "metrics": "/api/metrics",
        "source": "/api/source",
        "jpeg_stream": "/ws/stream",
        "browser_process": "/ws/process",
        "webrtc_offer": "/api/webrtc/offer",
    }


@app.websocket("/ws/process")
async def process_websocket(websocket: WebSocket):
    """Browser webcam path.

    Client JPEG → BrowserWebcamSource → shared pipeline → JPEG streamer.
    """
    await websocket.accept()

    pipeline = runtime.pipeline
    if pipeline is None or runtime.detector is None:
        await websocket.send_text(
            json.dumps({"type": "error", "data": "Pipeline not initialized"})
        )
        await websocket.close()
        return

    logger.info("Browser process WebSocket connected")

    source = BrowserWebcamSource(
        width=settings.camera_width,
        height=settings.camera_height,
    )
    await asyncio.to_thread(pipeline.set_video_source, source)
    await asyncio.to_thread(pipeline.start)

    stop_event = asyncio.Event()
    streamer = JpegFrameStreamer(
        pipeline,
        websocket,
        metrics_every=settings.ws_metrics_interval,
    )

    async def receive_loop() -> None:
        try:
            while not stop_event.is_set():
                message = await websocket.receive()
                if message.get("type") == "websocket.disconnect":
                    break

                data = message.get("bytes")
                if data:
                    # Push into VideoSource only — pipeline owns AI.
                    source.submit_jpeg(data)
                    continue

                text = message.get("text")
                if text:
                    await _handle_process_text(text)
        except WebSocketDisconnect:
            pass
        except Exception as exc:
            msg = str(exc).strip() or type(exc).__name__
            logger.warning("Browser receive loop closed: %s", msg)
        finally:
            stop_event.set()

    async def send_loop() -> None:
        try:
            await streamer.run(should_stop=stop_event.is_set)
        except WebSocketDisconnect:
            pass
        except Exception as exc:
            msg = str(exc).strip() or type(exc).__name__
            logger.warning("Browser send loop closed: %s", msg)
        finally:
            stop_event.set()

    try:
        await asyncio.gather(receive_loop(), send_loop())
    finally:
        if pipeline.video_source is source:
            await asyncio.to_thread(pipeline.stop_source_only)
        logger.info("Browser process WebSocket closed")


async def _handle_process_text(text: str) -> None:
    pipeline = runtime.pipeline
    if pipeline is None:
        return
    try:
        message = json.loads(text)
    except (ValueError, TypeError):
        return

    if message.get("type") == "config":
        data = message.get("data") or {}
        allowed = {
            "blur_method",
            "blur_kernel_size",
            "blur_sigma",
            "blur_pixelation_block",
            "det_conf_threshold",
            "jpeg_quality",
        }
        update = {k: v for k, v in data.items() if k in allowed and v is not None}
        if update:
            await asyncio.to_thread(pipeline.update_config, **update)


@app.websocket("/ws/stream")
async def stream_websocket(websocket: WebSocket):
    """RTSP / server-source JPEG stream (same pipeline, different VideoSource)."""
    await websocket.accept()
    logger.info("JPEG stream WebSocket connected")

    pipeline = runtime.pipeline
    if pipeline is None:
        await websocket.close()
        return

    stop_event = asyncio.Event()
    streamer = JpegFrameStreamer(
        pipeline,
        websocket,
        metrics_every=settings.ws_metrics_interval,
        idle_sleep_sec=max(0.02, 1.0 / max(settings.webrtc_target_fps, 1)),
    )

    try:
        await streamer.run(should_stop=stop_event.is_set)
    except WebSocketDisconnect:
        logger.info("JPEG stream WebSocket disconnected")
    except Exception as e:
        msg = str(e).strip() or type(e).__name__
        logger.warning("JPEG stream WebSocket closed: %s", msg)
    finally:
        stop_event.set()
        logger.info("JPEG stream WebSocket closed")


@app.websocket("/ws/metrics")
async def metrics_websocket(websocket: WebSocket):
    await websocket.accept()
    logger.info("Metrics WebSocket connected")
    pipeline = runtime.pipeline

    try:
        while True:
            if pipeline is None:
                await asyncio.sleep(0.5)
                continue
            await websocket.send_text(
                json.dumps({"type": "metrics", "data": pipeline.build_metrics_payload()})
            )
            await websocket.send_text(
                json.dumps({"type": "source_status", "data": pipeline.get_source_info()})
            )
            await asyncio.sleep(1.0)
    except WebSocketDisconnect:
        logger.info("Metrics WebSocket disconnected")
    except Exception as e:
        msg = str(e).strip() or type(e).__name__
        logger.warning("Metrics WebSocket closed: %s", msg)
    finally:
        logger.info("Metrics WebSocket closed")


def run():
    import os

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
