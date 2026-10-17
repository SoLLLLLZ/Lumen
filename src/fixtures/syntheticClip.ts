import { handsToFrame, type Clip, type ExpectedSegment } from '../engine/clip';
import type { Pose } from '../engine/types';
import { buildHand, type HandSpec, type ThumbSpec } from './syntheticHand';

export type Rng = () => number;

export function seededRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rng: Rng): number {
  const u = Math.max(rng(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

function between(rng: Rng, low: number, high: number): number {
  return low + (high - low) * rng();
}

export interface PoseTarget {
  curl: [number, number, number, number];
  thumb: ThumbSpec;
}

/** A pose with small natural variation. 'none' is a relaxed, half-curled hand. */
export function poseTarget(pose: Pose, rng: Rng): PoseTarget {
  const straight = () => between(rng, 0, 0.06);
  const folded = () => between(rng, 0.8, 1);
  const relaxed = () => between(rng, 0.25, 0.3);
  switch (pose) {
    case 'open_palm':
      return {
        curl: [straight(), straight(), straight(), straight()],
        thumb: { kind: 'out' },
      };
    case 'pinch':
      return {
        curl: [between(rng, 0.25, 0.35), straight(), relaxed(), relaxed()],
        thumb: { kind: 'pinch', gap: between(rng, 0.06, 0.14) },
      };
    case 'v':
      return {
        curl: [straight(), straight(), folded(), folded()],
        thumb: { kind: 'tucked' },
      };
    case 'fist':
      return {
        curl: [folded(), folded(), folded(), folded()],
        thumb: { kind: 'tucked' },
      };
    case 'none':
      return {
        curl: [relaxed(), relaxed(), relaxed(), relaxed()],
        thumb: { kind: 'out' },
      };
  }
}

export interface TrackSegment {
  fromMs: number;
  target: PoseTarget;
}

export interface HandTrack {
  scale: number;
  cx: number;
  cy: number;
  rotation: number;
  mirror: boolean;
  /** Sideways wobble amplitude, fraction of image width. */
  drift: number;
  segments: TrackSegment[];
}

export interface ClipOptions {
  name: string;
  category: string;
  durationMs: number;
  fps?: number;
  /** Landmark jitter in pixels, as a fraction of image width. */
  noise: number;
  seed: number;
  tracks: HandTrack[];
  expected: ExpectedSegment[];
  width?: number;
  height?: number;
}

const TRANSITION_MS = 150;

function specAt(track: HandTrack, timeMs: number, aspect: number): HandSpec {
  let index = 0;
  for (let i = 0; i < track.segments.length; i++) {
    if ((track.segments[i]?.fromMs ?? 0) <= timeMs) index = i;
  }
  const current = track.segments[index];
  if (!current) throw new Error('Track has no segments');
  const previous = track.segments[index - 1];
  const blend = previous
    ? Math.min(1, (timeMs - current.fromMs) / TRANSITION_MS)
    : 1;
  const from = previous ?? current;
  const curl = current.target.curl.map(
    (value, i) => (from.target.curl[i] ?? value) * (1 - blend) + value * blend,
  ) as HandSpec['curl'];
  const wobble = Math.sin(timeMs / 400) * track.drift;
  return {
    curl,
    thumb: blend < 0.5 ? from.target.thumb : current.target.thumb,
    scale: track.scale,
    cx: track.cx + wobble,
    cy: track.cy + wobble * 0.5,
    rotation: track.rotation,
    mirror: track.mirror,
    aspect,
  };
}

export function buildClip(options: ClipOptions): Clip {
  const width = options.width ?? 640;
  const height = options.height ?? 480;
  const aspect = width / height;
  const fps = options.fps ?? 30;
  const rng = seededRng(options.seed);
  const frames = [];
  for (let t = 0; t <= options.durationMs; t += 1000 / fps) {
    const hands = options.tracks.map((track) => ({
      landmarks: buildHand(specAt(track, t, aspect)).map((point) => ({
        x: point.x + gaussian(rng) * options.noise,
        y: point.y + gaussian(rng) * options.noise * aspect,
      })),
      confidence: 0.9,
    }));
    frames.push(handsToFrame(t, hands));
  }
  return {
    version: 1,
    name: options.name,
    category: options.category,
    width,
    height,
    expected: options.expected,
    frames,
  };
}
