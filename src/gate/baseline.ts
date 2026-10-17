// Node runs this file directly, so it has type imports only.
import type { PoseId } from '../pose/types';
import type { Backend, GateRun } from './criteria';
import type { DetectMode } from './page';

/** An own-pose score may move this many points from the baseline. */
export const MAX_DIFF = 5;

interface BaselineCase {
  readonly id: string;
  readonly pose: PoseId;
  /** Own-pose score; null when the call gave no score. */
  readonly own: number | null;
  readonly topCue: string | null;
  /** For a fault render, the cue that must come first. */
  readonly expectedCue?: string;
}

export interface Baseline {
  readonly at: string;
  readonly device: string;
  readonly mode: DetectMode;
  readonly backend: Backend;
  /** The criterion failures of the run (src/gate/criteria.ts). */
  readonly failures: readonly string[];
  readonly cases: readonly BaselineCase[];
  /** Why this baseline was saved, from `--note`. The gate report shows it. */
  readonly note: string;
}

/** What the gate does with `src/gate/baseline.json`, from its command line. */
export type BaselineAction = { readonly kind: 'compare' } | { readonly kind: 'save'; readonly note: string };

/**
 * `--save-baseline` needs `--note "<reason>"`. Without a reason, a scoring regression becomes the new normal and nobody
 * can see why.
 */
export function baselineAction(args: readonly string[]): BaselineAction {
  const at = args.indexOf('--note');
  if (!args.includes('--save-baseline')) {
    if (at !== -1) throw new Error('--note goes with --save-baseline. It says why the new baseline was saved.');
    return { kind: 'compare' };
  }
  const note = at === -1 ? undefined : args[at + 1]?.trim();
  if (note === undefined || note === '' || note.startsWith('--')) {
    throw new Error('--save-baseline needs --note "<reason>": say why the scores may move. The gate report shows the note.');
  }
  return { kind: 'save', note };
}

export function toBaseline(run: GateRun, failures: readonly string[], device: string, mode: DetectMode, note: string): Baseline {
  return {
    at: run.at,
    device,
    mode,
    note,
    backend: run.backend,
    failures,
    cases: [
      ...run.poses.map((c) => ({ id: c.id, pose: c.pose, own: c.scores[c.pose], topCue: c.topCue })),
      ...run.faults.map((c) => ({ id: c.id, pose: c.pose, own: c.scores[c.pose], topCue: c.topCue, expectedCue: c.expectedCue })),
    ],
  };
}

interface CaseComparison {
  readonly id: string;
  readonly baseline: BaselineCase;
  /** The run's own score and top cue; undefined when the run has no such case. */
  readonly run: { readonly own: number | null; readonly topCue: string | null } | undefined;
  /** Run minus baseline own score; null when either has no score. */
  readonly diff: number | null;
  readonly ok: boolean;
}

export interface Comparison {
  readonly cases: readonly CaseComparison[];
  readonly maxDiff: number;
  /** 0 criterion failures and every own-pose score within MAX_DIFF of the baseline. */
  readonly passed: boolean;
}

/** A case passes when both scores are within MAX_DIFF, or when neither run scored it. */
export function compare(run: GateRun, failures: readonly string[], baseline: Baseline): Comparison {
  const byId = new Map([...run.poses, ...run.faults].map((c) => [c.id, { own: c.scores[c.pose], topCue: c.topCue }]));
  const cases = baseline.cases.map((b): CaseComparison => {
    const now = byId.get(b.id);
    const diff = now === undefined || now.own === null || b.own === null ? null : now.own - b.own;
    const ok = now !== undefined && (diff === null ? now.own === b.own : Math.abs(diff) <= MAX_DIFF);
    return { id: b.id, baseline: b, run: now, diff, ok };
  });
  const maxDiff = Math.max(0, ...cases.map((c) => Math.abs(c.diff ?? 0)));
  return { cases, maxDiff, passed: failures.length === 0 && cases.every((c) => c.ok) };
}
