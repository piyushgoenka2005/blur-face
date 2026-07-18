import os
import cv2
import numpy as np
import logging
from typing import List, Tuple, Optional
from dataclasses import dataclass

try:
    import insightface
    from insightface.model_zoo import get_model
except ImportError:
    insightface = None
    get_model = None

try:
    import onnxruntime as ort
except ImportError:
    ort = None

logger = logging.getLogger(__name__)


@dataclass
class Face:
    bbox: Tuple[int, int, int, int]  # x1, y1, x2, y2
    confidence: float
    landmarks: Optional[np.ndarray]  # (5, 2) array


def _detect_ctx_id() -> int:
    """Auto-detect compute backend: CUDA if available, else CPU."""
    try:
        if ort and "CUDAExecutionProvider" in ort.get_available_providers():
            return 0  # CUDA
    except Exception:
        pass
    return -1  # CPU


def _enhance_for_detection(frame: np.ndarray) -> np.ndarray:
    """CLAHE on L channel — helps dark / grainy webcam frames."""
    if frame is None or frame.size == 0:
        return frame
    try:
        lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
        l2 = clahe.apply(l)
        return cv2.cvtColor(cv2.merge([l2, a, b]), cv2.COLOR_LAB2BGR)
    except Exception:
        return frame


class SCRFDDetector:
    def __init__(
        self,
        model_name: str = "det_10g",
        input_size: Tuple[int, int] = (640, 640),
        conf_threshold: float = 0.3,
        nms_threshold: float = 0.4,
        ctx_id: Optional[int] = None,
    ):
        self.model_name = model_name
        self.input_size = input_size
        self.conf_threshold = conf_threshold
        self.nms_threshold = nms_threshold

        self.ctx_id = ctx_id if ctx_id is not None else _detect_ctx_id()

        self._model = None
        self._initialized = False
        self._fallback_cascade = None
        self._fallback_mode = False

    def _sync_model_threshold(self) -> None:
        """InsightFace filters internally via det_thresh — must match ours."""
        if self._model is None:
            return
        thresh = float(self.conf_threshold)
        if hasattr(self._model, "det_thresh"):
            self._model.det_thresh = thresh
        if hasattr(self._model, "thresh"):
            self._model.thresh = thresh

    def _ensure_initialized(self):
        if self._initialized:
            return

        if insightface is None or get_model is None:
            cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
            self._fallback_cascade = cv2.CascadeClassifier(cascade_path)
            self._fallback_mode = True
            if self._fallback_cascade.empty():
                logger.warning(
                    "OpenCV Haar cascade unavailable; detector will run in no-op fallback mode"
                )
            else:
                logger.warning(
                    "insightface not installed; using OpenCV Haar cascade fallback detector"
                )
            self._initialized = True
            return

        device = "GPU" if self.ctx_id == 0 else "CPU"
        logger.info(f"Loading {self.model_name} with ctx_id={self.ctx_id} ({device})")

        try:
            model_path = os.path.expanduser("~/.insightface/models/buffalo_l/det_10g.onnx")
            if self.model_name in ("det_10g", "scrfd_500m_bnkps") and os.path.exists(model_path):
                self._model = get_model(model_path)
            else:
                self._model = get_model(self.model_name, download=True)

            if self._model is None:
                raise RuntimeError(f"Failed to load model {self.model_name}")

            self._model.prepare(ctx_id=self.ctx_id, input_size=self.input_size)
            self._sync_model_threshold()
            self._initialized = True
            logger.info(
                "Model loaded successfully on %s (det_thresh=%.2f)",
                device,
                self.conf_threshold,
            )
            return
        except Exception as exc:
            logger.warning("InsightFace model load failed (%s); using OpenCV Haar cascade", exc)
            cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
            self._fallback_cascade = cv2.CascadeClassifier(cascade_path)
            self._fallback_mode = True
            self._initialized = True
            if self._fallback_cascade.empty():
                logger.warning(
                    "OpenCV Haar cascade unavailable; detector will run in no-op fallback mode"
                )
            return

    def warmup(self):
        """Run a dummy inference to warm up the model."""
        self._ensure_initialized()
        if self._fallback_mode:
            return
        dummy = np.zeros((self.input_size[1], self.input_size[0], 3), dtype=np.uint8)
        _ = self._model.detect(dummy, input_size=self.input_size)
        logger.info("Model warmed up")

    def _parse_detections(self, bboxes, kpss) -> List[Face]:
        faces: List[Face] = []
        if bboxes is None or len(bboxes) == 0:
            return faces

        for i, bbox in enumerate(bboxes):
            x1, y1, x2, y2, score = bbox
            if score < self.conf_threshold:
                continue

            # Normalize [x, y, w, h] → [x1, y1, x2, y2] when needed.
            if x2 <= x1 or y2 <= y1:
                x2 = x1 + x2
                y2 = y1 + y2

            landmarks = None
            if kpss is not None and i < len(kpss):
                landmarks = kpss[i]

            faces.append(
                Face(
                    bbox=(int(x1), int(y1), int(x2), int(y2)),
                    confidence=float(score),
                    landmarks=landmarks,
                )
            )
        return faces

    def _detect_haar(self, frame: np.ndarray) -> List[Face]:
        if self._fallback_cascade is None or self._fallback_cascade.empty():
            return []

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        # Smaller minSize helps distant faces; lower minNeighbors helps motion blur.
        detections = self._fallback_cascade.detectMultiScale(
            gray,
            scaleFactor=1.05,
            minNeighbors=3,
            minSize=(24, 24),
            flags=cv2.CASCADE_SCALE_IMAGE,
        )
        faces: List[Face] = []
        for (x, y, w, h) in detections:
            faces.append(
                Face(
                    bbox=(int(x), int(y), int(x + w), int(y + h)),
                    confidence=0.5,
                    landmarks=None,
                )
            )
        return faces

    def detect(self, frame: np.ndarray) -> List[Face]:
        self._ensure_initialized()
        if frame is None or frame.size == 0:
            return []

        enhanced = _enhance_for_detection(frame)

        if self._fallback_mode:
            faces = self._detect_haar(enhanced)
            if not faces:
                faces = self._detect_haar(frame)
            return faces

        self._sync_model_threshold()

        # Primary pass on lighting-normalized frame (dark rooms / webcam noise).
        bboxes, kpss = self._model.detect(enhanced, input_size=self.input_size)
        faces = self._parse_detections(bboxes, kpss)

        # Retry original if CLAHE pass missed (over-bright / unusual lighting).
        if not faces:
            bboxes, kpss = self._model.detect(frame, input_size=self.input_size)
            faces = self._parse_detections(bboxes, kpss)

        return faces

    def get_compute_mode(self) -> str:
        if self._fallback_mode:
            return "haar-fallback"
        return "cuda" if self.ctx_id == 0 else "cpu"
