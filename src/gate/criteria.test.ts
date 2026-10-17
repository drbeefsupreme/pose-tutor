import { describe, expect, it } from 'vitest';
import { POSE_IDS, clearlyDifferent, judge, median, type CaseResult, type CallRow, type GateRun } from './criteria';
import type { PoseId } from '../pose/types';

const row = (pose: PoseId, scores: Partial<CallRow>): CaseResult => ({
  id: pose,
  pose,
  detected: 10,
  facing: 'front',
  scores: { ...Object.fromEntries(POSE_IDS.map((id) => [id, null])), ...scores } as CallRow,
  topCue: null,
});

const run = (poses: readonly CaseResult[], faults: GateRun['faults'] = []): GateRun => ({
  at: '2026-10-10T00:00:00Z',
  backend: { renderer: 'test', software: true, delegate: 'CPU' },
  size: [1280, 720],
  frames: 10,
  calibrated: true,
  poses,
  faults,
  references: [],
});

describe('clearlyDifferent', () => {
  it('separates facings and arms overhead from arms down, not look-alikes', () => {
    expect(clearlyDifferent('relaxedFront', 'relaxedBack')).toBe(true);
    expect(clearlyDifferent('frontDoubleBiceps', 'frontLatSpread')).toBe(true);
    expect(clearlyDifferent('frontLatSpread', 'mostMuscular')).toBe(false);
    expect(clearlyDifferent('frontDoubleBiceps', 'absAndThighs')).toBe(false);
    expect(clearlyDifferent('sideChest', 'sideTriceps')).toBe(false);
  });
});

describe('judge', () => {
  it('fails a low own score and a clearly different cross score, and lists look-alikes apart', () => {
    const verdict = judge(
      run([
        row('frontDoubleBiceps', { frontDoubleBiceps: 84, relaxedFront: 61 }),
        row('frontLatSpread', { frontLatSpread: 99, mostMuscular: 88 }),
        row('sideChest', { sideChest: 10 }),
      ]),
    );
    expect(verdict.failures).toEqual([
      'frontDoubleBiceps scores 84.0 for itself, below 85.',
      'frontDoubleBiceps scores 61.0 for the clearly different relaxedFront, not below 60.',
    ]);
    expect(verdict.lookAlikes).toEqual([{ rendered: 'frontLatSpread', called: 'mostMuscular', score: 88 }]);
  });

  it('passes a fault only with its cue on top and a score below 85', () => {
    const fault = (score: number, topCue: string) => ({
      ...row('frontDoubleBiceps', { frontDoubleBiceps: score }),
      id: 'drop',
      topCue,
      label: 'drop',
      expectedCue: 'Raise your elbows to shoulder height.',
    });
    const failures = judge(run([], [fault(66, 'Raise your elbows to shoulder height.'), fault(88, 'Raise your elbows to shoulder height.'), fault(60, 'Look straight at the camera.')])).failures;
    expect(failures).toHaveLength(2);
  });
});

describe('median', () => {
  it('ranks no score below every score', () => {
    expect(median([90, 80, undefined, 70])).toBe(75);
    expect(median([90, undefined, undefined, 70])).toBeNull();
    expect(median([undefined, 50, 60])).toBe(50);
  });
});
