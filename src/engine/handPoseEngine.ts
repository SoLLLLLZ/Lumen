import { LandmarkSmoother } from './oneEuro';
import {
  PoseClassifier,
  PoseStabilizer,
  type Classification,
} from './poseClassifier';
import { distance, palmPoint, WRIST } from './measurements';
import type { Digit, PalmPoint } from './measurements';
import type { Landmark, Pose, TrackedHand } from './types';

export interface HandState {
  id: number;
  landmarks: Landmark[];
  confidence: number;
  pose: Pose;
  pinchRatio: number;
  extensions: Record<Digit, number>;
  palm: PalmPoint;
}

export interface EngineOptions {
  /** Video width divided by height. */
  aspect?: number;
  /** A pose must hold this long before it is reported. */
  poseHoldMs?: number;
  /** A hand reappearing after this gap restarts its smoothing. */
  smoothingGapMs?: number;
  /** A hand missing this long is forgotten. */
  forgetAfterMs?: number;
  /** Largest wrist move between frames that still counts as the same hand. */
  matchDistance?: number;
}

interface Slot {
  id: number;
  smoother: LandmarkSmoother;
  classifier: PoseClassifier;
  stabilizer: PoseStabilizer;
  lastSeenMs: number;
  wrist: Landmark;
}

/** Smooths landmarks and reports a steady pose per tracked hand. */
export class HandPoseEngine {
  private readonly aspect: number;
  private readonly poseHoldMs: number;
  private readonly smoothingGapMs: number;
  private readonly forgetAfterMs: number;
  private readonly matchDistance: number;
  private slots: Slot[] = [];
  private nextId = 0;

  constructor(options: EngineOptions = {}) {
    this.aspect = options.aspect ?? 4 / 3;
    this.poseHoldMs = options.poseHoldMs ?? 100;
    this.smoothingGapMs = options.smoothingGapMs ?? 200;
    this.forgetAfterMs = options.forgetAfterMs ?? 400;
    this.matchDistance = options.matchDistance ?? 0.25;
  }

  process(timeMs: number, hands: TrackedHand[]): HandState[] {
    this.slots = this.slots.filter(
      (slot) => timeMs - slot.lastSeenMs <= this.forgetAfterMs,
    );

    const ordered = hands
      .filter((hand) => hand.landmarks[WRIST] !== undefined)
      .sort(
        (a, b) => (a.landmarks[WRIST]?.x ?? 0) - (b.landmarks[WRIST]?.x ?? 0),
      );
    const taken = new Set<Slot>();
    const states: HandState[] = [];

    for (const hand of ordered) {
      const wrist = hand.landmarks[WRIST] as Landmark;
      const slot = this.matchSlot(wrist, taken) ?? this.createSlot(wrist);
      taken.add(slot);

      if (timeMs - slot.lastSeenMs > this.smoothingGapMs) {
        slot.smoother.reset();
      }
      slot.lastSeenMs = timeMs;
      slot.wrist = wrist;

      const landmarks = slot.smoother.smooth(hand.landmarks, timeMs);
      const result: Classification = slot.classifier.classify(landmarks);
      states.push({
        id: slot.id,
        landmarks,
        confidence: hand.confidence,
        pose: slot.stabilizer.update(result.pose, timeMs),
        pinchRatio: result.pinchRatio,
        extensions: result.extensions,
        palm: palmPoint(landmarks, this.aspect),
      });
    }
    return states.sort((a, b) => a.id - b.id);
  }

  reset(): void {
    this.slots = [];
  }

  private matchSlot(wrist: Landmark, taken: Set<Slot>): Slot | undefined {
    let best: Slot | undefined;
    let bestDistance = this.matchDistance;
    for (const slot of this.slots) {
      if (taken.has(slot)) continue;
      const gap = distance(slot.wrist, wrist, this.aspect);
      if (gap <= bestDistance) {
        best = slot;
        bestDistance = gap;
      }
    }
    return best;
  }

  private createSlot(wrist: Landmark): Slot {
    const slot: Slot = {
      id: this.nextId++,
      smoother: new LandmarkSmoother(),
      classifier: new PoseClassifier(undefined, this.aspect),
      stabilizer: new PoseStabilizer(this.poseHoldMs),
      lastSeenMs: Number.NEGATIVE_INFINITY,
      wrist,
    };
    this.slots.push(slot);
    return slot;
  }
}
