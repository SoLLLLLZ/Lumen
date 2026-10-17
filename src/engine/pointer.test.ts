import { describe, expect, it } from 'vitest';
import { mapToScreen } from './pointer';

describe('mapToScreen', () => {
  const zone = 0.6;

  it('maps the image center to the screen center', () => {
    const point = mapToScreen({ x: 0.5, y: 0.5 }, zone);
    expect(point.x).toBeCloseTo(0.5, 10);
    expect(point.y).toBeCloseTo(0.5, 10);
  });

  it('maps the zone corners to the screen corners, mirrored in x', () => {
    const topLeft = mapToScreen({ x: 0.2, y: 0.2 }, zone);
    expect(topLeft.x).toBeCloseTo(1, 10);
    expect(topLeft.y).toBeCloseTo(0, 10);
    const bottomRight = mapToScreen({ x: 0.8, y: 0.8 }, zone);
    expect(bottomRight.x).toBeCloseTo(0, 10);
    expect(bottomRight.y).toBeCloseTo(1, 10);
  });

  it('maps the other two corners', () => {
    const topRight = mapToScreen({ x: 0.8, y: 0.2 }, zone);
    expect(topRight.x).toBeCloseTo(0, 10);
    expect(topRight.y).toBeCloseTo(0, 10);
    const bottomLeft = mapToScreen({ x: 0.2, y: 0.8 }, zone);
    expect(bottomLeft.x).toBeCloseTo(1, 10);
    expect(bottomLeft.y).toBeCloseTo(1, 10);
  });

  it('stops at the screen edge outside the zone', () => {
    expect(mapToScreen({ x: 0, y: 0 }, zone)).toEqual({ x: 1, y: 0 });
    expect(mapToScreen({ x: 1, y: 1 }, zone)).toEqual({ x: 0, y: 1 });
  });

  it('follows the zone size', () => {
    expect(mapToScreen({ x: 0, y: 0 }, 1)).toEqual({ x: 1, y: 0 });
    const half = mapToScreen({ x: 0.5, y: 0.25 }, 0.5);
    expect(half.x).toBeCloseTo(0.5, 10);
    expect(half.y).toBeCloseTo(0, 10);
  });
});
