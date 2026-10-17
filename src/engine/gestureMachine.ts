import type { EventBus } from './eventBus';
import { FlickDetector } from './flickDetector';
import type { HandState } from './handPoseEngine';
import { mapToScreen, DEFAULT_ACTIVE_ZONE, type ScreenPoint } from './pointer';
import type { Pose } from './types';

export type GestureState = 'asleep' | 'armed';

export interface MachineConfig {
  /** Open palm held this long wakes the system. */
  wakeHoldMs: number;
  /** Fist held this long puts it to sleep. */
  sleepFistHoldMs: number;
  /** No hand visible this long puts it to sleep. */
  noHandSleepMs: number;
  /** A pinch shorter than this, barely moving, is a tap. */
  tapMaxMs: number;
  /** Two taps this close together reset the view. */
  doubleTapMs: number;
}

export const DEFAULT_MACHINE_CONFIG: MachineConfig = {
  wakeHoldMs: 700,
  sleepFistHoldMs: 1000,
  noHandSleepMs: 3000,
  tapMaxMs: 400,
  doubleTapMs: 600,
};

/** Most a tap may move, as a fraction of the screen. */
const TAP_TRAVEL = 0.05;

type MachineHand = Pick<
  HandState,
  'id' | 'pose' | 'palm' | 'pointer' | 'pinchRatio'
>;

interface ActiveHold {
  handId: number;
  pose: Pose;
  sinceMs: number;
  done: boolean;
  /** Where a pinch was last seen on screen. */
  lastPoint?: ScreenPoint;
  /** Total distance moved by a pinch, in screen fractions. */
  travel: number;
  lastPalm?: { x: number; y: number };
  /** Thumb to index gap during a V, as a fraction of hand width. */
  lastSpread?: number;
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
  private readonly flicks = new FlickDetector();
  private activeZone = DEFAULT_ACTIVE_ZONE;
  private lastTapEndMs = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly bus: EventBus,
    private readonly config: MachineConfig = DEFAULT_MACHINE_CONFIG,
  ) {}

  get state(): GestureState {
    return this.current;
  }

  /** Share of the camera view, per axis, that reaches the whole screen. */
  setActiveZone(size: number): void {
    this.activeZone = size;
  }

  update(timeMs: number, hands: MachineHand[]): void {
    if (hands.length > 0) this.lastHandSeenMs = timeMs;

    if (this.hold) {
      const hold = this.hold;
      const stillHeld = hands.some(
        (hand) => hand.id === hold.handId && hand.pose === hold.pose,
      );
      if (!stillHeld) {
        if (hold.pose === 'pinch') this.endPinch(timeMs, hold);
        this.hold = null;
      }
    }

    if (!this.hold) this.hold = this.startHold(timeMs, hands);
    if (this.hold && !this.hold.done) this.finishHold(timeMs, this.hold);
    if (this.hold?.pose === 'pinch') this.trackPinch(timeMs, this.hold, hands);
    if (this.hold?.pose === 'v') this.trackSpread(timeMs, this.hold, hands);
    this.detectFlicks(timeMs, hands);

    if (
      this.current === 'armed' &&
      hands.length === 0 &&
      timeMs - this.lastHandSeenMs >= this.config.noHandSleepMs
    ) {
      this.goToSleep(timeMs, 'no-hand');
    }
  }

  private detectFlicks(timeMs: number, hands: MachineHand[]): void {
    const holdInProgress = this.hold !== null && !this.hold.done;
    if (this.current !== 'armed' || holdInProgress) {
      this.flicks.clearAll();
      return;
    }
    for (const hand of hands) {
      if (hand.pose !== 'open_palm') {
        this.flicks.clearHand(hand.id);
        continue;
      }
      const direction = this.flicks.update(timeMs, hand.id, hand.palm);
      if (direction) {
        this.bus.emit({ type: direction, timeMs });
        return;
      }
    }
  }

  /** Poses that can start a hold: a palm to wake, a fist, pinch or V once awake. */
  private endPinch(timeMs: number, hold: ActiveHold): void {
    this.bus.emit({ type: 'pinch-end', timeMs });
    const isTap =
      timeMs - hold.sinceMs <= this.config.tapMaxMs &&
      hold.travel <= TAP_TRAVEL;
    if (!isTap) {
      this.lastTapEndMs = Number.NEGATIVE_INFINITY;
    } else if (hold.sinceMs - this.lastTapEndMs <= this.config.doubleTapMs) {
      this.lastTapEndMs = Number.NEGATIVE_INFINITY;
      this.bus.emit({ type: 'reset-view', timeMs });
    } else {
      this.lastTapEndMs = timeMs;
    }
  }

  private trackSpread(
    timeMs: number,
    hold: ActiveHold,
    hands: MachineHand[],
  ): void {
    const hand = hands.find((candidate) => candidate.id === hold.handId);
    if (!hand || !Number.isFinite(hand.pinchRatio) || hand.pinchRatio <= 0) {
      return;
    }
    const previous = hold.lastSpread;
    hold.lastSpread = hand.pinchRatio;
    if (previous === undefined || previous === hand.pinchRatio) return;
    const center = mapToScreen(hand.pointer, this.activeZone);
    this.bus.emit({
      type: 'zoom',
      timeMs,
      factor: hand.pinchRatio / previous,
      x: center.x,
      y: center.y,
    });
  }

  private startingPoses(): Pose[] {
    return this.current === 'asleep' ? ['open_palm'] : ['fist', 'pinch', 'v'];
  }

  private trackPinch(
    timeMs: number,
    hold: ActiveHold,
    hands: MachineHand[],
  ): void {
    const hand = hands.find((candidate) => candidate.id === hold.handId);
    if (!hand) return;
    const point = mapToScreen(hand.pointer, this.activeZone);
    const previous = hold.lastPoint;
    hold.lastPoint = point;
    if (!previous) {
      this.bus.emit({ type: 'pinch-start', timeMs, x: point.x, y: point.y });
      return;
    }
    const dx = point.x - previous.x;
    const dy = point.y - previous.y;
    // Tap travel follows the palm: the pointer jumps when the fingers open.
    const lastPalm = hold.lastPalm;
    hold.lastPalm = hand.palm;
    if (lastPalm) {
      const palmMove = Math.hypot(
        hand.palm.x - lastPalm.x,
        hand.palm.y - lastPalm.y,
      );
      hold.travel += palmMove / this.activeZone;
    }
    if (dx !== 0 || dy !== 0) this.bus.emit({ type: 'pan', timeMs, dx, dy });
  }

  private startHold(timeMs: number, hands: MachineHand[]): ActiveHold | null {
    if (this.flicks.isLocked(timeMs)) return null;
    const wanted = this.startingPoses();
    const hand = hands
      .filter((candidate) => wanted.includes(candidate.pose))
      .sort((a, b) => a.id - b.id)[0];
    if (!hand) return null;
    return {
      handId: hand.id,
      pose: hand.pose,
      sinceMs: timeMs,
      done: false,
      travel: 0,
    };
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
      hold.pose === 'fist' &&
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
