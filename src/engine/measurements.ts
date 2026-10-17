import type { Landmark } from './types';

export const WRIST = 0;
export const THUMB_TIP = 4;
export const INDEX_MCP = 5;
export const PINKY_MCP = 17;

export type Finger = 'index' | 'middle' | 'ring' | 'pinky';
export const FINGERS: readonly Finger[] = ['index', 'middle', 'ring', 'pinky'];

const FINGER_JOINTS: Record<Finger, { mcp: number; tip: number }> = {
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
 * How far the fingertip is from the wrist compared with the knuckle.
 * Around 1.9 for a straight finger, below 1 for a finger folded into the palm.
 * Independent of hand size and rotation.
 */
export function fingerExtension(
  landmarks: Landmark[],
  finger: Finger,
  aspect: number,
): number {
  const { mcp, tip } = FINGER_JOINTS[finger];
  const wrist = at(landmarks, WRIST);
  const base = distance(at(landmarks, mcp), wrist, aspect);
  if (base <= 0) return 0;
  return distance(at(landmarks, tip), wrist, aspect) / base;
}
