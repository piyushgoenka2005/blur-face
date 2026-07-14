import json
import asyncio
import logging
from fastapi import WebSocket, WebSocketDisconnect
from typing import Optional

from ..core import FramePipeline
from ..config import settings

logger = logging.getLogger(__name__)


class WebSocketManager:
    def __init__(self, pipeline: FramePipeline):
        self.pipeline = pipeline
        self.active_connections: list[WebSocket] = []
        self._frame_queue: asyncio.Queue = asyncio.Queue(maxsize=settings.ws_max_queue_size)
        self._running = False
        self._producer_task: Optional[asyncio.Task] = None
        self._frame_counter = 0

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"Client connected. Total: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        logger.info(f"Client disconnected. Total: {len(self.active_connections)}")

    async def send_personal_message(self, message: str, websocket: WebSocket):
        try:
            await websocket.send_text(message)
        except Exception as e:
            logger.warning(f"Failed to send text message: {e}")

    async def send_bytes(self, data: bytes, websocket: WebSocket):
        try:
            await websocket.send_bytes(data)
        except Exception as e:
            logger.warning(f"Failed to send bytes: {e}")

    async def broadcast_metrics(self):
        if not self.active_connections:
            return
        
        metrics = self.pipeline.get_metrics()
        compute_mode = self.pipeline.detector.get_compute_mode()
        
        message = {
            "type": "metrics",
            "timestamp": time.time(),
            "data": {
                "fps": round(metrics.fps, 1),
                "faces_detected": metrics.faces_detected,
                "backend_status": "running" if self.pipeline._running else "stopped",
                "compute_mode": compute_mode,
                "blur_method": self.pipeline.blur_method,
                "latency_ms": {
                    "detection_p50": round(metrics.detection_p50, 1),
                    "detection_p95": round(metrics.detection_p95, 1),
                    "detection_p99": round(metrics.detection_p99, 1),
                    "blur_p50": round(metrics.blur_p50, 1),
                    "blur_p95": round(metrics.blur_p95, 1),
                    "blur_p99": round(metrics.blur_p99, 1),
                    "encode_p50": round(metrics.encode_p50, 1),
                    "encode_p95": round(metrics.encode_p95, 1),
                    "encode_p99": round(metrics.encode_p99, 1),
                    "total_p50": round(metrics.total_p50, 1),
                    "total_p95": round(metrics.total_p95, 1),
                    "total_p99": round(metrics.total_p99, 1),
                }
            }
        }
        
        text = json.dumps(message)
        dead_connections = []
        for ws in self.active_connections:
            try:
                await ws.send_text(text)
            except Exception:
                dead_connections.append(ws)
        
        for ws in dead_connections:
            self.disconnect(ws)

    async def start_producer(self):
        if self._running:
            return
        self._running = True
        self._producer_task = asyncio.create_task(self._produce_frames())
        logger.info("WebSocket producer started")

    async def stop_producer(self):
        self._running = False
        if self._producer_task:
            self._producer_task.cancel()
            try:
                await self._producer_task
            except asyncio.CancelledError:
                pass
        logger.info("WebSocket producer stopped")

    async def _produce_frames(self):
        while self._running:
            try:
                frame_data = self.pipeline.process_frame()
                if frame_data:
                    # Send frame to all connected clients
                    dead = []
                    for ws in self.active_connections:
                        try:
                            await ws.send_bytes(frame_data.jpeg_bytes)
                        except Exception:
                            dead.append(ws)
                    
                    for ws in dead:
                        self.disconnect(ws)
                    
                    # Send metrics periodically
                    self._frame_counter += 1
                    if self._frame_counter % settings.ws_metrics_interval == 0:
                        await self.broadcast_metrics()
                        
            except Exception as e:
                logger.error(f"Error in frame producer: {e}")
                await asyncio.sleep(0.01)
            
            # Small delay to prevent CPU spinning
            await asyncio.sleep(0.001)

    async def handle_message(self, websocket: WebSocket, data: str):
        try:
            msg = json.loads(data)
            msg_type = msg.get("type")
            
            if msg_type == "config":
                config_data = msg.get("data", {})
                self.pipeline.update_config(**config_data)
                
                # Acknowledge config change
                ack = {
                    "type": "config_ack",
                    "timestamp": time.time(),
                    "data": {
                        "blur_method": self.pipeline.blur_method,
                        "blur_kernel_size": self.pipeline.blur_kernel_size,
                        "blur_sigma": self.pipeline.blur_sigma,
                        "blur_pixelation_block": self.pipeline.blur_pixelation_block,
                        "det_conf_threshold": self.pipeline.detector.conf_threshold,
                        "jpeg_quality": self.pipeline.jpeg_quality
                    }
                }
                await websocket.send_text(json.dumps(ack))
                
            elif msg_type == "control":
                action = msg.get("data", {}).get("action")
                if action == "start":
                    self.pipeline.start()
                elif action == "stop":
                    self.pipeline.stop()
                    
        except json.JSONDecodeError:
            logger.warning("Invalid JSON received")
        except Exception as e:
            logger.error(f"Error handling message: {e}")

