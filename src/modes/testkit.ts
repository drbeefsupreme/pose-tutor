import type { Sighting } from '../pose/session';
import type { CheckResult, PoseId } from '../pose/types';
import type { Effect } from './mode';
import type { Drill } from './runner';

// Scripted scores and fake time for the mode tests.

/** A body scoring `score` for `pose`, whose faults ask for `cues`, most important first. */
export function body(score: number | undefined, cues: readonly string[] = [], pose: PoseId = 'frontDoubleBiceps'): Sighting {
  const faults: CheckResult[] = cues.map((text) => ({
    check: { metric: 'elbowHeight', side: 'left', band: { target: 0, min: -1, max: 1 }, weight: 1, low: { text, source: 'TEST' } },
    value: -2,
    score: 0.2,
    miss: 'low',
  }));
  return { kind: 'body', score: { pose, score, facing: 'front', results: faults, faults } };
}

export const NOBODY: Sighting = { kind: 'nobody' };

/** Feeds `sighting` every `stepMs` from `from` up to and including `to`; returns the effects in order. */
export function feed(drill: Drill, from: number, to: number, sighting: Sighting, stepMs = 100): Effect[] {
  const effects: Effect[] = [];
  for (let t = from; t <= to; t += stepMs) effects.push(...drill.frame(t, sighting, undefined));
  return effects;
}

export const said = (effects: readonly Effect[]): string[] => effects.flatMap((e) => (e.kind === 'say' ? [e.text] : []));

export const hits = (effects: readonly Effect[]) => effects.filter((e) => e.kind === 'hit');
