import type { Clip, ExpectedSegment } from '../engine/clip';
import type { Pose } from '../engine/types';
import {
  buildClip,
  poseTarget,
  seededRng,
  type HandTrack,
  type Move,
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
const CLIPS_PER_FLICK_GROUP = 20;
const CLIPS_PER_ACCIDENT_GROUP = 10;
const WAKE_HOLD_MS = 1000;

/** Back-and-forth moves, such as a hand gesturing while talking. */
function wiggle(
  startMs: number,
  count: number,
  half: { dx: number; dy: number; ms: number },
): Move[] {
  const moves: Move[] = [];
  for (let i = 0; i < count; i++) {
    const sign = i % 2 === 0 ? 1 : -1;
    const fromMs = startMs + i * half.ms;
    moves.push({
      fromMs,
      toMs: fromMs + half.ms,
      dx: sign * half.dx,
      dy: sign * half.dy,
    });
  }
  return moves;
}

/** The user wakes the system with a palm, then flicks one way. */
function flickClip(index: number): Clip {
  const seed = 9000 + index;
  const rng = seededRng(seed);
  const name = `flick-${String(index).padStart(2, '0')}`;
  const variant = Math.floor(index / 2);
  const rawRight = index % 2 === 0;
  const far = variant === 1;
  const reach = far ? 0.25 : 0.45;
  const durationOfFlick = variant === 4 ? 320 : between(rng, 160, 240);
  const startMs = 1500;
  const sign = rawRight ? 1 : -1;
  const moves: Move[] = [
    {
      fromMs: startMs,
      toMs: startMs + durationOfFlick,
      dx: sign * reach,
      dy: variant === 2 ? between(rng, 0.05, 0.1) : 0,
    },
  ];
  if (variant === 3) {
    // The hand comes straight back, which must not count as a second flick.
    moves.push({
      fromMs: startMs + durationOfFlick + 80,
      toMs: startMs + durationOfFlick + 80 + durationOfFlick,
      dx: -sign * reach,
      dy: 0,
    });
  }
  const palm = track(rng, [{ pose: 'open_palm', fromMs: 0 }], {
    scale: far ? between(rng, 0.085, 0.1) : between(rng, 0.15, 0.2),
    cx: rawRight ? 0.28 : 0.72,
    moves,
  });
  return buildClip({
    name,
    category: 'flick',
    fps: 30,
    seed,
    noise: NORMAL_NOISE,
    durationMs: 3200,
    tracks: [palm],
    expected: [],
    expectedEvents: ['wake', rawRight ? 'next' : 'previous'],
  });
}

/** Ordinary movement while awake. None of it may turn a page. */
function accidentClip(index: number): Clip {
  const seed = 9500 + index;
  const rng = seededRng(seed);
  const name = `accident-${String(index).padStart(2, '0')}`;
  const start = WAKE_HOLD_MS + 500;
  let pose: Pose = 'none';
  let moves: Move[];
  if (index <= 2) {
    // Scratching the nose: short strokes up toward the face.
    moves = wiggle(start, 8, { dx: 0.04, dy: -0.06, ms: 180 });
  } else if (index <= 5) {
    // Talking with the hands: open palm, steady back-and-forth.
    pose = 'open_palm';
    moves = wiggle(start, 10, { dx: 0.12, dy: 0.02, ms: 250 });
  } else if (index <= 8) {
    // Reaching for a mug: one slow sweep out and back with a relaxed hand.
    moves = [
      { fromMs: start, toMs: start + 700, dx: 0.35, dy: 0 },
      { fromMs: start + 1400, toMs: start + 2100, dx: -0.35, dy: 0 },
    ];
  } else {
    // A moderately quick reach with the palm still open.
    pose = 'open_palm';
    moves = [{ fromMs: start, toMs: start + 600, dx: 0.3, dy: 0 }];
  }
  const hand = track(
    rng,
    [
      { pose: 'open_palm', fromMs: 0 },
      { pose, fromMs: WAKE_HOLD_MS + 200 },
    ],
    { cx: 0.35, moves },
  );
  return buildClip({
    name,
    category: 'accident',
    fps: 30,
    seed,
    noise: NORMAL_NOISE,
    durationMs: 4200,
    tracks: [hand],
    expected: [],
    expectedEvents: ['wake'],
  });
}

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

const PAN_PINCH_MS = 1500;
/** Too soon after raising the palm to have woken the system. */
const PAN_ASLEEP_PINCH_MS = 400;
const PAN_RELEASE_MS = 3000;

interface PanPlan {
  /** Hand position in the image, in image widths. */
  cx: number;
  cy: number;
  /** Raw image movement of the hand while pinching. */
  dx: number;
  dy: number;
  wakes: boolean;
}

/** Pan drags, one per scenario. */
const PAN_PLANS: PanPlan[] = [
  // Starts on the left background (screen), drags rightward on screen.
  { cx: 0.8, cy: 0.9, dx: -0.12, dy: 0, wakes: true },
  // Starts on the left background and crosses the text: the mode must stay pan.
  { cx: 0.8, cy: 0.9, dx: -0.3, dy: 0.1, wakes: true },
  // Starts on the middle of the text and drifts out: nothing may pan.
  { cx: 0.59, cy: 0.9, dx: 0.3, dy: 0, wakes: true },
  // Asleep: the pinch does nothing at all.
  { cx: 0.8, cy: 0.9, dx: -0.12, dy: 0, wakes: false },
];

function panClip(index: number): Clip {
  const plan = PAN_PLANS[index] as PanPlan;
  const seed = 9700 + index;
  const rng = seededRng(seed);
  const name = `pan-${String(index).padStart(2, '0')}`;
  const pinchMs = plan.wakes ? PAN_PINCH_MS : PAN_ASLEEP_PINCH_MS;
  const hand = track(
    rng,
    [
      { pose: 'open_palm', fromMs: 0 },
      { pose: 'pinch', fromMs: pinchMs },
      { pose: 'open_palm', fromMs: PAN_RELEASE_MS },
    ],
    {
      scale: 0.17,
      cx: plan.cx,
      cy: plan.cy,
      rotation: 0,
      mirror: false,
      drift: 0,
      moves: [
        {
          fromMs: pinchMs + 500,
          toMs: pinchMs + 1200,
          dx: plan.dx,
          dy: plan.dy,
        },
      ],
    },
  );
  return buildClip({
    name,
    category: 'pan',
    fps: 30,
    seed,
    noise: 0.001,
    durationMs: 3600,
    tracks: [hand],
    expected: [],
    expectedEvents: plan.wakes
      ? ['wake', 'pinch-start', 'pan', 'pinch-end']
      : [],
  });
}

const ZOOM_START_MS = 1500;
const ZOOM_STEP_MS = 100;
const ZOOM_STEPS = 10;
const ZOOM_RELEASE_MS = 3200;
const OPEN_NARROW = 0.15;
const OPEN_WIDE = 1;

type ZoomKind = 'spread' | 'close' | 'asleep';
const ZOOM_KINDS: ZoomKind[] = ['spread', 'close', 'asleep'];

/** A V held steady, with the thumb moving away from or toward the index finger. */
function zoomClip(index: number): Clip {
  const kind = ZOOM_KINDS[index] as ZoomKind;
  const seed = 9800 + index;
  const rng = seededRng(seed);
  const name = `zoom-${String(index).padStart(2, '0')}`;
  const vStart = kind === 'asleep' ? PAN_ASLEEP_PINCH_MS : ZOOM_START_MS;
  const from = kind === 'close' ? OPEN_WIDE : OPEN_NARROW;
  const to = kind === 'close' ? OPEN_NARROW : OPEN_WIDE;
  const vTarget = poseTarget('v', rng);
  const withOpen = (open: number) => ({
    ...vTarget,
    thumb: { kind: 'spread' as const, open },
  });
  const steps = Array.from({ length: ZOOM_STEPS + 1 }, (_, i) => ({
    fromMs: vStart + 200 + i * ZOOM_STEP_MS,
    target: withOpen(from + ((to - from) * i) / ZOOM_STEPS),
  }));
  const palm = poseTarget('open_palm', rng);
  const hand: HandTrack = {
    scale: 0.17,
    cx: 0.5,
    cy: 0.9,
    rotation: 0,
    mirror: false,
    drift: 0,
    segments: [
      { fromMs: 0, target: palm },
      { fromMs: vStart, target: withOpen(from) },
      ...steps,
      { fromMs: ZOOM_RELEASE_MS, target: palm },
    ],
  };
  return buildClip({
    name,
    category: 'zoom',
    fps: 30,
    seed,
    noise: 0.001,
    durationMs: 4000,
    tracks: [hand],
    expected: [],
    expectedEvents: kind === 'asleep' ? [] : ['wake', 'zoom'],
  });
}

/** Two quick pinch taps in a row reset the view. */
function doubleTapClip(): Clip {
  const seed = 9900;
  const rng = seededRng(seed);
  const palm = poseTarget('open_palm', rng);
  const pinch = poseTarget('pinch', rng);
  const hand: HandTrack = {
    scale: 0.17,
    cx: 0.8,
    cy: 0.9,
    rotation: 0,
    mirror: false,
    drift: 0,
    segments: [
      { fromMs: 0, target: palm },
      { fromMs: 1500, target: pinch },
      { fromMs: 1850, target: palm },
      { fromMs: 2200, target: pinch },
      { fromMs: 2550, target: palm },
    ],
  };
  return buildClip({
    name: 'double-pinch-00',
    category: 'pan',
    fps: 30,
    seed,
    noise: 0.001,
    durationMs: 3600,
    tracks: [hand],
    expected: [],
    expectedEvents: [
      'wake',
      'pinch-start',
      'pan',
      'pinch-end',
      'pinch-start',
      'pan',
      'pinch-end',
      'reset-view',
    ],
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
  for (let i = 0; i < CLIPS_PER_FLICK_GROUP; i++) {
    clips.push(flickClip(i));
  }
  for (let i = 0; i < CLIPS_PER_ACCIDENT_GROUP; i++) {
    clips.push(accidentClip(i));
  }
  for (let i = 0; i < PAN_PLANS.length; i++) {
    clips.push(panClip(i));
  }
  for (let i = 0; i < ZOOM_KINDS.length; i++) {
    clips.push(zoomClip(i));
  }
  clips.push(doubleTapClip());
  return clips;
}
