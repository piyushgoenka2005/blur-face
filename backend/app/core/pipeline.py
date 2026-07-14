"""Frame processing pipeline.

Video Source → SCRFD Detector → Blur Engine → (latest blurred frame)
                                              ↘ WebRTC publisher

Processing runs continuously in a background thread and always keeps only
the newest blurred frame. Transport (WebRTC) never drives detection.
"""

from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass
from typing import Optional

import cv2
import numpy as np

from .detector import SCRFDDetector
from .blur import blur_faces
from .metrics import MetricsCollector, LatencyBreakdown, PipelineMetrics
from ..video_sources.base import ConnectionStatus, VideoSource

logger = logging.getLogger(__name__)


@dataclass
class ProcessedFrame:
    """Result of one detect+blur cycle (BGR frame for WebRTC, metrics attached)."""

    frame: np.ndarray
    timestamp: float
    faces_detected: int
    detection_latency_ms: float
    blur_latency_ms: float
    encode_latency_ms: float
    total_latency_ms: float
    # Kept for backwards-compatible call sites that still expect jpeg_bytes.
    jpeg_bytes: bytes = b""


class FramePipeline:
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
    ):
        self.detector = detector
        self.video_source: Optional[VideoSource] = video_source
        self.camera = video_source

        self.blur_method = blur_method
        self.blur_kernel_size = blur_kernel_size
        self.blur_sigma = blur_sigma
        self.blur_pixelation_block = blur_pixelation_block
        self.blur_margin = blur_margin
        self.jpeg_quality = jpeg_quality
        self.metrics_interval = metrics_interval
        self.target_fps = max(1.0, float(target_fps))

        self._metrics = MetricsCollector()
        self._running = False
        self._frame_count = 0
        self._detector_warmed = False

        self._latest_blurred: Optional[np.ndarray] = None
        self._latest_meta: Optional[ProcessedFrame] = None
        self._frame_lock = threading.Lock()

        self._process_thread: Optional[threading.Thread] = None
        self._paused = False

    def set_video_source(self, source: VideoSource) -> None:
        """Swap the frame provider without recreating detector / blur logic."""
        if self.video_source is not None:
            try:
                self.video_source.stop()
            except Exception:
                logger.exception("Error stopping previous video source")

        self.video_source = source
        self.camera = source
        self._metrics = MetricsCollector()
        self._frame_count = 0
        with self._frame_lock:
            self._latest_blurred = None
            self._latest_meta = None
        logger.info(
            "Video source set: %s (%s)",
            source.source_type,
            source.camera_name,
        )

    def start(self) -> None:
        if self.video_source is None:
            raise RuntimeError(
                "No video source selected. Connect a webcam or RTSP camera first."
            )

        if not self.video_source.is_opened():
            self.video_source.start()

        if not self._detector_warmed:
            self.detector.warmup()
            self._detector_warmed = True

        self._paused = False
        self._running = True
        self._ensure_process_thread()
        logger.info("Pipeline started (continuous processing loop)")

    def stop(self) -> None:
        self._running = False
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
        """Detach and stop the current source; processing loop keeps waiting."""
        self._paused = True
        if self.video_source is not None:
            try:
                self.video_source.stop()
            except Exception:
                logger.exception("Error stopping video source")
            self.video_source = None
            self.camera = None
        with self._frame_lock:
            self._latest_blurred = None
            self._latest_meta = None

    def set_paused(self, paused: bool) -> None:
        self._paused = paused

    @property
    def is_active(self) -> bool:
        return self._running and self.video_source is not None and not self._paused

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
        """Latest blurred BGR frame for the WebRTC publisher (copy)."""
        with self._frame_lock:
            if self._latest_blurred is None:
                return None
            return self._latest_blurred.copy()

    def get_latest_jpeg_bytes(self) -> Optional[bytes]:
        """Encode the latest blurred frame as JPEG for WebSocket streaming.

        Used as a reliable fallback when WebRTC media cannot traverse cloud
        hosts (e.g. Render) that block UDP.
        """
        frame = self.get_latest_blurred_frame()
        if frame is None:
            return None
        encode_params = [cv2.IMWRITE_JPEG_QUALITY, int(self.jpeg_quality)]
        ok, jpeg = cv2.imencode(".jpg", frame, encode_params)
        if not ok:
            return None
        return jpeg.tobytes()

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
        """Always process the newest source frame; drop backlog by design."""
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
                time.sleep(0.05)
                continue

            elapsed = time.perf_counter() - loop_start
            sleep_for = min_interval - elapsed
            if sleep_for > 0:
                time.sleep(sleep_for)

    def process_frame(self) -> Optional[ProcessedFrame]:
        if not self._running or self.video_source is None or self._paused:
            return None

        frame = self.video_source.read()
        if frame is None:
            return None

        start_total = time.perf_counter()

        start_det = time.perf_counter()
        faces = self.detector.detect(frame)
        detection_ms = (time.perf_counter() - start_det) * 1000

        start_blur = time.perf_counter()
        blurred_frame = blur_faces(
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

        # Handoff cost (copy into shared slot). Actual video encode is WebRTC/aiortc.
        start_enc = time.perf_counter()
        with self._frame_lock:
            self._latest_blurred = blurred_frame
        encode_ms = (time.perf_counter() - start_enc) * 1000

        total_ms = (time.perf_counter() - start_total) * 1000
        self._frame_count += 1

        latencies = LatencyBreakdown(
            detection_ms=detection_ms,
            blur_ms=blur_ms,
            encode_ms=encode_ms,
            total_ms=total_ms,
        )
        self._metrics.record_frame(latencies, len(faces))

        result = ProcessedFrame(
            frame=blurred_frame,
            timestamp=time.time(),
            faces_detected=len(faces),
            detection_latency_ms=detection_ms,
            blur_latency_ms=blur_ms,
            encode_latency_ms=encode_ms,
            total_latency_ms=total_ms,
        )
        with self._frame_lock:
            self._latest_meta = result
        return result

    def get_metrics(self) -> PipelineMetrics:
        return self._metrics.get_summary()

    def build_metrics_payload(self) -> dict:
        metrics = self.get_metrics()
        source_info = self.get_source_info()
        compute_mode = self.detector.get_compute_mode()
        return {
            "fps": round(metrics.fps, 1),
            "faces_detected": metrics.faces_detected,
            "backend_status": "running" if self.is_active else "idle",
            "compute_mode": compute_mode,
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
        if jpeg_quality is not None:
            self.jpeg_quality = jpeg_quality

        logger.info(
            "Config updated: blur_method=%s, blur_kernel=%s, "
            "conf_threshold=%s, jpeg_quality=%s",
            self.blur_method,
            self.blur_kernel_size,
            self.detector.conf_threshold,
            self.jpeg_quality,
        )
