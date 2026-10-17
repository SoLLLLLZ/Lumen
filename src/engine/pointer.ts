export interface ScreenPoint {
  x: number;
  y: number;
}

export const DEFAULT_ACTIVE_ZONE = 0.6;
export const MIN_ACTIVE_ZONE = 0.3;
export const MAX_ACTIVE_ZONE = 1;

function unit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Like mapToScreen, but a point outside the zone lands off screen. */
export function mapToScreenUnclamped(
  point: ScreenPoint,
  zoneSize: number,
): ScreenPoint {
  const margin = (1 - zoneSize) / 2;
  return {
    x: 1 - (point.x - margin) / zoneSize,
    y: (point.y - margin) / zoneSize,
  };
}

/**
 * Maps a point in the camera image (0 to 1 on each axis) to the screen.
 * Only the central zoneSize of the image is used, so the hand never has to
 * reach the camera edge. The x axis is mirrored to match the mirrored video.
 */
export function mapToScreen(point: ScreenPoint, zoneSize: number): ScreenPoint {
  const mapped = mapToScreenUnclamped(point, zoneSize);
  return { x: unit(mapped.x), y: unit(mapped.y) };
}
