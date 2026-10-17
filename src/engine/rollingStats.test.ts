import { describe, expect, it } from 'vitest';
import { RollingStats } from './rollingStats';

describe('RollingStats', () => {
  it('reports zero before any frames arrive', () => {
    expect(new RollingStats(1000).snapshot()).toEqual({ fps: 0, averageMs: 0 });
  });

  it('computes frame rate from frame spacing', () => {
    const stats = new RollingStats(2000);
    for (let frame = 0; frame < 31; frame++) {
      stats.record(frame * 40, 10);
    }
    expect(stats.snapshot().fps).toBeCloseTo(25, 5);
  });

  it('averages the processing time', () => {
    const stats = new RollingStats(1000);
    stats.record(0, 10);
    stats.record(40, 20);
    stats.record(80, 30);
    expect(stats.snapshot().averageMs).toBe(20);
  });

  it('forgets frames older than the window', () => {
    const stats = new RollingStats(1000);
    for (let frame = 0; frame < 10; frame++) {
      stats.record(frame * 100, 50);
    }
    stats.record(5000, 5);
    stats.record(5100, 5);
    const snapshot = stats.snapshot();
    expect(snapshot.fps).toBeCloseTo(10, 5);
    expect(snapshot.averageMs).toBe(5);
  });
});
