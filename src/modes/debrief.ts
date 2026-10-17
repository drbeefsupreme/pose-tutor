export interface DebriefQueue<J> {
  readonly running: J | undefined;
  readonly waiting: J | undefined;
}

interface QueueStep<J> {
  readonly queue: DebriefQueue<J>;
  readonly start: J | undefined;
  readonly dropped: J | undefined;
}

export const EMPTY_QUEUE: DebriefQueue<never> = { running: undefined, waiting: undefined };

export function enqueue<J>(queue: DebriefQueue<J>, job: J): QueueStep<J> {
  if (queue.running === undefined) return { queue: { running: job, waiting: undefined }, start: job, dropped: undefined };
  return { queue: { running: queue.running, waiting: job }, start: undefined, dropped: queue.waiting };
}

export function settle<J>(queue: DebriefQueue<J>): QueueStep<J> {
  return { queue: { running: queue.waiting, waiting: undefined }, start: queue.waiting, dropped: undefined };
}
