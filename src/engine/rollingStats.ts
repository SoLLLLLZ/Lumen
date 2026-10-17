// Frame rate and per-frame processing time over a sliding time window.
export interface FrameStats {
  fps: number;
  averageMs: number;
}

interface FrameSample {
  timeMs: number;
  durationMs: number;
}

export class RollingStats {
  private samples: FrameSample[] = [];

  constructor(private readonly windowMs: number) {}

  record(timeMs: number, durationMs: number): void {
    this.samples.push({ timeMs, durationMs });
    const oldestAllowed = timeMs - this.windowMs;
    while (this.samples.length > 0 && this.samples[0]!.timeMs < oldestAllowed) {
      this.samples.shift();
    }
  }

  snapshot(): FrameStats {
    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    if (!first || !last || this.samples.length < 2) {
      return { fps: 0, averageMs: first?.durationMs ?? 0 };
    }
    const elapsedSeconds = (last.timeMs - first.timeMs) / 1000;
    const totalDuration = this.samples.reduce(
      (sum, sample) => sum + sample.durationMs,
      0,
    );
    return {
      fps: (this.samples.length - 1) / elapsedSeconds,
      averageMs: totalDuration / this.samples.length,
    };
  }
}
