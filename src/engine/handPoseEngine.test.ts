import { describe, expect, it } from 'vitest';
import {
  buildHand,
  DEFAULT_SPEC,
  type HandSpec,
} from '../fixtures/syntheticHand';
import { HandPoseEngine } from './handPoseEngine';
import type { TrackedHand } from './types';

const FIST: Partial<HandSpec> = {
  curl: [1, 1, 1, 1],
  thumb: { kind: 'tucked' },
};
const OPEN: Partial<HandSpec> = { curl: [0, 0, 0, 0], thumb: { kind: 'out' } };

function tracked(overrides: Partial<HandSpec>): TrackedHand {
  return {
    landmarks: buildHand({ ...DEFAULT_SPEC, ...overrides }),
    confidence: 0.9,
  };
}

function run(
  engine: HandPoseEngine,
  hands: TrackedHand[],
  fromMs: number,
  toMs: number,
) {
  let states = engine.process(fromMs, hands);
  for (let t = fromMs + 33; t <= toMs; t += 33)
    states = engine.process(t, hands);
  return states;
}

describe('HandPoseEngine', () => {
  it('reports no hands when none are visible', () => {
    expect(new HandPoseEngine().process(0, [])).toEqual([]);
  });

  it('reports a held pose after the hold time', () => {
    const engine = new HandPoseEngine();
    expect(engine.process(0, [tracked(FIST)])[0]?.pose).toBe('none');
    expect(run(engine, [tracked(FIST)], 33, 300)[0]?.pose).toBe('fist');
  });

  it('tracks two hands separately and keeps their ids', () => {
    const engine = new HandPoseEngine();
    const left = tracked({ ...FIST, cx: 0.25, scale: 0.15 });
    const right = tracked({ ...OPEN, cx: 0.75, scale: 0.15 });
    const states = run(engine, [right, left], 0, 400);
    expect(states.map((s) => [s.id, s.pose])).toEqual([
      [0, 'fist'],
      [1, 'open_palm'],
    ]);
    // The hands swap list order and drift a little: ids must not swap.
    const moved = run(
      engine,
      [
        tracked({ ...OPEN, cx: 0.76, scale: 0.15 }),
        tracked({ ...FIST, cx: 0.26, scale: 0.15 }),
      ],
      433,
      600,
    );
    expect(moved.map((s) => [s.id, s.pose])).toEqual([
      [0, 'fist'],
      [1, 'open_palm'],
    ]);
  });

  it('does not change pose for a single bad frame', () => {
    const engine = new HandPoseEngine();
    run(engine, [tracked(OPEN)], 0, 400);
    const states = engine.process(433, [tracked(FIST)]);
    expect(states[0]?.pose).toBe('open_palm');
    expect(engine.process(466, [tracked(OPEN)])[0]?.pose).toBe('open_palm');
  });

  it('starts a returning hand fresh after it was gone', () => {
    const engine = new HandPoseEngine();
    run(engine, [tracked({ ...OPEN, cx: 0.3 })], 0, 300);
    engine.process(333, []);
    const back = engine.process(900, [tracked({ ...OPEN, cx: 0.32 })]);
    expect(back[0]?.landmarks[0]?.x).toBeCloseTo(0.32, 5);
  });

  it('smooths landmarks of a still hand', () => {
    const engine = new HandPoseEngine();
    const still = tracked(OPEN);
    let smoothed = engine.process(0, [still]);
    for (let i = 1; i < 30; i++) {
      const jittered = {
        ...still,
        landmarks: still.landmarks.map((p) => ({
          x: p.x + (i % 2 === 0 ? 0.004 : -0.004),
          y: p.y,
        })),
      };
      smoothed = engine.process(i * 33, [jittered]);
    }
    const wrist = smoothed[0]?.landmarks[0]?.x ?? 0;
    expect(Math.abs(wrist - (still.landmarks[0]?.x ?? 0))).toBeLessThan(0.002);
  });
});
