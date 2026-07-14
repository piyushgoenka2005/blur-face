from pydantic_settings import BaseSettings
from pydantic import Field
from typing import Tuple, Literal


class Settings(BaseSettings):
    # Camera (webcam defaults)
    camera_device_id: int = Field(default=0, description="Webcam device ID")
    camera_width: int = Field(default=1280, description="Capture width")
    camera_height: int = Field(default=720, description="Capture height")
    camera_fps: int = Field(default=25, description="Target FPS")

    # RTSP
    rtsp_reconnect_interval: float = Field(default=3.0, ge=1.0, description="Seconds between RTSP reconnect attempts")
    rtsp_open_timeout: float = Field(default=8.0, ge=2.0, description="Seconds to wait for first RTSP frame")

    # WebRTC
    webrtc_target_fps: float = Field(default=25.0, ge=1.0, le=60.0, description="WebRTC publish / processing target FPS")
    webrtc_stun_urls: str = Field(
        default="stun:stun.l.google.com:19302",
        description="Comma-separated STUN URLs for ICE",
    )

    # Detection
    det_model_name: str = Field(default="det_10g", description="InsightFace model name")
    det_input_size: Tuple[int, int] = Field(default=(640, 640), description="Model input size (W, H)")
    det_conf_threshold: float = Field(default=0.5, ge=0.0, le=1.0, description="Confidence threshold")
    det_nms_threshold: float = Field(default=0.4, ge=0.0, le=1.0, description="NMS threshold")

    # Blur
    blur_method: Literal["gaussian", "pixelation"] = Field(default="gaussian", description="Blur method")
    blur_kernel_size: int = Field(default=51, ge=3, le=101, description="Gaussian kernel size (odd)")
    blur_sigma: float = Field(default=30.0, gt=0, description="Gaussian sigma")
    blur_pixelation_block: int = Field(default=16, ge=4, le=64, description="Pixelation block size")
    blur_margin: float = Field(default=0.12, ge=0.0, le=0.5, description="Bbox expansion margin")

    # WebSocket
    ws_max_queue_size: int = Field(default=5, description="Max frames in queue")
    ws_metrics_interval: int = Field(default=10, description="Send metrics every N frames")

    # Performance
    jpeg_quality: int = Field(default=80, ge=10, le=100, description="JPEG encoding quality")

    # CORS — comma-separated origins (include your Vercel URL in production)
    cors_origins: str = Field(
        default="http://localhost:5173,http://127.0.0.1:5173",
        description="Allowed browser origins for the React dashboard",
    )

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
