import { describe, expect, it } from 'vitest';
import { JUDGE, JUDGE_ORDER, judgeMode } from './judge';
import { learnMode } from './learn';
import { startDrill, whatsWrong } from './runner';
import { body, feed, NOBODY, said } from './testkit';

describe('a running drill', () => {
  it('stops the mode clock while paused, so a call does not time out during a pause', () => {
    const { drill } = startDrill(judgeMode({ ...JUDGE, order: JUDGE_ORDER.slice(0, 2), limitMs: 10_000 }), 0);
    feed(drill, 0, 4000, NOBODY);
    expect(said(drill.command(4000, 'pause'))).toEqual(['Paused. Say resume when you are ready.']);
    expect(feed(drill, 4100, 30_000, NOBODY)).toEqual([]);
    expect(drill.view(30_000)).toEqual(expect.objectContaining({ paused: true, clock: { label: 'Time left', ms: 6000 } }));
    expect(drill.command(30_000, 'next')).toEqual([]);

    expect(said(drill.command(30_000, 'resume'))).toEqual(['Resuming.']);
    expect(drill.view(35_000).clock).toEqual({ label: 'Time left', ms: 1000 });
    expect(said(feed(drill, 30_100, 36_000, NOBODY))).toContain('Time.');
  });

  it('repeats the last sentence and answers what is wrong from the latest frame', () => {
    const { drill } = startDrill(learnMode('frontDoubleBiceps'), 0);
    drill.command(10, 'skip');
    expect(said(drill.command(20, 'repeat'))).toEqual(['Now hit the pose.']);
    drill.frame(100, body(70, ['Raise your elbows.', 'Bring your fists up.']), undefined);
    expect(said(drill.command(200, 'whatsWrong'))).toEqual(['Raise your elbows.']);
    expect(drill.command(300, 'other')).toEqual([]);
  });

  it('says what to fix for every kind of frame', () => {
    expect(whatsWrong(NOBODY)).toBe("I can't see you. Step in front of the camera.");
    expect(whatsWrong({ kind: 'cropped' })).toBe('Step back so your whole body is in view.');
    expect(whatsWrong(body(96))).toBe('Nothing big. Keep it tight.');
    expect(whatsWrong(undefined)).toBe('Nothing is scored here.');
  });

  it('ignores commands after the drill is done, except repeat', () => {
    const { drill } = startDrill(learnMode('frontDoubleBiceps'), 0);
    drill.command(10, 'stop');
    expect(drill.command(20, 'next')).toEqual([]);
    expect(drill.command(20, 'pause')).toEqual([]);
    expect(said(drill.command(20, 'repeat'))).toEqual(['Stopped.']);
  });
});
