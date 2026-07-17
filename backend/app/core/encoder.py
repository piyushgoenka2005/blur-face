"""JPEG encoder stage — pipeline output formatting only."""

from __future__ import annotations

from typing import Optional

import cv2
import numpy as np


class JpegEncoder:
    """Encode BGR frames to JPEG bytes (no detection / blur knowledge)."""

    def __init__(self, quality: int = 80):
        self.quality = max(10, min(100, int(quality)))

    def encode(self, frame: np.ndarray) -> Optional[bytes]:
        if frame is None or frame.size == 0:
            return None
        params = [cv2.IMWRITE_JPEG_QUALITY, self.quality]
        ok, jpeg = cv2.imencode(".jpg", frame, params)
        if not ok:
            return None
        return jpeg.tobytes()
