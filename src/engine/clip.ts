import { LANDMARK_COUNT, POSES, type Pose, type TrackedHand } from './types';

/** One recorded hand: confidence and landmarks flattened as x0,y0,x1,y1,... */
export interface ClipHand {
  c: number;
  p: number[];
}

export interface ClipFrame {
  /** Milliseconds since the start of the clip. */
  t: number;
  hands: ClipHand[];
}

/** From fromMs until toMs (or the end if null), hand number `hand` holds `pose`. */
export interface ExpectedSegment {
  fromMs: number;
  toMs: number | null;
  hand: number;
  pose: Pose;
}

export interface Clip {
  version: 1;
  name: string;
  category: string;
  width: number;
  height: number;
  expected: ExpectedSegment[];
  frames: ClipFrame[];
}

export function frameToHands(frame: ClipFrame): TrackedHand[] {
  return frame.hands.map((hand) => {
    const landmarks = [];
    for (let i = 0; i < LANDMARK_COUNT; i++) {
      landmarks.push({ x: hand.p[i * 2] ?? 0, y: hand.p[i * 2 + 1] ?? 0 });
    }
    return { landmarks, confidence: hand.c };
  });
}

export function handsToFrame(timeMs: number, hands: TrackedHand[]): ClipFrame {
  const round = (value: number) => Math.round(value * 10000) / 10000;
  return {
    t: Math.round(timeMs),
    hands: hands.map((hand) => ({
      c: round(hand.confidence),
      p: hand.landmarks.flatMap((point) => [round(point.x), round(point.y)]),
    })),
  };
}

export function isClip(value: unknown): value is Clip {
  if (typeof value !== 'object' || value === null) return false;
  const clip = value as Partial<Clip>;
  return (
    clip.version === 1 &&
    typeof clip.name === 'string' &&
    typeof clip.width === 'number' &&
    typeof clip.height === 'number' &&
    Array.isArray(clip.frames) &&
    Array.isArray(clip.expected) &&
    clip.expected.every((segment) => POSES.includes(segment.pose))
  );
}
