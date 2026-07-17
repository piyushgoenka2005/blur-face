"""VideoSource interface — sole frame provider contract for the pipeline.

SOLID
-----
- S: sources only capture / supply BGR frames
- O: new sources implement this ABC without changing SCRFD/blur
- L: any VideoSource is substitutable in FramePipeline
- I: small, focused surface (start/read/stop + metadata)
- D: detector/blur depend on this abstraction, never on RTSP or browser

The detector never knows whether frames come from a browser webcam or RTSP.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from enum import Enum
from typing import Optional

import numpy as np


class ConnectionStatus(str, Enum):
    """Lifecycle status exposed to the dashboard and REST API."""

    IDLE = "idle"
    CONNECTING = "connecting"
    CONNECTED = "connected"
    DISCONNECTED = "disconnected"
    RECONNECTING = "reconnecting"


class VideoSource(ABC):
    """Abstract frame provider (BGR numpy arrays)."""

    @abstractmethod
    def start(self) -> None:
        """Open the source and begin producing frames."""

    @abstractmethod
    def read(self) -> Optional[np.ndarray]:
        """Return the newest available BGR frame, or None."""

    @abstractmethod
    def stop(self) -> None:
        """Stop capture and release resources."""

    @abstractmethod
    def is_opened(self) -> bool:
        """True when the source is open and usable."""

    @property
    @abstractmethod
    def source_type(self) -> str:
        """Human-readable kind, e.g. 'Browser Webcam' or 'RTSP Camera'."""

    @property
    @abstractmethod
    def camera_name(self) -> str:
        """Display name for the camera."""

    @property
    @abstractmethod
    def connection_status(self) -> ConnectionStatus:
        """Current connection lifecycle status."""

    def is_running(self) -> bool:
        """Compatibility helper for health checks."""
        return self.is_opened()
