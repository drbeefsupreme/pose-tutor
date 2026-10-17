// Shared contract for the pose tutor. The scoring spec (src/pose/spec.ts) and the figure poses
// (src/figure/figurePoses.ts) are authored separately; the tracking gate checks that they agree.

/** NPC / IFBB Pro prejudging: quarter turns plus the 8 mandatory poses. Side poses are shown to the
 * judges' left or right; `left` means the athlete's left side faces the camera. */
export type PoseId =
  | 'relaxedFront'
  | 'quarterTurnLeftSide'
  | 'relaxedBack'
  | 'quarterTurnRightSide'
  | 'frontDoubleBiceps'
  | 'frontLatSpread'
  | 'sideChest'
  | 'backDoubleBiceps'
  | 'backLatSpread'
  | 'sideTriceps'
  | 'absAndThighs'
  | 'mostMuscular';

export type BodySide = 'left' | 'right';

/** Which way the athlete faces the camera. Side views name the athlete's side nearest the camera. */
export type Facing = 'front' | 'back' | 'leftSide' | 'rightSide';

export type MidBone = 'pelvis' | 'lumbar' | 'chest' | 'neck' | 'head';
export type LimbBone = 'scap' | 'upperarm' | 'forearm' | 'hand' | 'thigh' | 'shin' | 'foot';
/** Limb bones carry an explicit side: no mirroring, so asymmetric poses are representable. */
export type BoneKey = MidBone | `${LimbBone}L` | `${LimbBone}R`;

/** Rotation about a world-rest axis [x, y, z] by degrees. Lists apply in order (first rotation first). */
export type AxisAngle = readonly [number, number, number, number];

export interface FigurePose {
  /** Whole-body turn about +Y in degrees; 90 shows the figure's left side to a front camera. */
  yaw: number;
  bones: Partial<Record<BoneKey, readonly AxisAngle[]>>;
}

/** 2D image-plane metrics measured from pose landmarks. Definitions: docs/pose-spec.md. */
export type MetricId =
  | 'hipWidth'
  | 'shoulderWidth'
  | 'twist'
  | 'stanceRatio'
  | 'stagger'
  | 'kneeFlex'
  | 'heelLift'
  | 'abduction'
  | 'elbowFlex'
  | 'elbowHeight'
  | 'wristHeight'
  | 'wristVsNose'
  | 'forearmAngle'
  | 'elbowSpan'
  | 'wristGap'
  | 'headYaw'
  | 'shrug'
  | 'wristVis';

/** Per-limb metrics need a side; `near` / `far` resolve against the pose's facing. */
export type MetricSide = BodySide | 'near' | 'far';

export interface Band {
  target: number;
  min: number;
  max: number;
}

export interface Cue {
  /** Spoken correction: imperative, friendly, under 8 words. */
  text: string;
  /** Pose-spec source tag for the fault, e.g. 'S10' or 'ESTIMATE'. */
  source: string;
}

export interface Check {
  metric: MetricId;
  side?: MetricSide;
  band: Band;
  /** Relative importance within the pose, 1 = normal. */
  weight: number;
  /** Cue when the value is below `band.min` / above `band.max`. */
  low?: Cue;
  high?: Cue;
}

export interface PoseSpec {
  id: PoseId;
  name: string;
  facing: Facing;
  checks: readonly Check[];
  /** One short sentence per step: feet, legs, hips, torso, arms, hands, head, finish. */
  buildUp: readonly string[];
  /** Things a coach cues that the camera cannot measure (lat flare, vacuum, smile). */
  coachOnly: readonly string[];
  /** Short official description with its source tag. */
  description: string;
}

/** One measured metric value; absent when the landmarks it needs were not visible enough. */
export type Metrics = Partial<Record<`${MetricId}` | `${MetricId}.${BodySide}`, number>>;

export interface CheckResult {
  check: Check;
  value: number | undefined;
  /** 1 inside the band, falling toward 0 outside it; undefined when not measurable. */
  score: number | undefined;
  /** Which edge of the band was missed, if any. */
  miss: 'low' | 'high' | undefined;
}

export interface PoseScore {
  pose: PoseId;
  /** 0..100 over the measurable checks; undefined when the facing is wrong or too little is visible. */
  score: number | undefined;
  facing: Facing | undefined;
  results: readonly CheckResult[];
  /** Missed checks ordered by importance, most important first. */
  faults: readonly CheckResult[];
}
