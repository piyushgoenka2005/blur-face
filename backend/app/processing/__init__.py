"""Processing package — face detection and blur (shared by all video sources).

Thin re-exports of the existing SCRFD detector and blur engine so callers can
import from ``app.processing`` without duplicating logic.
"""

from .detector import SCRFDDetector, Face
from .blur import blur_faces

__all__ = ["SCRFDDetector", "Face", "blur_faces"]
