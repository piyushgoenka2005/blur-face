"""RTSP / IP CCTV video source with low-latency capture and auto-reconnect."""

from __future__ import annotations

import logging
import os
import re
import threading
import time
from typing import Optional
from urllib.parse import quote, urlparse

import cv2
import numpy as np

from .base import ConnectionStatus, VideoSource

logger = logging.getLogger(__name__)

# Prefer TCP + no demux buffer for lower glass-to-glass latency when FFMPEG is used.
_FFMPEG_OPTIONS = "rtsp_transport;tcp|fflags;nobuffer|flags;low_delay|max_delay;0"


def validate_rtsp_url(url: str) -> str:
    """Validate and normalise an RTSP URL. Raises ValueError on failure."""
    if not url or not url.strip():
        raise ValueError("RTSP URL is required.")

    cleaned = url.strip()
    if not cleaned.lower().startswith("rtsp://"):
        raise ValueError(
            "Invalid RTSP URL. It must start with rtsp:// "
            "(example: rtsp://user:pass@192.168.1.100:554/stream)."
        )

    try:
        parsed = urlparse(cleaned)
    except Exception as exc:
        raise ValueError(f"Invalid RTSP URL format: {exc}") from exc

    if not parsed.hostname:
        raise ValueError(
            "Invalid RTSP URL: missing camera host/IP. "
            "Example: rtsp://admin:password@192.168.1.100:554/Streaming/Channels/101"
        )

    return cleaned


def build_rtsp_url(
    ip_address: str,
    port: int = 554,
    username: str = "",
    password: str = "",
    stream_path: str = "",
) -> str:
    """Build an RTSP URL from discrete connection fields."""
    ip = (ip_address or "").strip()
    if not ip:
        raise ValueError("IP address is required when not providing a full RTSP URL.")

    # Basic IPv4 / hostname sanity check
    if not re.match(r"^[\w.\-]+$", ip):
        raise ValueError(f"Invalid IP address or hostname: {ip}")

    try:
        port_num = int(port) if port is not None else 554
    except (TypeError, ValueError) as exc:
        raise ValueError("Port must be a number (default 554).") from exc

    if not (1 <= port_num <= 65535):
        raise ValueError("Port must be between 1 and 65535.")

    path = (stream_path or "").strip().lstrip("/")
    user = quote((username or "").strip(), safe="")
    pwd = quote((password or "").strip(), safe="")

    if user or pwd:
        auth = f"{user}:{pwd}@"
    else:
        auth = ""

    if path:
        return f"rtsp://{auth}{ip}:{port_num}/{path}"
    return f"rtsp://{auth}{ip}:{port_num}/"


def classify_rtsp_error(url: str, opened: bool, had_frame: bool) -> str:
    """Map OpenCV failure modes to user-friendly messages."""
    parsed = urlparse(url)
    has_auth = bool(parsed.username or parsed.password)

    if not opened:
        if has_auth:
            return (
                "Unable to connect to the RTSP camera. "
                "Check username/password, IP address, port, and that the camera is online."
            )
        return (
            "Unable to connect to the RTSP camera. "
            "The camera may be offline, the URL may be wrong, or the network timed out."
        )

    if not had_frame:
        return (
            "Connected to the camera but no video frames were received. "
            "Verify the stream path and that the camera is streaming."
        )

    return "RTSP stream interrupted. Attempting to reconnect..."


class RTSPSource(VideoSource):
    """Capture the latest frame from an RTSP/IP camera with auto-reconnect."""

    def __init__(
        self,
        rtsp_url: str,
        camera_name: str = "RTSP Camera",
        reconnect_interval: float = 3.0,
        open_timeout_sec: float = 8.0,
    ):
        self._rtsp_url = validate_rtsp_url(rtsp_url)
        self._camera_name = (camera_name or "").strip() or "RTSP Camera"
        self._reconnect_interval = max(1.0, float(reconnect_interval))
        self._open_timeout_sec = max(2.0, float(open_timeout_sec))

        self._cap: Optional[cv2.VideoCapture] = None
        self._frame: Optional[np.ndarray] = None
        self._lock = threading.Lock()
        self._thread: Optional[threading.Thread] = None
        self._running = False
        self._status = ConnectionStatus.IDLE
        self._last_error: Optional[str] = None

    @property
    def source_type(self) -> str:
        return "RTSP Camera"

    @property
    def camera_name(self) -> str:
        return self._camera_name

    @property
    def connection_status(self) -> ConnectionStatus:
        return self._status

    @property
    def last_error(self) -> Optional[str]:
        return self._last_error

    @property
    def rtsp_url(self) -> str:
        """Return URL with password redacted for logging/UI."""
        return _redact_url(self._rtsp_url)

    def start(self) -> None:
        if self._running:
            return

        self._status = ConnectionStatus.CONNECTING
        self._last_error = None

        # Hint FFMPEG toward low-latency RTSP before opening.
        os.environ.setdefault("OPENCV_FFMPEG_CAPTURE_OPTIONS", _FFMPEG_OPTIONS)

        opened, had_frame = self._open_capture(initial=True)
        if not opened or not had_frame:
            self._release_cap()
            self._status = ConnectionStatus.DISCONNECTED
            message = classify_rtsp_error(self._rtsp_url, opened, had_frame)
            self._last_error = message
            raise ConnectionError(message)

        self._running = True
        self._status = ConnectionStatus.CONNECTED
        self._thread = threading.Thread(target=self._capture_loop, daemon=True)
        self._thread.start()
        logger.info("RTSP source started: %s (%s)", self._camera_name, self.rtsp_url)

    def stop(self) -> None:
        self._running = False
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=3.0)
        self._release_cap()
        self._status = ConnectionStatus.DISCONNECTED
        logger.info("RTSP source stopped: %s", self._camera_name)

    def is_opened(self) -> bool:
        return (
            self._running
            and self._status in (ConnectionStatus.CONNECTED, ConnectionStatus.RECONNECTING)
            and self._thread is not None
            and self._thread.is_alive()
        )

    def read(self) -> Optional[np.ndarray]:
        with self._lock:
            if self._frame is not None:
                return self._frame.copy()
            return None

    def _open_capture(self, initial: bool = False) -> tuple[bool, bool]:
        """Open VideoCapture with low-latency settings.

        Returns (opened, received_at_least_one_frame).

        OpenCV's RTSP open can block for a long time on unreachable hosts,
        so we perform the open+first-frame read on a worker thread and
        enforce open_timeout_sec from the caller.
        """
        self._release_cap()

        result: dict = {"cap": None, "frame": None, "opened": False, "error": None}

        def worker() -> None:
            try:
                os.environ.setdefault("OPENCV_FFMPEG_CAPTURE_OPTIONS", _FFMPEG_OPTIONS)
                cap = cv2.VideoCapture(self._rtsp_url, cv2.CAP_FFMPEG)
                if not cap.isOpened():
                    cap = cv2.VideoCapture(self._rtsp_url)
                if not cap.isOpened():
                    result["opened"] = False
                    return

                result["opened"] = True
                try:
                    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                except Exception:
                    pass

                # Keep reading until we get a frame or the parent abandons us.
                while True:
                    ret, frame = cap.read()
                    if ret and frame is not None:
                        result["cap"] = cap
                        result["frame"] = frame
                        return
                    time.sleep(0.05)
            except Exception as exc:
                result["error"] = exc

        thread = threading.Thread(target=worker, daemon=True)
        thread.start()
        thread.join(timeout=self._open_timeout_sec)

        if thread.is_alive():
            # Timed out — abandon the worker (daemon). Any late VideoCapture
            # will be GC'd; we cannot safely interrupt native FFMPEG opens.
            logger.warning(
                "RTSP open timed out after %.1fs (%s)",
                self._open_timeout_sec,
                self.rtsp_url,
            )
            return False, False

        if result["error"] is not None:
            logger.warning("RTSP open error: %s", result["error"])
            return False, False

        if not result["opened"]:
            return False, False

        if result["frame"] is None or result["cap"] is None:
            if result["cap"] is not None:
                try:
                    result["cap"].release()
                except Exception:
                    pass
            return True, False

        with self._lock:
            self._frame = result["frame"]
        self._cap = result["cap"]
        return True, True

    def _release_cap(self) -> None:
        if self._cap is not None:
            try:
                self._cap.release()
            except Exception:
                pass
            self._cap = None

    def _capture_loop(self) -> None:
        """Continuously grab the newest frame; reconnect on stream loss."""
        consecutive_failures = 0

        while self._running:
            if self._cap is None or not self._cap.isOpened():
                self._reconnect()
                continue

            ret, frame = self._cap.read()
            if not ret or frame is None:
                consecutive_failures += 1
                if consecutive_failures >= 5:
                    logger.warning(
                        "RTSP stream interrupted (%s). Reconnecting in %.0fs...",
                        self.rtsp_url,
                        self._reconnect_interval,
                    )
                    self._last_error = classify_rtsp_error(self._rtsp_url, True, False)
                    self._release_cap()
                    consecutive_failures = 0
                else:
                    time.sleep(0.02)
                continue

            consecutive_failures = 0
            if self._status != ConnectionStatus.CONNECTED:
                self._status = ConnectionStatus.CONNECTED
                self._last_error = None
                logger.info("RTSP stream restored: %s", self.rtsp_url)

            # Always overwrite with the newest frame — never queue backlog.
            with self._lock:
                self._frame = frame

    def _reconnect(self) -> None:
        if not self._running:
            return

        self._status = ConnectionStatus.RECONNECTING
        self._release_cap()
        time.sleep(self._reconnect_interval)

        if not self._running:
            return

        try:
            opened, had_frame = self._open_capture(initial=False)
            if opened and had_frame:
                self._status = ConnectionStatus.CONNECTED
                self._last_error = None
                logger.info("RTSP reconnected: %s", self.rtsp_url)
            else:
                self._last_error = classify_rtsp_error(self._rtsp_url, opened, had_frame)
                logger.warning("RTSP reconnect failed: %s", self._last_error)
        except Exception as exc:
            self._last_error = f"Reconnect failed: {exc}"
            logger.warning("RTSP reconnect exception: %s", exc)


def _redact_url(url: str) -> str:
    """Hide password in logs / API responses."""
    try:
        parsed = urlparse(url)
        if not parsed.password:
            return url
        netloc = parsed.netloc
        # Replace :password@ with :****@
        redacted = re.sub(r":([^:@]+)@", r":****@", netloc, count=1)
        return parsed._replace(netloc=redacted).geturl()
    except Exception:
        return "rtsp://***"
