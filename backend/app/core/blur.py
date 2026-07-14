import cv2
import numpy as np
import logging
from typing import List
from .detector import Face

logger = logging.getLogger(__name__)


def _expand_bbox(bbox: tuple, margin: float, frame_w: int, frame_h: int) -> tuple:
    """Expand bounding box by margin percentage."""
    x1, y1, x2, y2 = bbox
    w = x2 - x1
    h = y2 - y1
    mx = int(w * margin * 0.65)
    my_top = int(h * margin * 0.45)
    my_bottom = int(h * margin * 0.75)
    return (
        int(max(0, x1 - mx)),
        int(max(0, y1 - my_top)),
        int(min(frame_w, x2 + mx)),
        int(min(frame_h, y2 + my_bottom))
    )


def blur_faces(
    frame: np.ndarray,
    faces: List[Face],
    method: str = "gaussian",
    kernel_size: int = 51,
    sigma: float = 30.0,
    pixelation_block: int = 16,
    margin: float = 0.12,
    draw_debug_rectangles: bool = True
) -> np.ndarray:
    """
    Apply blur or pixelation to detected face regions.

    Args:
        frame: Input frame (BGR)
        faces: List of Face objects with bboxes
        method: "gaussian" or "pixelation"
        kernel_size: Gaussian kernel size (must be odd)
        sigma: Gaussian sigma
        pixelation_block: Block size for pixelation
        margin: Expansion margin around bbox (0.0-0.5)

    Returns:
        Modified frame with faces blurred/pixelated
    """
    if not faces:
        return frame

    h, w = frame.shape[:2]
    result = frame.copy()

    for face in faces:
        x1, y1, x2, y2 = _expand_bbox(face.bbox, margin, w, h)

        # Clamp to frame bounds
        x1 = int(max(0, min(x1, w - 1)))
        y1 = int(max(0, min(y1, h - 1)))
        x2 = int(max(x1 + 1, min(x2, w)))
        y2 = int(max(y1 + 1, min(y2, h)))

        roi = result[y1:y2, x1:x2]
        if roi.size == 0:
            continue

        if method == "gaussian":
            k = kernel_size if kernel_size % 2 == 1 else kernel_size + 1
            blurred = cv2.GaussianBlur(roi, (k, k), sigma)
            result[y1:y2, x1:x2] = blurred

        elif method == "pixelation":
            small = cv2.resize(roi, (pixelation_block, pixelation_block), interpolation=cv2.INTER_LINEAR)
            pixelated = cv2.resize(small, (x2 - x1, y2 - y1), interpolation=cv2.INTER_NEAREST)
            result[y1:y2, x1:x2] = pixelated

        else:
            logger.warning(f"Unknown blur method: {method}, using gaussian")
            k = kernel_size if kernel_size % 2 == 1 else kernel_size + 1
            blurred = cv2.GaussianBlur(roi, (k, k), sigma)
            result[y1:y2, x1:x2] = blurred

        if draw_debug_rectangles:
            cv2.rectangle(result, (x1, y1), (x2, y2), (0, 255, 0), 2)

    return result
