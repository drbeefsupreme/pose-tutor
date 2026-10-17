import { describe, expect, it } from 'vitest';
import type { PoseId } from '../pose/types';
import { baselineAction, compare, toBaseline } from './baseline';
import { POSE_IDS, type CallRow, type CaseResult, type FaultResult, type GateRun } from './criteria';

const row = (pose: PoseId, own: number | null, topCue: string | null = null): CaseResult => ({
  id: pose,
  pose,
  detected: 10,
  facing: 'front',
  scores: { ...Object.fromEntries(POSE_IDS.map((id) => [id, null])), [pose]: own } as CallRow,
  topCue,
});

const fault = (own: number, topCue: string): FaultResult => ({
  ...row('frontDoubleBiceps', own, topCue),
  id: 'fdbElbowsDropped',
  label: 'elbows dropped',
  expectedCue: 'Raise your elbows to shoulder height.',
});

const run = (poses: readonly CaseResult[], faults: readonly FaultResult[] = []): GateRun => ({
  at: '2026-10-16T00:00:00Z',
  backend: { renderer: 'test', software: true, delegate: 'CPU' },
  size: [1280, 720],
  frames: 10,
  calibrated: true,
  poses,
  faults,
  references: [],
});

const saved = toBaseline(
  run([row('frontDoubleBiceps', 98), row('sideChest', null)], [fault(66, 'Raise your elbows to shoulder height.')]),
  [],
  'emulator-5564',
  'video',
  'The figure mesh changed.',
);

describe('gate baseline', () => {
  it('keeps the own score and top cue of every pose and fault', () => {
    expect(saved.cases).toEqual([
      { id: 'frontDoubleBiceps', pose: 'frontDoubleBiceps', own: 98, topCue: null },
      { id: 'sideChest', pose: 'sideChest', own: null, topCue: null },
      { id: 'fdbElbowsDropped', pose: 'frontDoubleBiceps', own: 66, topCue: 'Raise your elbows to shoulder height.', expectedCue: 'Raise your elbows to shoulder height.' },
    ]);
  });

  it('passes own scores within 5 points and fails a larger move, a lost score or a missing case', () => {
    const near = compare(run([row('frontDoubleBiceps', 93), row('sideChest', null)], [fault(70.5, 'x')]), [], saved);
    expect(near.cases.map((c) => [c.id, c.diff, c.ok])).toEqual([
      ['frontDoubleBiceps', -5, true],
      ['sideChest', null, true],
      ['fdbElbowsDropped', 4.5, true],
    ]);
    expect([near.passed, near.maxDiff]).toEqual([true, 5]);

    const far = compare(run([row('frontDoubleBiceps', 92.9), row('sideChest', 80)]), [], saved);
    expect(far.cases.map((c) => c.ok)).toEqual([false, false, false]);
    expect(far.passed).toBe(false);
  });

  it('fails on any criterion failure, even with matching scores', () => {
    const same = run([row('frontDoubleBiceps', 98), row('sideChest', null)], [fault(66, 'Raise your elbows to shoulder height.')]);
    expect(compare(same, [], saved).passed).toBe(true);
    expect(compare(same, ['fdbElbowsDropped gives "x"'], saved).passed).toBe(false);
  });
});

describe('gate --save-baseline', () => {
  const refusal = '--save-baseline needs --note "<reason>"';

  it('refuses to save a baseline without a reason', () => {
    expect(() => baselineAction(['--save-baseline'])).toThrow(refusal);
    expect(() => baselineAction(['--save-baseline', '--note'])).toThrow(refusal);
    expect(() => baselineAction(['--save-baseline', '--note', '  '])).toThrow(refusal);
    expect(() => baselineAction(['--save-baseline', '--note', '--no-build'])).toThrow(refusal);
    expect(() => baselineAction(['--save-baseline', '--note=The figure mesh changed.'])).toThrow(refusal);
  });

  it('saves with the reason, and compares when the flag is absent', () => {
    expect(baselineAction(['--no-build', '--save-baseline', '--note', ' The figure mesh changed. '])).toEqual({
      kind: 'save',
      note: 'The figure mesh changed.',
    });
    expect(baselineAction(['--mode=video'])).toEqual({ kind: 'compare' });
  });

  it('refuses a note when no baseline is saved', () => {
    expect(() => baselineAction(['--note', 'The figure mesh changed.'])).toThrow('--note goes with --save-baseline');
  });

  it('writes the note into the baseline', () => {
    expect(toBaseline(run([row('sideChest', 90)]), [], 'emulator-5564', 'video', 'The figure mesh changed.').note).toBe('The figure mesh changed.');
  });
});
