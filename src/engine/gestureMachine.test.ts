import { describe, expect, it } from 'vitest';
import { EventBus, type GestureEvent } from './eventBus';
import { GestureMachine } from './gestureMachine';
import type { PalmPoint } from './measurements';
import type { Pose } from './types';

type Hand = {
  id: number;
  pose: Pose;
  palm: PalmPoint;
  pointer?: { x: number; y: number };
};
const STILL_PALM: PalmPoint = { x: 0.5, y: 0.5, size: 0.2 };
const FRAME_MS = 33;

const CENTER = { x: 0.5, y: 0.5 };

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
      machine.update(
        now,
        hands.map((hand) => ({ pointer: CENTER, ...hand })),
      );
      now += FRAME_MS;
    }
  }
  return { machine, events, hold, clock: () => now };
}

const palm = (id = 0): Hand => ({ id, pose: 'open_palm', palm: STILL_PALM });
const fist = (id = 0): Hand => ({ id, pose: 'fist', palm: STILL_PALM });

describe('GestureMachine', () => {
  it('starts asleep and ignores everything but a held open palm', () => {
    const { machine, events, hold } = setup();
    hold([fist()], 3000);
    hold([{ id: 0, pose: 'v', palm: STILL_PALM }], 3000);
    hold([{ id: 0, pose: 'pinch', palm: STILL_PALM }], 3000);
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
    hold([{ id: 0, pose: 'none', palm: STILL_PALM }], 33);
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
    hold([{ id: 0, pose: 'none', palm: STILL_PALM }], 100);
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

  describe('flicks', () => {
    /** Moves one open palm sideways over durationMs. */
    function flickHand(
      sim: ReturnType<typeof setup>,
      dx: number,
      durationMs = 200,
      id = 0,
    ) {
      const frames = Math.round(durationMs / FRAME_MS);
      for (let i = 0; i <= frames; i++) {
        sim.hold(
          [
            {
              id,
              pose: 'open_palm',
              palm: { x: 0.5 + (dx * i) / frames, y: 0.5, size: 0.2 },
            },
          ],
          FRAME_MS,
        );
      }
    }
    const next = (events: GestureEvent[]) => events.map((event) => event.type);

    it('ignores flicks while asleep', () => {
      const sim = setup();
      flickHand(sim, 0.5);
      expect(next(sim.events)).toEqual([]);
    });

    it('emits next for a rightward flick and previous for a leftward one', () => {
      const sim = setup();
      sim.hold([palm()], 900);
      flickHand(sim, 0.5);
      sim.hold([palm()], 800);
      flickHand(sim, -0.5);
      expect(next(sim.events)).toEqual(['wake', 'next', 'previous']);
    });

    it('does not turn the page on the return stroke', () => {
      const sim = setup();
      sim.hold([palm()], 900);
      flickHand(sim, 0.5);
      flickHand(sim, -0.5);
      expect(next(sim.events)).toEqual(['wake', 'next']);
    });

    it('ignores a flick made with a hand that is not an open palm', () => {
      const sim = setup();
      sim.hold([palm()], 900);
      for (let i = 0; i <= 6; i++) {
        sim.hold(
          [
            {
              id: 0,
              pose: 'v',
              palm: { x: 0.2 + i * 0.08, y: 0.5, size: 0.2 },
            },
          ],
          FRAME_MS,
        );
      }
      expect(next(sim.events)).toEqual(['wake']);
    });

    it('never runs a flick while a fist is being held for sleep', () => {
      const sim = setup();
      sim.hold([palm()], 900);
      sim.hold([fist(0)], 300);
      const frames = 6;
      for (let i = 0; i <= frames; i++) {
        const moving: Hand = {
          id: 1,
          pose: 'open_palm',
          palm: { x: 0.2 + (0.5 * i) / frames, y: 0.5, size: 0.2 },
        };
        sim.hold([fist(0), moving], FRAME_MS);
      }
      expect(next(sim.events)).toEqual(['wake']);
    });

    it('does not start a sleep fist during the flick lockout', () => {
      const sim = setup();
      sim.hold([palm()], 900);
      flickHand(sim, 0.5);
      sim.hold([fist()], 1700);
      // The fist hold only begins once the 400 ms lockout is over.
      expect(next(sim.events)).toEqual(['wake', 'next', 'sleep']);
      const sleep = sim.events[2];
      expect(sleep?.timeMs).toBeGreaterThanOrEqual(
        (sim.events[1]?.timeMs ?? 0) + 400 + 1000,
      );
    });

    it('does not flick after going back to sleep', () => {
      const sim = setup();
      sim.hold([palm()], 900);
      sim.hold([fist()], 1200);
      flickHand(sim, 0.5);
      expect(next(sim.events)).toEqual(['wake', 'sleep']);
    });

    it('lets two hands produce only one flick event', () => {
      const sim = setup();
      sim.hold([palm()], 900);
      const frames = 6;
      for (let i = 0; i <= frames; i++) {
        const x = 0.2 + (0.5 * i) / frames;
        sim.hold(
          [
            { id: 0, pose: 'open_palm', palm: { x, y: 0.5, size: 0.2 } },
            { id: 1, pose: 'open_palm', palm: { x, y: 0.5, size: 0.2 } },
          ],
          FRAME_MS,
        );
      }
      expect(next(sim.events)).toEqual(['wake', 'next']);
    });
  });

  describe('pinch and pan', () => {
    const pinchAt = (x: number, y = 0.5, id = 0): Hand => ({
      id,
      pose: 'pinch',
      palm: STILL_PALM,
      pointer: { x, y },
    });
    const types = (events: GestureEvent[]) => events.map((e) => e.type);

    it('ignores a pinch while asleep', () => {
      const sim = setup();
      sim.hold([pinchAt(0.4)], 500);
      sim.hold([pinchAt(0.6)], 500);
      expect(sim.events).toEqual([]);
    });

    it('starts a pinch where the hand is, mirrored onto the screen', () => {
      const sim = setup();
      sim.hold([palm()], 900);
      sim.hold([pinchAt(0.2, 0.35)], 100);
      const start = sim.events.find((e) => e.type === 'pinch-start');
      // Zone is 0.2 to 0.8 of the image: x 0.2 is the zone edge, mirrored to 1.
      expect(start).toMatchObject({ x: 1, y: expect.closeTo(0.25, 10) });
    });

    it('pans by the change in mapped position and ends on release', () => {
      const sim = setup();
      sim.hold([palm()], 900);
      sim.hold([pinchAt(0.5)], FRAME_MS);
      sim.hold([pinchAt(0.4)], FRAME_MS);
      sim.hold([pinchAt(0.4, 0.6)], FRAME_MS);
      sim.hold([palm()], FRAME_MS);
      expect(types(sim.events)).toEqual([
        'wake',
        'pinch-start',
        'pan',
        'pan',
        'pinch-end',
      ]);
      const pans = sim.events.filter((e) => e.type === 'pan');
      // Hand moved left in the image by 0.1 = 1/6 of the zone; mirrored, that is rightward.
      expect(pans[0]).toMatchObject({ dx: expect.closeTo(1 / 6, 5), dy: 0 });
      expect(pans[1]).toMatchObject({ dx: 0, dy: expect.closeTo(1 / 6, 5) });
    });

    it('emits no pan while the pinch is still', () => {
      const sim = setup();
      sim.hold([palm()], 900);
      sim.hold([pinchAt(0.5)], 500);
      expect(types(sim.events)).toEqual(['wake', 'pinch-start']);
    });

    it('does not sleep from a pinch held for over a second', () => {
      const sim = setup();
      sim.hold([palm()], 900);
      sim.hold([pinchAt(0.5)], 2500);
      expect(sim.machine.state).toBe('armed');
    });

    it('ends the pinch when the hand leaves', () => {
      const sim = setup();
      sim.hold([palm()], 900);
      sim.hold([pinchAt(0.5)], 200);
      sim.hold([], FRAME_MS);
      expect(types(sim.events)).toEqual(['wake', 'pinch-start', 'pinch-end']);
    });

    it('lets a second hand neither pan nor start a gesture meanwhile', () => {
      const sim = setup();
      sim.hold([palm()], 900);
      sim.hold([pinchAt(0.5, 0.5, 0), pinchAt(0.3, 0.5, 1)], 300);
      sim.hold([pinchAt(0.5, 0.5, 0), pinchAt(0.7, 0.5, 1)], 300);
      expect(types(sim.events)).toEqual(['wake', 'pinch-start']);
    });

    it('never flicks while a pinch is held', () => {
      const sim = setup();
      sim.hold([palm(0)], 900);
      sim.hold([pinchAt(0.5, 0.5, 0)], 100);
      for (let i = 0; i <= 6; i++) {
        sim.hold(
          [
            pinchAt(0.5, 0.5, 0),
            {
              id: 1,
              pose: 'open_palm',
              palm: { x: 0.2 + (0.5 * i) / 6, y: 0.5, size: 0.2 },
            },
          ],
          FRAME_MS,
        );
      }
      expect(types(sim.events)).toEqual(['wake', 'pinch-start']);
    });

    it('uses the adjusted zone size', () => {
      const sim = setup();
      sim.machine.setActiveZone(1);
      sim.hold([palm()], 900);
      sim.hold([pinchAt(0.25)], 100);
      const start = sim.events.find((e) => e.type === 'pinch-start');
      expect(start).toMatchObject({ x: expect.closeTo(0.75, 10) });
    });
  });
});
