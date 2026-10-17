import {
  handsToFrame,
  type Clip,
  type ClipFrame,
  type ExpectedSegment,
} from './clip';
import type { TrackedHand } from './types';

export interface RecordingMeta {
  name: string;
  category: string;
  width: number;
  height: number;
  expected: ExpectedSegment[];
}

/** Collects raw (unsmoothed) landmark frames into a clip. */
export class ClipRecorder {
  private readonly frames: ClipFrame[] = [];
  private startMs: number | undefined;

  add(timeMs: number, hands: TrackedHand[]): void {
    this.startMs ??= timeMs;
    this.frames.push(handsToFrame(timeMs - this.startMs, hands));
  }

  get frameCount(): number {
    return this.frames.length;
  }

  finish(meta: RecordingMeta): Clip {
    return { version: 1, ...meta, frames: [...this.frames] };
  }
}
