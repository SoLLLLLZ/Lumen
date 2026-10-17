import { describe, expect, it } from 'vitest';
import { OneEuroFilter } from './oneEuro';

function noise(index: number): number {
  // Deterministic jitter between -1 and 1.
  return Math.sin(index * 12.9898) * 0.5 + Math.sin(index * 78.233) * 0.5;
}

function variance(values: number[]): number {
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  return values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
}

describe('OneEuroFilter', () => {
  it('returns the first value unchanged', () => {
    expect(new OneEuroFilter().filter(0.42, 0)).toBe(0.42);
  });

  it('damps jitter on a still hand', () => {
    const filter = new OneEuroFilter();
    const raw: number[] = [];
    const smooth: number[] = [];
    for (let i = 0; i < 120; i++) {
      const value = 0.5 + noise(i) * 0.004;
      raw.push(value);
      smooth.push(filter.filter(value, i * 33));
    }
    expect(variance(smooth.slice(30))).toBeLessThan(
      variance(raw.slice(30)) * 0.25,
    );
  });

  it('follows fast motion with little lag', () => {
    const filter = new OneEuroFilter();
    // A flick: 2 image widths per second.
    let lastRaw = 0;
    let lastSmooth = 0;
    for (let i = 0; i < 20; i++) {
      lastRaw = i * 0.0667;
      lastSmooth = filter.filter(lastRaw, i * 33);
    }
    expect(lastRaw - lastSmooth).toBeLessThan(0.02);
  });

  it('lags less than a fixed slow filter on fast motion', () => {
    const adaptive = new OneEuroFilter();
    const fixed = new OneEuroFilter({ minCutoff: 1.5, beta: 0, dCutoff: 1 });
    let adaptiveValue = 0;
    let fixedValue = 0;
    for (let i = 0; i < 20; i++) {
      adaptiveValue = adaptive.filter(i * 0.0667, i * 33);
      fixedValue = fixed.filter(i * 0.0667, i * 33);
    }
    expect(adaptiveValue).toBeGreaterThan(fixedValue);
  });

  it('starts fresh after reset', () => {
    const filter = new OneEuroFilter();
    filter.filter(0.1, 0);
    filter.reset();
    expect(filter.filter(0.9, 1000)).toBe(0.9);
  });
});
