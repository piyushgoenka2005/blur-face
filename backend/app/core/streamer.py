"""Output streamer helpers — publish latest pipeline results.

Streamers never run detection; they only read encoded frames from the pipeline.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import TYPE_CHECKING, Awaitable, Callable, Optional

from fastapi import WebSocket

if TYPE_CHECKING:
    from .pipeline import FramePipeline

logger = logging.getLogger(__name__)


class JpegFrameStreamer:
    """Push newest JPEG frames (+ periodic metrics) over a WebSocket."""

    def __init__(
        self,
        pipeline: "FramePipeline",
        websocket: WebSocket,
        metrics_every: int = 10,
        idle_sleep_sec: float = 0.02,
    ):
        self._pipeline = pipeline
        self._websocket = websocket
        self._metrics_every = max(1, metrics_every)
        self._idle_sleep_sec = idle_sleep_sec

    async def run(
        self,
        should_stop: Callable[[], bool],
        on_frame: Optional[Callable[[], Awaitable[None]]] = None,
    ) -> int:
        """Stream until ``should_stop()`` is true. Returns frames sent."""
        sent = 0
        last_seq = -1
        pipeline = self._pipeline
        ws = self._websocket

        while not should_stop():
            if not pipeline.is_active:
                await asyncio.sleep(0.05)
                continue

            seq, jpeg = await asyncio.to_thread(pipeline.wait_for_jpeg, 0.05)
            if jpeg is None or seq == last_seq:
                await asyncio.sleep(self._idle_sleep_sec)
                continue

            last_seq = seq
            await ws.send_bytes(jpeg)
            sent += 1

            if on_frame is not None:
                await on_frame()

            if sent % self._metrics_every == 0:
                await ws.send_text(
                    json.dumps(
                        {
                            "type": "metrics",
                            "data": pipeline.build_metrics_payload(),
                        }
                    )
                )
                await ws.send_text(
                    json.dumps(
                        {
                            "type": "source_status",
                            "data": pipeline.get_source_info(),
                        }
                    )
                )

        return sent
