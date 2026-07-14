"""Abstract video source interface.

The detector and blur pipeline depend only on this contract — they never
need to know whether frames come from a webcam or an RTSP/IP camera.
"""

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
    """Common interface for all frame providers."""

    @abstractmethod
    def start(self) -> None:
        """Open the source and begin capturing frames."""

    @abstractmethod
    def read(self) -> Optional[np.ndarray]:
        """Return the latest frame (BGR), or None if not yet available."""

    @abstractmethod
    def stop(self) -> None:
        """Stop capture and release hardware / network resources."""

    @abstractmethod
    def is_opened(self) -> bool:
        """True when the underlying capture is open and usable."""

    @property
    @abstractmethod
    def source_type(self) -> str:
        """Human-readable source kind, e.g. 'Laptop Webcam' or 'RTSP Camera'."""

    @property
    @abstractmethod
    def camera_name(self) -> str:
        """Display name for the camera (user-provided or default)."""

    @property
    @abstractmethod
    def connection_status(self) -> ConnectionStatus:
        """Current connection lifecycle status."""

    def is_running(self) -> bool:
        """Compatibility helper used by health checks and the pipeline."""
        return self.is_opened()
