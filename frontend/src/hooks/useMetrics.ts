import { useState, useEffect, useRef } from 'react';
import type { FrameData } from '../types';

interface UseMetricsReturn {
  fps: number;
  frameTimestamps: number[];
}

export function useMetrics(frames: FrameData[]): UseMetricsReturn {
  const [fps, setFps] = useState(0);
  const timestampsRef = useRef<number[]>([]);
  const processedCountRef = useRef(0);

  useEffect(() => {
    const newFrames = frames.slice(processedCountRef.current);
    newFrames.forEach(frame => {
      timestampsRef.current.push(frame.timestamp);
    });
    processedCountRef.current = frames.length;

    const now = Date.now();
    const recent = timestampsRef.current.filter(timestamp => timestamp > now - 1000);
    timestampsRef.current = recent;
    setFps(recent.length > 0 ? recent.length : frames.length > 0 ? frames.length : 0);
  }, [frames]);

  return { fps, frameTimestamps: timestampsRef.current };
}
