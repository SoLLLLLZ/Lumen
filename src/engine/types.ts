export interface Landmark {
  x: number;
  y: number;
}

export interface TrackedHand {
  landmarks: Landmark[];
  confidence: number;
}

export type Pose = 'open_palm' | 'pinch' | 'v' | 'fist' | 'none';

export const POSES: readonly Pose[] = [
  'open_palm',
  'pinch',
  'v',
  'fist',
  'none',
];

export const LANDMARK_COUNT = 21;
