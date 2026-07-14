"""Re-export SCRFD detector — single implementation lives in app.core.detector."""

from ..core.detector import SCRFDDetector, Face

__all__ = ["SCRFDDetector", "Face"]
