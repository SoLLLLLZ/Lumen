import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FLICK_CONFIG,
  FlickDetector,
  type FlickDirection,
} from './flickDetector';

const FRAME_MS = 33;
const SIZE = 0.2;

/** Moves the palm in a straight line and returns any flicks, with their times. */
function sweep(
  detector: FlickDetector,
  startMs: number,
  move: { dx: number; dy?: number; durationMs: number },
  size = SIZE,
) {
  const flicks: { direction: FlickDirection; timeMs: number }[] = [];
  const frames = Math.round(move.durationMs / FRAME_MS);
  for (let i = 0; i <= frames; i++) {
    const progress = i / frames;
    const timeMs = startMs + i * FRAME_MS;
    const direction = detector.update(timeMs, 0, {
      x: 0.5 + move.dx * progress,
      y: 0.5 + (move.dy ?? 0) * progress,
      size,
    });
    if (direction) flicks.push({ direction, timeMs });
  }
  return flicks;
}

describe('FlickDetector', () => {
  it('reports next for a fast move to the right of the image', () => {
    const flicks = sweep(new FlickDetector(), 0, { dx: 0.5, durationMs: 200 });
    expect(flicks.map((flick) => flick.direction)).toEqual(['next']);
  });

  it('reports previous for a fast move to the left of the image', () => {
    const flicks = sweep(new FlickDetector(), 0, { dx: -0.5, durationMs: 200 });
    expect(flicks.map((flick) => flick.direction)).toEqual(['previous']);
  });

  it('ignores a move that is too short', () => {
    // 0.2 is one palm length, below the 1.5 minimum.
    expect(sweep(new FlickDetector(), 0, { dx: 0.2, durationMs: 100 })).toEqual(
      [],
    );
  });

  it('ignores a move with enough distance that is too slow', () => {
    // Two palm lengths in 400 ms is 5 per second, below the minimum of 6.
    expect(sweep(new FlickDetector(), 0, { dx: 0.4, durationMs: 400 })).toEqual(
      [],
    );
  });

  it('ignores a long move that is too slow', () => {
    expect(
      sweep(new FlickDetector(), 0, { dx: 0.5, durationMs: 1500 }),
    ).toEqual([]);
  });

  it('ignores a mostly vertical or diagonal move', () => {
    const detector = new FlickDetector();
    expect(sweep(detector, 0, { dx: 0.1, dy: 0.5, durationMs: 200 })).toEqual(
      [],
    );
    expect(
      sweep(detector, 1000, { dx: 0.5, dy: 0.4, durationMs: 200 }),
    ).toEqual([]);
  });

  it('measures distance in palm lengths so a distant small hand still counts', () => {
    const small = sweep(
      new FlickDetector(),
      0,
      { dx: 0.2, durationMs: 200 },
      0.08,
    );
    const large = sweep(
      new FlickDetector(),
      0,
      { dx: 0.2, durationMs: 200 },
      0.3,
    );
    expect(small).toHaveLength(1);
    expect(large).toEqual([]);
  });

  it('ignores the return stroke inside the 400 ms lockout', () => {
    const detector = new FlickDetector();
    const first = sweep(detector, 0, { dx: 0.5, durationMs: 200 });
    const firedAt = first[0]?.timeMs ?? 0;
    const back = sweep(detector, firedAt + 60, { dx: -0.5, durationMs: 200 });
    expect(first).toHaveLength(1);
    expect(back).toEqual([]);
  });

  it('is locked for exactly 400 ms after a flick', () => {
    const detector = new FlickDetector();
    const [first] = sweep(detector, 0, { dx: 0.5, durationMs: 200 });
    const firedAt = first?.timeMs ?? 0;
    expect(detector.isLocked(firedAt + 399)).toBe(true);
    expect(detector.isLocked(firedAt + 400)).toBe(false);
  });

  it('detects a new flick once the lockout has ended', () => {
    const detector = new FlickDetector();
    const [first] = sweep(detector, 0, { dx: 0.5, durationMs: 200 });
    const later = sweep(detector, (first?.timeMs ?? 0) + 500, {
      dx: -0.5,
      durationMs: 200,
    });
    expect(later.map((flick) => flick.direction)).toEqual(['previous']);
  });

  it('does not reuse old motion after a flick when the window is long', () => {
    const detector = new FlickDetector({
      ...DEFAULT_FLICK_CONFIG,
      windowMs: 2000,
      lockoutMs: 100,
    });
    const [first] = sweep(detector, 0, { dx: 0.5, durationMs: 200 });
    const still = (timeMs: number) =>
      detector.update(timeMs, 0, { x: 1, y: 0.5, size: SIZE });
    expect(first).toBeDefined();
    expect(still((first?.timeMs ?? 0) + 200)).toBeNull();
    expect(still((first?.timeMs ?? 0) + 233)).toBeNull();
  });

  it('fires once per flick even though the hand keeps moving', () => {
    const flicks = sweep(new FlickDetector(), 0, { dx: 1.2, durationMs: 400 });
    expect(flicks).toHaveLength(1);
  });

  it('does not combine movement across separate hands', () => {
    const detector = new FlickDetector();
    const point = (x: number) => ({ x, y: 0.5, size: SIZE });
    expect(detector.update(0, 0, point(0.2))).toBeNull();
    expect(detector.update(33, 1, point(0.8))).toBeNull();
  });

  it('forgets a hand when asked, so old motion cannot join new motion', () => {
    const detector = new FlickDetector();
    const point = (x: number) => ({ x, y: 0.5, size: SIZE });
    detector.update(0, 0, point(0.2));
    detector.clearHand(0);
    expect(detector.update(100, 0, point(0.8))).toBeNull();
  });
});
