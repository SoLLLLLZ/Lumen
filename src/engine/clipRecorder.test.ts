import { describe, expect, it } from 'vitest';
import { buildHand, DEFAULT_SPEC } from '../fixtures/syntheticHand';
import { frameToHands, isClip } from './clip';
import { ClipRecorder } from './clipRecorder';
import { evaluateClip, replayClip } from './replayer';

const hand = {
  landmarks: buildHand({
    ...DEFAULT_SPEC,
    curl: [1, 1, 1, 1],
    thumb: { kind: 'tucked' },
  }),
  confidence: 0.9,
};
const meta = {
  name: 'fist-test',
  category: 'fist',
  width: 640,
  height: 480,
  expected: [{ fromMs: 0, toMs: null, hand: 0, pose: 'fist' as const }],
};

describe('ClipRecorder', () => {
  it('stores times relative to the first frame', () => {
    const recorder = new ClipRecorder();
    recorder.add(5000, [hand]);
    recorder.add(5033, [hand]);
    const clip = recorder.finish(meta);
    expect(clip.frames.map((f) => f.t)).toEqual([0, 33]);
    expect(recorder.frameCount).toBe(2);
  });

  it('round-trips landmarks through JSON to four decimals', () => {
    const recorder = new ClipRecorder();
    recorder.add(0, [hand]);
    const clip = JSON.parse(JSON.stringify(recorder.finish(meta)));
    expect(isClip(clip)).toBe(true);
    const back = frameToHands(clip.frames[0])[0];
    hand.landmarks.forEach((point, i) => {
      expect(back?.landmarks[i]?.x).toBeCloseTo(point.x, 3);
      expect(back?.landmarks[i]?.y).toBeCloseTo(point.y, 3);
    });
  });

  it('produces a clip the replayer can score', () => {
    const recorder = new ClipRecorder();
    for (let t = 0; t <= 1000; t += 33) recorder.add(t, [hand]);
    const clip = recorder.finish(meta);
    expect(evaluateClip(clip, replayClip(clip)).passed).toBe(true);
    const wrong = {
      ...clip,
      expected: [{ ...meta.expected[0]!, pose: 'v' as const }],
    };
    expect(evaluateClip(wrong, replayClip(wrong)).passed).toBe(false);
  });

  it('rejects things that are not clips', () => {
    expect(isClip(null)).toBe(false);
    expect(isClip({ version: 2 })).toBe(false);
  });
});
