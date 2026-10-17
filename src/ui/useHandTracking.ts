import { useCallback, useEffect, useRef, useState } from 'react';
import { RollingStats } from '../engine/rollingStats';
import { isPermissionError, startCamera, stopStream } from '../tracking/camera';
import { clearCanvas, drawSkeleton } from '../tracking/drawSkeleton';
import {
  loadHandTracker,
  type Delegate,
  type HandTracker,
  type TrackedHand,
} from '../tracking/handTracker';

export type TrackingPhase =
  'idle' | 'starting' | 'running' | 'paused' | 'denied' | 'error';
export type ModelState =
  | { status: 'loading'; progress: number }
  | { status: 'ready' }
  | { status: 'failed' };

export interface TrackingStats {
  fps: number;
  trackingMs: number;
  handCount: number;
  confidences: number[];
}

const EMPTY_STATS: TrackingStats = {
  fps: 0,
  trackingMs: 0,
  handCount: 0,
  confidences: [],
};
const STATS_WINDOW_MS = 2000;
const STATS_PUBLISH_INTERVAL_MS = 250;

// Everything that must be undone when the camera stops.
interface Session {
  end: () => void;
}

export function useHandTracking() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trackerRef = useRef<HandTracker | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const showSkeletonRef = useRef(true);

  const [model, setModel] = useState<ModelState>({
    status: 'loading',
    progress: 0,
  });
  const [delegate, setDelegate] = useState<Delegate | null>(null);
  const [phase, setPhase] = useState<TrackingPhase>('idle');
  const [stats, setStats] = useState<TrackingStats>(EMPTY_STATS);
  const [showSkeleton, setShowSkeleton] = useState(true);

  useEffect(() => {
    showSkeletonRef.current = showSkeleton;
  }, [showSkeleton]);

  // Preload the model at startup so the first camera start is not delayed.
  useEffect(() => {
    let cancelled = false;
    loadHandTracker((progress) => {
      if (!cancelled) setModel({ status: 'loading', progress });
    })
      .then((tracker) => {
        if (cancelled) {
          tracker.close();
          return;
        }
        trackerRef.current = tracker;
        setDelegate(tracker.delegate);
        setModel({ status: 'ready' });
      })
      .catch(() => {
        if (!cancelled) setModel({ status: 'failed' });
      });
    return () => {
      cancelled = true;
      trackerRef.current?.close();
      trackerRef.current = null;
    };
  }, []);

  const stop = useCallback((nextPhase: 'idle' | 'paused' | 'error') => {
    sessionRef.current?.end();
    sessionRef.current = null;
    setStats(EMPTY_STATS);
    setPhase(nextPhase);
  }, []);

  const start = useCallback(async () => {
    const tracker = trackerRef.current;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!tracker || !video || !canvas || sessionRef.current) return;

    setPhase('starting');
    let stream: MediaStream;
    try {
      stream = await startCamera();
    } catch (error) {
      setPhase(isPermissionError(error) ? 'denied' : 'error');
      return;
    }

    const frameStats = new RollingStats(STATS_WINDOW_MS);
    let latestHands: TrackedHand[] = [];
    let running = true;
    let lastVideoTime = -1;

    function onFrame() {
      if (!running || !video || !canvas) return;
      if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        try {
          const startedAt = performance.now();
          latestHands = tracker!.detect(video, startedAt);
          const finishedAt = performance.now();
          frameStats.record(finishedAt, finishedAt - startedAt);
        } catch {
          stop('error');
          return;
        }
        if (showSkeletonRef.current) {
          drawSkeleton(canvas, latestHands);
        } else {
          clearCanvas(canvas);
        }
      }
      scheduleNextFrame();
    }

    function scheduleNextFrame() {
      if (video && 'requestVideoFrameCallback' in video) {
        video.requestVideoFrameCallback(onFrame);
      } else {
        requestAnimationFrame(onFrame);
      }
    }

    const publishTimer = setInterval(() => {
      const { fps, averageMs } = frameStats.snapshot();
      setStats({
        fps,
        trackingMs: averageMs,
        handCount: latestHands.length,
        confidences: latestHands.map((hand) => hand.confidence),
      });
    }, STATS_PUBLISH_INTERVAL_MS);

    const onVisibilityChange = () => {
      if (document.hidden) stop('paused');
    };
    const onPageHide = () => stop('idle');
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onPageHide);

    sessionRef.current = {
      end() {
        running = false;
        clearInterval(publishTimer);
        document.removeEventListener('visibilitychange', onVisibilityChange);
        window.removeEventListener('pagehide', onPageHide);
        stopStream(stream);
        video.srcObject = null;
        clearCanvas(canvas);
      },
    };

    try {
      video.srcObject = stream;
      await video.play();
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    } catch {
      stop('error');
      return;
    }
    if (!running) return;
    setPhase('running');
    scheduleNextFrame();
  }, [stop]);

  useEffect(() => () => stop('idle'), [stop]);

  return {
    videoRef,
    canvasRef,
    model,
    delegate,
    phase,
    stats,
    showSkeleton,
    toggleSkeleton: () => setShowSkeleton((current) => !current),
    start,
    turnOff: () => stop('idle'),
  };
}
