import type { BodySide } from './types';

/** One BlazePose landmark: `x` and `y` normalized to the image (0..1, y pointing down). */
export interface Landmark {
  readonly x: number;
  readonly y: number;
  /** Estimator confidence that the point is visible, 0..1. */
  readonly visibility: number;
}

/** The 33 BlazePose landmarks of one person in one image. */
export interface PoseLandmarks {
  /** Image width / height. Metrics scale `x` by it, so lengths and angles are not distorted. */
  readonly aspect: number;
  readonly points: readonly Landmark[];
}

export const LANDMARK_COUNT = 33;

export const NOSE = 0;

export type SidedJoint = 'ear' | 'shoulder' | 'elbow' | 'wrist' | 'hip' | 'knee' | 'ankle' | 'heel' | 'footIndex';

/** BlazePose indices by joint and by the athlete's own side. */
export const JOINTS: { readonly [J in SidedJoint]: { readonly [S in BodySide]: number } } = {
  ear: { left: 7, right: 8 },
  shoulder: { left: 11, right: 12 },
  elbow: { left: 13, right: 14 },
  wrist: { left: 15, right: 16 },
  hip: { left: 23, right: 24 },
  knee: { left: 25, right: 26 },
  ankle: { left: 27, right: 28 },
  heel: { left: 29, right: 30 },
  footIndex: { left: 31, right: 32 },
};

/** The bones of the BlazePose skeleton as pairs of landmark indices, as MediaPipe draws them. */
export const POSE_CONNECTIONS: readonly (readonly [number, number])[] = [
  [0, 1], [1, 2], [2, 3], [3, 7], [0, 4], [4, 5], [5, 6], [6, 8], [9, 10],
  [11, 12], [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19],
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20],
  [11, 23], [12, 24], [23, 24], [23, 25], [24, 26], [25, 27], [26, 28],
  [27, 29], [28, 30], [29, 31], [30, 32], [27, 31], [28, 32],
];

/** Wraps detector output for an image of `width` x `height` pixels. MediaPipe's landmark objects fit as they are. */
export function poseLandmarks(points: readonly Landmark[], width: number, height: number): PoseLandmarks {
  if (points.length !== LANDMARK_COUNT) {
    throw new Error(`expected ${LANDMARK_COUNT} BlazePose landmarks, got ${points.length}`);
  }
  if (!(width > 0 && height > 0)) throw new Error(`invalid image size ${width}x${height}`);
  return { aspect: width / height, points };
}
