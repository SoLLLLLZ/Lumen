import type { PalmPoint } from './measurements';

export interface FlickConfig {
  /** Only motion inside this window counts. */
  windowMs: number;
  /** Least sideways travel, in palm lengths. */
  minDistance: number;
  /** Least average speed over the travel, in palm lengths per second. */
  minSpeed: number;
  /** Sideways travel must be at least this many times the vertical travel. */
  directionRatio: number;
  /** After a flick, all flicks are ignored for this long (the return stroke). */
  lockoutMs: number;
}

export const DEFAULT_FLICK_CONFIG: FlickConfig = {
  windowMs: 400,
  minDistance: 1.5,
  minSpeed: 6,
  directionRatio: 2,
  lockoutMs: 400,
};

export type FlickDirection = 'next' | 'previous';

interface Sample {
  timeMs: number;
  point: PalmPoint;
}

/**
 * Spots a quick sideways hand move. In the raw camera image the hand moving
 * right is the user's hand moving left, which turns to the next page.
 */
export class FlickDetector {
  private readonly history = new Map<number, Sample[]>();
  private lockedUntilMs = Number.NEGATIVE_INFINITY;

  constructor(private readonly config: FlickConfig = DEFAULT_FLICK_CONFIG) {}

  /** True while the return stroke of the last flick is being ignored. */
  isLocked(timeMs: number): boolean {
    return timeMs < this.lockedUntilMs;
  }

  /** Forget everything seen so far for a hand, for example when its pose changes. */
  clearHand(handId: number): void {
    this.history.delete(handId);
  }

  clearAll(): void {
    this.history.clear();
  }

  /** Feed one frame of one hand. Returns a direction when a flick completes. */
  update(
    timeMs: number,
    handId: number,
    point: PalmPoint,
  ): FlickDirection | null {
    if (this.isLocked(timeMs)) return null;

    const samples = (this.history.get(handId) ?? []).filter(
      (sample) => timeMs - sample.timeMs <= this.config.windowMs,
    );
    samples.push({ timeMs, point });
    this.history.set(handId, samples);

    for (const start of samples) {
      const direction = this.checkMove(start, { timeMs, point });
      if (direction) {
        this.history.clear();
        this.lockedUntilMs = timeMs + this.config.lockoutMs;
        return direction;
      }
    }
    return null;
  }

  private checkMove(from: Sample, to: Sample): FlickDirection | null {
    const seconds = (to.timeMs - from.timeMs) / 1000;
    if (seconds <= 0) return null;
    const size = (from.point.size + to.point.size) / 2;
    if (size <= 0) return null;

    const dx = (to.point.x - from.point.x) / size;
    const dy = (to.point.y - from.point.y) / size;
    if (Math.abs(dx) < this.config.minDistance) return null;
    if (Math.abs(dx) / seconds < this.config.minSpeed) return null;
    if (Math.abs(dx) < this.config.directionRatio * Math.abs(dy)) return null;
    return dx > 0 ? 'next' : 'previous';
  }
}
