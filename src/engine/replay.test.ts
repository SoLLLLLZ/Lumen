import { describe, expect, it } from 'vitest';
import { isClip, type Clip } from './clip';
import { evaluateClip, replayClip, replayEvents } from './replayer';

const modules = import.meta.glob('../fixtures/clips/**/*.json', {
  eager: true,
  import: 'default',
});
const clips: Clip[] = Object.entries(modules).map(([path, value]) => {
  if (!isClip(value)) throw new Error(`${path} is not a valid clip`);
  return value;
});

function countByCategory(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const clip of clips) {
    counts[clip.category] = (counts[clip.category] ?? 0) + 1;
  }
  return counts;
}

describe('clip library', () => {
  it('has at least 10 clips of each gesture and of ordinary behaviour', () => {
    const counts = countByCategory();
    for (const category of [
      'open_palm',
      'pinch',
      'v',
      'fist',
      'reading',
      'talking',
      'face-touching',
      'wake-sleep',
      'flick',
      'accident',
    ]) {
      expect(counts[category] ?? 0, category).toBeGreaterThanOrEqual(10);
    }
  });

  it('classifies at least 95% of clips correctly', () => {
    const failed = clips.filter(
      (clip) => !evaluateClip(clip, replayClip(clip)).passed,
    );
    expect(
      failed.map((clip) => clip.name),
      'clips that failed',
    ).toEqual([]);
    expect(1 - failed.length / clips.length).toBeGreaterThanOrEqual(0.95);
  });

  describe.each(clips.map((clip) => [clip.name, clip] as const))(
    '%s',
    (_, clip) => {
      it('yields the expected pose timeline', () => {
        const result = evaluateClip(clip, replayClip(clip));
        expect(result.failures.slice(0, 3)).toEqual([]);
      });

      it('emits exactly the expected events', () => {
        if (!clip.expectedEvents) return;
        // A drag or V hold emits every frame, so a run of pans or zooms counts as one.
        const types = replayEvents(clip)
          .map((event) => event.type)
          .filter(
            (type, i, all) =>
              (type !== 'pan' && type !== 'zoom') || all[i - 1] !== type,
          );
        expect(types).toEqual(clip.expectedEvents);
      });

      it('does not flicker within 300 ms while a pose is held', () => {
        const timeline = replayClip(clip);
        for (const segment of clip.expected) {
          const held = timeline.filter(
            (entry) =>
              entry.t >= segment.fromMs + 250 &&
              entry.t <= (segment.toMs ?? Infinity),
          );
          let changes = 0;
          for (let i = 1; i < held.length; i++) {
            if (
              held[i]?.poses[segment.hand] !== held[i - 1]?.poses[segment.hand]
            ) {
              changes++;
            }
          }
          expect(changes).toBe(0);
        }
      });
    },
  );
});
