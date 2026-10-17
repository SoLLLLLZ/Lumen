import { useState } from 'react';
import { POSES, type Pose } from '../engine/types';
import { useHandTracking, type TrackingPhase } from './useHandTracking';

const PHASE_MESSAGES: Record<TrackingPhase, string> = {
  idle: 'Camera is off.',
  starting: 'Starting camera.',
  running: 'Tracking.',
  paused:
    'Camera paused because the tab was hidden. Start the camera to continue.',
  denied:
    'Camera access was blocked. Allow it in your browser settings, then try again.',
  error: 'The camera or hand tracking could not start. Try again.',
};

const POSE_LABELS: Record<Pose, string> = {
  open_palm: 'Open palm',
  pinch: 'Pinch',
  v: 'V pose',
  fist: 'Fist',
  none: 'No pose',
};

export function App() {
  const {
    videoRef,
    canvasRef,
    model,
    delegate,
    phase,
    stats,
    showSkeleton,
    toggleSkeleton,
    recording,
    startRecording,
    stopRecording,
    start,
    turnOff,
  } = useHandTracking();
  const [showDebug, setShowDebug] = useState(true);
  const [clipName, setClipName] = useState('');
  const [clipPose, setClipPose] = useState<Pose>('open_palm');

  const isRunning = phase === 'running';
  const canStart =
    model.status === 'ready' && phase !== 'starting' && !isRunning;

  return (
    <main>
      <h1>Lumen</h1>
      <p>
        Lumen reads hand gestures from your webcam. Video is processed on this
        device only. Nothing is stored or sent anywhere.
      </p>

      {model.status === 'loading' && (
        <p>
          <label>
            Loading hand tracking model ({Math.round(model.progress * 100)}%){' '}
            <progress max={1} value={model.progress} />
          </label>
        </p>
      )}
      {model.status === 'failed' && (
        <p>Hand tracking could not load. Reload the page to retry.</p>
      )}

      <div className="controls">
        {!isRunning && (
          <button onClick={start} disabled={!canStart}>
            Start camera
          </button>
        )}
        {isRunning && (
          <>
            <button onClick={turnOff}>Turn camera off</button>
            <button onClick={toggleSkeleton} aria-pressed={showSkeleton}>
              {showSkeleton ? 'Hide hand overlay' : 'Show hand overlay'}
            </button>
            <button
              onClick={() => setShowDebug((current) => !current)}
              aria-pressed={showDebug}
            >
              {showDebug ? 'Hide debug view' : 'Show debug view'}
            </button>
          </>
        )}
      </div>

      <p role="status">{PHASE_MESSAGES[phase]}</p>

      <div className="stage" hidden={!isRunning}>
        <video ref={videoRef} className="mirrored" playsInline muted />
        <canvas ref={canvasRef} className="mirrored" />
      </div>

      {isRunning && showDebug && (
        <dl className="debug" aria-label="Debug view">
          <dt>Frame rate</dt>
          <dd data-testid="fps">{stats.fps.toFixed(1)} fps</dd>
          <dt>Tracking time</dt>
          <dd>{stats.trackingMs.toFixed(1)} ms per frame</dd>
          <dt>Hands</dt>
          <dd data-testid="hands">{stats.handCount}</dd>
          <dt>Confidence</dt>
          <dd>
            {stats.confidences.length > 0
              ? stats.confidences
                  .map((value) => `${Math.round(value * 100)}%`)
                  .join(', ')
              : 'no hand'}
          </dd>
          <dt>Pose</dt>
          <dd data-testid="poses">
            {stats.hands.length > 0
              ? stats.hands
                  .map(
                    (hand, index) =>
                      `Hand ${index + 1}: ${POSE_LABELS[hand.pose]}`,
                  )
                  .join('; ')
              : 'no hand'}
          </dd>
          <dt>Pinch gap</dt>
          <dd>
            {stats.hands.length > 0
              ? stats.hands
                  .map((hand) => `${Math.round(hand.pinchRatio * 100)}%`)
                  .join(', ')
              : 'no hand'}
          </dd>
          <dt>Extension (thumb, index, middle, ring, pinky)</dt>
          <dd>
            {stats.hands.length > 0
              ? stats.hands
                  .map((hand) =>
                    Object.values(hand.extensions)
                      .map((value) => value.toFixed(2))
                      .join(' '),
                  )
                  .join('; ')
              : 'no hand'}
          </dd>
          <dt>Backend</dt>
          <dd>{delegate === 'GPU' ? 'GPU' : 'CPU (GPU unavailable)'}</dd>
        </dl>
      )}

      {isRunning && showDebug && (
        <form
          className="recorder"
          aria-label="Clip recorder"
          onSubmit={(event) => {
            event.preventDefault();
            if (recording) {
              stopRecording();
            } else if (clipName.trim() !== '') {
              startRecording(clipName.trim(), clipPose);
            }
          }}
        >
          <label>
            Clip name{' '}
            <input
              value={clipName}
              onChange={(event) => setClipName(event.target.value)}
              disabled={recording}
            />
          </label>
          <label>
            Pose held the whole time{' '}
            <select
              value={clipPose}
              onChange={(event) => setClipPose(event.target.value as Pose)}
              disabled={recording}
            >
              {POSES.map((pose) => (
                <option key={pose} value={pose}>
                  {POSE_LABELS[pose]}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={!recording && clipName.trim() === ''}>
            {recording ? 'Stop and save clip' : 'Record clip'}
          </button>
        </form>
      )}
    </main>
  );
}
