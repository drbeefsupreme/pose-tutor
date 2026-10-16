// The coach debrief queue. One debrief runs at a time, and at most one waits: a newer hit replaces the waiting
// one, so the coach always looks at the latest pose and never holds up the drill.

export interface DebriefQueue<J> {
  readonly running: J | undefined;
  readonly waiting: J | undefined;
}

export interface QueueStep<J> {
  readonly queue: DebriefQueue<J>;
  /** The job to start now, if any. */
  readonly start: J | undefined;
  /** The waiting job that `job` replaced. */
  readonly dropped: J | undefined;
}

export const EMPTY_QUEUE: DebriefQueue<never> = { running: undefined, waiting: undefined };

export function enqueue<J>(queue: DebriefQueue<J>, job: J): QueueStep<J> {
  if (queue.running === undefined) return { queue: { running: job, waiting: undefined }, start: job, dropped: undefined };
  return { queue: { running: queue.running, waiting: job }, start: undefined, dropped: queue.waiting };
}

/** The running job ended (with a note or an error): start the waiting one. */
export function settle<J>(queue: DebriefQueue<J>): QueueStep<J> {
  return { queue: { running: queue.waiting, waiting: undefined }, start: queue.waiting, dropped: undefined };
}
