// Voice commands: what a recognized phrase means. Jev chooses among COMMAND_OPTIONS; its answer counts only at
// MIN_CONFIDENCE or more. Otherwise, and whenever jev is unavailable, a small keyword table decides.

export const COMMAND_OPTIONS = {
  next: 'Move on: the next step, the next pose or the next call.',
  repeat: 'Say the last instruction again.',
  whatsWrong: 'Asks what is wrong with the pose right now, or what to fix.',
  pause: 'Pause or wait for a moment.',
  resume: 'Continue after a pause.',
  stop: 'Stop practicing and end the drill.',
  skip: 'Skip the current step or pose without finishing it.',
  other: 'Anything else: talk that is not a command for the app.',
} as const satisfies Record<string, string>;

export type Command = keyof typeof COMMAND_OPTIONS;

const MIN_CONFIDENCE = 0.7;

/** Jev's answer, or `unavailable` when the app could not ask jev (no key stored, offline, an error). */
export type IntentReply =
  | { readonly kind: 'answer'; readonly choice: string; readonly confidence: number }
  | { readonly kind: 'unavailable' };

interface Decision {
  /** Undefined when nothing matched: the phrase is ignored. */
  readonly command: Command | undefined;
  readonly via: 'jev' | 'keywords';
  /** Jev's confidence, when jev answered. */
  readonly confidence: number | undefined;
}

/** Checked in order: the first match wins, so "skip to the next one" skips. */
const KEYWORDS: readonly (readonly [Command, RegExp])[] = [
  ['whatsWrong', /\bwrong\b|\bwhat (do|should) i (fix|change)\b|\bhow do i fix\b/],
  ['repeat', /\brepeat\b|\bagain\b|\bsay (that|it)\b|\bpardon\b|\bwhat did you say\b/],
  ['resume', /\bresume\b|\bcontinue\b|\bcarry on\b|\bi'?m ready\b|\bunpause\b/],
  ['pause', /\bpause\b|\bhold on\b|\bwait\b|\bone (sec|second|moment)\b|\ba (sec|second|moment)\b|\bbreak\b/],
  ['stop', /\bstop\b|\bquit\b|\bend (it|the drill|the session)\b|\bexit\b|\bi'?m done\b/],
  ['skip', /\bskip\b/],
  ['next', /\bnext\b|\bmove on\b|\bgo on\b|\bgo ahead\b/],
];

export function keywordCommand(heard: string): Command | undefined {
  const text = heard.toLowerCase();
  return KEYWORDS.find(([, pattern]) => pattern.test(text))?.[0];
}

const isCommand = (choice: string): choice is Command => Object.hasOwn(COMMAND_OPTIONS, choice);

export function decide(heard: string, reply: IntentReply): Decision {
  if (reply.kind === 'answer' && reply.confidence >= MIN_CONFIDENCE && isCommand(reply.choice)) {
    return { command: reply.choice, via: 'jev', confidence: reply.confidence };
  }
  return { command: keywordCommand(heard), via: 'keywords', confidence: reply.kind === 'answer' ? reply.confidence : undefined };
}
