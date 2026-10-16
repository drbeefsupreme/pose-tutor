import { JOINTS, NOSE, type PoseLandmarks } from './landmarks';
import { faultCue } from './score';
import { FACING_CHECKS } from './spec';
import type { Check, PoseScore } from './types';

// The cue scheduler: one pose call from the first frame to the hit. It owns what is said and when, so corrections
// come one at a time, most important first. It is a pure reducer over (state, sighting, time).

interface SchedulerConfig {
  /** Score at which the pose counts as hit and the hold starts. */
  readonly hitScore: number;
  /** The hold survives dips down to `hitScore - holdSlack`, so a score hovering at the line does not restart it. */
  readonly holdSlack: number;
  /**
   * While holding, frames that cannot be scored (a facing flicker, a landmark dropout) or that score under the hold line
   * (a jittery side view) are let through for this long after the last frame at the line, so one bad frame does not
   * restart the hold. A frame under the line still counts in the hold's mean score and steadiness.
   */
  readonly holdGraceMs: number;
  /** How long the pose must be held for a hit. */
  readonly holdMs: number;
  /** A correction is not said again sooner than this after it was last said. */
  readonly repeatMs: number;
  /** After a correction ends, the athlete gets this long to fix it before the tutor moves on. */
  readonly fixMs: number;
  /** A fault whose check still scores at least this (of 1) is too small to correct. */
  readonly minorScore: number;
  /** Estimated speaking time per word. Nothing new is said before the sentence in flight ends. */
  readonly msPerWord: number;
}

export const SCHEDULER: SchedulerConfig = {
  hitScore: 85,
  holdSlack: 5,
  holdGraceMs: 300,
  holdMs: 3000,
  repeatMs: 4000,
  fixMs: 2500,
  minorScore: 0.9,
  msPerWord: 400,
};

/** What the camera shows on one frame: nobody, a body partly outside the image, or a body with its pose score. */
export type Sighting =
  | { readonly kind: 'nobody' }
  | { readonly kind: 'cropped' }
  | { readonly kind: 'body'; readonly score: PoseScore };

/** Why the athlete cannot be coached yet. `unclear`: in view and facing right, but too little is visible to score. */
export type FramingReason = 'nobody' | 'cropped' | 'facing' | 'unclear';

/** A sentence for the speech channel. `interrupt` cuts off the sentence in flight. */
export interface Say {
  readonly text: string;
  readonly interrupt: boolean;
}

export interface HitResult {
  /** Score on the frame that completed the hold. */
  readonly score: number;
  /** From the session start to the start of the hold that hit. */
  readonly timeToHitMs: number;
  /** Mean score over the hold. */
  readonly meanScore: number;
  /** Steadiness: the score's standard deviation over the hold, in points. 0 is perfectly steady. */
  readonly scoreSd: number;
}

export type SessionEvent =
  | { readonly kind: 'framing'; readonly at: number; readonly reason: FramingReason }
  | { readonly kind: 'correcting'; readonly at: number }
  | { readonly kind: 'cue'; readonly at: number; readonly say: Say }
  | { readonly kind: 'praise'; readonly at: number; readonly say: Say }
  | { readonly kind: 'holding'; readonly at: number; readonly say: Say }
  | { readonly kind: 'hit'; readonly at: number; readonly say: Say; readonly result: HitResult };

interface HoldStats {
  readonly n: number;
  readonly sum: number;
  readonly sumSq: number;
}

type Phase =
  | { readonly kind: 'framing'; readonly reason: FramingReason }
  | { readonly kind: 'correcting' }
  | {
      readonly kind: 'holding';
      readonly since: number;
      readonly stats: HoldStats;
      /** The last frame that scored at or above the hold line; the hold grace runs from here. */
      readonly seenAt: number;
    }
  | { readonly kind: 'hit'; readonly result: HitResult };

export interface SessionState {
  readonly startedAt: number;
  readonly phase: Phase;
  /** Estimated end of the sentence in flight. */
  readonly busyUntil: number;
  /** The last correction said in this phase, and the estimated end of saying it. */
  readonly focus: { readonly text: string; readonly endsAt: number } | undefined;
  readonly lastSaid: ReadonlyMap<string, number>;
  readonly praises: number;
}

interface Advance {
  readonly state: SessionState;
  readonly events: readonly SessionEvent[];
}

const FRAMING_SAY: { readonly [R in Exclude<FramingReason, 'facing'>]: string } = {
  nobody: 'Step in front of the camera.',
  cropped: 'Step back so your whole body is in view.',
  unclear: 'Step back so your whole body is in view.',
};
const PRAISE = ['Good.', 'Nice.', "That's it."];
const HOLD_SAY = 'Hold it.';
const HIT_SAY = 'Pose hit. Relax.';

const TURN_CHECKS: ReadonlySet<Check> = new Set(Object.values(FACING_CHECKS));

/** The nose and every limb joint down to the toes: the landmarks that must lie inside the image. */
const IN_VIEW = [
  NOSE,
  ...(['shoulder', 'elbow', 'wrist', 'hip', 'knee', 'ankle', 'heel', 'footIndex'] as const).flatMap((joint) => [
    JOINTS[joint].left,
    JOINTS[joint].right,
  ]),
];

/** Whether the whole body is inside the image. Landmarks outside it are the detector's guesses. */
export function inView(lm: PoseLandmarks): boolean {
  return IN_VIEW.every((i) => {
    const { x, y } = lm.points[i];
    return x >= 0 && x <= 1 && y >= 0 && y <= 1;
  });
}

export function startSession(now: number): SessionState {
  return {
    startedAt: now,
    phase: { kind: 'framing', reason: 'nobody' },
    busyUntil: now,
    focus: undefined,
    lastSaid: new Map(),
    praises: 0,
  };
}

type Reading =
  | { readonly kind: 'framing'; readonly reason: FramingReason; readonly say: string }
  | { readonly kind: 'scored'; readonly score: number; readonly corrections: readonly string[] };

/** The framing problem of a sighting, or its score and the distinct corrections worth saying, most important first. */
function read(sighting: Sighting, minorScore: number): Reading {
  if (sighting.kind !== 'body') return { kind: 'framing', reason: sighting.kind, say: FRAMING_SAY[sighting.kind] };
  const { score, faults } = sighting.score;
  if (score === undefined) {
    const turn = faults.at(0);
    const cue = turn && TURN_CHECKS.has(turn.check) ? faultCue(turn) : undefined;
    return cue
      ? { kind: 'framing', reason: 'facing', say: cue.text }
      : { kind: 'framing', reason: 'unclear', say: FRAMING_SAY.unclear };
  }
  const corrections: string[] = [];
  for (const fault of faults) {
    const text = (fault.score ?? 0) < minorScore ? faultCue(fault)?.text : undefined;
    if (text !== undefined && !corrections.includes(text)) corrections.push(text);
  }
  return { kind: 'scored', score, corrections };
}

type Draft = { -readonly [K in keyof SessionState]: SessionState[K] };

function say(s: Draft, text: string, interrupt: boolean, now: number, config: SchedulerConfig): Say {
  s.busyUntil = now + config.msPerWord * text.split(' ').length;
  return { text, interrupt };
}

/**
 * Says the most important sentence of `targets` once the channel is free. The last correction keeps the floor
 * until it had `fixMs` to be fixed, and no correction is said again within `repeatMs`. With `praiseFixes`, a
 * correction that disappeared earns praise first.
 */
function coach(
  s: Draft,
  targets: readonly string[],
  praiseFixes: boolean,
  now: number,
  config: SchedulerConfig,
  events: SessionEvent[],
): void {
  if (now < s.busyUntil) return;
  if (s.focus && !targets.includes(s.focus.text)) {
    s.focus = undefined;
    if (praiseFixes) {
      events.push({ kind: 'praise', at: now, say: say(s, PRAISE[s.praises % PRAISE.length], false, now, config) });
      s.praises += 1;
      return;
    }
  }
  if (s.focus && now < s.focus.endsAt + config.fixMs) return;
  const text = targets.at(0);
  if (text === undefined || now < (s.lastSaid.get(text) ?? -Infinity) + config.repeatMs) return;
  events.push({ kind: 'cue', at: now, say: say(s, text, false, now, config) });
  s.focus = { text, endsAt: s.busyUntil };
  s.lastSaid = new Map(s.lastSaid).set(text, now);
}

/**
 * Moves the session to `now` given what the camera shows: framing until the athlete is in view and facing right,
 * then correcting until the score reaches `hitScore`, then holding until it stays there for `holdMs`, then hit.
 * Phase events mark each change; cue, praise, holding and hit events carry the sentence to say.
 */
export function advance(
  state: SessionState,
  sighting: Sighting,
  now: number,
  config: SchedulerConfig = SCHEDULER,
): Advance {
  if (state.phase.kind === 'hit') return { state, events: [] };
  const s: Draft = { ...state };
  const events: SessionEvent[] = [];
  const reading = read(sighting, config.minorScore);

  if (reading.kind === 'framing') {
    if (s.phase.kind === 'holding' && now - s.phase.seenAt <= config.holdGraceMs) return { state, events: [] };
    if (s.phase.kind !== 'framing' || s.phase.reason !== reading.reason) {
      s.phase = { kind: 'framing', reason: reading.reason };
      s.focus = undefined;
      events.push({ kind: 'framing', at: now, reason: reading.reason });
    }
    coach(s, [reading.say], false, now, config, events);
  } else if (s.phase.kind === 'holding' && reading.score >= config.hitScore - config.holdSlack) {
    const { since, stats } = s.phase;
    const held = { n: stats.n + 1, sum: stats.sum + reading.score, sumSq: stats.sumSq + reading.score * reading.score };
    if (now - since < config.holdMs) {
      s.phase = { kind: 'holding', since, stats: held, seenAt: now };
    } else {
      const meanScore = held.sum / held.n;
      const result: HitResult = {
        score: reading.score,
        timeToHitMs: since - s.startedAt,
        meanScore,
        scoreSd: Math.sqrt(Math.max(0, held.sumSq / held.n - meanScore * meanScore)),
      };
      s.phase = { kind: 'hit', result };
      events.push({ kind: 'hit', at: now, say: say(s, HIT_SAY, true, now, config), result });
    }
  } else if (s.phase.kind === 'holding' && now - s.phase.seenAt <= config.holdGraceMs) {
    const { stats } = s.phase;
    s.phase = { ...s.phase, stats: { n: stats.n + 1, sum: stats.sum + reading.score, sumSq: stats.sumSq + reading.score * reading.score } };
  } else if (s.phase.kind !== 'holding' && reading.score >= config.hitScore) {
    // A camera frame can be older than the session (it was taken before the call started): the hold starts with the session.
    const since = Math.max(now, s.startedAt);
    s.phase = { kind: 'holding', since, stats: { n: 1, sum: reading.score, sumSq: reading.score * reading.score }, seenAt: now };
    s.focus = undefined;
    events.push({ kind: 'holding', at: now, say: say(s, HOLD_SAY, true, now, config) });
  } else {
    if (s.phase.kind !== 'correcting') {
      s.phase = { kind: 'correcting' };
      s.focus = undefined;
      events.push({ kind: 'correcting', at: now });
    }
    coach(s, reading.corrections, true, now, config, events);
  }
  return { state: s, events };
}
