import { advance, SCHEDULER, type HitResult, type SessionState } from '../pose/session';
import { POSE_SPECS } from '../pose/spec';
import type { PoseId } from '../pose/types';
import { say, sessionAfter, sessionStage, spoken, type Mode, type Step } from './mode';

// Learn a pose: the build-up steps one at a time (the athlete moves on by voice or key), then free correction by
// the cue scheduler until the pose is hit.

export interface LearnState {
  readonly pose: PoseId;
  readonly stage:
    | { readonly kind: 'step'; readonly index: number }
    | { readonly kind: 'practice'; readonly session: SessionState }
    | { readonly kind: 'done'; readonly result: HitResult | undefined };
}

const PRACTICE_SAY = 'Now hit the pose.';

export function learnMode(pose: PoseId): Mode<LearnState> {
  const spec = POSE_SPECS[pose][0];
  const steps = spec.buildUp;

  const practice = (now: number): Step<LearnState> => ({
    state: { pose, stage: { kind: 'practice', session: sessionAfter(PRACTICE_SAY, now) } },
    effects: [say(PRACTICE_SAY, true)],
  });

  const step = (index: number, intro = ''): Step<LearnState> => ({
    state: { pose, stage: { kind: 'step', index } },
    effects: [say(`${intro}${steps[index]}`, true)],
  });

  return {
    id: 'learn',
    start: (now) => (steps.length > 0 ? step(0, `${spec.name}, step by step. `) : practice(now)),
    frame(state, { now, sighting }) {
      if (state.stage.kind !== 'practice' || sighting === undefined) return { state, effects: [] };
      const { state: session, events } = advance(state.stage.session, sighting, now);
      const effects = spoken(events);
      const hit = events.find((e) => e.kind === 'hit');
      if (!hit) return { state: { pose, stage: { kind: 'practice', session } }, effects };
      return {
        state: { pose, stage: { kind: 'done', result: hit.result } },
        effects: [...effects, { kind: 'hit', pose, result: hit.result }],
      };
    },
    next(state, now) {
      if (state.stage.kind !== 'step') return { state, effects: [] };
      return state.stage.index + 1 < steps.length ? step(state.stage.index + 1) : practice(now);
    },
    skip(state, now) {
      if (state.stage.kind === 'step') return practice(now);
      if (state.stage.kind === 'practice') return { state: { pose, stage: { kind: 'done', result: undefined } }, effects: [] };
      return { state, effects: [] };
    },
    stop: (state) => (state.stage.kind === 'done' ? state : { pose, stage: { kind: 'done', result: undefined } }),
    view(state, now) {
      const base = { figure: { kind: 'pose', pose }, scoring: pose, title: spec.name, clock: undefined } as const;
      const { stage } = state;
      switch (stage.kind) {
        case 'step':
          return {
            ...base,
            detail: `Step ${stage.index + 1} of ${steps.length}`,
            stage: { kind: 'step', index: stage.index, count: steps.length, text: steps[stage.index] },
          };
        case 'practice':
          return { ...base, detail: 'Free correction', stage: sessionStage(stage.session, now, SCHEDULER.holdMs) };
        case 'done':
          return { ...base, detail: undefined, stage: { kind: 'done', summary: { mode: 'learn', pose, result: stage.result } } };
      }
    },
  };
}
