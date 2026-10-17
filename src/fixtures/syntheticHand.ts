import type { Landmark } from '../engine/types';

export type ThumbSpec =
  | { kind: 'out' }
  | { kind: 'tucked' }
  | { kind: 'pinch'; gap: number }
  /** Thumb pointing up (open 0) to straight out to the side (open 1). */
  | { kind: 'spread'; open: number };

export interface HandSpec {
  /** Curl 0 (straight) to 1 (folded) for index, middle, ring, pinky. */
  curl: [number, number, number, number];
  thumb: ThumbSpec;
  /** Palm width as a fraction of image width. */
  scale: number;
  /** Wrist position, normalized image coordinates. */
  cx: number;
  cy: number;
  /** Radians, counterclockwise on screen. */
  rotation: number;
  /** Draw a left hand instead of a right hand. */
  mirror: boolean;
  /** Video width divided by height. */
  aspect: number;
}

interface FingerShape {
  mcp: [number, number];
  angle: number;
  lengths: [number, number, number];
}

// Hand space: wrist at the origin, y up, one unit is the palm width.
const FINGER_SHAPES: FingerShape[] = [
  { mcp: [-0.5, 1.05], angle: -0.08, lengths: [0.45, 0.28, 0.25] },
  { mcp: [-0.17, 1.12], angle: -0.02, lengths: [0.5, 0.3, 0.25] },
  { mcp: [0.17, 1.07], angle: 0.05, lengths: [0.45, 0.28, 0.25] },
  { mcp: [0.5, 0.95], angle: 0.15, lengths: [0.42, 0.26, 0.24] },
];

type Point = [number, number];

function fingerPoints(shape: FingerShape, curl: number): Point[] {
  const [l1, l2, l3] = shape.lengths;
  const dir: Point = [Math.sin(shape.angle), Math.cos(shape.angle)];
  const along = (distance: number): Point => [
    shape.mcp[0] + dir[0] * distance,
    shape.mcp[1] + dir[1] * distance,
  ];
  return [
    shape.mcp,
    along(l1 * (1 - 0.9 * curl)),
    along((l1 + l2) * (1 - 1.1 * curl)),
    along((l1 + l2 + l3) * (1 - 1.45 * curl)),
  ];
}

function thumbPoints(thumb: ThumbSpec, indexTip: Point): Point[] {
  const cmc: Point = [-0.35, 0.2];
  if (thumb.kind === 'out') {
    return [cmc, [-0.6, 0.5], [-0.85, 0.75], [-1.05, 0.95]];
  }
  if (thumb.kind === 'tucked') {
    return [cmc, [-0.55, 0.4], [-0.3, 0.5], [-0.1, 0.65]];
  }
  if (thumb.kind === 'spread') {
    const base: Point = [-0.6, 0.5];
    const angle = (Math.PI / 2) * (1 + thumb.open);
    const reach = 0.64;
    const end: Point = [
      base[0] + Math.cos(angle) * reach,
      base[1] + Math.sin(angle) * reach,
    ];
    const middle: Point = [
      base[0] + (end[0] - base[0]) * 0.55,
      base[1] + (end[1] - base[1]) * 0.55,
    ];
    return [cmc, base, middle, end];
  }
  const tip: Point = [indexTip[0] + thumb.gap, indexTip[1] - thumb.gap * 0.3];
  const mcp: Point = [-0.6, 0.5];
  const ip: Point = [
    mcp[0] + (tip[0] - mcp[0]) * 0.55,
    mcp[1] + (tip[1] - mcp[1]) * 0.55,
  ];
  return [cmc, mcp, ip, tip];
}

/** The 21 MediaPipe landmarks of a made-up but anatomically plausible hand. */
export function buildHand(spec: HandSpec): Landmark[] {
  const fingers = FINGER_SHAPES.map((shape, i) =>
    fingerPoints(shape, spec.curl[i] ?? 0),
  );
  const indexTip = fingers[0]?.[3] ?? [0, 0];
  const points: Point[] = [
    [0, 0],
    ...thumbPoints(spec.thumb, indexTip),
    ...fingers.flat(),
  ];

  const cos = Math.cos(spec.rotation);
  const sin = Math.sin(spec.rotation);
  const flip = spec.mirror ? -1 : 1;
  return points.map(([hx, hy]) => {
    const fx = hx * flip;
    const rx = fx * cos - hy * sin;
    const ry = fx * sin + hy * cos;
    return {
      x: spec.cx + rx * spec.scale,
      y: spec.cy - ry * spec.scale * spec.aspect,
    };
  });
}

export const DEFAULT_SPEC: HandSpec = {
  curl: [0, 0, 0, 0],
  thumb: { kind: 'out' },
  scale: 0.17,
  cx: 0.5,
  cy: 0.85,
  rotation: 0,
  mirror: false,
  aspect: 4 / 3,
};
