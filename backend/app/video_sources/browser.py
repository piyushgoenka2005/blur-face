"""Browser webcam VideoSource — frames pushed from the client over WebSocket.

The browser captures with getUserMedia and sends JPEG bytes. This source
decodes them to BGR and exposes them through the same ``VideoSource.read()``
contract as RTSP. The SCRFD detector never sees the difference.

Latest-frame-wins: if the pipeline is busy, older pending frames are dropped.
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


def decode_jpeg_to_bgr(data: bytes) -> Optional[np.ndarray]:
    """Decode JPEG/PNG bytes to a BGR image (OpenCV)."""
    if not data:
        return None
    try:
        buffer = np.frombuffer(data, dtype=np.uint8)
        frame = cv2.imdecode(buffer, cv2.IMREAD_COLOR)
        if frame is None or frame.size == 0:
            return None
        return frame
    except Exception:
        return None


class BrowserWebcamSource(VideoSource):
    """Push-based VideoSource fed by browser JPEG frames."""

    def __init__(
        self,
        camera_name: str = "Browser Webcam",
        width: int = 640,
        height: int = 480,
        stale_after_sec: float = 5.0,
    ):
        self._camera_name = camera_name or "Browser Webcam"
        self.width = width
        self.height = height
        self._stale_after_sec = stale_after_sec

        self._lock = threading.Lock()
        self._cond = threading.Condition(self._lock)
        self._frame: Optional[np.ndarray] = None
        self._opened = False
        self._status = ConnectionStatus.IDLE
        self._last_recv_ts: float = 0.0
        self._dropped = 0
        self._submitted = 0

    @property
    def source_type(self) -> str:
        return "Browser Webcam"

    @property
    def camera_name(self) -> str:
        return self._camera_name

    @property
    def connection_status(self) -> ConnectionStatus:
        return self._status

    @property
    def last_error(self) -> Optional[str]:
        if self._opened and self._last_recv_ts > 0:
            if time.time() - self._last_recv_ts > self._stale_after_sec:
                return "No frames received from browser recently."
        return None

    @property
    def dropped_frames(self) -> int:
        with self._lock:
            return self._dropped

    def start(self) -> None:
        with self._cond:
            self._opened = True
            self._status = ConnectionStatus.CONNECTED
            self._frame = None
        logger.info("BrowserWebcamSource started (awaiting client frames)")

    def stop(self) -> None:
        with self._cond:
            self._opened = False
            self._status = ConnectionStatus.DISCONNECTED
            self._frame = None
            self._cond.notify_all()
        logger.info(
            "BrowserWebcamSource stopped (submitted=%s dropped=%s)",
            self._submitted,
            self._dropped,
        )

    def is_opened(self) -> bool:
        return self._opened

    def submit_jpeg(self, data: bytes) -> bool:
        """Decode a client JPEG and store as the newest pending frame."""
        frame = decode_jpeg_to_bgr(data)
        if frame is None:
            return False
        self.submit_bgr(frame)
        return True

    def submit_bgr(self, frame: np.ndarray) -> None:
        """Store the newest BGR frame; overwrites any unprocessed frame."""
        if frame is None or not self._opened:
            return
        with self._cond:
            if self._frame is not None:
                self._dropped += 1
            self._frame = frame
            self._submitted += 1
            self._last_recv_ts = time.time()
            self._cond.notify()

    def read(self) -> Optional[np.ndarray]:
        """Consume the newest pending frame (None if nothing waiting).

        Consuming avoids re-processing the same browser frame. While waiting,
        ``submit_*`` may overwrite the slot (drop old / keep newest).
        """
        with self._cond:
            if not self._opened:
                return None
            if self._frame is None:
                self._cond.wait(timeout=0.05)
            if self._frame is None:
                return None
            frame = self._frame
            self._frame = None
            return frame


# Backward-compatible alias used by earlier iterations.
BrowserFrameSource = BrowserWebcamSource
