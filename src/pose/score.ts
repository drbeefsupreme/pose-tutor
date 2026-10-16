import { metricKey } from './metrics';
import { FACING_CHECKS, POSE_SPECS, resolveSide } from './spec';
import type { Band, Check, CheckResult, Cue, Facing, Metrics, PoseId, PoseScore, PoseSpec } from './types';

/** A pose gets a score only when the measurable checks carry at least this share of its total weight. */
export const MIN_MEASURED_WEIGHT = 0.5;

/**
 * Distance outside a band at which a check scores 0: half a band width. An open side counts as the closed side
 * mirrored about the target, so `atLeast(2.35, 2.15)` falls to 0 at 1.95. With a full band width, both elbows
 * dropped 30° in the front double biceps still scored 88, a hit, in the tracking gate.
 */
function falloffWidth({ target, min, max }: Band): number {
  const below = Number.isFinite(min) ? target - min : max - target;
  const above = Number.isFinite(max) ? max - target : target - min;
  return (below + above) / 2;
}

/**
 * 1 at the band edge, 0 at half a band width out, a smoothstep between. Its slope is 0 at the edge, and the band
 * interior is flat, so landmark jitter around a band edge does not make the score flicker.
 */
function falloff(distance: number, band: Band): number {
  const t = Math.min(1, distance / falloffWidth(band));
  return (1 - t) * (1 - t) * (1 + 2 * t);
}

function evaluate(check: Check, metrics: Metrics, facing: Facing): CheckResult {
  const side = check.side === undefined ? undefined : resolveSide(check.side, facing);
  const value = check.side !== undefined && side === undefined ? undefined : metrics[metricKey(check.metric, side)];
  if (value === undefined) return { check, value, score: undefined, miss: undefined };
  const { min, max } = check.band;
  if (value < min) return { check, value, score: falloff(min - value, check.band), miss: 'low' };
  if (value > max) return { check, value, score: falloff(value - max, check.band), miss: 'high' };
  return { check, value, score: 1, miss: undefined };
}

/** The spoken correction for a fault. */
export function faultCue(fault: CheckResult): Cue | undefined {
  if (fault.miss === 'low') return fault.check.low;
  if (fault.miss === 'high') return fault.check.high;
  return undefined;
}

/**
 * Scores one pose variant. The score is the weighted mean of the measurable checks, 0..100, and needs the
 * athlete in the variant's facing. Faults are ordered by the points they cost: weight times the share of the
 * check's score that the miss lost. A wrong facing puts its turn cue first and leaves the score undefined.
 */
export function scorePose(spec: PoseSpec, metrics: Metrics, facing: Facing | undefined): PoseScore {
  const results = spec.checks.map((check) => evaluate(check, metrics, spec.facing));
  const faults = results
    .filter((r) => r.miss !== undefined)
    .sort((a, b) => b.check.weight * (1 - (b.score ?? 1)) - a.check.weight * (1 - (a.score ?? 1)));
  if (facing !== spec.facing) {
    if (facing === undefined) return { pose: spec.id, score: undefined, facing, results, faults };
    const check = FACING_CHECKS[spec.facing];
    const turn: CheckResult = {
      check,
      value: metrics.hipWidth,
      score: 0,
      miss: Number.isFinite(check.band.min) ? 'low' : 'high',
    };
    return { pose: spec.id, score: undefined, facing, results, faults: [turn, ...faults] };
  }
  let total = 0;
  let measured = 0;
  let sum = 0;
  for (const r of results) {
    total += r.check.weight;
    if (r.score === undefined) continue;
    measured += r.check.weight;
    sum += r.check.weight * r.score;
  }
  const score = measured >= MIN_MEASURED_WEIGHT * total ? (100 * sum) / measured : undefined;
  return { pose: spec.id, score, facing, results, faults };
}

export interface CallScore {
  readonly variant: PoseSpec;
  readonly result: PoseScore;
}

/**
 * Scores a pose call against each variant the athlete may choose (either side, a most-muscular style) and
 * keeps the best: the highest score, else a variant in the athlete's facing, else the default variant.
 */
export function scoreCall(id: PoseId, metrics: Metrics, facing: Facing | undefined): CallScore {
  const variants = POSE_SPECS[id];
  let best: CallScore = { variant: variants[0], result: scorePose(variants[0], metrics, facing) };
  for (let i = 1; i < variants.length; i++) {
    const next = { variant: variants[i], result: scorePose(variants[i], metrics, facing) };
    if (preference(next, facing) > preference(best, facing)) best = next;
  }
  return best;
}

/** Any score beats none; with no score, a variant in the athlete's facing beats one that asks them to turn. */
function preference({ variant, result }: CallScore, facing: Facing | undefined): number {
  return result.score ?? (variant.facing === facing ? -1 : -2);
}
