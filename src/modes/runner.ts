import type { PoseLandmarks } from '../pose/landmarks';
import { faultCue } from '../pose/score';
import { SCHEDULER, type Sighting } from '../pose/session';
import type { Command } from './commands';
import { say, type Effect, type Mode, type ModeView } from './mode';

// A running drill: one mode plus the commands every mode shares. Pause stops the mode clock, so time limits and
// holds do not run while the athlete is paused. Repeat says the last sentence again; "what's wrong" answers from
// the latest frame.

export interface DrillView extends ModeView {
  readonly paused: boolean;
  /** The last sentence the drill said. */
  readonly said: string | undefined;
}

export interface Drill {
  frame(now: number, sighting: Sighting | undefined, landmarks: PoseLandmarks | undefined): readonly Effect[];
  command(now: number, command: Command): readonly Effect[];
  view(now: number): DrillView;
}

/** The answer to "what's wrong": the biggest correction on the latest frame. */
export function whatsWrong(sighting: Sighting | undefined): string {
  if (sighting === undefined) return 'Nothing is scored here.';
  if (sighting.kind === 'nobody') return "I can't see you. Step in front of the camera.";
  if (sighting.kind === 'cropped') return 'Step back so your whole body is in view.';
  const { score, faults } = sighting.score;
  const top = faults.find((f) => score === undefined || (f.score ?? 0) < SCHEDULER.minorScore);
  const cue = top && faultCue(top);
  if (cue) return cue.text;
  return score === undefined ? 'Step back so your whole body is in view.' : 'Nothing big. Keep it tight.';
}

/** A new drill and what it says first. */
export interface StartedDrill {
  readonly drill: Drill;
  readonly effects: readonly Effect[];
}

export function startDrill<S>(mode: Mode<S>, now: number): StartedDrill {
  const first = mode.start(now);
  let state = first.state;
  let pausedAt: number | undefined;
  let pausedMs = 0;
  let said: string | undefined;
  let lastSighting: Sighting | undefined;

  const clock = (at: number) => (pausedAt ?? at) - pausedMs;
  const done = (at: number) => mode.view(state, clock(at)).stage.kind === 'done';
  const out = (effects: readonly Effect[]): readonly Effect[] => {
    for (const e of effects) if (e.kind === 'say') said = e.text;
    return effects;
  };
  const apply = (step: { readonly state: S; readonly effects: readonly Effect[] }) => {
    state = step.state;
    return out(step.effects);
  };

  const drill: Drill = {
    frame(at, sighting, landmarks) {
      lastSighting = sighting;
      if (pausedAt !== undefined || done(at)) return [];
      return apply(mode.frame(state, { now: clock(at), sighting, landmarks }));
    },
    command(at, command) {
      if (command === 'repeat') return said === undefined ? [] : [say(said, true)];
      if (command === 'whatsWrong') return out([say(whatsWrong(lastSighting), true)]);
      if (command === 'other' || done(at)) return [];
      if (command === 'stop') {
        state = mode.stop(state, clock(at));
        pausedAt = undefined;
        return out([say('Stopped.', true)]);
      }
      if (command === 'pause') {
        if (pausedAt !== undefined) return [];
        pausedAt = at;
        return out([say('Paused. Say resume when you are ready.', true)]);
      }
      if (command === 'resume') {
        if (pausedAt === undefined) return [];
        pausedMs += at - pausedAt;
        pausedAt = undefined;
        return out([say('Resuming.', true)]);
      }
      if (pausedAt !== undefined) return [];
      return apply(command === 'next' ? mode.next(state, clock(at)) : mode.skip(state, clock(at)));
    },
    view: (at) => ({ ...mode.view(state, clock(at)), paused: pausedAt !== undefined, said }),
  };
  return { drill, effects: out(first.effects) };
}
