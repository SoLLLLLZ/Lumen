import { useEffect } from 'react';
import type { EventBus } from '../engine/eventBus';

/** Fraction of the screen moved by one Shift+arrow press. */
export const KEY_PAN_STEP = 0.05;
const IGNORED_TARGETS = 'button, input, select, textarea, a, label, summary';

const ARROWS: Record<string, { dx: number; dy: number }> = {
  ArrowLeft: { dx: -1, dy: 0 },
  ArrowRight: { dx: 1, dy: 0 },
  ArrowUp: { dx: 0, dy: -1 },
  ArrowDown: { dx: 0, dy: 1 },
};

/**
 * Sends the same events a hand does, so the reader has one code path.
 * Shift+arrows pan, and dragging the mouse pans from empty space.
 */
export function useKeyboardMouse(bus: EventBus): void {
  useEffect(() => {
    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    function onKeyDown(event: KeyboardEvent) {
      const arrow = ARROWS[event.key];
      const target = event.target as HTMLElement | null;
      if (!arrow || !event.shiftKey) return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (target && target.closest('input, select, textarea')) return;
      event.preventDefault();
      const timeMs = performance.now();
      // The screen's left edge is always empty space, so this always pans.
      bus.emit({ type: 'pinch-start', timeMs, x: 0, y: 0.5 });
      bus.emit({
        type: 'pan',
        timeMs,
        dx: arrow.dx * KEY_PAN_STEP,
        dy: arrow.dy * KEY_PAN_STEP,
      });
      bus.emit({ type: 'pinch-end', timeMs });
    }

    function onPointerDown(event: PointerEvent) {
      const target = event.target as HTMLElement | null;
      if (event.pointerType !== 'mouse' || event.button !== 0) return;
      if (target?.closest(IGNORED_TARGETS)) return;
      dragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
      bus.emit({
        type: 'pinch-start',
        timeMs: performance.now(),
        x: event.clientX / window.innerWidth,
        y: event.clientY / window.innerHeight,
      });
    }

    function onPointerMove(event: PointerEvent) {
      if (!dragging) return;
      bus.emit({
        type: 'pan',
        timeMs: performance.now(),
        dx: (event.clientX - lastX) / window.innerWidth,
        dy: (event.clientY - lastY) / window.innerHeight,
      });
      lastX = event.clientX;
      lastY = event.clientY;
    }

    function onPointerUp() {
      if (!dragging) return;
      dragging = false;
      bus.emit({ type: 'pinch-end', timeMs: performance.now() });
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [bus]);
}
