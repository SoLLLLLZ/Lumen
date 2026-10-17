export type GestureEvent =
  | { type: 'wake'; timeMs: number }
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
