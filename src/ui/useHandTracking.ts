import { useCallback, useEffect, useRef, useState } from 'react';
import { ClipRecorder } from '../engine/clipRecorder';
import { HandPoseEngine, type HandState } from '../engine/handPoseEngine';
import { RollingStats } from '../engine/rollingStats';
import type { Pose } from '../engine/types';
import { isPermissionError, startCamera, stopStream } from '../tracking/camera';
import { downloadClip } from '../tracking/downloadClip';
import { clearCanvas, drawSkeleton } from '../tracking/drawSkeleton';
import {
  loadHandTracker,
  type Delegate,
  type HandTracker,
} from '../tracking/handTracker';

export type TrackingPhase =
  'idle' | 'starting' | 'running' | 'paused' | 'denied' | 'error';
export type ModelState =
  | { status: 'loading'; progress: number }
  | { status: 'ready' }
  | { status: 'failed' };

export type HandReadout = Pick<
  HandState,
  'id' | 'pose' | 'pinchRatio' | 'extensions'
>;

export interface TrackingStats {
  fps: number;
  trackingMs: number;
  handCount: number;
  confidences: number[];
  hands: HandReadout[];
}

interface ActiveRecording {
  recorder: ClipRecorder;
  name: string;
  pose: Pose;
  width: number;
  height: number;
}

const EMPTY_STATS: TrackingStats = {
  fps: 0,
  trackingMs: 0,
  handCount: 0,
  confidences: [],
  hands: [],
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
  const recordingRef = useRef<ActiveRecording | null>(null);
  const showSkeletonRef = useRef(true);

  const [model, setModel] = useState<ModelState>({
    status: 'loading',
    progress: 0,
  });
  const [delegate, setDelegate] = useState<Delegate | null>(null);
  const [phase, setPhase] = useState<TrackingPhase>('idle');
  const [stats, setStats] = useState<TrackingStats>(EMPTY_STATS);
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [recording, setRecording] = useState(false);

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
    recordingRef.current = null;
    setRecording(false);
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
    let engine = new HandPoseEngine();
    let latestHands: HandState[] = [];
    let running = true;
    let lastVideoTime = -1;

    function onFrame() {
      if (!running || !video || !canvas) return;
      if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        try {
          const startedAt = performance.now();
          const raw = tracker!.detect(video, startedAt);
          const finishedAt = performance.now();
          frameStats.record(finishedAt, finishedAt - startedAt);
          recordingRef.current?.recorder.add(startedAt, raw);
          latestHands = engine.process(startedAt, raw);
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
        hands: latestHands.map(({ id, pose, pinchRatio, extensions }) => ({
          id,
          pose,
          pinchRatio,
          extensions,
        })),
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
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        engine = new HandPoseEngine({
          aspect: video.videoWidth / video.videoHeight,
        });
      }
    } catch {
      stop('error');
      return;
    }
    if (!running) return;
    setPhase('running');
    scheduleNextFrame();
  }, [stop]);

  const startRecording = useCallback((name: string, pose: Pose) => {
    const video = videoRef.current;
    if (!video || !sessionRef.current || recordingRef.current) return;
    recordingRef.current = {
      recorder: new ClipRecorder(),
      name,
      pose,
      width: video.videoWidth,
      height: video.videoHeight,
    };
    setRecording(true);
  }, []);

  const stopRecording = useCallback(() => {
    const active = recordingRef.current;
    recordingRef.current = null;
    setRecording(false);
    if (!active || active.recorder.frameCount === 0) return;
    downloadClip(
      active.recorder.finish({
        name: active.name,
        category: active.pose,
        width: active.width,
        height: active.height,
        expected: [{ fromMs: 0, toMs: null, hand: 0, pose: active.pose }],
      }),
    );
  }, []);

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
    recording,
    startRecording,
    stopRecording,
    start,
    turnOff: () => stop('idle'),
  };
}
