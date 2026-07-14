import time
import statistics
from collections import deque
from dataclasses import dataclass, field
from typing import Deque, Optional


@dataclass
class LatencyBreakdown:
    detection_ms: float = 0.0
    blur_ms: float = 0.0
    encode_ms: float = 0.0
    total_ms: float = 0.0


@dataclass
class PipelineMetrics:
    fps: float = 0.0
    faces_detected: int = 0
    
    # Detection latency percentiles
    detection_p50: float = 0.0
    detection_p95: float = 0.0
    detection_p99: float = 0.0
    
    # Blur latency percentiles
    blur_p50: float = 0.0
    blur_p95: float = 0.0
    blur_p99: float = 0.0
    
    # Encode latency percentiles
    encode_p50: float = 0.0
    encode_p95: float = 0.0
    encode_p99: float = 0.0
    
    # Total latency percentiles
    total_p50: float = 0.0
    total_p95: float = 0.0
    total_p99: float = 0.0


class MetricsCollector:
    def __init__(self, window_size: int = 100):
        self.window_size = window_size
        
        # Rolling windows for percentiles
        self._detection_times: Deque[float] = deque(maxlen=window_size)
        self._blur_times: Deque[float] = deque(maxlen=window_size)
        self._encode_times: Deque[float] = deque(maxlen=window_size)
        self._total_times: Deque[float] = deque(maxlen=window_size)
        
        # FPS calculation
        self._frame_timestamps: Deque[float] = deque(maxlen=window_size)
        
        # Face counts
        self._face_counts: Deque[int] = deque(maxlen=window_size)
        
        self._last_frame_time: Optional[float] = None

    def record_frame(self, latencies: LatencyBreakdown, face_count: int):
        now = time.time()
        
        self._detection_times.append(latencies.detection_ms)
        self._blur_times.append(latencies.blur_ms)
        self._encode_times.append(latencies.encode_ms)
        self._total_times.append(latencies.total_ms)
        self._face_counts.append(face_count)
        self._frame_timestamps.append(now)

    def get_summary(self) -> PipelineMetrics:
        if not self._frame_timestamps:
            return PipelineMetrics()
        
        # Calculate FPS from frame timestamps
        if len(self._frame_timestamps) >= 2:
            time_span = self._frame_timestamps[-1] - self._frame_timestamps[0]
            fps = (len(self._frame_timestamps) - 1) / time_span if time_span > 0 else 0.0
        else:
            fps = 0.0
        
        # Average face count
        avg_faces = sum(self._face_counts) / len(self._face_counts) if self._face_counts else 0
        
        def percentile(data: Deque[float], p: float) -> float:
            if not data:
                return 0.0
            sorted_data = sorted(data)
            idx = int(len(sorted_data) * p / 100)
            idx = min(idx, len(sorted_data) - 1)
            return sorted_data[idx]
        
        return PipelineMetrics(
            fps=fps,
            faces_detected=int(avg_faces),
            detection_p50=percentile(self._detection_times, 50),
            detection_p95=percentile(self._detection_times, 95),
            detection_p99=percentile(self._detection_times, 99),
            blur_p50=percentile(self._blur_times, 50),
            blur_p95=percentile(self._blur_times, 95),
            blur_p99=percentile(self._blur_times, 99),
            encode_p50=percentile(self._encode_times, 50),
            encode_p95=percentile(self._encode_times, 95),
            encode_p99=percentile(self._encode_times, 99),
            total_p50=percentile(self._total_times, 50),
            total_p95=percentile(self._total_times, 95),
            total_p99=percentile(self._total_times, 99),
        )

