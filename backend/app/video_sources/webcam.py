"""Laptop webcam video source.

Preserves the original CameraCapture behaviour — including synthetic-frame
fallback when no physical webcam is available — behind the VideoSource API.
"""

from __future__ import annotations

import logging
import threading
import time
from typing import Optional

import cv2
import numpy as np

from .base import ConnectionStatus, VideoSource

logger = logging.getLogger(__name__)


class WebcamSource(VideoSource):
    """Capture frames from the default (or configured) laptop webcam."""

    def __init__(
        self,
        device_id: int = 0,
        width: int = 640,
        height: int = 480,
        fps: int = 30,
        camera_name: str = "Laptop Webcam",
    ):
        self.device_id = device_id
        self.width = width
        self.height = height
        self.fps = fps
        self._camera_name = camera_name or "Laptop Webcam"

        self._cap: Optional[cv2.VideoCapture] = None
        self._frame: Optional[np.ndarray] = None
        self._lock = threading.Lock()
        self._thread: Optional[threading.Thread] = None
        self._running = False
        self._fallback_mode = False
        self._synthetic_frame_index = 0
        self._status = ConnectionStatus.IDLE

    @property
    def source_type(self) -> str:
        return "Laptop Webcam"

    @property
    def camera_name(self) -> str:
        return self._camera_name

    @property
    def connection_status(self) -> ConnectionStatus:
        return self._status

    def start(self) -> None:
        if self._running:
            return

        self._status = ConnectionStatus.CONNECTING
        self._cap = cv2.VideoCapture(self.device_id)

        if not self._cap.isOpened():
            logger.warning(
                "Cannot open camera device %s; using synthetic frames",
                self.device_id,
            )
            self._cap = None
            self._fallback_mode = True
            self._running = True
            self._status = ConnectionStatus.CONNECTED
            self._thread = threading.Thread(target=self._capture_loop, daemon=True)
            self._thread.start()
            return

        self._cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
        self._cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)
        self._cap.set(cv2.CAP_PROP_FPS, self.fps)

        actual_w = int(self._cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        actual_h = int(self._cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        actual_fps = self._cap.get(cv2.CAP_PROP_FPS)
        logger.info("Webcam started: %sx%s @ %.1f FPS", actual_w, actual_h, actual_fps)

        self._running = True
        self._status = ConnectionStatus.CONNECTED
        self._thread = threading.Thread(target=self._capture_loop, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._running = False
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=2.0)
        if self._cap:
            self._cap.release()
            self._cap = None
        self._status = ConnectionStatus.DISCONNECTED
        logger.info("Webcam stopped")

    def is_opened(self) -> bool:
        return self._running and self._thread is not None and self._thread.is_alive()

    def read(self) -> Optional[np.ndarray]:
        with self._lock:
            if self._frame is not None:
                return self._frame.copy()
            return None

    def _capture_loop(self) -> None:
        while self._running:
            if self._fallback_mode or not self._cap or not self._cap.isOpened():
                with self._lock:
                    self._frame = self._generate_synthetic_frame()
                time.sleep(max(1.0 / max(self.fps, 1), 0.03))
                continue

            ret, frame = self._cap.read()
            if not ret:
                logger.warning("Failed to read frame from webcam; switching to synthetic")
                self._fallback_mode = True
                time.sleep(0.01)
                continue

            # Always keep only the latest frame (drop backlog).
            with self._lock:
                self._frame = frame

    def _generate_synthetic_frame(self) -> np.ndarray:
        width = self.width
        height = self.height
        frame = np.zeros((height, width, 3), dtype=np.uint8)

        frame[:] = (18, 25, 38)
        t = self._synthetic_frame_index
        self._synthetic_frame_index += 1

        cv2.rectangle(frame, (0, 0), (width - 1, height - 1), (70, 90, 120), 2)
        cv2.putText(
            frame,
            "Face Blur Demo Camera",
            (24, 42),
            cv2.FONT_HERSHEY_SIMPLEX,
            1.0,
            (220, 235, 255),
            2,
            cv2.LINE_AA,
        )
        cv2.putText(
            frame,
            f"Frame {t}",
            (24, 78),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.8,
            (150, 200, 255),
            2,
            cv2.LINE_AA,
        )

        centers = [
            (int(width * (0.25 + 0.05 * np.sin(t * 0.03))), int(height * 0.42)),
            (int(width * (0.50 + 0.04 * np.cos(t * 0.04))), int(height * 0.56)),
            (int(width * (0.72 + 0.03 * np.sin(t * 0.05))), int(height * 0.38)),
        ]

        for idx, (cx, cy) in enumerate(centers):
            radius = 42 + (idx * 3)
            color = (90 + idx * 20, 120 + idx * 15, 150 + idx * 10)
            cv2.circle(frame, (cx, cy), radius, color, -1)
            cv2.circle(frame, (cx - 12, cy - 10), 5, (240, 240, 240), -1)
            cv2.circle(frame, (cx + 12, cy - 10), 5, (240, 240, 240), -1)
            cv2.ellipse(frame, (cx, cy + 12), (16, 10), 0, 0, 180, (40, 40, 40), 2)

        overlay = frame.copy()
        cv2.rectangle(overlay, (18, height - 92), (width - 18, height - 18), (8, 12, 20), -1)
        frame = cv2.addWeighted(overlay, 0.55, frame, 0.45, 0)
        cv2.putText(
            frame,
            "Synthetic frames active",
            (28, height - 48),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.8,
            (180, 220, 255),
            2,
            cv2.LINE_AA,
        )
        cv2.putText(
            frame,
            "Backend stays alive without webcam",
            (28, height - 24),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.65,
            (210, 210, 210),
            2,
            cv2.LINE_AA,
        )

        return frame
