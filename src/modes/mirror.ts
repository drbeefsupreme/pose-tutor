import { JOINTS, type PoseLandmarks, type SidedJoint } from '../pose/landmarks';
import { MIN_VISIBILITY } from '../pose/metrics';
import type { AxisAngle, BodySide, FigurePose } from '../pose/types';
import type { Mode } from './mode';

// The figure copies the athlete as a mirror image: the athlete's right arm moves the figure's left arm, on the same
// side of the screen as in the mirrored camera preview.

type Segment = 'upperarm' | 'forearm' | 'thigh' | 'shin';
type FigureSide = 'L' | 'R';
type SegmentKey = `${Segment}${FigureSide}`;

/** Segment angles in degrees from straight down, positive away from the body's midline. */
type LimbAngles = Readonly<Record<SegmentKey, number>>;

/** Left-side joints of the figure's rest skeleton (x outward, y up), from scripts/figure/skeleton.ts JOINTS. */
const REST_JOINTS = {
  shoulder: [0.205, 1.445],
  elbow: [0.33, 1.185],
  wrist: [0.385, 0.935],
  hip: [0.092, 0.925],
  knee: [0.115, 0.505],
  ankle: [0.14, 0.085],
} as const satisfies { readonly [J in SidedJoint]?: readonly [number, number] };

type Joint = keyof typeof REST_JOINTS;

const SEGMENTS: { readonly [S in Segment]: { readonly from: Joint; readonly to: Joint; readonly parent?: Segment } } = {
  upperarm: { from: 'shoulder', to: 'elbow' },
  forearm: { from: 'elbow', to: 'wrist', parent: 'upperarm' },
  thigh: { from: 'hip', to: 'knee' },
  shin: { from: 'knee', to: 'ankle', parent: 'thigh' },
};

const DEG = 180 / Math.PI;

export const REST_ANGLES: { readonly [S in Segment]: number } = Object.fromEntries(
  (Object.keys(SEGMENTS) as Segment[]).map((s) => {
    const a = REST_JOINTS[SEGMENTS[s].from];
    const b = REST_JOINTS[SEGMENTS[s].to];
    return [s, Math.atan2(b[0] - a[0], a[1] - b[1]) * DEG];
  }),
) as { readonly [S in Segment]: number };

export const REST_LIMBS: LimbAngles = Object.fromEntries(
  (Object.keys(SEGMENTS) as Segment[]).flatMap((s) => [
    [`${s}L`, REST_ANGLES[s]],
    [`${s}R`, REST_ANGLES[s]],
  ]),
) as LimbAngles;

const DRIVER: { readonly [F in FigureSide]: { readonly side: BodySide; readonly outward: 1 | -1 } } = {
  L: { side: 'right', outward: -1 },
  R: { side: 'left', outward: 1 },
};

export function readLimbs(lm: PoseLandmarks): Partial<Record<SegmentKey, number>> {
  const out: Partial<Record<SegmentKey, number>> = {};
  for (const fig of ['L', 'R'] as const) {
    const { side, outward } = DRIVER[fig];
    for (const seg of Object.keys(SEGMENTS) as Segment[]) {
      const a = lm.points[JOINTS[SEGMENTS[seg].from][side]];
      const b = lm.points[JOINTS[SEGMENTS[seg].to][side]];
      if (a.visibility < MIN_VISIBILITY || b.visibility < MIN_VISIBILITY) continue;
      out[`${seg}${fig}`] = Math.atan2(outward * (b.x - a.x) * lm.aspect, b.y - a.y) * DEG;
    }
  }
  return out;
}

/** The newest angles; a segment hidden on this frame keeps its last angle. */
export function nextLimbs(prev: LimbAngles, lm: PoseLandmarks | undefined): LimbAngles {
  return lm ? { ...prev, ...readLimbs(lm) } : prev;
}

/** The figure pose for limb angles: rotations about the frontal axis, each relative to its parent segment. */
export function mirrorFigure(angles: LimbAngles): FigurePose {
  const bones: FigurePose['bones'] = {};
  for (const fig of ['L', 'R'] as const) {
    // +Z swings a left limb away from the midline; the right side is its mirror image.
    const axisZ = fig === 'L' ? 1 : -1;
    for (const seg of Object.keys(SEGMENTS) as Segment[]) {
      const { parent } = SEGMENTS[seg];
      const own = angles[`${seg}${fig}`] - REST_ANGLES[seg];
      const turn = parent === undefined ? own : own - (angles[`${parent}${fig}`] - REST_ANGLES[parent]);
      const deg = turn - 360 * Math.round(turn / 360);
      const rotation: AxisAngle = [0, 0, axisZ, deg];
      bones[`${seg}${fig}`] = [rotation];
    }
  }
  return { yaw: 0, bones };
}

interface MirrorState {
  readonly angles: LimbAngles;
  readonly stopped: boolean;
}

export const mirrorMode: Mode<MirrorState> = {
  id: 'mirror',
  start: () => ({ state: { angles: REST_LIMBS, stopped: false }, effects: [{ kind: 'say', text: 'Mirror. Move, and the figure follows you.', interrupt: true }] }),
  frame: (state, { landmarks }) => ({ state: { ...state, angles: nextLimbs(state.angles, landmarks) }, effects: [] }),
  next: (state) => ({ state, effects: [] }),
  skip: (state) => ({ state, effects: [] }),
  stop: (state) => ({ ...state, stopped: true }),
  view: (state) => ({
    figure: { kind: 'live', figure: mirrorFigure(state.angles) },
    scoring: undefined,
    title: 'Mirror',
    detail: 'The figure copies you',
    stage: state.stopped ? { kind: 'done', summary: { mode: 'mirror' } } : { kind: 'mirror' },
    clock: undefined,
  }),
};
