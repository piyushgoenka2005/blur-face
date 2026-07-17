"""Process-global runtime: one SCRFD detector, one pipeline.

Created once during app lifespan and reused for browser + RTSP sources.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from .core.detector import SCRFDDetector
    from .core.pipeline import FramePipeline
    from .streaming import WebRTCManager

detector: Optional["SCRFDDetector"] = None
pipeline: Optional["FramePipeline"] = None
webrtc_manager: Optional["WebRTCManager"] = None
