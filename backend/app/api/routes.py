from datetime import datetime
from fastapi import APIRouter, HTTPException
from typing import Optional, Any
import asyncio

from ..config import settings
from ..core import FramePipeline
from ..schemas import (
    ConfigUpdate,
    ConfigResponse,
    HealthResponse,
    SourceConnectRequest,
    SourceStatusResponse,
    WebRTCOfferRequest,
    WebRTCAnswerResponse,
)
from ..video_sources import WebcamSource, RTSPSource, build_rtsp_url, validate_rtsp_url
from ..streaming import WebRTCManager

router = APIRouter(prefix="", tags=["api"])

# Set from main.py lifespan
pipeline: Optional[FramePipeline] = None
webrtc_manager: Optional[WebRTCManager] = None


@router.get("/health", response_model=HealthResponse)
async def health_check():
    source_info = pipeline.get_source_info() if pipeline else {}
    camera_running = False
    if pipeline and pipeline.video_source is not None:
        camera_running = pipeline.video_source.is_opened()

    return HealthResponse(
        status="ok",
        timestamp=datetime.now(),
        camera_running=camera_running,
        compute_mode=pipeline.detector.get_compute_mode() if pipeline else "unknown",
        source_type=source_info.get("source_type"),
        camera_name=source_info.get("camera_name"),
        connection_status=source_info.get("connection_status", "idle"),
    )


@router.get("/config", response_model=ConfigResponse)
async def get_config():
    if not pipeline:
        raise HTTPException(status_code=503, detail="Pipeline not initialized")

    compute_mode = "cpu"
    try:
        import onnxruntime as ort

        if "CUDAExecutionProvider" in ort.get_available_providers():
            compute_mode = "cuda"
    except Exception:
        pass

    return ConfigResponse(
        blur_method=pipeline.blur_method,
        blur_kernel_size=pipeline.blur_kernel_size,
        blur_sigma=pipeline.blur_sigma,
        blur_pixelation_block=pipeline.blur_pixelation_block,
        det_conf_threshold=pipeline.detector.conf_threshold,
        jpeg_quality=pipeline.jpeg_quality,
        camera_width=settings.camera_width,
        camera_height=settings.camera_height,
        det_model_name=settings.det_model_name,
        det_input_size=settings.det_input_size,
        compute_mode=compute_mode,
    )


@router.post("/config", response_model=ConfigResponse)
async def update_config(config: ConfigUpdate):
    if not pipeline:
        raise HTTPException(status_code=503, detail="Pipeline not initialized")

    update_data = config.model_dump(exclude_unset=True)
    pipeline.update_config(**update_data)

    return await get_config()


@router.get("/metrics")
async def get_metrics() -> dict[str, Any]:
    if not pipeline:
        raise HTTPException(status_code=503, detail="Pipeline not initialized")
    return pipeline.build_metrics_payload()


@router.get("/source", response_model=SourceStatusResponse)
async def get_source_status():
    if not pipeline:
        return SourceStatusResponse(connection_status="idle", source_active=False)

    info = pipeline.get_source_info()
    rtsp_url = None
    if pipeline.video_source is not None and hasattr(pipeline.video_source, "rtsp_url"):
        rtsp_url = getattr(pipeline.video_source, "rtsp_url", None)

    return SourceStatusResponse(
        source_type=info.get("source_type"),
        camera_name=info.get("camera_name"),
        connection_status=info.get("connection_status", "idle"),
        source_active=info.get("source_active", False),
        message=info.get("message"),
        rtsp_url=rtsp_url,
    )


@router.post("/source/connect", response_model=SourceStatusResponse)
async def connect_source(request: SourceConnectRequest):
    """Select and start a video source (webcam or RTSP)."""
    if not pipeline:
        raise HTTPException(status_code=503, detail="Pipeline not initialized")

    try:
        if pipeline.video_source is not None:
            await asyncio.to_thread(pipeline.stop_source_only)

        source = await asyncio.to_thread(_create_and_start_source, request)
        pipeline.set_video_source(source)
        if not pipeline._detector_warmed:
            await asyncio.to_thread(pipeline.detector.warmup)
            pipeline._detector_warmed = True
        # Start continuous detect+blur loop (independent of WebRTC peers).
        await asyncio.to_thread(pipeline.start)

    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ConnectionError as exc:
        try:
            pipeline.stop_source_only()
        except Exception:
            pass
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        try:
            pipeline.stop_source_only()
        except Exception:
            pass
        raise HTTPException(
            status_code=500,
            detail=f"Failed to connect video source: {exc}",
        ) from exc

    info = pipeline.get_source_info()
    rtsp_url = None
    if pipeline.video_source is not None and hasattr(pipeline.video_source, "rtsp_url"):
        rtsp_url = getattr(pipeline.video_source, "rtsp_url", None)

    return SourceStatusResponse(
        source_type=info.get("source_type"),
        camera_name=info.get("camera_name"),
        connection_status=info.get("connection_status", "connected"),
        source_active=info.get("source_active", True),
        message=info.get("message"),
        rtsp_url=rtsp_url,
    )


@router.post("/source/disconnect", response_model=SourceStatusResponse)
async def disconnect_source():
    """Stop the current video source and return to idle (source selection)."""
    if not pipeline:
        raise HTTPException(status_code=503, detail="Pipeline not initialized")

    await asyncio.to_thread(pipeline.stop_source_only)
    return SourceStatusResponse(
        source_type=None,
        camera_name=None,
        connection_status="idle",
        source_active=False,
        message=None,
        rtsp_url=None,
    )


@router.post("/webrtc/offer", response_model=WebRTCAnswerResponse)
async def webrtc_offer(request: WebRTCOfferRequest):
    """Browser sends an SDP offer; server answers and publishes blurred video."""
    if not webrtc_manager:
        raise HTTPException(status_code=503, detail="WebRTC manager not initialized")
    if not pipeline or not pipeline.is_active:
        raise HTTPException(
            status_code=409,
            detail="Connect a video source before starting WebRTC.",
        )

    try:
        answer = await webrtc_manager.handle_offer(request.sdp, request.type)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"WebRTC negotiation failed: {exc}",
        ) from exc

    return WebRTCAnswerResponse(sdp=answer["sdp"], type=answer["type"])


def _create_and_start_source(request: SourceConnectRequest):
    """Build + start a VideoSource (runs in a worker thread)."""
    if request.source_type == "webcam":
        source = WebcamSource(
            device_id=settings.camera_device_id,
            width=settings.camera_width,
            height=settings.camera_height,
            fps=settings.camera_fps,
            camera_name=(request.camera_name or "").strip() or "Laptop Webcam",
        )
    else:
        url = _resolve_rtsp_url(request)
        source = RTSPSource(
            rtsp_url=url,
            camera_name=(request.camera_name or "").strip() or "RTSP Camera",
            reconnect_interval=settings.rtsp_reconnect_interval,
            open_timeout_sec=settings.rtsp_open_timeout,
        )

    source.start()
    return source


def _resolve_rtsp_url(request: SourceConnectRequest) -> str:
    """Prefer a pasted URL; otherwise build one from discrete fields."""
    if request.rtsp_url and request.rtsp_url.strip():
        return validate_rtsp_url(request.rtsp_url)

    return build_rtsp_url(
        ip_address=request.ip_address or "",
        port=request.port if request.port is not None else 554,
        username=request.username or "",
        password=request.password or "",
        stream_path=request.stream_path or "",
    )
