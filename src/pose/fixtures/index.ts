import { poseLandmarks, type Landmark, type PoseLandmarks } from '../landmarks';
import { metricKey } from '../metrics';
import { FACING_CHECKS, POSE_SPECS } from '../spec';
import type { Facing, MetricId, Metrics, PoseId } from '../types';
import backDoubleBiceps from './back-double-biceps.json';
import frontDoubleBicepsElbowsDropped from './front-double-biceps-elbows-dropped.json';
import frontDoubleBiceps from './front-double-biceps.json';
import frontLatSpread from './front-lat-spread.json';
import leftSide from './left-side.json';
import refsFile from './refs-landmarks.json';
import relaxedFront from './relaxed-front.json';

/** BlazePose landmark names in model output order, written out so the fixtures do not depend on `JOINTS`. */
const BLAZEPOSE = [
  'nose',
  'leftEyeInner',
  'leftEye',
  'leftEyeOuter',
  'rightEyeInner',
  'rightEye',
  'rightEyeOuter',
  'leftEar',
  'rightEar',
  'mouthLeft',
  'mouthRight',
  'leftShoulder',
  'rightShoulder',
  'leftElbow',
  'rightElbow',
  'leftWrist',
  'rightWrist',
  'leftPinky',
  'rightPinky',
  'leftIndex',
  'rightIndex',
  'leftThumb',
  'rightThumb',
  'leftHip',
  'rightHip',
  'leftKnee',
  'rightKnee',
  'leftAnkle',
  'rightAnkle',
  'leftHeel',
  'rightHeel',
  'leftFootIndex',
  'rightFootIndex',
] as const;

export type LandmarkName = (typeof BLAZEPOSE)[number];
type Point = readonly [number, number];

/** A hand-built figure: named points in a square image, all visible. */
export interface Body {
  readonly about: string;
  readonly joints: Partial<Record<LandmarkName, Point>>;
}

/** Visibility of a hidden landmark. Hidden wrists in the reference photos read 0.00..0.26. */
export const HIDDEN_VISIBILITY = 0.1;

const isLandmarkName = (name: string): name is LandmarkName => (BLAZEPOSE as readonly string[]).includes(name);

interface BodyFile {
  readonly about: string;
  readonly aspect: number;
  readonly joints: { readonly [name: string]: readonly number[] };
}

function body(file: BodyFile): Body {
  if (file.aspect !== 1) throw new Error(`hand-built fixtures use a square image, got aspect ${file.aspect}`);
  const joints: Partial<Record<LandmarkName, Point>> = {};
  for (const [name, value] of Object.entries(file.joints)) {
    if (!isLandmarkName(name) || value.length !== 2) throw new Error(`bad joint ${name}`);
    joints[name] = [value[0], value[1]];
  }
  return { about: file.about, joints };
}

export const BODIES = {
  relaxedFront: body(relaxedFront),
  frontDoubleBiceps: body(frontDoubleBiceps),
  frontDoubleBicepsElbowsDropped: body(frontDoubleBicepsElbowsDropped),
  frontLatSpread: body(frontLatSpread),
  backDoubleBiceps: body(backDoubleBiceps),
  leftSide: body(leftSide),
} as const;

/** The body with some points moved. */
export function moved(base: Body, joints: Partial<Record<LandmarkName, Point>>): Body {
  return { about: `${base.about} (moved)`, joints: { ...base.joints, ...joints } };
}

/** The body turned to face the other way: mirrored about x = 0.5 with left and right swapped. */
export function turnedAround(base: Body): Body {
  const joints: Partial<Record<LandmarkName, Point>> = {};
  for (const name of BLAZEPOSE) {
    const point = base.joints[name];
    if (!point) continue;
    const other = name.startsWith('left') ? `right${name.slice(4)}` : name.startsWith('right') ? `left${name.slice(5)}` : name;
    if (!isLandmarkName(other)) throw new Error(`no mirror for ${name}`);
    joints[other] = [1 - point[0], point[1]];
  }
  return { about: `${base.about} (turned around)`, joints };
}

export interface Framing {
  /** Landmarks to report with `HIDDEN_VISIBILITY`. */
  readonly hidden?: readonly LandmarkName[];
  /** Image width / height to frame the body in, centred; the body keeps its true proportions. */
  readonly aspect?: number;
}

/** The 33 landmarks a detector would report for the body; unnamed landmarks are invisible. */
export function landmarks(b: Body, { hidden = [], aspect = 1 }: Framing = {}): PoseLandmarks {
  const points: Landmark[] = BLAZEPOSE.map((name) => {
    const point = b.joints[name];
    if (!point) return { x: 0, y: 0, visibility: 0 };
    return { x: 0.5 + (point[0] - 0.5) / aspect, y: point[1], visibility: hidden.includes(name) ? HIDDEN_VISIBILITY : 1 };
  });
  return poseLandmarks(points, aspect, 1);
}

/** One of the 26 pose-spec reference photos (see `about` in refs-landmarks.json). */
export interface RefPhoto {
  readonly id: string;
  readonly pose: PoseId;
  readonly facing: Facing;
  /** Id of the same athlete's relaxed-front photo. */
  readonly calibration: string | undefined;
  readonly landmarks: PoseLandmarks;
  /** The pose-spec script's values, where every landmark a metric needs is visible. */
  readonly measured: Metrics;
}

const METRIC_IDS: { readonly [M in MetricId]: true } = {
  hipWidth: true,
  shoulderWidth: true,
  twist: true,
  stanceRatio: true,
  stagger: true,
  kneeFlex: true,
  heelLift: true,
  abduction: true,
  elbowFlex: true,
  elbowHeight: true,
  wristHeight: true,
  wristVsNose: true,
  forearmAngle: true,
  elbowSpan: true,
  wristGap: true,
  headYaw: true,
  shrug: true,
  wristVis: true,
};
const isMetricId = (id: string): id is MetricId => Object.hasOwn(METRIC_IDS, id);
const isPoseId = (id: string): id is PoseId => Object.hasOwn(POSE_SPECS, id);
const isFacing = (id: string): id is Facing => Object.hasOwn(FACING_CHECKS, id);

function metrics(raw: { readonly [key: string]: number | undefined }): Metrics {
  const m: Metrics = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined) continue;
    const [metric, side] = key.split('.');
    if (!isMetricId(metric) || !(side === undefined || side === 'left' || side === 'right')) {
      throw new Error(`bad metric ${key}`);
    }
    m[metricKey(metric, side)] = value;
  }
  return m;
}

export const REFS: readonly RefPhoto[] = refsFile.refs.map((r) => {
  if (!isPoseId(r.pose) || !isFacing(r.facing)) throw new Error(`bad reference ${r.id}`);
  const points = r.landmarks.map(([x, y, visibility]) => ({ x, y, visibility }));
  return {
    id: r.id,
    pose: r.pose,
    facing: r.facing,
    calibration: r.calibration ?? undefined,
    landmarks: poseLandmarks(points, r.aspect, 1),
    measured: metrics(r.measured),
  };
});
