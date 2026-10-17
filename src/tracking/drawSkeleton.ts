import { HAND_CONNECTIONS, type TrackedHand } from './handTracker';

export function clearCanvas(canvas: HTMLCanvasElement): void {
  canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
}

export function drawSkeleton(
  canvas: HTMLCanvasElement,
  hands: TrackedHand[],
): void {
  const context = canvas.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.lineWidth = 3;
  context.strokeStyle = '#ffffff';
  context.fillStyle = '#ffd400';

  for (const hand of hands) {
    for (const { start, end } of HAND_CONNECTIONS) {
      const from = hand.landmarks[start];
      const to = hand.landmarks[end];
      if (!from || !to) continue;
      context.beginPath();
      context.moveTo(from.x * canvas.width, from.y * canvas.height);
      context.lineTo(to.x * canvas.width, to.y * canvas.height);
      context.stroke();
    }
    for (const point of hand.landmarks) {
      context.beginPath();
      context.arc(
        point.x * canvas.width,
        point.y * canvas.height,
        4,
        0,
        Math.PI * 2,
      );
      context.fill();
    }
  }
}
