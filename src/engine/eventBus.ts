/**
 * Positions and movements are fractions of the screen width and height.
 * A zoom factor multiplies the current zoom around the point x, y.
 */
export type GestureEvent =
  | { type: 'wake'; timeMs: number }
  | { type: 'next'; timeMs: number }
  | { type: 'previous'; timeMs: number }
  | { type: 'pinch-start'; timeMs: number; x: number; y: number }
  | { type: 'pan'; timeMs: number; dx: number; dy: number }
  | { type: 'pinch-end'; timeMs: number }
  | { type: 'zoom'; timeMs: number; factor: number; x: number; y: number }
  | { type: 'reset-view'; timeMs: number }
  | { type: 'sleep'; timeMs: number; reason: 'fist' | 'no-hand' };

type Handler = (event: GestureEvent) => void;

export class EventBus {
  private readonly handlers = new Set<Handler>();

  subscribe(handler: Handler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  emit(event: GestureEvent): void {
    for (const handler of [...this.handlers]) handler(event);
  }
}
