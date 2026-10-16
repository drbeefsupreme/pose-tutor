import { describe, expect, it } from 'vitest';
import { POSE_SPECS } from '../pose/spec';
import { learnMode } from './learn';
import { startDrill } from './runner';
import { body, feed, hits, said } from './testkit';

const STEPS = POSE_SPECS.frontDoubleBiceps[0].buildUp;

describe('Learn a pose', () => {
  it('says the build-up steps one at a time as the athlete moves on, then corrects until the hit', () => {
    const { drill, effects } = startDrill(learnMode('frontDoubleBiceps'), 0);
    expect(said(effects)).toEqual([`Front double biceps, step by step. ${STEPS[0]}`]);
    expect(drill.view(0).stage).toEqual({ kind: 'step', index: 0, count: STEPS.length, text: STEPS[0] });

    // A perfect pose during the steps is not a hit: the steps come first.
    expect(hits(feed(drill, 0, 5000, body(98)))).toEqual([]);

    const spoken: string[] = [];
    for (let i = 1; i <= STEPS.length; i++) spoken.push(...said(drill.command(5000 + i, 'next')));
    expect(spoken).toEqual([...STEPS.slice(1), 'Now hit the pose.']);

    const correcting = feed(drill, 6000, 9000, body(70, ['Raise your elbows.']));
    expect(said(correcting)).toContain('Raise your elbows.');
    expect(drill.view(9000).stage.kind).toBe('correcting');

    const hit = feed(drill, 9100, 13_000, body(92));
    expect(hits(hit)).toEqual([{ kind: 'hit', pose: 'frontDoubleBiceps', result: expect.objectContaining({ meanScore: 92, scoreSd: 0 }) }]);
    const stage = drill.view(13_000).stage;
    expect(stage.kind === 'done' && stage.summary).toEqual({
      mode: 'learn',
      pose: 'frontDoubleBiceps',
      result: expect.objectContaining({ meanScore: 92, timeToHitMs: 9100 - 5000 - STEPS.length }),
    });
  });

  it('skips the remaining steps straight to free correction', () => {
    const { drill } = startDrill(learnMode('frontLatSpread'), 0);
    expect(said(drill.command(100, 'skip'))).toEqual(['Now hit the pose.']);
    expect(drill.view(100).stage.kind).not.toBe('step');
  });

  it('ends without a result when stopped', () => {
    const { drill } = startDrill(learnMode('frontDoubleBiceps'), 0);
    drill.command(100, 'stop');
    const stage = drill.view(200).stage;
    expect(stage.kind === 'done' && stage.summary).toEqual({ mode: 'learn', pose: 'frontDoubleBiceps', result: undefined });
  });
});
