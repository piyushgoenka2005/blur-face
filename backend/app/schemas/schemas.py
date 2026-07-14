from pydantic import BaseModel, Field
from typing import Optional, Literal
from datetime import datetime


class ConfigUpdate(BaseModel):
    blur_method: Optional[Literal["gaussian", "pixelation"]] = None
    blur_kernel_size: Optional[int] = Field(None, ge=3, le=101)
    blur_sigma: Optional[float] = Field(None, gt=0)
    blur_pixelation_block: Optional[int] = Field(None, ge=4, le=64)
    det_conf_threshold: Optional[float] = Field(None, ge=0.0, le=1.0)
    jpeg_quality: Optional[int] = Field(None, ge=10, le=100)


class ConfigResponse(BaseModel):
    blur_method: str
    blur_kernel_size: int
    blur_sigma: float
    blur_pixelation_block: int
    det_conf_threshold: float
    jpeg_quality: int
    camera_width: int
    camera_height: int
    det_model_name: str
    det_input_size: tuple
    compute_mode: str


class MetricsResponse(BaseModel):
    fps: float
    faces_detected: int
    latency_ms: dict
    backend_status: str
    compute_mode: str
    blur_method: str
    source_type: Optional[str] = None
    camera_name: Optional[str] = None
    connection_status: Optional[str] = None


class HealthResponse(BaseModel):
    status: str
    timestamp: datetime
    camera_running: bool
    compute_mode: str
    source_type: Optional[str] = None
    camera_name: Optional[str] = None
    connection_status: Optional[str] = None


class SourceConnectRequest(BaseModel):
    """Connect a laptop webcam or an RTSP/IP camera.

    For RTSP, provide either:
      - rtsp_url (Option A — full URL paste), or
      - ip_address (+ optional port/username/password/stream_path) (Option B).
    """

    source_type: Literal["webcam", "rtsp"]
    camera_name: Optional[str] = Field(None, max_length=120)

    # Option A — full RTSP URL
    rtsp_url: Optional[str] = None

    # Option B — discrete fields used to build the URL
    ip_address: Optional[str] = None
    port: Optional[int] = Field(default=554, ge=1, le=65535)
    username: Optional[str] = None
    password: Optional[str] = None
    stream_path: Optional[str] = None


class SourceStatusResponse(BaseModel):
    source_type: Optional[str] = None
    camera_name: Optional[str] = None
    connection_status: str = "idle"
    source_active: bool = False
    message: Optional[str] = None
    rtsp_url: Optional[str] = None


class WebRTCOfferRequest(BaseModel):
    sdp: str
    type: str


class WebRTCAnswerResponse(BaseModel):
    sdp: str
    type: str
