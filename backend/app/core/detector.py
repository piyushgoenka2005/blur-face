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


class SCRFDDetector:
    def __init__(
        self,
        model_name: str = "det_10g",
        input_size: Tuple[int, int] = (640, 640),
        conf_threshold: float = 0.5,
        nms_threshold: float = 0.4,
        ctx_id: Optional[int] = None
    ):
        self.model_name = model_name
        self.input_size = input_size
        self.conf_threshold = conf_threshold
        self.nms_threshold = nms_threshold
        
        # Auto-detect or use provided ctx_id
        self.ctx_id = ctx_id if ctx_id is not None else _detect_ctx_id()
        
        self._model = None
        self._initialized = False
        self._fallback_cascade = None
        self._fallback_mode = False

    def _ensure_initialized(self):
        if self._initialized:
            return
        
        if insightface is None or get_model is None:
            cascade_path = cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
            self._fallback_cascade = cv2.CascadeClassifier(cascade_path)
            self._fallback_mode = True
            if self._fallback_cascade.empty():
                logger.warning("OpenCV Haar cascade unavailable; detector will run in no-op fallback mode")
            else:
                logger.warning("insightface not installed; using OpenCV Haar cascade fallback detector")
            self._initialized = True
            return
        
        device = "GPU" if self.ctx_id == 0 else "CPU"
        logger.info(f"Loading {self.model_name} with ctx_id={self.ctx_id} ({device})")

        try:
            # Prefer local buffalo_l detector when available
            model_path = os.path.expanduser("~/.insightface/models/buffalo_l/det_10g.onnx")
            if self.model_name in ("det_10g", "scrfd_500m_bnkps") and os.path.exists(model_path):
                self._model = get_model(model_path)
            else:
                self._model = get_model(self.model_name, download=True)

            if self._model is None:
                raise RuntimeError(f"Failed to load model {self.model_name}")

            self._model.prepare(ctx_id=self.ctx_id, input_size=self.input_size)
            self._initialized = True
            logger.info(f"Model loaded successfully on {device}")
            return
        except Exception as exc:
            logger.warning("InsightFace model load failed (%s); using OpenCV Haar cascade", exc)
            cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
            self._fallback_cascade = cv2.CascadeClassifier(cascade_path)
            self._fallback_mode = True
            self._initialized = True
            if self._fallback_cascade.empty():
                logger.warning("OpenCV Haar cascade unavailable; detector will run in no-op fallback mode")
            return

    def warmup(self):
        """Run a dummy inference to warm up the model."""
        self._ensure_initialized()
        if self._fallback_mode:
            return
        dummy = np.zeros((self.input_size[1], self.input_size[0], 3), dtype=np.uint8)
        _ = self._model.detect(dummy, input_size=self.input_size)
        logger.info("Model warmed up")

    def detect(self, frame: np.ndarray) -> List[Face]:
        self._ensure_initialized()

        if self._fallback_mode:
            if self._fallback_cascade is None or self._fallback_cascade.empty():
                return []

            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            detections = self._fallback_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(40, 40))
            faces: List[Face] = []
            for (x, y, w, h) in detections:
                faces.append(Face(bbox=(int(x), int(y), int(x + w), int(y + h)), confidence=0.5, landmarks=None))
            return faces
        
        # InsightFace/SCRFD returns boxes in the original image coordinate space.
        bboxes, kpss = self._model.detect(frame, input_size=self.input_size)
        
        faces = []
        if bboxes is not None and len(bboxes) > 0:
            for i, bbox in enumerate(bboxes):
                x1, y1, x2, y2, score = bbox
                if score < self.conf_threshold:
                    continue

                # Some detectors expose boxes as [x1, y1, x2, y2], while others
                # return [x, y, w, h]. Normalize both to x1/y1/x2/y2.
                if x2 <= x1 or y2 <= y1:
                    x2 = x1 + x2
                    y2 = y1 + y2
                
                landmarks = None
                if kpss is not None and i < len(kpss):
                    landmarks = kpss[i]
                
                faces.append(Face(
                    bbox=(int(x1), int(y1), int(x2), int(y2)),
                    confidence=float(score),
                    landmarks=landmarks
                ))
        
        return faces

    def get_compute_mode(self) -> str:
        return "cuda" if self.ctx_id == 0 else "cpu"
