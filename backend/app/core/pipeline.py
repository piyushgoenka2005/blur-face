"""Unified processing pipeline (SOLID orchestration).

```
VideoSource  →  SCRFDDetector  →  blur_faces  →  JpegEncoder  →  Streamer
```

The detector only receives BGR ndarrays. It never knows whether frames
came from ``BrowserWebcamSource`` or ``RTSPSource``.
"""

from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass
from typing import Optional, Tuple

import numpy as np

from .detector import Face, SCRFDDetector
from .blur import blur_faces
from .encoder import JpegEncoder
from .metrics import MetricsCollector, LatencyBreakdown, PipelineMetrics
from ..video_sources.base import ConnectionStatus, VideoSource

logger = logging.getLogger(__name__)

# Keep last boxes briefly so shake / brief SCRFD misses don't flash a clear face.
_DEFAULT_FACE_HOLD_SEC = 1.0


@dataclass
class ProcessedFrame:
    """Result of one detect → blur → encode cycle."""

    frame: np.ndarray
    timestamp: float
    faces_detected: int
    detection_latency_ms: float
    blur_latency_ms: float
    encode_latency_ms: float
    total_latency_ms: float
    jpeg_bytes: bytes = b""
    seq: int = 0


class FramePipeline:
    """Orchestrates VideoSource → SCRFD → Blur → Encoder.

    Owns one shared detector for the process lifetime. Swapping sources
    never reloads the model.
    """

    def __init__(
        self,
        detector: SCRFDDetector,
        video_source: Optional[VideoSource] = None,
        blur_method: str = "gaussian",
        blur_kernel_size: int = 51,
        blur_sigma: float = 30.0,
        blur_pixelation_block: int = 16,
        blur_margin: float = 0.12,
        jpeg_quality: int = 80,
        metrics_interval: int = 10,
        target_fps: float = 25.0,
        face_hold_sec: float = _DEFAULT_FACE_HOLD_SEC,
    ):
        self.detector = detector
        self.video_source: Optional[VideoSource] = video_source
        self.camera = video_source

        self.blur_method = blur_method
        self.blur_kernel_size = blur_kernel_size
        self.blur_sigma = blur_sigma
        self.blur_pixelation_block = blur_pixelation_block
        self.blur_margin = blur_margin
        self.metrics_interval = metrics_interval
        self.target_fps = max(1.0, float(target_fps))
        self.face_hold_sec = max(0.0, float(face_hold_sec))

        self.encoder = JpegEncoder(quality=jpeg_quality)
        self.jpeg_quality = jpeg_quality

        self._metrics = MetricsCollector()
        self._running = False
        self._paused = False
        self._frame_count = 0
        self._detector_warmed = False
        self._result_seq = 0

        self._held_faces: list[Face] = []
        self._held_until: float = 0.0

        self._latest_blurred: Optional[np.ndarray] = None
        self._latest_jpeg: Optional[bytes] = None
        self._latest_meta: Optional[ProcessedFrame] = None
        self._frame_lock = threading.Lock()
        self._result_cond = threading.Condition(self._frame_lock)

        self._process_thread: Optional[threading.Thread] = None

    # ------------------------------------------------------------------
    # Source management
    # ------------------------------------------------------------------

    def set_video_source(self, source: VideoSource) -> None:
        """Attach any VideoSource; detector/blur stay the same instance."""
        if self.video_source is not None:
            try:
                self.video_source.stop()
            except Exception:
                logger.exception("Error stopping previous video source")

        self.video_source = source
        self.camera = source
        self._metrics = MetricsCollector()
        self._frame_count = 0
        with self._result_cond:
            self._latest_blurred = None
            self._latest_jpeg = None
            self._latest_meta = None
            self._result_seq = 0
        self._held_faces = []
        self._held_until = 0.0
        logger.info(
            "Video source set: %s (%s)",
            source.source_type,
            source.camera_name,
        )

    def start(self) -> None:
        if self.video_source is None:
            raise RuntimeError(
                "No video source selected. Connect a browser webcam or RTSP camera first."
            )

        if not self.video_source.is_opened():
            self.video_source.start()

        if not self._detector_warmed:
            self.detector.warmup()
            self._detector_warmed = True

        self._paused = False
        self._running = True
        self._ensure_process_thread()
        logger.info(
            "Pipeline started: VideoSource → SCRFD → Blur → Encoder (%s)",
            self.video_source.source_type,
        )

    def stop(self) -> None:
        self._running = False
        with self._result_cond:
            self._result_cond.notify_all()
        if self._process_thread and self._process_thread.is_alive():
            self._process_thread.join(timeout=2.0)
        self._process_thread = None
        if self.video_source is not None:
            try:
                self.video_source.stop()
            except Exception:
                logger.exception("Error stopping video source")
        logger.info("Pipeline stopped")

    def stop_source_only(self) -> None:
        """Detach current source; keep detector loaded for the next source."""
        self._paused = True
        if self.video_source is not None:
            try:
                self.video_source.stop()
            except Exception:
                logger.exception("Error stopping video source")
            self.video_source = None
            self.camera = None
        self._held_faces = []
        self._held_until = 0.0
        with self._result_cond:
            self._latest_blurred = None
            self._latest_jpeg = None
            self._latest_meta = None
            self._result_cond.notify_all()

    def set_paused(self, paused: bool) -> None:
        self._paused = paused

    @property
    def is_active(self) -> bool:
        return self._running and self.video_source is not None and not self._paused

    # ------------------------------------------------------------------
    # Outputs for streamers
    # ------------------------------------------------------------------

    def get_source_info(self) -> dict:
        if self.video_source is None:
            return {
                "source_type": None,
                "camera_name": None,
                "connection_status": ConnectionStatus.IDLE.value,
                "source_active": False,
                "message": None,
            }

        message = None
        if hasattr(self.video_source, "last_error"):
            message = getattr(self.video_source, "last_error", None)

        return {
            "source_type": self.video_source.source_type,
            "camera_name": self.video_source.camera_name,
            "connection_status": self.video_source.connection_status.value,
            "source_active": self.is_active,
            "message": message,
        }

    def get_latest_blurred_frame(self) -> Optional[np.ndarray]:
        with self._frame_lock:
            if self._latest_blurred is None:
                return None
            return self._latest_blurred.copy()

    def get_latest_jpeg_bytes(self) -> Optional[bytes]:
        with self._frame_lock:
            return self._latest_jpeg

    def wait_for_jpeg(self, timeout_sec: float = 0.05) -> Tuple[int, Optional[bytes]]:
        """Block until a new encoded frame is available (or timeout)."""
        deadline = time.perf_counter() + max(0.0, timeout_sec)
        with self._result_cond:
            start_seq = self._result_seq
            while self._latest_jpeg is None or self._result_seq == start_seq:
                remaining = deadline - time.perf_counter()
                if remaining <= 0:
                    break
                self._result_cond.wait(timeout=remaining)
            return self._result_seq, self._latest_jpeg

    # ------------------------------------------------------------------
    # Processing loop
    # ------------------------------------------------------------------

    def _ensure_process_thread(self) -> None:
        if self._process_thread and self._process_thread.is_alive():
            return
        self._process_thread = threading.Thread(
            target=self._processing_loop,
            name="face-blur-pipeline",
            daemon=True,
        )
        self._process_thread.start()

    def _processing_loop(self) -> None:
        """Pull newest frame from VideoSource; drop backlog by design."""
        min_interval = 1.0 / self.target_fps
        while self._running:
            loop_start = time.perf_counter()

            if self._paused or self.video_source is None:
                time.sleep(0.05)
                continue

            try:
                self.process_frame()
            except Exception:
                logger.exception("Pipeline processing error")
                time.sleep(0.02)
                continue

            # Pace continuous sources (RTSP / server webcam). Browser source
            # already blocks inside read() until a new frame arrives.
            source_type = getattr(self.video_source, "source_type", "")
            if source_type != "Browser Webcam":
                elapsed = time.perf_counter() - loop_start
                sleep_for = min_interval - elapsed
                if sleep_for > 0:
                    time.sleep(sleep_for)

    def _apply_face_hold(self, faces: list[Face]) -> list[Face]:
        """Reuse recent boxes briefly when SCRFD drops (shake / distance / darkness)."""
        now = time.time()
        if faces:
            self._held_faces = faces
            self._held_until = now + self.face_hold_sec
            return faces
        if self._held_faces and now <= self._held_until:
            return self._held_faces
        self._held_faces = []
        return []

    def process_frame(self) -> Optional[ProcessedFrame]:
        """Single stage chain: read → SCRFD → blur → encode → publish."""
        if not self._running or self.video_source is None or self._paused:
            return None

        frame = self.video_source.read()
        if frame is None:
            return None

        start_total = time.perf_counter()

        start_det = time.perf_counter()
        raw_faces = self.detector.detect(frame)
        faces = self._apply_face_hold(raw_faces)
        detection_ms = (time.perf_counter() - start_det) * 1000

        start_blur = time.perf_counter()
        blurred = blur_faces(
            frame,
            faces,
            method=self.blur_method,
            kernel_size=self.blur_kernel_size,
            sigma=self.blur_sigma,
            pixelation_block=self.blur_pixelation_block,
            margin=self.blur_margin,
            draw_debug_rectangles=True,
        )
        blur_ms = (time.perf_counter() - start_blur) * 1000

        start_enc = time.perf_counter()
        jpeg_bytes = self.encoder.encode(blurred) or b""
        encode_ms = (time.perf_counter() - start_enc) * 1000

        total_ms = (time.perf_counter() - start_total) * 1000
        self._frame_count += 1

        self._metrics.record_frame(
            LatencyBreakdown(
                detection_ms=detection_ms,
                blur_ms=blur_ms,
                encode_ms=encode_ms,
                total_ms=total_ms,
            ),
            len(faces),
        )

        with self._result_cond:
            self._result_seq += 1
            # Keep one BGR buffer for WebRTC; JPEG path uses _latest_jpeg only.
            self._latest_blurred = blurred
            self._latest_jpeg = jpeg_bytes if jpeg_bytes else None
            # Do not retain a second full-frame copy in meta (memory).
            self._latest_meta = ProcessedFrame(
                frame=np.empty(0, dtype=np.uint8),
                timestamp=time.time(),
                faces_detected=len(faces),
                detection_latency_ms=detection_ms,
                blur_latency_ms=blur_ms,
                encode_latency_ms=encode_ms,
                total_latency_ms=total_ms,
                jpeg_bytes=b"",
                seq=self._result_seq,
            )
            self._result_cond.notify_all()

        return self._latest_meta

    # ------------------------------------------------------------------
    # Metrics / config
    # ------------------------------------------------------------------

    def get_metrics(self) -> PipelineMetrics:
        return self._metrics.get_summary()

    def build_metrics_payload(self) -> dict:
        metrics = self.get_metrics()
        source_info = self.get_source_info()
        return {
            "fps": round(metrics.fps, 1),
            "faces_detected": metrics.faces_detected,
            "backend_status": "running" if self.is_active else "idle",
            "compute_mode": self.detector.get_compute_mode(),
            "blur_method": self.blur_method,
            "source_type": source_info.get("source_type"),
            "camera_name": source_info.get("camera_name"),
            "connection_status": source_info.get("connection_status"),
            "message": source_info.get("message"),
            "latency_ms": {
                "detection_p50": round(metrics.detection_p50, 1),
                "detection_p95": round(metrics.detection_p95, 1),
                "detection_p99": round(metrics.detection_p99, 1),
                "blur_p50": round(metrics.blur_p50, 1),
                "blur_p95": round(metrics.blur_p95, 1),
                "blur_p99": round(metrics.blur_p99, 1),
                "encode_p50": round(metrics.encode_p50, 1),
                "encode_p95": round(metrics.encode_p95, 1),
                "encode_p99": round(metrics.encode_p99, 1),
                "total_p50": round(metrics.total_p50, 1),
                "total_p95": round(metrics.total_p95, 1),
                "total_p99": round(metrics.total_p99, 1),
            },
        }

    def update_config(
        self,
        blur_method: str = None,
        blur_kernel_size: int = None,
        blur_sigma: float = None,
        blur_pixelation_block: int = None,
        det_conf_threshold: float = None,
        jpeg_quality: int = None,
    ):
        if blur_method is not None:
            self.blur_method = blur_method
        if blur_kernel_size is not None:
            self.blur_kernel_size = blur_kernel_size
        if blur_sigma is not None:
            self.blur_sigma = blur_sigma
        if blur_pixelation_block is not None:
            self.blur_pixelation_block = blur_pixelation_block
        if det_conf_threshold is not None:
            self.detector.conf_threshold = det_conf_threshold
            if hasattr(self.detector, "_sync_model_threshold"):
                self.detector._sync_model_threshold()
        if jpeg_quality is not None:
            self.jpeg_quality = jpeg_quality
            self.encoder.quality = jpeg_quality

        logger.info(
            "Config updated: blur_method=%s, blur_kernel=%s, conf_threshold=%s, jpeg_quality=%s",
            self.blur_method,
            self.blur_kernel_size,
            self.detector.conf_threshold,
            self.jpeg_quality,
        )
