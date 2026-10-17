import { describe, expect, it } from 'vitest';
import {
  buildHand,
  DEFAULT_SPEC,
  type HandSpec,
} from '../fixtures/syntheticHand';
import { digitExtension, handWidth, pinchRatio } from './measurements';
import { PoseClassifier, PoseStabilizer } from './poseClassifier';
import type { Pose } from './types';

const ASPECT = 4 / 3;

function hand(overrides: Partial<HandSpec>) {
  return buildHand({ ...DEFAULT_SPEC, ...overrides });
}

const OPEN: Partial<HandSpec> = { curl: [0, 0, 0, 0], thumb: { kind: 'out' } };
const V: Partial<HandSpec> = {
  curl: [0, 1, 1, 1],
  thumb: { kind: 'out' },
};
const FIST: Partial<HandSpec> = {
  curl: [1, 1, 1, 1],
  thumb: { kind: 'tucked' },
};
const PINCH: Partial<HandSpec> = {
  curl: [0.3, 0, 0.2, 0.2],
  thumb: { kind: 'pinch', gap: 0.1 },
};

function classify(overrides: Partial<HandSpec>): Pose {
  return new PoseClassifier().classify(hand(overrides)).pose;
}

describe('measurements', () => {
  it('measure the same at any hand size and rotation', () => {
    const small = hand({ ...PINCH, scale: 0.08 });
    const large = hand({ ...PINCH, scale: 0.2, rotation: 0.7 });
    expect(pinchRatio(small, ASPECT)).toBeCloseTo(pinchRatio(large, ASPECT), 2);
    expect(digitExtension(small, 'middle', ASPECT)).toBeCloseTo(
      digitExtension(large, 'middle', ASPECT),
      2,
    );
  });

  it('report hand width in image-width units', () => {
    expect(handWidth(hand({ ...OPEN, scale: 0.2 }), ASPECT)).toBeCloseTo(
      0.2,
      1,
    );
  });

  it('see a straight finger as far more extended than a folded one', () => {
    expect(digitExtension(hand(OPEN), 'index', ASPECT)).toBeGreaterThan(1.6);
    expect(digitExtension(hand(FIST), 'index', ASPECT)).toBeLessThan(1.3);
  });
});

describe('PoseClassifier', () => {
  it.each([
    ['open_palm', OPEN],
    ['v', V],
    ['fist', FIST],
    ['pinch', PINCH],
  ] as const)('recognizes %s', (pose, spec) => {
    expect(classify(spec)).toBe(pose);
  });

  it('recognizes every pose on a mirrored hand, rotated, and far away', () => {
    const far = { scale: 0.09, rotation: -0.6, mirror: true };
    expect(classify({ ...OPEN, ...far })).toBe('open_palm');
    expect(classify({ ...V, ...far })).toBe('v');
    expect(classify({ ...FIST, ...far })).toBe('fist');
    expect(classify({ ...PINCH, ...far })).toBe('pinch');
  });

  it('rejects the neighbors of each pose', () => {
    // Three fingers up is neither a V nor an open palm.
    expect(classify({ curl: [0, 0, 0, 1], thumb: { kind: 'tucked' } })).toBe(
      'none',
    );
    // Index alone, thumb tucked, is not a V.
    expect(classify({ curl: [0, 1, 1, 1], thumb: { kind: 'tucked' } })).toBe(
      'none',
    );
    // The old index plus middle pose is not a V any more.
    expect(classify({ curl: [0, 0, 1, 1], thumb: { kind: 'tucked' } })).toBe(
      'none',
    );
    // Thumb, index and middle up is not a V.
    expect(classify({ curl: [0, 0, 1, 1], thumb: { kind: 'out' } })).toBe(
      'none',
    );
    // Open palm with the ring finger down is not an open palm.
    expect(classify({ curl: [0, 0, 1, 0], thumb: { kind: 'out' } })).toBe(
      'none',
    );
    // Three fingers folded is not a fist.
    expect(classify({ curl: [1, 1, 1, 0], thumb: { kind: 'tucked' } })).toBe(
      'none',
    );
    // A relaxed half-curled hand is nothing.
    expect(
      classify({ curl: [0.2, 0.2, 0.2, 0.2], thumb: { kind: 'out' } }),
    ).toBe('none');
  });

  it('does not call a fist with the thumb on the index finger a pinch', () => {
    expect(
      classify({ curl: [1, 1, 1, 1], thumb: { kind: 'pinch', gap: 0.08 } }),
    ).toBe('fist');
  });

  it('engages the pinch at a smaller gap than it releases', () => {
    const classifier = new PoseClassifier();
    const withGap = (gap: number) =>
      classifier.classify(
        hand({ curl: [0.3, 0, 0.2, 0.2], thumb: { kind: 'pinch', gap } }),
      );
    // 0.3 of hand width: above the engage limit, so it does not start.
    expect(withGap(0.3).pose).not.toBe('pinch');
    // Close enough to engage.
    expect(withGap(0.1).pose).toBe('pinch');
    // Opened to between the two limits: still pinched.
    const between = withGap(0.3);
    expect(between.pinchRatio).toBeGreaterThan(0.25);
    expect(between.pinchRatio).toBeLessThan(0.4);
    expect(between.pose).toBe('pinch');
    // Opened past the release limit: released.
    expect(withGap(0.45).pose).not.toBe('pinch');
    // And a gap between the limits does not re-engage it.
    expect(withGap(0.3).pose).not.toBe('pinch');
  });
});

describe('PoseStabilizer', () => {
  it('ignores a pose that lasts less than the hold time', () => {
    const stabilizer = new PoseStabilizer(100);
    stabilizer.update('open_palm', 0);
    stabilizer.update('open_palm', 150);
    expect(stabilizer.update('fist', 200)).toBe('open_palm');
    expect(stabilizer.update('open_palm', 233)).toBe('open_palm');
    expect(stabilizer.update('fist', 266)).toBe('open_palm');
  });

  it('accepts a pose once it has held long enough', () => {
    const stabilizer = new PoseStabilizer(100);
    for (let t = 0; t <= 100; t += 33) stabilizer.update('v', t);
    expect(stabilizer.update('v', 133)).toBe('v');
  });
});
