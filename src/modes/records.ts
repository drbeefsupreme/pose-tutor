import type { PoseId } from '../pose/types';
import { field, storedObject } from './stored';
import { JUDGE_ORDER, type CallResult } from './judge';
import type { Summary } from './mode';

export const BEST_KEY = 'posing-judge-best';

interface PoseBest {
  readonly score: number;
  /** Fastest hit; undefined until the pose was hit. */
  readonly timeMs: number | undefined;
}

interface JudgeBest {
  readonly round: { readonly meanScore: number; readonly at: string } | undefined;
  readonly poses: Partial<Record<PoseId, PoseBest>>;
}

export const NO_BEST: JudgeBest = { round: undefined, poses: {} };

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Reads the stored record; anything malformed counts as no record. */
export function parseBest(raw: string | null): JudgeBest {
  const stored = storedObject(raw);
  const round = field(stored, 'round');
  const meanScore = field(round, 'meanScore');
  const at = field(round, 'at');
  const poses: Partial<Record<PoseId, PoseBest>> = {};
  for (const pose of JUDGE_ORDER) {
    const best = field(field(stored, 'poses'), pose);
    const score = field(best, 'score');
    const timeMs = field(best, 'timeMs');
    if (finite(score)) poses[pose] = { score, timeMs: finite(timeMs) ? timeMs : undefined };
  }
  return { round: finite(meanScore) && typeof at === 'string' ? { meanScore, at } : undefined, poses };
}

export interface NewBests {
  readonly round: boolean;
  readonly poses: readonly PoseId[];
}

function poseBest(prev: PoseBest | undefined, call: CallResult): PoseBest | undefined {
  if (call.score === undefined) return prev;
  const time = call.outcome === 'hit' ? call.timeMs : undefined;
  return {
    score: Math.max(prev?.score ?? 0, call.score),
    timeMs: time === undefined ? prev?.timeMs : Math.min(prev?.timeMs ?? Infinity, time),
  };
}

export function mergeBest(best: JudgeBest, summary: Extract<Summary, { mode: 'judge' }>, at: string): { best: JudgeBest; news: NewBests } {
  const poses = { ...best.poses };
  const improved: PoseId[] = [];
  for (const call of summary.calls) {
    const prev = poses[call.pose];
    const next = poseBest(prev, call);
    if (next === undefined) continue;
    poses[call.pose] = next;
    if (prev === undefined || next.score > prev.score || (next.timeMs ?? Infinity) < (prev.timeMs ?? Infinity)) improved.push(call.pose);
  }
  const roundBest = summary.complete && summary.meanScore > (best.round?.meanScore ?? -Infinity);
  return {
    best: { round: roundBest ? { meanScore: summary.meanScore, at } : best.round, poses },
    news: { round: roundBest, poses: improved },
  };
}
