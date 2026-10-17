import { DIGITS, digitExtension, pinchRatio, type Digit } from './measurements';
import type { Landmark, Pose } from './types';

export interface PoseThresholds {
  /** Pinch starts when thumb to index is under this fraction of hand width. */
  pinchEngage: number;
  /** Pinch ends only once it is over this fraction. Must exceed pinchEngage. */
  pinchRelease: number;
  /** Finger counts as straight at or above this extension. */
  extended: number;
  /** Finger counts as folded at or below this extension. */
  curled: number;
  /** A pinch needs the index finger at least this extended, so a fist with the thumb on top is not a pinch. */
  pinchMinIndexExtension: number;
}

export const DEFAULT_THRESHOLDS: PoseThresholds = {
  pinchEngage: 0.25,
  pinchRelease: 0.4,
  extended: 1.6,
  curled: 1.35,
  pinchMinIndexExtension: 1.05,
};

export interface Classification {
  pose: Pose;
  pinchRatio: number;
  extensions: Record<Digit, number>;
}

/** Classifies single frames. Holds only the pinch hysteresis state. */
export class PoseClassifier {
  private pinched = false;

  constructor(
    private readonly thresholds: PoseThresholds = DEFAULT_THRESHOLDS,
    private readonly aspect = 4 / 3,
  ) {}

  classify(landmarks: Landmark[]): Classification {
    const t = this.thresholds;
    const ratio = pinchRatio(landmarks, this.aspect);
    const extensions = {} as Record<Digit, number>;
    for (const digit of DIGITS) {
      extensions[digit] = digitExtension(landmarks, digit, this.aspect);
    }

    if (this.pinched) {
      if (ratio > t.pinchRelease) this.pinched = false;
    } else if (ratio < t.pinchEngage) {
      this.pinched = true;
    }
    if (this.pinched && extensions.index < t.pinchMinIndexExtension) {
      this.pinched = false;
    }

    const up = (digit: Digit) => extensions[digit] >= t.extended;
    const down = (digit: Digit) => extensions[digit] <= t.curled;

    let pose: Pose = 'none';
    if (this.pinched) pose = 'pinch';
    else if (up('index') && up('middle') && up('ring') && up('pinky')) {
      pose = 'open_palm';
    } else if (
      up('thumb') &&
      up('index') &&
      down('middle') &&
      down('ring') &&
      down('pinky')
    ) {
      pose = 'v';
    } else if (
      down('index') &&
      down('middle') &&
      down('ring') &&
      down('pinky')
    ) {
      pose = 'fist';
    }

    return { pose, pinchRatio: ratio, extensions };
  }

  reset(): void {
    this.pinched = false;
  }
}

/** Accepts a new pose only after it has been seen continuously for holdMs. */
export class PoseStabilizer {
  private current: Pose = 'none';
  private candidate: Pose | null = null;
  private candidateSinceMs = 0;

  constructor(private readonly holdMs = 100) {}

  update(raw: Pose, timeMs: number): Pose {
    if (raw === this.current) {
      this.candidate = null;
      return this.current;
    }
    if (raw !== this.candidate) {
      this.candidate = raw;
      this.candidateSinceMs = timeMs;
    }
    if (timeMs - this.candidateSinceMs >= this.holdMs) {
      this.current = raw;
      this.candidate = null;
    }
    return this.current;
  }

  reset(): void {
    this.current = 'none';
    this.candidate = null;
  }
}
