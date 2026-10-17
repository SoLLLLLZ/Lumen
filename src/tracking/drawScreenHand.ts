import { mapToScreenUnclamped } from '../engine/pointer';
import type { HandState } from '../engine/handPoseEngine';
import { HAND_CONNECTIONS } from './handTracker';

const LINE_COLOR = 'rgba(30, 110, 255, 0.45)';
const JOINT_COLOR = 'rgba(30, 110, 255, 0.55)';
const POINTER_COLOR = 'rgba(255, 140, 0, 0.8)';

/** Sizes the canvas to the window in device pixels and returns the scale. */
export function fitToWindow(canvas: HTMLCanvasElement): number {
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.round(window.innerWidth * scale);
  canvas.height = Math.round(window.innerHeight * scale);
  return scale;
}

/** Draws each hand where the gestures will act on the page. */
export function drawScreenHand(
  canvas: HTMLCanvasElement,
  hands: HandState[],
  activeZone: number,
): void {
  const context = canvas.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  const toPixels = (point: { x: number; y: number }) => {
    const mapped = mapToScreenUnclamped(point, activeZone);
    return { x: mapped.x * canvas.width, y: mapped.y * canvas.height };
  };
  const unit = canvas.width / window.innerWidth;

  context.lineWidth = 2 * unit;
  context.strokeStyle = LINE_COLOR;
  context.fillStyle = JOINT_COLOR;
  for (const hand of hands) {
    for (const { start, end } of HAND_CONNECTIONS) {
      const from = hand.landmarks[start];
      const to = hand.landmarks[end];
      if (!from || !to) continue;
      const a = toPixels(from);
      const b = toPixels(to);
      context.beginPath();
      context.moveTo(a.x, a.y);
      context.lineTo(b.x, b.y);
      context.stroke();
    }
    for (const point of hand.landmarks) {
      const spot = toPixels(point);
      context.beginPath();
      context.arc(spot.x, spot.y, 3 * unit, 0, Math.PI * 2);
      context.fill();
    }
    const pointer = toPixels(hand.pointer);
    context.strokeStyle = POINTER_COLOR;
    context.lineWidth = 3 * unit;
    context.beginPath();
    context.arc(pointer.x, pointer.y, 9 * unit, 0, Math.PI * 2);
    context.stroke();
    context.strokeStyle = LINE_COLOR;
    context.lineWidth = 2 * unit;
  }
}
