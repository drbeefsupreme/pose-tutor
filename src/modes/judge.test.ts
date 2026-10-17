import { describe, expect, it } from 'vitest';
import { JUDGE, JUDGE_CALLS, JUDGE_ORDER, judgeMode, type CallResult } from './judge';
import { startDrill } from './runner';
import { body, feed, hits, NOBODY, said } from './testkit';

const ROUND = { ...JUDGE, order: JUDGE_ORDER.slice(0, 3), limitMs: 10_000, restMs: 2000 };

describe("Judge's calls", () => {
  it('calls the quarter turns, then the mandatory poses, in prejudging order', () => {
    expect(JUDGE_ORDER).toEqual([
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
    ]);
  });

  it('runs a round: a hit, a timeout and a skip, with rests between calls', () => {
    const { drill, effects } = startDrill(judgeMode(ROUND), 0);
    expect(said(effects)).toEqual(['Facing the front, relaxed.']);
    expect(drill.view(0)).toEqual(expect.objectContaining({ scoring: 'relaxedFront', detail: 'Call 1 of 3', clock: { label: 'Time left', ms: 10_000 } }));

    feed(drill, 0, 1900, NOBODY);
    const first = feed(drill, 2000, 5000, body(90, [], 'relaxedFront'));
    expect(hits(first)).toEqual([{ kind: 'hit', pose: 'relaxedFront', result: expect.objectContaining({ meanScore: 90, timeToHitMs: 2000 }) }]);
    expect(drill.view(5000).stage).toEqual({ kind: 'rest' });

    expect(said(feed(drill, 5100, 6900, NOBODY))).toEqual([]);
    expect(said(drill.frame(7000, NOBODY, undefined))).toEqual([JUDGE_CALLS.quarterTurnLeftSide]);
    const second = feed(drill, 7100, 17_000, body(70, [], 'quarterTurnLeftSide'));
    expect(said(second)).toContain('Time.');
    expect(hits(second)).toEqual([]);

    feed(drill, 17_100, 19_000, NOBODY);
    drill.frame(19_100, body(40, [], 'relaxedBack'), undefined);
    expect(said(drill.command(20_000, 'skip'))).toEqual(["That's the round. Average score 67."]);

    const stage = drill.view(20_000).stage;
    const calls: CallResult[] = [
      { pose: 'relaxedFront', outcome: 'hit', score: 90, timeMs: 2000 },
      { pose: 'quarterTurnLeftSide', outcome: 'timeout', score: 70, timeMs: 10_000 },
      { pose: 'relaxedBack', outcome: 'skipped', score: 40, timeMs: 1000 },
    ];
    expect(stage.kind === 'done' && stage.summary).toEqual({ mode: 'judge', calls, complete: true, meanScore: 200 / 3 });
  });

  it('moves on from a rest at once when the athlete says next', () => {
    const { drill } = startDrill(judgeMode(ROUND), 0);
    feed(drill, 0, 3000, body(95, [], 'relaxedFront'));
    expect(drill.view(3000).stage).toEqual({ kind: 'rest' });
    expect(said(drill.command(3100, 'next'))).toEqual([JUDGE_CALLS.quarterTurnLeftSide]);
    expect(drill.view(3100).title).toBe('Quarter turn left');
  });

  it('ends an incomplete round when stopped', () => {
    const { drill } = startDrill(judgeMode(ROUND), 0);
    feed(drill, 0, 3000, body(95, [], 'relaxedFront'));
    drill.command(3500, 'stop');
    const stage = drill.view(3500).stage;
    expect(stage.kind === 'done' && stage.summary).toEqual(expect.objectContaining({ complete: false, meanScore: 95 }));
  });
});
