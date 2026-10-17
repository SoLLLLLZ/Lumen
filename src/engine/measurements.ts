import type { Landmark } from './types';

export const WRIST = 0;
export const THUMB_TIP = 4;
export const INDEX_MCP = 5;
export const INDEX_TIP = 8;
export const MIDDLE_MCP = 9;
export const PINKY_MCP = 17;

export type Finger = 'index' | 'middle' | 'ring' | 'pinky';
export type Digit = 'thumb' | Finger;
export const FINGERS: readonly Finger[] = ['index', 'middle', 'ring', 'pinky'];
export const DIGITS: readonly Digit[] = ['thumb', ...FINGERS];

const DIGIT_JOINTS: Record<Digit, { mcp: number; tip: number }> = {
  thumb: { mcp: 2, tip: 4 },
  index: { mcp: 5, tip: 8 },
  middle: { mcp: 9, tip: 12 },
  ring: { mcp: 13, tip: 16 },
  pinky: { mcp: 17, tip: 20 },
};

function at(landmarks: Landmark[], index: number): Landmark {
  const point = landmarks[index];
  if (!point) throw new Error(`Missing landmark ${index}`);
  return point;
}

/**
 * Distance in units of image width. Landmarks are normalized per axis, so the
 * vertical difference is scaled by height/width to keep distances true.
 */
export function distance(a: Landmark, b: Landmark, aspect: number): number {
  return Math.hypot(a.x - b.x, (a.y - b.y) / aspect);
}

/** Palm width: index knuckle to pinky knuckle. */
export function handWidth(landmarks: Landmark[], aspect: number): number {
  return distance(at(landmarks, INDEX_MCP), at(landmarks, PINKY_MCP), aspect);
}

/** Thumb tip to index tip, as a fraction of hand width. */
export function pinchRatio(landmarks: Landmark[], aspect: number): number {
  const width = handWidth(landmarks, aspect);
  if (width <= 0) return Infinity;
  return distance(at(landmarks, THUMB_TIP), at(landmarks, 8), aspect) / width;
}

/**
 * How far the fingertip is from the wrist compared with the knuckle (for the
 * thumb, the joint at its base).
 * Around 1.9 for a straight finger, below 1 for a finger folded into the palm.
 * Independent of hand size and rotation.
 */
export function digitExtension(
  landmarks: Landmark[],
  digit: Digit,
  aspect: number,
): number {
  const { mcp, tip } = DIGIT_JOINTS[digit];
  const wrist = at(landmarks, WRIST);
  const base = distance(at(landmarks, mcp), wrist, aspect);
  if (base <= 0) return 0;
  return distance(at(landmarks, tip), wrist, aspect) / base;
}

export interface PalmPoint {
  /** Middle knuckle position in units of image width. */
  x: number;
  y: number;
  /** Wrist to middle knuckle, in the same units. Scales motion by hand size. */
  size: number;
}

export function palmPoint(landmarks: Landmark[], aspect: number): PalmPoint {
  const knuckle = at(landmarks, MIDDLE_MCP);
  const wrist = at(landmarks, WRIST);
  return {
    x: knuckle.x,
    y: knuckle.y / aspect,
    size: distance(knuckle, wrist, aspect),
  };
}

/** Midpoint between thumb tip and index tip, in image coordinates. */
export function pinchPoint(landmarks: Landmark[]): Landmark {
  const thumb = at(landmarks, THUMB_TIP);
  const index = at(landmarks, INDEX_TIP);
  return { x: (thumb.x + index.x) / 2, y: (thumb.y + index.y) / 2 };
}
