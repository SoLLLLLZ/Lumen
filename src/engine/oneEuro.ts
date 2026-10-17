import { LANDMARK_COUNT, type Landmark } from './types';

export interface OneEuroParams {
  /** Lower removes more jitter at rest but adds lag. Hz. */
  minCutoff: number;
  /** Higher lets fast motion through with less lag. */
  beta: number;
  /** Cutoff for the speed estimate. Hz. */
  dCutoff: number;
}

export const DEFAULT_ONE_EURO: OneEuroParams = {
  minCutoff: 1.5,
  beta: 10,
  dCutoff: 1,
};

function smoothingFactor(cutoffHz: number, dtSeconds: number): number {
  const tau = 1 / (2 * Math.PI * cutoffHz);
  return 1 / (1 + tau / dtSeconds);
}

export class OneEuroFilter {
  private value: number | undefined;
  private speed = 0;
  private lastTimeMs = 0;

  constructor(private readonly params: OneEuroParams = DEFAULT_ONE_EURO) {}

  filter(raw: number, timeMs: number): number {
    if (this.value === undefined) {
      this.value = raw;
      this.lastTimeMs = timeMs;
      return raw;
    }
    const dt = Math.max((timeMs - this.lastTimeMs) / 1000, 1e-3);
    this.lastTimeMs = timeMs;

    const rawSpeed = (raw - this.value) / dt;
    const speedAlpha = smoothingFactor(this.params.dCutoff, dt);
    this.speed += speedAlpha * (rawSpeed - this.speed);

    const cutoff =
      this.params.minCutoff + this.params.beta * Math.abs(this.speed);
    const alpha = smoothingFactor(cutoff, dt);
    this.value += alpha * (raw - this.value);
    return this.value;
  }

  reset(): void {
    this.value = undefined;
    this.speed = 0;
  }
}

/** One filter per coordinate of one hand. */
export class LandmarkSmoother {
  private readonly filters: OneEuroFilter[];

  constructor(params: OneEuroParams = DEFAULT_ONE_EURO) {
    this.filters = Array.from(
      { length: LANDMARK_COUNT * 2 },
      () => new OneEuroFilter(params),
    );
  }

  smooth(landmarks: Landmark[], timeMs: number): Landmark[] {
    return landmarks.map((point, index) => ({
      x: this.filters[index * 2]?.filter(point.x, timeMs) ?? point.x,
      y: this.filters[index * 2 + 1]?.filter(point.y, timeMs) ?? point.y,
    }));
  }

  reset(): void {
    for (const filter of this.filters) filter.reset();
  }
}
