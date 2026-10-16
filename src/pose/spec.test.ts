import { describe, expect, it } from 'vitest';
import { BODIES, landmarks } from './fixtures';
import { calibrate, measure, metricKey } from './metrics';
import { FACING_CHECKS, POSE_SPECS, resolveSide } from './spec';
import type { Check, MetricId, PoseSpec } from './types';

const variants: readonly PoseSpec[] = Object.values(POSE_SPECS).flat();
const checks: readonly [PoseSpec, Check][] = variants.flatMap((spec) => spec.checks.map((c): [PoseSpec, Check] => [spec, c]));

/** Values a metric cannot pass, so a band edge there needs no cue. */
const LIMITS: { readonly [M in MetricId]: readonly [number, number] } = {
  hipWidth: [0, Infinity],
  shoulderWidth: [0, Infinity],
  twist: [-90, 90],
  stanceRatio: [0, Infinity],
  stagger: [0, Infinity],
  kneeFlex: [0, 180],
  heelLift: [-1, 1],
  abduction: [0, 180],
  elbowFlex: [0, 180],
  elbowHeight: [-Infinity, Infinity],
  wristHeight: [-Infinity, Infinity],
  wristVsNose: [-Infinity, Infinity],
  forearmAngle: [0, 180],
  elbowSpan: [0, Infinity],
  wristGap: [0, Infinity],
  headYaw: [-Infinity, Infinity],
  shrug: [0, Infinity],
  wristVis: [0, 1],
};

describe('POSE_SPECS', () => {
  it('has variants for every pose call, each tagged with its call', () => {
    expect(Object.entries(POSE_SPECS).map(([id, list]) => [id, list.map((v) => v.id)])).toEqual([
      ['relaxedFront', ['relaxedFront']],
      ['quarterTurnLeftSide', ['quarterTurnLeftSide']],
      ['relaxedBack', ['relaxedBack']],
      ['quarterTurnRightSide', ['quarterTurnRightSide']],
      ['frontDoubleBiceps', ['frontDoubleBiceps']],
      ['frontLatSpread', ['frontLatSpread']],
      ['sideChest', ['sideChest', 'sideChest']],
      ['backDoubleBiceps', ['backDoubleBiceps']],
      ['backLatSpread', ['backLatSpread']],
      ['sideTriceps', ['sideTriceps', 'sideTriceps']],
      ['absAndThighs', ['absAndThighs']],
      ['mostMuscular', ['mostMuscular', 'mostMuscular', 'mostMuscular']],
    ]);
  });

  it('gives every variant eight build-up steps, coach-only notes and a tagged description', () => {
    for (const v of variants) {
      expect([v.name, v.buildUp.length, v.coachOnly.length > 0, /\[S\d+\]/.test(v.description)]).toEqual([v.name, 8, true, true]);
    }
  });

  it('speaks every cue in under 8 words and tags its source', () => {
    const cues = [...checks.map(([, c]) => c), ...Object.values(FACING_CHECKS)].flatMap((c) => [c.low, c.high]);
    for (const cue of cues) {
      if (!cue) continue;
      expect([cue.text, cue.text.split(' ').length < 8, /^(S\d+|ESTIMATE)$/.test(cue.source)]).toEqual([cue.text, true, true]);
    }
  });

  it('keeps every target in its band and has a cue for every band edge a value can cross', () => {
    for (const [spec, c] of checks) {
      const [lowest, highest] = LIMITS[c.metric];
      const { target, min, max } = c.band;
      expect([spec.name, c.metric, min <= target && target <= max && min < max]).toEqual([spec.name, c.metric, true]);
      expect([spec.name, c.metric, min > lowest ? c.low !== undefined : true]).toEqual([spec.name, c.metric, true]);
      expect([spec.name, c.metric, max < highest ? c.high !== undefined : true]).toEqual([spec.name, c.metric, true]);
    }
  });

  it('reads only metrics that measure() reports, and near or far only in side views', () => {
    const calibration = calibrate(landmarks(BODIES.relaxedFront));
    const reported = Object.keys(measure(landmarks(BODIES.frontDoubleBiceps), { calibration }));
    for (const [spec, c] of checks) {
      const side = c.side === undefined ? undefined : resolveSide(c.side, spec.facing);
      const resolves = c.side === undefined || side !== undefined;
      expect([spec.name, c.metric, c.side, resolves && reported.includes(metricKey(c.metric, side))]).toEqual([
        spec.name,
        c.metric,
        c.side,
        true,
      ]);
    }
  });
});

describe('resolveSide', () => {
  it('maps near and far to the side facing the camera and back', () => {
    expect([resolveSide('near', 'leftSide'), resolveSide('far', 'leftSide'), resolveSide('near', 'rightSide')]).toEqual([
      'left',
      'right',
      'right',
    ]);
    expect([resolveSide('near', 'front'), resolveSide('left', 'back')]).toEqual([undefined, 'left']);
  });
});
