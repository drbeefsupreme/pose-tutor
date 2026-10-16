import { advance, SCHEDULER, type SessionState } from '../pose/session';
import { POSE_SPECS } from '../pose/spec';
import type { PoseId } from '../pose/types';
import { say, sessionAfter, sessionStage, spoken, type Effect, type HoldResult, type Mode, type Step } from './mode';

// Hold drill: the cue scheduler coaches the athlete into the pose, then the pose must be held for the goal time.
// The score may dip below the hold line for up to `GRACE_MS`; a longer dip, or losing the athlete, restarts the hold.
// The result is the mean score over the hold and its standard deviation (steadiness).

export const HOLD_GOALS_S = [10, 20, 30] as const;
export type HoldGoal = (typeof HOLD_GOALS_S)[number];

/** How long the score may stay under the hold line before the hold restarts. */
const GRACE_MS = 1000;

interface Stats {
  readonly n: number;
  readonly sum: number;
  readonly sumSq: number;
  readonly last: number;
}

export interface HoldState {
  readonly startedAt: number;
  readonly resets: number;
  readonly stage:
    | { readonly kind: 'approach'; readonly session: SessionState }
    | {
        readonly kind: 'holding';
        readonly since: number;
        /** When the score went under the hold line; undefined while it is above. */
        readonly below: number | undefined;
        readonly stats: Stats;
        /** How many of the time calls (`marks`) were said. */
        readonly called: number;
      }
    | { readonly kind: 'done'; readonly result: HoldResult | undefined };
}

const LOST_SAY = 'Lost it. Get back into the pose.';

/** Remaining-time calls: halfway on long holds, and five seconds to go. */
function marks(goalMs: number): { readonly atMs: number; readonly text: string }[] {
  return [
    ...(goalMs >= 20_000 ? [{ atMs: goalMs / 2, text: 'Halfway.' }] : []),
    ...(goalMs > 5000 ? [{ atMs: goalMs - 5000, text: 'Five seconds.' }] : []),
  ];
}

export function holdMode(pose: PoseId, goalS: HoldGoal): Mode<HoldState> {
  const spec = POSE_SPECS[pose][0];
  const goalMs = goalS * 1000;
  const line = SCHEDULER.hitScore - SCHEDULER.holdSlack;
  const calls = marks(goalMs);
  const holdSay = `Hold it for ${goalS} seconds.`;

  const approach = (startedAt: number, resets: number, text: string, now: number): Step<HoldState> => ({
    state: { startedAt, resets, stage: { kind: 'approach', session: sessionAfter(text, now) } },
    effects: [say(text, true)],
  });

  const finish = (state: HoldState, stats: Stats, since: number): Step<HoldState> => {
    const meanScore = stats.sum / stats.n;
    const result: HoldResult = {
      score: stats.last,
      timeToHitMs: since - state.startedAt,
      meanScore,
      scoreSd: Math.sqrt(Math.max(0, stats.sumSq / stats.n - meanScore * meanScore)),
      goalMs,
      resets: state.resets,
    };
    return {
      state: { ...state, stage: { kind: 'done', result } },
      effects: [say('Time. Relax.', true), { kind: 'hit', pose, result }],
    };
  };

  return {
    id: 'hold',
    start: (now) => approach(now, 0, `${spec.name}, ${goalS} second hold.`, now),
    frame(state, { now, sighting }) {
      const { stage } = state;
      if (stage.kind === 'done' || sighting === undefined) return { state, effects: [] };
      if (stage.kind === 'approach') {
        const { state: session, events } = advance(stage.session, sighting, now, { ...SCHEDULER, holdMs: Infinity });
        const holding = events.find((e) => e.kind === 'holding');
        const score = sighting.kind === 'body' ? sighting.score.score : undefined;
        if (!holding || score === undefined) return { state: { ...state, stage: { kind: 'approach', session } }, effects: spoken(events) };
        // A camera frame can be older than the approach session: the hold starts no earlier than the session.
        const since = Math.max(now, stage.session.startedAt);
        return {
          state: { ...state, stage: { kind: 'holding', since, below: undefined, stats: { n: 1, sum: score, sumSq: score * score, last: score }, called: 0 } },
          effects: [say(holdSay, true)],
        };
      }
      const score = sighting.kind === 'body' ? sighting.score.score : undefined;
      const stats =
        score === undefined ? stage.stats : { n: stage.stats.n + 1, sum: stage.stats.sum + score, sumSq: stage.stats.sumSq + score * score, last: score };
      const below = score !== undefined && score >= line ? undefined : (stage.below ?? now);
      if (below !== undefined && now - below > GRACE_MS) return approach(state.startedAt, state.resets + 1, LOST_SAY, now);
      const heldMs = now - stage.since;
      if (heldMs >= goalMs) return finish(state, stats, stage.since);
      const effects: Effect[] = [];
      let called = stage.called;
      while (called < calls.length && heldMs >= calls[called].atMs) effects.push(say(calls[called++].text));
      return { state: { ...state, stage: { ...stage, below, stats, called } }, effects };
    },
    next: (state) => ({ state, effects: [] }),
    skip: (state) => ({ state: { ...state, stage: { kind: 'done', result: undefined } }, effects: [] }),
    stop: (state) => (state.stage.kind === 'done' ? state : { ...state, stage: { kind: 'done', result: undefined } }),
    view(state, now) {
      const base = { figure: { kind: 'pose', pose }, scoring: pose, title: spec.name, detail: `${goalS} s hold` } as const;
      const { stage } = state;
      switch (stage.kind) {
        case 'approach':
          return { ...base, stage: sessionStage(stage.session, now, goalMs), clock: undefined };
        case 'holding': {
          const heldMs = now - stage.since;
          return {
            ...base,
            stage: { kind: 'holding', heldMs, goalMs },
            clock: { label: 'Hold', ms: Math.max(0, goalMs - heldMs) },
          };
        }
        case 'done':
          return { ...base, stage: { kind: 'done', summary: { mode: 'hold', pose, goalMs, result: stage.result } }, clock: undefined };
      }
    },
  };
}
