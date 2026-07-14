import { useEffect, useRef } from 'react';
import type { ConnectionStatus, SourceStatus } from '../types';

interface VideoStreamProps {
  stream: MediaStream | null;
  status: ConnectionStatus;
  sourceStatus?: SourceStatus | null;
}

export function VideoStream({ stream, status, sourceStatus }: VideoStreamProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraStatus = sourceStatus?.connection_status;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (stream) {
      video.srcObject = stream;
      void video.play().catch(() => {
        // Autoplay can fail until user gesture; muted helps.
      });
    } else {
      video.srcObject = null;
    }
  }, [stream]);

  const getStatusText = () => {
    if (cameraStatus === 'reconnecting') return 'Reconnecting camera...';
    switch (status) {
      case 'connecting': return 'Connecting WebRTC...';
      case 'connected': return 'Live';
      case 'disconnected': return 'Disconnected';
      case 'error': return 'WebRTC Error';
      case 'demo': return 'Demo Mode';
      default: return 'Unknown';
    }
  };

  const getStatusColor = () => {
    if (cameraStatus === 'reconnecting') return 'text-yellow-400';
    switch (status) {
      case 'connected': return 'text-green-400';
      case 'connecting': return 'text-yellow-400';
      case 'disconnected': return 'text-gray-400';
      case 'error': return 'text-red-400';
      case 'demo': return 'text-cyan-300';
      default: return 'text-gray-400';
    }
  };

  const showOverlay = status !== 'connected' || cameraStatus === 'reconnecting' || !stream;

  return (
    <div className="relative w-full max-w-4xl mx-auto">
      <div className="aspect-video bg-slate-950 rounded-3xl overflow-hidden relative border border-white/10 shadow-2xl shadow-cyan-950/20">
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          autoPlay
          playsInline
          muted
          controls={false}
        />

        {showOverlay && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm">
            <div className="text-center px-6">
              <div className={`text-2xl font-mono mb-2 ${getStatusColor()}`}>
                {getStatusText()}
              </div>
              <div className="text-sm text-gray-400">
                {cameraStatus === 'reconnecting'
                  ? 'Camera stream interrupted — retrying every 3 seconds'
                  : status === 'connecting'
                    ? 'Negotiating peer connection...'
                    : 'Waiting for blurred WebRTC stream...'}
              </div>
            </div>
          </div>
        )}

        {status === 'connected' && cameraStatus !== 'reconnecting' && stream && (
          <div className="absolute top-3 right-3 flex items-center gap-2 text-green-400 text-sm font-mono">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
            LIVE · WebRTC
          </div>
        )}

        {(sourceStatus?.source_type || sourceStatus?.camera_name) && (
          <div className="absolute top-3 left-3 rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-xs text-slate-200 backdrop-blur-sm">
            <div className="font-medium">{sourceStatus.source_type}</div>
            <div className="text-slate-400">{sourceStatus.camera_name}</div>
          </div>
        )}
      </div>
    </div>
  );
}
