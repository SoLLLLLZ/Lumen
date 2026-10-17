import { frameToHands, type Clip } from './clip';
import { EventBus, type GestureEvent } from './eventBus';
import { GestureMachine } from './gestureMachine';
import { HandPoseEngine } from './handPoseEngine';
import type { Pose } from './types';

export interface TimelineEntry {
  t: number;
  /** Pose of each visible hand, ordered by hand id. */
  poses: Pose[];
}

/** Feeds a clip through a fresh engine and returns the pose seen at each frame. */
export function replayClip(clip: Clip): TimelineEntry[] {
  const engine = new HandPoseEngine({ aspect: clip.width / clip.height });
  return clip.frames.map((frame) => ({
    t: frame.t,
    poses: engine
      .process(frame.t, frameToHands(frame))
      .map((hand) => hand.pose),
  }));
}

export interface ClipResult {
  passed: boolean;
  failures: string[];
}

/**
 * Checks the timeline against the clip's expectations. The first settleMs of
 * each segment is skipped so a pose can change; after that it must hold.
 */
export function evaluateClip(
  clip: Clip,
  timeline: TimelineEntry[],
  settleMs = 250,
): ClipResult {
  const failures: string[] = [];
  for (const segment of clip.expected) {
    const end = segment.toMs ?? Number.POSITIVE_INFINITY;
    for (const entry of timeline) {
      if (entry.t < segment.fromMs + settleMs || entry.t > end) continue;
      const seen = entry.poses[segment.hand] ?? 'none';
      if (seen !== segment.pose) {
        failures.push(
          `t=${entry.t}ms hand ${segment.hand}: expected ${segment.pose}, got ${seen}`,
        );
      }
    }
  }
  return { passed: failures.length === 0, failures };
}

/** Feeds a clip through the whole pipeline and returns every event it emits. */
export function replayEvents(clip: Clip): GestureEvent[] {
  const engine = new HandPoseEngine({ aspect: clip.width / clip.height });
  const bus = new EventBus();
  const events: GestureEvent[] = [];
  bus.subscribe((event) => events.push(event));
  const machine = new GestureMachine(bus);
  for (const frame of clip.frames) {
    machine.update(frame.t, engine.process(frame.t, frameToHands(frame)));
  }
  return events;
}
