"""WebRTC streaming — publish blurred frames only via aiortc."""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Optional, Set

import cv2
import numpy as np
from aiortc import (
    RTCConfiguration,
    RTCIceServer,
    RTCPeerConnection,
    RTCSessionDescription,
    VideoStreamTrack,
)
from aiortc.rtcrtpsender import RTCRtpSender
from av import VideoFrame

logger = logging.getLogger(__name__)


def build_rtc_configuration(stun_urls: list[str]) -> RTCConfiguration:
    """ICE config with public STUN servers for NAT traversal."""
    servers = [RTCIceServer(urls=stun_urls)] if stun_urls else []
    return RTCConfiguration(iceServers=servers)


def prefer_h264_then_vp8(pc: RTCPeerConnection) -> None:
    """Prefer H264 when the stack supports it; otherwise fall back to VP8."""
    try:
        caps = RTCRtpSender.getCapabilities("video")
        if not caps or not caps.codecs:
            return

        h264 = [c for c in caps.codecs if c.mimeType.lower() == "video/h264"]
        vp8 = [c for c in caps.codecs if c.mimeType.lower() == "video/vp8"]
        rest = [
            c
            for c in caps.codecs
            if c.mimeType.lower() not in ("video/h264", "video/vp8")
        ]
        preferred = h264 + vp8 + rest
        if not preferred:
            return

        for transceiver in pc.getTransceivers():
            if transceiver.kind == "video":
                transceiver.setCodecPreferences(preferred)
                codec_names = [c.mimeType for c in preferred[:3]]
                logger.info("WebRTC codec preference: %s", codec_names)
                break
    except Exception:
        logger.exception("Unable to set WebRTC codec preferences; using defaults")


class BlurredVideoTrack(VideoStreamTrack):
    """aiortc video track that publishes the latest *blurred* BGR frame only."""

    kind = "video"

    def __init__(self, frame_provider, target_fps: float = 25.0):
        super().__init__()
        self._frame_provider = frame_provider
        self._target_fps = max(1.0, float(target_fps))
        self._frame_interval = 1.0 / self._target_fps
        self._last_send = 0.0
        self._placeholder: Optional[np.ndarray] = None

    async def recv(self) -> VideoFrame:
        # Pace to target FPS so the encoder does not race ahead of the pipeline.
        now = time.time()
        wait = self._frame_interval - (now - self._last_send)
        if wait > 0:
            await asyncio.sleep(wait)
        self._last_send = time.time()

        pts, time_base = await self.next_timestamp()

        bgr = None
        try:
            bgr = self._frame_provider.get_latest_blurred_frame()
        except Exception:
            logger.exception("Frame provider failed while serving WebRTC track")

        if bgr is None:
            bgr = self._black_frame()

        # Ensure even dimensions (required by many encoders).
        h, w = bgr.shape[:2]
        if w % 2 or h % 2:
            bgr = cv2.resize(bgr, (w - (w % 2), h - (h % 2)))

        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        frame = VideoFrame.from_ndarray(rgb, format="rgb24")
        frame.pts = pts
        frame.time_base = time_base
        return frame

    def _black_frame(self) -> np.ndarray:
        if self._placeholder is None:
            self._placeholder = np.zeros((480, 640, 3), dtype=np.uint8)
            cv2.putText(
                self._placeholder,
                "Waiting for blurred frames...",
                (40, 240),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.8,
                (200, 200, 200),
                2,
                cv2.LINE_AA,
            )
        return self._placeholder


class WebRTCManager:
    """Manage PeerConnections that publish the shared blurred track."""

    def __init__(
        self,
        frame_provider,
        stun_urls: Optional[list[str]] = None,
        target_fps: float = 25.0,
    ):
        self._frame_provider = frame_provider
        self._stun_urls = stun_urls or ["stun:stun.l.google.com:19302"]
        self._target_fps = target_fps
        self._pcs: Set[RTCPeerConnection] = set()
        self._lock = asyncio.Lock()

    @property
    def peer_count(self) -> int:
        return len(self._pcs)

    async def handle_offer(self, sdp: str, type_: str) -> dict:
        """Complete offer/answer exchange; return the local answer SDP."""
        config = build_rtc_configuration(self._stun_urls)
        pc = RTCPeerConnection(configuration=config)

        async with self._lock:
            self._pcs.add(pc)

        @pc.on("connectionstatechange")
        async def on_connectionstatechange() -> None:
            state = pc.connectionState
            logger.info("WebRTC connection state: %s (peers=%s)", state, len(self._pcs))
            if state in ("failed", "closed"):
                await self._dispose_pc(pc)

        track = BlurredVideoTrack(self._frame_provider, target_fps=self._target_fps)
        pc.addTrack(track)
        prefer_h264_then_vp8(pc)

        offer = RTCSessionDescription(sdp=sdp, type=type_)
        await pc.setRemoteDescription(offer)
        answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)

        # Wait briefly for ICE candidates so the answer is usable without trickle.
        await self._wait_ice_gathering(pc)

        assert pc.localDescription is not None
        return {
            "sdp": pc.localDescription.sdp,
            "type": pc.localDescription.type,
        }

    async def _wait_ice_gathering(self, pc: RTCPeerConnection, timeout: float = 2.0) -> None:
        if pc.iceGatheringState == "complete":
            return

        done = asyncio.Event()

        @pc.on("icegatheringstatechange")
        def on_ice_gathering_state_change() -> None:
            if pc.iceGatheringState == "complete":
                done.set()

        try:
            await asyncio.wait_for(done.wait(), timeout=timeout)
        except asyncio.TimeoutError:
            logger.debug(
                "ICE gathering still in progress after %.1fs; sending answer anyway",
                timeout,
            )

    async def _dispose_pc(self, pc: RTCPeerConnection) -> None:
        async with self._lock:
            self._pcs.discard(pc)
        try:
            await pc.close()
        except Exception:
            pass

    async def close_all(self) -> None:
        async with self._lock:
            peers = list(self._pcs)
            self._pcs.clear()
        for pc in peers:
            try:
                await pc.close()
            except Exception:
                pass
