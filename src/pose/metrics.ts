import { JOINTS, NOSE, type PoseLandmarks } from './landmarks';
import type { BodySide, Facing, MetricId, MetricSide, Metrics } from './types';

// Definitions: "Metric definitions" in docs/pose-spec.md. Coordinates are image coordinates with
// x scaled by the aspect ratio and y pointing down; heights are positive above the reference point.

/** Landmarks below this visibility are hidden. Hidden wrists read 0.00..0.26 and visible ones 0.53..1.00 [pose-spec]. */
export const MIN_VISIBILITY = 0.5;

/** Hip width per torso below which a view is a side view. The cut separated all 26 reference photos [pose-spec]. */
export const SIDE_VIEW_HIP_WIDTH = 0.28;

/** One user's relaxed-front baseline. Twist and shrug compare against it. */
export interface Calibration {
  readonly shoulderWidth: number;
  readonly hipWidth: number;
  /** Vertical ear-to-shoulder distance per torso. */
  readonly earDrop: number;
}

interface MeasureOptions {
  readonly calibration?: Calibration;
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
export const isMetricId = (id: string): id is MetricId => Object.hasOwn(METRIC_IDS, id);
const METRIC_SIDES: { readonly [S in MetricSide]: true } = { left: true, right: true, near: true, far: true };
export const isMetricSide = (side: string): side is MetricSide => Object.hasOwn(METRIC_SIDES, side);

export function metricKey(metric: MetricId, side?: BodySide): keyof Metrics {
  return side === undefined ? metric : `${metric}.${side}`;
}

const SIDES: readonly BodySide[] = ['left', 'right'];
const DEG = 180 / Math.PI;
const { ear: EAR, shoulder: SH, elbow: EL, wrist: WR, hip: HIP, knee: KNEE, ankle: ANK, heel: HEEL, footIndex: TOE } =
  JOINTS;

const seen = (lm: PoseLandmarks, i: number): boolean => lm.points[i].visibility >= MIN_VISIBILITY;
const px = (lm: PoseLandmarks, i: number): number => lm.points[i].x * lm.aspect;
const py = (lm: PoseLandmarks, i: number): number => lm.points[i].y;
const dist = (lm: PoseLandmarks, i: number, j: number): number =>
  Math.hypot(px(lm, j) - px(lm, i), py(lm, j) - py(lm, i));

/** Angle between two vectors in degrees; NaN when either has zero length. */
function angleBetween(ax: number, ay: number, bx: number, by: number): number {
  const cos = (ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by));
  return Math.acos(Math.max(-1, Math.min(1, cos))) * DEG;
}

/** 180° minus the angle at joint `b`: 0° is a straight limb. */
const flexion = (lm: PoseLandmarks, a: number, b: number, c: number): number =>
  180 - angleBetween(px(lm, a) - px(lm, b), py(lm, a) - py(lm, b), px(lm, c) - px(lm, b), py(lm, c) - py(lm, b));

/** Rotation out of the image plane that shrinks a front-view width to `width`, in degrees. */
const turn = (width: number, frontWidth: number): number => Math.acos(Math.min(1, width / frontWidth)) * DEG;

interface Trunk {
  readonly shoulderX: number;
  readonly shoulderY: number;
  readonly hipX: number;
  readonly hipY: number;
  /** Mid-shoulder to mid-hip distance, the unit of every height and width. */
  readonly length: number;
}

function trunk(lm: PoseLandmarks): Trunk | undefined {
  if (!(seen(lm, SH.left) && seen(lm, SH.right) && seen(lm, HIP.left) && seen(lm, HIP.right))) return undefined;
  const shoulderX = (px(lm, SH.left) + px(lm, SH.right)) / 2;
  const shoulderY = (py(lm, SH.left) + py(lm, SH.right)) / 2;
  const hipX = (px(lm, HIP.left) + px(lm, HIP.right)) / 2;
  const hipY = (py(lm, HIP.left) + py(lm, HIP.right)) / 2;
  const length = Math.hypot(hipX - shoulderX, hipY - shoulderY);
  return length > 0 ? { shoulderX, shoulderY, hipX, hipY, length } : undefined;
}

/** Mean vertical ear-to-shoulder distance per torso over the sides where ear and shoulder are visible. */
function earDrop(lm: PoseLandmarks, t: Trunk): number {
  let sum = 0;
  let n = 0;
  for (const side of SIDES) {
    if (!(seen(lm, EAR[side]) && seen(lm, SH[side]))) continue;
    sum += py(lm, SH[side]) - py(lm, EAR[side]);
    n++;
  }
  return sum / n / t.length;
}

function put(m: Metrics, metric: MetricId, side: BodySide | undefined, value: number): void {
  if (Number.isFinite(value)) m[metricKey(metric, side)] = value;
}

/** Measures every metric whose landmarks are visible. Twist and shrug also need a calibration. */
export function measure(lm: PoseLandmarks, { calibration }: MeasureOptions = {}): Metrics {
  const m: Metrics = {};
  const t = trunk(lm);
  const nose = seen(lm, NOSE);

  for (const side of SIDES) {
    const s = SH[side];
    const e = EL[side];
    const w = WR[side];
    const elbow = seen(lm, e);
    const wrist = seen(lm, w);
    put(m, 'wristVis', side, lm.points[w].visibility);
    if (t && elbow) {
      const abduction = angleBetween(px(lm, e) - px(lm, s), py(lm, e) - py(lm, s), t.hipX - t.shoulderX, t.hipY - t.shoulderY);
      put(m, 'abduction', side, abduction);
      put(m, 'elbowHeight', side, (py(lm, s) - py(lm, e)) / t.length);
    }
    if (seen(lm, s) && elbow && wrist) put(m, 'elbowFlex', side, flexion(lm, s, e, w));
    if (t && wrist) put(m, 'wristHeight', side, (py(lm, s) - py(lm, w)) / t.length);
    if (t && nose && wrist) put(m, 'wristVsNose', side, (py(lm, NOSE) - py(lm, w)) / t.length);
    if (elbow && wrist) {
      put(m, 'forearmAngle', side, Math.atan2(Math.abs(px(lm, w) - px(lm, e)), py(lm, e) - py(lm, w)) * DEG);
    }
    if (seen(lm, HIP[side]) && seen(lm, KNEE[side]) && seen(lm, ANK[side])) {
      put(m, 'kneeFlex', side, flexion(lm, HIP[side], KNEE[side], ANK[side]));
    }
    if (seen(lm, HEEL[side]) && seen(lm, TOE[side])) {
      put(m, 'heelLift', side, (py(lm, TOE[side]) - py(lm, HEEL[side])) / dist(lm, HEEL[side], TOE[side]));
    }
  }

  const shoulders = seen(lm, SH.left) && seen(lm, SH.right);
  if (t) {
    const hipWidth = dist(lm, HIP.left, HIP.right) / t.length;
    const shoulderWidth = dist(lm, SH.left, SH.right) / t.length;
    put(m, 'hipWidth', undefined, hipWidth);
    put(m, 'shoulderWidth', undefined, shoulderWidth);
    if (calibration) {
      put(m, 'twist', undefined, turn(hipWidth, calibration.hipWidth) - turn(shoulderWidth, calibration.shoulderWidth));
      put(m, 'shrug', undefined, earDrop(lm, t) / calibration.earDrop);
    }
  }
  if (seen(lm, ANK.left) && seen(lm, ANK.right)) {
    const ankleGap = Math.abs(px(lm, ANK.left) - px(lm, ANK.right));
    if (shoulders) put(m, 'stanceRatio', undefined, ankleGap / Math.abs(px(lm, SH.left) - px(lm, SH.right)));
    if (t) put(m, 'stagger', undefined, ankleGap / t.length);
  }
  if (shoulders && seen(lm, EL.left) && seen(lm, EL.right)) {
    put(m, 'elbowSpan', undefined, dist(lm, EL.left, EL.right) / dist(lm, SH.left, SH.right));
  }
  if (t && seen(lm, WR.left) && seen(lm, WR.right)) put(m, 'wristGap', undefined, dist(lm, WR.left, WR.right) / t.length);
  if (nose && seen(lm, EAR.left) && seen(lm, EAR.right)) {
    const midEarX = (px(lm, EAR.left) + px(lm, EAR.right)) / 2;
    put(m, 'headYaw', undefined, (px(lm, NOSE) - midEarX) / dist(lm, EAR.left, EAR.right));
  }
  return m;
}

/** Image-x direction the athlete's front points to, from the toes and the nose, each weighted by its visibility. */
function forwardX(lm: PoseLandmarks, t: Trunk): number {
  let sum = lm.points[NOSE].visibility * (px(lm, NOSE) - t.shoulderX);
  for (const side of SIDES) {
    const reach = px(lm, TOE[side]) - px(lm, HEEL[side]);
    sum += Math.min(lm.points[HEEL[side]].visibility, lm.points[TOE[side]].visibility) * reach;
  }
  return sum;
}

/**
 * Front and back views have a hip width of at least 0.28 torso; the left shoulder on the image right then means
 * front [pose-spec]. A side view shows the side that is ahead when the athlete faces image left: the left side.
 */
export function classifyFacing(lm: PoseLandmarks): Facing | undefined {
  const t = trunk(lm);
  if (!t) return undefined;
  if (dist(lm, HIP.left, HIP.right) / t.length >= SIDE_VIEW_HIP_WIDTH) {
    return px(lm, SH.left) > px(lm, SH.right) ? 'front' : 'back';
  }
  return forwardX(lm, t) < 0 ? 'leftSide' : 'rightSide';
}

/** Baseline from a relaxed-front frame; undefined unless the frame faces front and an ear is visible. */
export function calibrate(relaxedFront: PoseLandmarks): Calibration | undefined {
  const t = trunk(relaxedFront);
  if (!t || classifyFacing(relaxedFront) !== 'front') return undefined;
  const drop = earDrop(relaxedFront, t);
  if (!(drop > 0)) return undefined;
  return {
    shoulderWidth: dist(relaxedFront, SH.left, SH.right) / t.length,
    hipWidth: dist(relaxedFront, HIP.left, HIP.right) / t.length,
    earDrop: drop,
  };
}
