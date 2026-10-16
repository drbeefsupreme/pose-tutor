import { describe, expect, it } from 'vitest';
import { holdMode } from './hold';
import { startDrill } from './runner';
import { body, feed, hits, NOBODY, said } from './testkit';

describe('Hold drill', () => {
  it('holds for the goal and reports the mean score and steadiness', () => {
    const { drill, effects } = startDrill(holdMode('frontDoubleBiceps', 10), 0);
    expect(said(effects)).toEqual(['Front double biceps, 10 second hold.']);
    expect(said(feed(drill, 0, 2900, body(60, ['Raise your elbows.'])))).toEqual(['Raise your elbows.']);

    expect(said(drill.frame(3000, body(90), undefined))).toEqual(['Hold it for 10 seconds.']);
    const during = [];
    for (let t = 3100; t <= 12_900; t += 100) during.push(...drill.frame(t, body(t % 200 === 0 ? 90 : 94), undefined));
    expect(said(during)).toEqual(['Five seconds.']);
    expect(hits(during)).toEqual([]);
    expect(drill.view(12_900).clock?.ms).toBe(100);

    const end = drill.frame(13_000, body(90), undefined);
    expect(said(end)).toEqual(['Time. Relax.']);
    const [hit] = hits(end);
    expect(hit?.kind === 'hit' && hit.result).toEqual(expect.objectContaining({ timeToHitMs: 3000, goalMs: 10_000, resets: 0 }));
    expect(hit?.kind === 'hit' && hit.result.meanScore).toBeCloseTo(92, 0);
    expect(hit?.kind === 'hit' && hit.result.scoreSd).toBeCloseTo(2, 0);
    expect(drill.view(13_000).stage.kind).toBe('done');
  });

  it('survives a dip of under a second but restarts after a longer one', () => {
    const { drill } = startDrill(holdMode('frontDoubleBiceps', 10), 0);
    drill.frame(0, body(90), undefined);
    feed(drill, 100, 2000, body(90));
    expect(said(feed(drill, 2100, 2900, body(70)))).toEqual([]);
    expect(drill.view(2900).stage).toEqual({ kind: 'holding', heldMs: 2900, goalMs: 10_000 });
    feed(drill, 3000, 4000, body(90));

    expect(said(feed(drill, 4100, 5200, NOBODY))).toEqual(['Five seconds.', 'Lost it. Get back into the pose.']);
    expect(drill.view(5200).stage.kind).toBe('framing');

    drill.frame(6000, body(88), undefined);
    const end = feed(drill, 6100, 16_000, body(88));
    const [hit] = hits(end);
    expect(hit?.kind === 'hit' && hit.result).toEqual(expect.objectContaining({ meanScore: 88, resets: 1, timeToHitMs: 6000 }));
  });

  it('counts the hold from the drill start when the first frame is older than the start', () => {
    const { drill } = startDrill(holdMode('frontDoubleBiceps', 10), 1000);
    drill.frame(700, body(92), undefined);
    expect(drill.view(1000).stage).toEqual({ kind: 'holding', heldMs: 0, goalMs: 10_000 });
    expect(hits(feed(drill, 800, 10_900, body(92)))).toEqual([]);
    const [hit] = hits(drill.frame(11_000, body(92), undefined));
    expect(hit?.kind === 'hit' && hit.result).toEqual(expect.objectContaining({ timeToHitMs: 0, meanScore: 92, goalMs: 10_000 }));
  });

  it('calls halfway on a 20 second hold', () => {
    const { drill } = startDrill(holdMode('backDoubleBiceps', 20), 0);
    drill.frame(0, body(95), undefined);
    expect(said(feed(drill, 100, 20_000, body(95)))).toEqual(['Halfway.', 'Five seconds.', 'Time. Relax.']);
  });
});
