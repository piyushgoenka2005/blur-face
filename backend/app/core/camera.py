"""Backward-compatible webcam capture wrapper.

New code should import WebcamSource from app.video_sources.
This module keeps existing imports working.
"""

from ..video_sources.webcam import WebcamSource

# Historical name used throughout the prototype.
CameraCapture = WebcamSource

__all__ = ["CameraCapture", "WebcamSource"]
