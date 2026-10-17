import { describe, expect, it } from 'vitest';
import { EventBus, type GestureEvent } from './eventBus';
import { GestureMachine } from './gestureMachine';
import type { Pose } from './types';

type Hand = { id: number; pose: Pose };
const FRAME_MS = 33;

function setup() {
  const bus = new EventBus();
  const events: GestureEvent[] = [];
  bus.subscribe((event) => events.push(event));
  const machine = new GestureMachine(bus);
  let now = 0;
  /** Feeds the same hands for durationMs of frames. */
  function hold(hands: Hand[], durationMs: number) {
    const end = now + durationMs;
    while (now < end) {
      machine.update(now, hands);
      now += FRAME_MS;
    }
  }
  return { machine, events, hold, clock: () => now };
}

const palm = (id = 0): Hand => ({ id, pose: 'open_palm' });
const fist = (id = 0): Hand => ({ id, pose: 'fist' });

describe('GestureMachine', () => {
  it('starts asleep and ignores everything but a held open palm', () => {
    const { machine, events, hold } = setup();
    hold([fist()], 3000);
    hold([{ id: 0, pose: 'v' }], 3000);
    hold([{ id: 0, pose: 'pinch' }], 3000);
    hold([], 5000);
    expect(machine.state).toBe('asleep');
    expect(events).toEqual([]);
  });

  it('wakes once after the open palm has been held 0.7 s', () => {
    const { machine, events, hold } = setup();
    hold([palm()], 660);
    expect(events).toEqual([]);
    hold([palm()], 200);
    expect(machine.state).toBe('armed');
    expect(events).toHaveLength(1);
    const wake = events[0];
    expect(wake?.type).toBe('wake');
    expect(wake?.timeMs).toBeGreaterThanOrEqual(700);
    expect(wake?.timeMs).toBeLessThan(740);
  });

  it('does not wake on a palm held less than 0.7 s', () => {
    const { machine, events, hold } = setup();
    hold([palm()], 600);
    hold([], 100);
    hold([palm()], 600);
    expect(machine.state).toBe('asleep');
    expect(events).toEqual([]);
  });

  it('does not wake when the palm is interrupted by another pose', () => {
    const { events, hold } = setup();
    hold([palm()], 500);
    hold([{ id: 0, pose: 'none' }], 33);
    hold([palm()], 500);
    expect(events).toEqual([]);
  });

  it('does not wake again while the same palm stays up', () => {
    const { events, hold } = setup();
    hold([palm()], 5000);
    expect(events.map((e) => e.type)).toEqual(['wake']);
  });

  it('sleeps once after a fist held 1 s while armed', () => {
    const { machine, events, hold } = setup();
    hold([palm()], 800);
    hold([fist()], 960);
    expect(machine.state).toBe('armed');
    hold([fist()], 100);
    expect(machine.state).toBe('asleep');
    expect(events.map((e) => e.type)).toEqual(['wake', 'sleep']);
    expect(events[1]).toMatchObject({ type: 'sleep', reason: 'fist' });
    hold([fist()], 3000);
    expect(events).toHaveLength(2);
  });

  it('does not sleep on a fist held less than 1 s', () => {
    const { machine, hold } = setup();
    hold([palm()], 800);
    hold([fist()], 900);
    hold([palm()], 100);
    hold([fist()], 900);
    expect(machine.state).toBe('armed');
  });

  it('sleeps after 3 s with no hand, not before', () => {
    const { machine, events, hold } = setup();
    hold([palm()], 800);
    hold([], 2900);
    expect(machine.state).toBe('armed');
    hold([], 200);
    expect(machine.state).toBe('asleep');
    expect(events[1]).toMatchObject({ type: 'sleep', reason: 'no-hand' });
  });

  it('keeps the no-hand timer from the moment a hand was last seen', () => {
    const { machine, hold } = setup();
    hold([palm()], 800);
    hold([], 2000);
    hold([{ id: 0, pose: 'none' }], 100);
    hold([], 2900);
    expect(machine.state).toBe('armed');
  });

  it('can wake again after sleeping', () => {
    const { events, hold } = setup();
    hold([palm()], 800);
    hold([fist()], 1100);
    hold([], 200);
    hold([palm()], 800);
    expect(events.map((e) => e.type)).toEqual(['wake', 'sleep', 'wake']);
  });

  it('wakes again from a palm held up through a fist sleep only after releasing it', () => {
    const { events, hold } = setup();
    hold([palm()], 800);
    hold([fist()], 1100);
    // Still showing the fist: nothing more can happen until it changes.
    hold([fist()], 2000);
    expect(events.map((e) => e.type)).toEqual(['wake', 'sleep']);
  });

  describe('one gesture at a time', () => {
    it('lets only one of two open palms wake the system', () => {
      const { events, hold } = setup();
      hold([palm(0), palm(1)], 3000);
      expect(events.map((e) => e.type)).toEqual(['wake']);
    });

    it('times a fist from the first hand, not from a second hand joining later', () => {
      const { events, hold, clock } = setup();
      hold([palm(0)], 800);
      const fistStart = clock();
      hold([fist(0)], 600);
      hold([fist(0), fist(1)], 500);
      expect(events.map((e) => e.type)).toEqual(['wake', 'sleep']);
      // Sleep came 1 s after hand 0 began, well before hand 1 had held 1 s.
      expect((events[1]?.timeMs ?? 0) - fistStart).toBeLessThan(1050);
    });

    it('does not count a fist time carried over from the other hand', () => {
      const { machine, hold } = setup();
      hold([palm(0)], 800);
      hold([fist(0), palm(1)], 500);
      hold([palm(0), fist(1)], 700);
      // Neither fist was held for a full second by one hand.
      expect(machine.state).toBe('armed');
    });
  });
});
