import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConnectionStatus } from '../types';
import { apiUrl } from '../config';

const STUN_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
];

interface UseWebRTCOptions {
  enabled?: boolean;
}

interface UseWebRTCReturn {
  stream: MediaStream | null;
  status: ConnectionStatus;
  reconnect: () => void;
}

async function waitIceGatheringComplete(pc: RTCPeerConnection, timeoutMs = 2000): Promise<void> {
  if (pc.iceGatheringState === 'complete') return;

  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => resolve(), timeoutMs);
    const check = () => {
      if (pc.iceGatheringState === 'complete') {
        clearTimeout(timer);
        pc.removeEventListener('icegatheringstatechange', check);
        resolve();
      }
    };
    pc.addEventListener('icegatheringstatechange', check);
  });
}

export function useWebRTC(options: UseWebRTCOptions = {}): UseWebRTCReturn {
  const { enabled = true } = options;
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stoppedRef = useRef(false);
  const connectGenRef = useRef(0);

  const cleanupPc = useCallback(() => {
    if (pcRef.current) {
      try {
        pcRef.current.getSenders().forEach(s => s.track?.stop());
        pcRef.current.getReceivers().forEach(r => r.track?.stop());
        pcRef.current.close();
      } catch {
        // ignore
      }
      pcRef.current = null;
    }
    setStream(null);
  }, []);

  const connect = useCallback(async () => {
    if (stoppedRef.current) return;

    const gen = ++connectGenRef.current;
    cleanupPc();
    setStatus('connecting');

    try {
      const pc = new RTCPeerConnection({ iceServers: STUN_SERVERS });
      pcRef.current = pc;

      pc.addTransceiver('video', { direction: 'recvonly' });

      pc.ontrack = (event) => {
        if (stoppedRef.current || gen !== connectGenRef.current) return;
        const media = event.streams[0] ?? new MediaStream([event.track]);
        setStream(media);
        setStatus('connected');
      };

      pc.onconnectionstatechange = () => {
        if (stoppedRef.current || gen !== connectGenRef.current) return;
        const state = pc.connectionState;
        if (state === 'connected') {
          setStatus('connected');
        } else if (state === 'failed' || state === 'disconnected' || state === 'closed') {
          setStatus('disconnected');
          cleanupPc();
          if (!stoppedRef.current) {
            reconnectTimerRef.current = setTimeout(() => {
              void connect();
            }, 1500);
          }
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitIceGatheringComplete(pc);

      const local = pc.localDescription;
      if (!local) {
        throw new Error('Missing local SDP description');
      }

      const response = await fetch(apiUrl('/api/webrtc/offer'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sdp: local.sdp, type: local.type }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.detail || `WebRTC offer failed (${response.status})`);
      }

      const answer = await response.json();
      if (stoppedRef.current || gen !== connectGenRef.current) return;

      await pc.setRemoteDescription(answer);
    } catch (err) {
      if (stoppedRef.current || gen !== connectGenRef.current) return;
      console.warn('WebRTC connect failed:', err);
      setStatus('error');
      cleanupPc();
      reconnectTimerRef.current = setTimeout(() => {
        void connect();
      }, 2000);
    }
  }, [cleanupPc]);

  const reconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    void connect();
  }, [connect]);

  useEffect(() => {
    if (!enabled) {
      stoppedRef.current = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      cleanupPc();
      setStatus('disconnected');
      return;
    }

    stoppedRef.current = false;
    void connect();

    return () => {
      stoppedRef.current = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      cleanupPc();
    };
  }, [enabled, connect, cleanupPc]);

  return { stream, status, reconnect };
}
