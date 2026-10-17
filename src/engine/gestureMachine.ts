import type { EventBus } from './eventBus';
import type { HandState } from './handPoseEngine';
import type { Pose } from './types';

export type GestureState = 'asleep' | 'armed';

export interface MachineConfig {
  /** Open palm held this long wakes the system. */
  wakeHoldMs: number;
  /** Fist held this long puts it to sleep. */
  sleepFistHoldMs: number;
  /** No hand visible this long puts it to sleep. */
  noHandSleepMs: number;
}

export const DEFAULT_MACHINE_CONFIG: MachineConfig = {
  wakeHoldMs: 700,
  sleepFistHoldMs: 1000,
  noHandSleepMs: 3000,
};

type MachineHand = Pick<HandState, 'id' | 'pose'>;

interface ActiveHold {
  handId: number;
  pose: Pose;
  sinceMs: number;
  done: boolean;
}

/**
 * Turns pose frames into wake and sleep events.
 * Only one hold is tracked at a time. It stays locked, even after it has
 * fired, until that hand changes pose or leaves, so one gesture cannot fire
 * twice and a second hand cannot start another gesture meanwhile.
 */
export class GestureMachine {
  private current: GestureState = 'asleep';
  private hold: ActiveHold | null = null;
  private lastHandSeenMs = 0;

  constructor(
    private readonly bus: EventBus,
    private readonly config: MachineConfig = DEFAULT_MACHINE_CONFIG,
  ) {}

  get state(): GestureState {
    return this.current;
  }

  update(timeMs: number, hands: MachineHand[]): void {
    if (hands.length > 0) this.lastHandSeenMs = timeMs;

    if (this.hold) {
      const hold = this.hold;
      const stillHeld = hands.some(
        (hand) => hand.id === hold.handId && hand.pose === hold.pose,
      );
      if (!stillHeld) this.hold = null;
    }

    if (!this.hold) this.hold = this.startHold(timeMs, hands);
    if (this.hold && !this.hold.done) this.finishHold(timeMs, this.hold);

    if (
      this.current === 'armed' &&
      hands.length === 0 &&
      timeMs - this.lastHandSeenMs >= this.config.noHandSleepMs
    ) {
      this.goToSleep(timeMs, 'no-hand');
    }
  }

  private wantedPose(): Pose {
    return this.current === 'asleep' ? 'open_palm' : 'fist';
  }

  private startHold(timeMs: number, hands: MachineHand[]): ActiveHold | null {
    const wanted = this.wantedPose();
    const hand = hands
      .filter((candidate) => candidate.pose === wanted)
      .sort((a, b) => a.id - b.id)[0];
    if (!hand) return null;
    return { handId: hand.id, pose: wanted, sinceMs: timeMs, done: false };
  }

  private finishHold(timeMs: number, hold: ActiveHold): void {
    const heldMs = timeMs - hold.sinceMs;
    if (this.current === 'asleep' && heldMs >= this.config.wakeHoldMs) {
      hold.done = true;
      this.current = 'armed';
      this.lastHandSeenMs = timeMs;
      this.bus.emit({ type: 'wake', timeMs });
    } else if (
      this.current === 'armed' &&
      heldMs >= this.config.sleepFistHoldMs
    ) {
      hold.done = true;
      this.goToSleep(timeMs, 'fist');
    }
  }

  private goToSleep(timeMs: number, reason: 'fist' | 'no-hand'): void {
    this.current = 'asleep';
    this.bus.emit({ type: 'sleep', timeMs, reason });
  }
}
