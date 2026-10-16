import type { PoseLandmarks } from '../pose/landmarks';
import { SCHEDULER, startSession, type FramingReason, type HitResult, type SessionEvent, type SessionState, type Sighting } from '../pose/session';
import type { FigurePose, PoseId } from '../pose/types';
import type { CallResult } from './judge';

// The contract between a practice mode (a pure reducer over frames, commands and time) and the tutor shell that
// owns the camera, the speech channel and the API. Time is the mode clock: it stands still while a drill is paused.

export type ModeId = 'learn' | 'hold' | 'judge' | 'mirror';

/** One camera frame. `sighting` is undefined when the mode scores no pose. */
export interface Frame {
  readonly now: number;
  readonly sighting: Sighting | undefined;
  readonly landmarks: PoseLandmarks | undefined;
}

/** What a mode asks of the shell. `hit`: the athlete held a pose; the shell saves the photo and asks the coach. */
export type Effect =
  | { readonly kind: 'say'; readonly text: string; readonly interrupt: boolean }
  | { readonly kind: 'hit'; readonly pose: PoseId; readonly result: HitResult };

export interface Step<S> {
  readonly state: S;
  readonly effects: readonly Effect[];
}

/** The figure shows a library pose, or (mirror) a pose built from the athlete's landmarks. */
export type FigureTarget = { readonly kind: 'pose'; readonly pose: PoseId } | { readonly kind: 'live'; readonly figure: FigurePose };

export interface HoldResult extends HitResult {
  readonly goalMs: number;
  /** How often the hold was lost and started again. */
  readonly resets: number;
}

/** The end of a drill. `result` is undefined when the athlete stopped or skipped before a hit. */
export type Summary =
  | { readonly mode: 'learn'; readonly pose: PoseId; readonly result: HitResult | undefined }
  | { readonly mode: 'hold'; readonly pose: PoseId; readonly goalMs: number; readonly result: HoldResult | undefined }
  | { readonly mode: 'judge'; readonly calls: readonly CallResult[]; readonly complete: boolean; readonly meanScore: number }
  | { readonly mode: 'mirror' };

export type Stage =
  | { readonly kind: 'step'; readonly index: number; readonly count: number; readonly text: string }
  | { readonly kind: 'framing'; readonly reason: FramingReason }
  | { readonly kind: 'correcting' }
  | { readonly kind: 'holding'; readonly heldMs: number; readonly goalMs: number }
  | { readonly kind: 'rest' }
  | { readonly kind: 'mirror' }
  | { readonly kind: 'done'; readonly summary: Summary };

export interface ModeView {
  readonly figure: FigureTarget;
  /** The pose each frame is scored against; undefined when nothing is scored. */
  readonly scoring: PoseId | undefined;
  readonly title: string;
  readonly detail: string | undefined;
  readonly stage: Stage;
  readonly clock: { readonly label: string; readonly ms: number } | undefined;
}

export interface Mode<S> {
  readonly id: ModeId;
  start(now: number): Step<S>;
  frame(state: S, frame: Frame): Step<S>;
  /** The athlete asks to move on: the next build-up step, or the next call. */
  next(state: S, now: number): Step<S>;
  /** The athlete gives up on the current step, pose or call. */
  skip(state: S, now: number): Step<S>;
  /** Ends the drill now; the state's view is `done` afterwards. */
  stop(state: S, now: number): S;
  view(state: S, now: number): ModeView;
}

export const say = (text: string, interrupt = false): Effect => ({ kind: 'say', text, interrupt });

/** The spoken sentences of cue scheduler events, in order. */
export function spoken(events: readonly SessionEvent[]): Effect[] {
  return events.flatMap((e) => ('say' in e ? [say(e.say.text, e.say.interrupt)] : []));
}

/** A new cue scheduler session that stays quiet while `text` (said by the mode) is spoken. */
export function sessionAfter(text: string, now: number): SessionState {
  return { ...startSession(now), busyUntil: now + SCHEDULER.msPerWord * text.split(' ').length };
}

/** The stage of a cue scheduler session that has not hit yet. */
export function sessionStage(session: SessionState, now: number, goalMs: number): Stage {
  const { phase } = session;
  if (phase.kind === 'framing') return { kind: 'framing', reason: phase.reason };
  if (phase.kind === 'holding') return { kind: 'holding', heldMs: now - phase.since, goalMs };
  return { kind: 'correcting' };
}
