export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export const MIN_SCALE = 0.75;
export const MAX_SCALE = 3;

/** Strip on each side of the page that always counts as empty space. */
export const GRAB_MARGIN_PX = 64;
/** Least of the page that must stay on screen along each axis. */
export const MIN_VISIBLE_PX = 64;

function contains(rect: Rect, point: Point): boolean {
  return (
    point.x >= rect.left &&
    point.x <= rect.right &&
    point.y >= rect.top &&
    point.y <= rect.bottom
  );
}

function overlap(a: Rect, b: Rect): Rect {
  return {
    left: Math.max(a.left, b.left),
    top: Math.max(a.top, b.top),
    right: Math.min(a.right, b.right),
    bottom: Math.min(a.bottom, b.bottom),
  };
}

export interface HitLayout {
  /** The page as drawn, after any pan and zoom. */
  page: Rect;
  /** The block of text inside the page. */
  text: Rect;
  viewport: Rect;
}

/**
 * Whether a pinch here starts a pan. Margins and background count, and so do
 * the grab strips along the visible left and right edges of the page, which
 * keeps panning possible when the text fills the screen.
 */
export function isEmptySpace(point: Point, layout: HitLayout): boolean {
  if (!contains(layout.text, point)) return true;
  const visible = overlap(layout.page, layout.viewport);
  return (
    point.x - visible.left < GRAB_MARGIN_PX ||
    visible.right - point.x < GRAB_MARGIN_PX
  );
}

function clampAxis(
  offset: number,
  start: number,
  end: number,
  viewStart: number,
  viewEnd: number,
): number {
  const size = end - start;
  const need = Math.min(MIN_VISIBLE_PX, size, viewEnd - viewStart);
  const lowest = viewStart + need - end;
  const highest = viewEnd - need - start;
  return Math.min(highest, Math.max(lowest, offset));
}

/** Limits a pan so some of the page always stays on screen. */
export function clampPan(offset: Point, base: Rect, viewport: Rect): Point {
  return {
    x: clampAxis(
      offset.x,
      base.left,
      base.right,
      viewport.left,
      viewport.right,
    ),
    y: clampAxis(
      offset.y,
      base.top,
      base.bottom,
      viewport.top,
      viewport.bottom,
    ),
  };
}

export interface View {
  /** Pan offset in pixels, applied before the scale. */
  x: number;
  y: number;
  scale: number;
}

export const DEFAULT_VIEW: View = { x: 0, y: 0, scale: 1 };

/**
 * Multiplies the zoom by factor, kept within the limits, so the page point
 * under center stays put. origin is where the page's top left corner sits
 * with no pan applied.
 */
export function zoomAbout(
  view: View,
  factor: number,
  center: Point,
  origin: Point,
): View {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.scale * factor));
  const ratio = scale / view.scale;
  const fromOriginX = center.x - origin.x;
  const fromOriginY = center.y - origin.y;
  return {
    scale,
    x: fromOriginX - (fromOriginX - view.x) * ratio,
    y: fromOriginY - (fromOriginY - view.y) * ratio,
  };
}

export type PanMode = 'idle' | 'pan' | 'content';

/**
 * Remembers what a pinch started on. The mode is fixed at the start and kept
 * until release, even if the hand drifts onto text or back to empty space.
 */
export class PanSession {
  private current: PanMode = 'idle';

  get mode(): PanMode {
    return this.current;
  }

  start(onEmptySpace: boolean): void {
    this.current = onEmptySpace ? 'pan' : 'content';
  }

  /** The movement to apply, or null when this pinch is not a pan. */
  move(delta: Point): Point | null {
    return this.current === 'pan' ? delta : null;
  }

  end(): void {
    this.current = 'idle';
  }
}
