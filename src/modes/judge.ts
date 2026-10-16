import { advance, SCHEDULER, type SchedulerConfig, type SessionState } from '../pose/session';
import { POSE_LABELS } from '../progress/format';
import type { PoseId } from '../pose/types';
import { say, sessionAfter, sessionStage, spoken, type Effect, type Mode, type Step, type Summary } from './mode';

// Judge's calls: NPC prejudging. The quarter turns, then the eight mandatory poses, each called as a head judge
// calls it, with a time limit per call and a short rest between calls.

/** Prejudging order: quarter turns (front, left side, back, right side), then the mandatory poses. */
export const JUDGE_ORDER: readonly PoseId[] = [
  'relaxedFront',
  'quarterTurnLeftSide',
  'relaxedBack',
  'quarterTurnRightSide',
  'frontDoubleBiceps',
  'frontLatSpread',
  'sideChest',
  'backDoubleBiceps',
  'backLatSpread',
  'sideTriceps',
  'absAndThighs',
  'mostMuscular',
];

/** The head judge's call for each pose. A quarter turn to the right shows the left side to the judges. */
export const JUDGE_CALLS: Record<PoseId, string> = {
  relaxedFront: 'Facing the front, relaxed.',
  quarterTurnLeftSide: 'Quarter turn to the right.',
  relaxedBack: 'Quarter turn to the right.',
  quarterTurnRightSide: 'Quarter turn to the right.',
  frontDoubleBiceps: 'Face the front. Front double biceps.',
  frontLatSpread: 'Front lat spread.',
  sideChest: 'Side chest, your best side.',
  backDoubleBiceps: 'Turn to the back. Back double biceps.',
  backLatSpread: 'Back lat spread.',
  sideTriceps: 'Side triceps, your best side.',
  absAndThighs: 'Face the front. Abdominals and thighs.',
  mostMuscular: 'Most muscular.',
};

export interface JudgeConfig {
  readonly scheduler: SchedulerConfig;
  readonly order: readonly PoseId[];
  /** Time to hit each call. */
  readonly limitMs: number;
  /** Pause after a call before the next one. */
  readonly restMs: number;
}

export const JUDGE: JudgeConfig = { scheduler: SCHEDULER, order: JUDGE_ORDER, limitMs: 25_000, restMs: 2500 };

/** One call: `score` is the hold's mean on a hit, else the best score seen; `timeMs` runs from the call to the hold. */
export interface CallResult {
  readonly pose: PoseId;
  readonly outcome: 'hit' | 'timeout' | 'skipped';
  readonly score: number | undefined;
  readonly timeMs: number;
}

export interface JudgeState {
  readonly results: readonly CallResult[];
  readonly stage:
    | { readonly kind: 'call'; readonly since: number; readonly session: SessionState; readonly best: number | undefined }
    | { readonly kind: 'rest'; readonly until: number }
    | { readonly kind: 'done' };
}

/** Mean over the calls made; a call without a score counts 0. */
export function judgeSummary(results: readonly CallResult[], total: number): Extract<Summary, { mode: 'judge' }> {
  const meanScore = results.length === 0 ? 0 : results.reduce((sum, r) => sum + (r.score ?? 0), 0) / results.length;
  return { mode: 'judge', calls: results, complete: results.length === total, meanScore };
}

export function judgeMode(config: JudgeConfig = JUDGE): Mode<JudgeState> {
  const { order, scheduler } = config;

  const call = (results: readonly CallResult[], now: number): Step<JudgeState> => {
    const text = JUDGE_CALLS[order[results.length]];
    return {
      state: { results, stage: { kind: 'call', since: now, session: sessionAfter(text, now, scheduler), best: undefined } },
      effects: [say(text, true)],
    };
  };

  /** Records the current call and rests before the next one, or ends the round. */
  const close = (results: readonly CallResult[], now: number, effects: readonly Effect[]): Step<JudgeState> => {
    if (results.length < order.length) return { state: { results, stage: { kind: 'rest', until: now + config.restMs } }, effects };
    const { meanScore } = judgeSummary(results, order.length);
    return { state: { results, stage: { kind: 'done' } }, effects: [...effects, say(`That's the round. Average score ${Math.round(meanScore)}.`)] };
  };

  /** In a rest, calls the next pose now; in a call, records it as skipped and calls the next one. */
  const moveOn = (state: JudgeState, now: number): Step<JudgeState> => {
    const { stage, results } = state;
    if (stage.kind === 'rest') return call(results, now);
    if (stage.kind !== 'call') return { state, effects: [] };
    const skipped: CallResult = { pose: order[results.length], outcome: 'skipped', score: stage.best, timeMs: now - stage.since };
    const closed = close([...results, skipped], now, []);
    return closed.state.stage.kind === 'rest' ? call(closed.state.results, now) : closed;
  };

  return {
    id: 'judge',
    start: (now) => call([], now),
    frame(state, { now, sighting }) {
      const { stage, results } = state;
      if (stage.kind === 'done') return { state, effects: [] };
      if (stage.kind === 'rest') return now >= stage.until ? call(results, now) : { state, effects: [] };
      const pose = order[results.length];
      if (now - stage.since >= config.limitMs) {
        return close([...results, { pose, outcome: 'timeout', score: stage.best, timeMs: config.limitMs }], now, [say('Time.', true)]);
      }
      if (sighting === undefined) return { state, effects: [] };
      const { state: session, events } = advance(stage.session, sighting, now, scheduler);
      const effects = spoken(events);
      const hit = events.find((e) => e.kind === 'hit');
      if (hit) {
        const result: CallResult = { pose, outcome: 'hit', score: hit.result.meanScore, timeMs: hit.result.timeToHitMs };
        return close([...results, result], now, [...effects, { kind: 'hit', pose, result: hit.result }]);
      }
      const score = sighting.kind === 'body' ? sighting.score.score : undefined;
      const best = score === undefined ? stage.best : Math.max(stage.best ?? 0, score);
      return { state: { results, stage: { ...stage, session, best } }, effects };
    },
    next: moveOn,
    skip: moveOn,
    stop: (state) => ({ results: state.results, stage: { kind: 'done' } }),
    view(state, now) {
      const { stage, results } = state;
      const index = Math.min(results.length, order.length - 1);
      const pose = order[index];
      const base = {
        figure: { kind: 'pose', pose },
        title: POSE_LABELS[pose],
        detail: `Call ${index + 1} of ${order.length}`,
      } as const;
      switch (stage.kind) {
        case 'call':
          return {
            ...base,
            scoring: pose,
            stage: sessionStage(stage.session, now, scheduler.holdMs),
            clock: { label: 'Time left', ms: Math.max(0, config.limitMs - (now - stage.since)) },
          };
        case 'rest':
          return { ...base, scoring: undefined, detail: `Next: call ${index + 1} of ${order.length}`, stage: { kind: 'rest' }, clock: undefined };
        case 'done':
          return {
            ...base,
            scoring: undefined,
            detail: undefined,
            stage: { kind: 'done', summary: judgeSummary(results, order.length) },
            clock: undefined,
          };
      }
    },
  };
}
