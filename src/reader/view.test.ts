import { describe, expect, it } from 'vitest';
import {
  clampPan,
  isEmptySpace,
  MAX_SCALE,
  MIN_SCALE,
  PanSession,
  zoomAbout,
  type HitLayout,
  type Rect,
} from './view';

const viewport: Rect = { left: 0, top: 0, right: 1000, bottom: 800 };
const layout: HitLayout = {
  page: { left: 100, top: 100, right: 900, bottom: 700 },
  text: { left: 120, top: 120, right: 880, bottom: 680 },
  viewport,
};

describe('isEmptySpace', () => {
  it('treats the background outside the page as empty', () => {
    expect(isEmptySpace({ x: 20, y: 400 }, layout)).toBe(true);
    expect(isEmptySpace({ x: 500, y: 20 }, layout)).toBe(true);
  });

  it('treats the padding around the text as empty', () => {
    expect(isEmptySpace({ x: 110, y: 400 }, layout)).toBe(true);
    expect(isEmptySpace({ x: 500, y: 110 }, layout)).toBe(true);
  });

  it('treats the middle of the text as not empty', () => {
    expect(isEmptySpace({ x: 500, y: 400 }, layout)).toBe(false);
  });

  it('counts a 64 px strip inside each side of the page as empty', () => {
    expect(isEmptySpace({ x: 100 + 63, y: 400 }, layout)).toBe(true);
    expect(isEmptySpace({ x: 100 + 65, y: 400 }, layout)).toBe(false);
    expect(isEmptySpace({ x: 900 - 63, y: 400 }, layout)).toBe(true);
    expect(isEmptySpace({ x: 900 - 65, y: 400 }, layout)).toBe(false);
  });

  it('keeps the strips on screen when the page is larger than the screen', () => {
    const zoomed: HitLayout = {
      page: { left: -500, top: -300, right: 1500, bottom: 1100 },
      text: { left: -450, top: -250, right: 1450, bottom: 1050 },
      viewport,
    };
    expect(isEmptySpace({ x: 30, y: 400 }, zoomed)).toBe(true);
    expect(isEmptySpace({ x: 970, y: 400 }, zoomed)).toBe(true);
    expect(isEmptySpace({ x: 500, y: 400 }, zoomed)).toBe(false);
  });
});

describe('clampPan', () => {
  const base: Rect = { left: 100, top: 100, right: 900, bottom: 700 };

  it('leaves a pan that keeps the page on screen alone', () => {
    expect(clampPan({ x: 50, y: -40 }, base, viewport)).toEqual({
      x: 50,
      y: -40,
    });
  });

  it('keeps 64 px of the page on screen at every side', () => {
    expect(clampPan({ x: 5000, y: 5000 }, base, viewport)).toEqual({
      x: 1000 - 64 - 100,
      y: 800 - 64 - 100,
    });
    expect(clampPan({ x: -5000, y: -5000 }, base, viewport)).toEqual({
      x: 64 - 900,
      y: 64 - 700,
    });
  });

  it('works for a page larger than the screen', () => {
    const big: Rect = { left: -500, top: -300, right: 1500, bottom: 1100 };
    const farLeft = clampPan({ x: -5000, y: 0 }, big, viewport);
    expect(1500 + farLeft.x).toBe(64);
  });
});

describe('PanSession', () => {
  it('ignores movement until a pinch has started', () => {
    expect(new PanSession().move({ x: 1, y: 1 })).toBeNull();
  });

  it('passes movement through after a pinch on empty space', () => {
    const session = new PanSession();
    session.start(true);
    expect(session.move({ x: 1, y: 2 })).toEqual({ x: 1, y: 2 });
  });

  it('never pans a pinch that started on text', () => {
    const session = new PanSession();
    session.start(false);
    expect(session.mode).toBe('content');
    expect(session.move({ x: 1, y: 2 })).toBeNull();
  });

  it('forgets the mode when the pinch ends', () => {
    const session = new PanSession();
    session.start(true);
    session.end();
    expect(session.mode).toBe('idle');
    expect(session.move({ x: 1, y: 2 })).toBeNull();
  });
});

describe('zoomAbout', () => {
  const origin = { x: 100, y: 50 };
  const start = { x: 0, y: 0, scale: 1 };

  it('multiplies the scale', () => {
    expect(zoomAbout(start, 2, origin, origin).scale).toBe(2);
  });

  it('stops at the zoom limits', () => {
    expect(MAX_SCALE).toBe(3);
    expect(MIN_SCALE).toBe(0.75);
    expect(zoomAbout(start, 100, origin, origin).scale).toBe(3);
    expect(zoomAbout(start, 0.001, origin, origin).scale).toBe(0.75);
    const atMax = { ...start, scale: MAX_SCALE };
    expect(zoomAbout(atMax, 2, origin, origin)).toEqual(atMax);
  });

  it('keeps the point under the fingertips fixed', () => {
    const center = { x: 400, y: 300 };
    const view = { x: 20, y: -10, scale: 1.5 };
    const next = zoomAbout(view, 2, center, origin);
    // A page point under the center before zooming.
    const pagePoint = {
      x: (center.x - origin.x - view.x) / view.scale,
      y: (center.y - origin.y - view.y) / view.scale,
    };
    expect(origin.x + next.x + pagePoint.x * next.scale).toBeCloseTo(center.x);
    expect(origin.y + next.y + pagePoint.y * next.scale).toBeCloseTo(center.y);
  });

  it('leaves the page where it is when zooming about its corner', () => {
    expect(zoomAbout(start, 2, origin, origin)).toEqual({
      x: 0,
      y: 0,
      scale: 2,
    });
  });
});
