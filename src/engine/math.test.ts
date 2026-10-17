import { describe, expect, it } from 'vitest';
import { clamp } from './math';

describe('clamp', () => {
  it('keeps values inside the range unchanged', () => {
    expect(clamp(1.5, 0.75, 3)).toBe(1.5);
  });

  it('limits values below the minimum', () => {
    expect(clamp(0.1, 0.75, 3)).toBe(0.75);
  });

  it('limits values above the maximum', () => {
    expect(clamp(10, 0.75, 3)).toBe(3);
  });
});
