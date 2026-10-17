import type { Clip, ExpectedSegment } from '../engine/clip';
import type { Pose } from '../engine/types';
import {
  buildClip,
  poseTarget,
  seededRng,
  type HandTrack,
  type Rng,
} from './syntheticClip';

export const GESTURES: Pose[] = ['open_palm', 'pinch', 'v', 'fist'];
const CLIPS_PER_GESTURE = 10;
const CLIPS_PER_BACKGROUND = 10;
const NORMAL_NOISE = 0.0025;

function between(rng: Rng, low: number, high: number): number {
  return low + (high - low) * rng();
}

function track(
  rng: Rng,
  poses: { pose: Pose; fromMs: number }[],
  overrides: Partial<HandTrack> = {},
): HandTrack {
  return {
    scale: between(rng, 0.15, 0.2),
    cx: between(rng, 0.4, 0.6),
    cy: between(rng, 0.75, 0.9),
    rotation: between(rng, -0.15, 0.15),
    mirror: rng() < 0.5,
    drift: 0.01,
    segments: poses.map(({ pose, fromMs }) => ({
      fromMs,
      target: poseTarget(pose, rng),
    })),
    ...overrides,
  };
}

function gestureClip(gesture: Pose, index: number): Clip {
  const seed = 1000 * (GESTURES.indexOf(gesture) + 1) + index;
  const rng = seededRng(seed);
  const name = `${gesture}-${String(index).padStart(2, '0')}`;
  const other: Pose = gesture === 'fist' ? 'open_palm' : 'fist';
  const base = { name, category: gesture, fps: 30, seed, noise: NORMAL_NOISE };
  const held: ExpectedSegment = {
    fromMs: 0,
    toMs: null,
    hand: 0,
    pose: gesture,
  };

  if (index <= 3) {
    return buildClip({
      ...base,
      durationMs: 1500,
      tracks: [track(rng, [{ pose: gesture, fromMs: 0 }])],
      expected: [held],
    });
  }
  if (index <= 5) {
    // A little farther back: the hand is about half the size.
    return buildClip({
      ...base,
      durationMs: 1500,
      noise: 0.002,
      tracks: [
        track(rng, [{ pose: gesture, fromMs: 0 }], {
          scale: between(rng, 0.085, 0.11),
        }),
      ],
      expected: [held],
    });
  }
  if (index <= 7) {
    return buildClip({
      ...base,
      durationMs: 1500,
      tracks: [
        track(rng, [{ pose: gesture, fromMs: 0 }], {
          rotation: (index === 6 ? 1 : -1) * between(rng, 0.4, 0.65),
          mirror: index === 7,
        }),
      ],
      expected: [held],
    });
  }
  if (index === 8) {
    return buildClip({
      ...base,
      durationMs: 1500,
      tracks: [
        track(rng, [{ pose: gesture, fromMs: 0 }], { cx: 0.28, scale: 0.15 }),
        track(rng, [{ pose: other, fromMs: 0 }], { cx: 0.72, scale: 0.15 }),
      ],
      expected: [held, { fromMs: 0, toMs: null, hand: 1, pose: other }],
    });
  }
  return buildClip({
    ...base,
    durationMs: 2500,
    tracks: [
      track(rng, [
        { pose: other, fromMs: 0 },
        { pose: gesture, fromMs: 1000 },
      ]),
    ],
    expected: [
      { fromMs: 0, toMs: 900, hand: 0, pose: other },
      { fromMs: 1000, toMs: null, hand: 0, pose: gesture },
    ],
  });
}

type Background = 'reading' | 'talking' | 'face-touching';
const BACKGROUNDS: Background[] = ['reading', 'talking', 'face-touching'];

/** Ordinary behaviour that must never read as a gesture. */
function backgroundClip(kind: Background, index: number): Clip {
  const seed = 5000 + 100 * BACKGROUNDS.indexOf(kind) + index;
  const rng = seededRng(seed);
  const name = `${kind}-${String(index).padStart(2, '0')}`;
  const none: ExpectedSegment = {
    fromMs: 0,
    toMs: null,
    hand: 0,
    pose: 'none',
  };
  const base = {
    name,
    category: kind,
    fps: 30,
    seed,
    noise: NORMAL_NOISE,
    durationMs: 2000,
    expected: [none],
    expectedEvents: [],
  };

  if (kind === 'reading') {
    // Hands off the keyboard or out of view for the first half, a relaxed resting hand for the rest.
    if (index < 5) return buildClip({ ...base, tracks: [] });
    return buildClip({
      ...base,
      tracks: [
        track(rng, [{ pose: 'none', fromMs: 0 }], {
          cy: between(rng, 0.9, 0.98),
          drift: 0.004,
        }),
      ],
    });
  }
  if (kind === 'talking') {
    return buildClip({
      ...base,
      tracks: [
        track(
          rng,
          [
            { pose: 'none', fromMs: 0 },
            { pose: 'none', fromMs: 600 },
            { pose: 'none', fromMs: 1200 },
          ],
          { drift: 0.05, rotation: between(rng, -0.5, 0.5) },
        ),
      ],
    });
  }
  return buildClip({
    ...base,
    tracks: [
      track(rng, [{ pose: 'none', fromMs: 0 }], {
        cy: between(rng, 0.45, 0.6),
        scale: between(rng, 0.12, 0.2),
        drift: 0.015,
      }),
    ],
  });
}

const CLIPS_PER_STATE_GROUP = 10;

/** Wake and sleep behaviour; each clip says which events it must produce. */
function stateClip(index: number): Clip {
  const seed = 8000 + index;
  const rng = seededRng(seed);
  const name = `wake-sleep-${String(index).padStart(2, '0')}`;
  const base = {
    name,
    category: 'wake-sleep',
    fps: 30,
    seed,
    noise: NORMAL_NOISE,
    expected: [],
  };

  if (index <= 3) {
    // Palm held up the whole time: wakes once and never again.
    return buildClip({
      ...base,
      durationMs: 2000,
      tracks: [track(rng, [{ pose: 'open_palm', fromMs: 0 }])],
      expectedEvents: ['wake'],
    });
  }
  if (index <= 5) {
    // A palm raised for under half a second does nothing.
    return buildClip({
      ...base,
      durationMs: 2000,
      tracks: [
        track(rng, [
          { pose: 'open_palm', fromMs: 0 },
          { pose: 'none', fromMs: 450 },
        ]),
      ],
      expectedEvents: [],
    });
  }
  if (index <= 7) {
    return buildClip({
      ...base,
      durationMs: 3500,
      tracks: [
        track(rng, [
          { pose: 'open_palm', fromMs: 0 },
          { pose: 'fist', fromMs: 1300 },
        ]),
      ],
      expectedEvents: ['wake', 'sleep'],
    });
  }
  if (index === 8) {
    // The hand leaves the picture: sleeps after 3 s.
    return buildClip({
      ...base,
      durationMs: 5000,
      tracks: [
        track(rng, [{ pose: 'open_palm', fromMs: 0 }], {
          visibleUntilMs: 1100,
        }),
      ],
      expectedEvents: ['wake', 'sleep'],
    });
  }
  return buildClip({
    ...base,
    durationMs: 4800,
    tracks: [
      track(rng, [
        { pose: 'open_palm', fromMs: 0 },
        { pose: 'fist', fromMs: 1300 },
        { pose: 'none', fromMs: 2900 },
        { pose: 'open_palm', fromMs: 3300 },
      ]),
    ],
    expectedEvents: ['wake', 'sleep', 'wake'],
  });
}

export function buildClipLibrary(): Clip[] {
  const clips: Clip[] = [];
  for (const gesture of GESTURES) {
    for (let i = 0; i < CLIPS_PER_GESTURE; i++) {
      clips.push(gestureClip(gesture, i));
    }
  }
  for (const kind of BACKGROUNDS) {
    for (let i = 0; i < CLIPS_PER_BACKGROUND; i++) {
      clips.push(backgroundClip(kind, i));
    }
  }
  for (let i = 0; i < CLIPS_PER_STATE_GROUP; i++) {
    clips.push(stateClip(i));
  }
  return clips;
}
