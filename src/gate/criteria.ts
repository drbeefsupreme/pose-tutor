import type { Delegate } from '../platform/types';
import type { PoseLandmarks } from '../pose/landmarks';
import type { Calibration } from '../pose/metrics';
import { SCHEDULER } from '../pose/session';
import { POSE_SPECS } from '../pose/spec';
import type { Facing, PoseId } from '../pose/types';

// The tracking gate: renders of the figure go through the real tracking pipeline, and these rules decide whether the
// figure and the scoring spec agree.

/** An own-pose score at least this high is a hit, as in the live session. */
export const HIT_SCORE = SCHEDULER.hitScore;
/** A clearly different pose must score below this. */
export const DIFFERENT_MAX = 60;

export type ArmClass = 'overhead' | 'down';

/** Where the arms are, by pose: elbows at or above the shoulders, or below them. In judges' call order. */
export const ARMS: { readonly [P in PoseId]: ArmClass } = {
  relaxedFront: 'down',
  quarterTurnLeftSide: 'down',
  relaxedBack: 'down',
  quarterTurnRightSide: 'down',
  frontDoubleBiceps: 'overhead',
  frontLatSpread: 'down',
  sideChest: 'down',
  backDoubleBiceps: 'overhead',
  backLatSpread: 'down',
  sideTriceps: 'down',
  absAndThighs: 'overhead',
  mostMuscular: 'down',
};

const isPoseId = (key: string): key is PoseId => Object.hasOwn(ARMS, key);
export const POSE_IDS: readonly PoseId[] = Object.keys(ARMS).filter(isPoseId);

const facings = (id: PoseId): readonly Facing[] => POSE_SPECS[id].map((v) => v.facing);

/** Poses the tutor scores from the front or back must pass; a front camera sees side poses poorly. */
export const isGated = (id: PoseId): boolean => facings(id).every((f) => f === 'front' || f === 'back');

/** Clearly different: no facing in common, or arms overhead against arms down. */
export function clearlyDifferent(a: PoseId, b: PoseId): boolean {
  const fb = facings(b);
  return !facings(a).some((f) => fb.includes(f)) || ARMS[a] !== ARMS[b];
}

/** Median score of each called pose over the frames; null when the call gave no score on half the frames. */
export type CallRow = { readonly [P in PoseId]: number | null };

export interface CaseResult {
  readonly id: string;
  /** The pose the figure shows; for a fault render, the pose it breaks. */
  readonly pose: PoseId;
  /** Frames on which MediaPipe found a person. */
  readonly detected: number;
  /** Most frequent facing over the frames. */
  readonly facing: Facing | null;
  readonly scores: CallRow;
  /** Most frequent top fault cue of the own pose call. */
  readonly topCue: string | null;
}

export interface FaultResult extends CaseResult {
  readonly label: string;
  readonly expectedCue: string;
}

export interface Backend {
  readonly renderer: string;
  readonly software: boolean;
  readonly delegate: Delegate;
}

/** Own-pose score of one of the 26 reference photos under the scoring at the time of the run. */
export interface RefScore {
  readonly id: string;
  readonly pose: PoseId;
  readonly score: number | null;
}

export interface GateRun {
  readonly at: string;
  readonly backend: Backend;
  readonly size: readonly [number, number];
  readonly frames: number;
  /** Whether the relaxed-front render gave a calibration, which twist and shrug need. */
  readonly calibrated: boolean;
  readonly poses: readonly CaseResult[];
  readonly faults: readonly FaultResult[];
  readonly references: readonly RefScore[];
}

export interface GateOutput {
  readonly run: GateRun;
  readonly report: string;
  readonly failures: readonly string[];
  /** PNG data URLs. */
  readonly sheet: string;
  readonly faultSheet: string;
  /** The calibration and the last smoothed landmarks of each case, for offline checks of the scoring. */
  readonly trace: { readonly calibration: Calibration | null; readonly landmarks: Readonly<Record<string, PoseLandmarks | null>> };
}

export interface CrossScore {
  readonly rendered: PoseId;
  readonly called: PoseId;
  readonly score: number;
}

export interface Verdict {
  readonly failures: readonly string[];
  /** Same facing and arm class, scoring at least DIFFERENT_MAX: 2D look-alikes, not failures. */
  readonly lookAlikes: readonly CrossScore[];
}

const fmt = (score: number | null): string => (score === null ? 'no score' : score.toFixed(1));

export function faultPasses(f: FaultResult): boolean {
  const score = f.scores[f.pose];
  return f.topCue === f.expectedCue && (score === null || score < HIT_SCORE);
}

export function judge(run: GateRun): Verdict {
  const failures: string[] = [];
  const lookAlikes: CrossScore[] = [];
  if (!run.calibrated) failures.push('The relaxed-front render gave no calibration.');
  for (const row of run.poses) {
    if (!isGated(row.pose)) continue;
    const own = row.scores[row.pose];
    if (own === null || own < HIT_SCORE) failures.push(`${row.pose} scores ${fmt(own)} for itself, below ${HIT_SCORE}.`);
    for (const called of POSE_IDS) {
      const score = row.scores[called];
      if (called === row.pose || score === null || score < DIFFERENT_MAX) continue;
      if (clearlyDifferent(row.pose, called)) {
        failures.push(`${row.pose} scores ${fmt(score)} for the clearly different ${called}, not below ${DIFFERENT_MAX}.`);
      } else {
        lookAlikes.push({ rendered: row.pose, called, score });
      }
    }
  }
  for (const f of run.faults) {
    if (!faultPasses(f)) {
      failures.push(`${f.id} gives "${f.topCue ?? 'no cue'}" at ${fmt(f.scores[f.pose])}; expected "${f.expectedCue}" below ${HIT_SCORE}.`);
    }
  }
  return { failures, lookAlikes };
}

/** Median with "no score" ranked below every score. */
export function median(values: readonly (number | undefined)[]): number | null {
  const sorted = values.map((v) => v ?? -Infinity).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = sorted.length / 2;
  const m = Number.isInteger(mid) ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[Math.floor(mid)];
  return Number.isFinite(m) ? m : null;
}

export function mostCommon<T>(values: readonly T[]): T | undefined {
  const counts = new Map<T, number>();
  let best: T | undefined;
  let bestCount = 0;
  for (const v of values) {
    const n = (counts.get(v) ?? 0) + 1;
    counts.set(v, n);
    if (n > bestCount) [best, bestCount] = [v, n];
  }
  return best;
}
