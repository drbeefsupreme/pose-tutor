import { describe, expect, it } from 'vitest';
import { BODIES, HIDDEN_VISIBILITY, landmarks, moved, REFS, turnedAround } from './fixtures';
import { poseLandmarks } from './landmarks';
import { calibrate, classifyFacing, measure } from './metrics';
import type { Metrics } from './types';

const close = (values: Record<string, number>, digits = 3) =>
  Object.fromEntries(Object.entries(values).map(([k, v]) => [k, expect.closeTo(v, digits)]));

const calibration = calibrate(landmarks(BODIES.relaxedFront));

describe('measure', () => {
  it('reads every calibration-free metric of the hand-built front double biceps', () => {
    expect(measure(landmarks(BODIES.frontDoubleBiceps))).toEqual(
      close({
        'abduction.left': 95.7106,
        'abduction.right': 95.7106,
        'elbowFlex.left': 114.1978,
        'elbowFlex.right': 114.1978,
        'elbowHeight.left': 0.05,
        'elbowHeight.right': 0.05,
        'wristHeight.left': 0.4267,
        'wristHeight.right': 0.4267,
        'wristVsNose.left': 0.1267,
        'wristVsNose.right': 0.1267,
        'forearmAngle.left': 29.9084,
        'forearmAngle.right': 29.9084,
        'kneeFlex.left': 4.9698,
        'kneeFlex.right': 4.9698,
        'heelLift.left': 0.3511,
        'heelLift.right': 0.3511,
        'wristVis.left': 1,
        'wristVis.right': 1,
        hipWidth: 0.4,
        shoulderWidth: 0.8,
        stanceRatio: 0.95,
        stagger: 0.76,
        elbowSpan: 2.25,
        wristGap: 1.3667,
        headYaw: 0,
      }),
    );
  });

  it('reads the arms of the other hand-built poses', () => {
    const arms = (m: Metrics) => [m['abduction.left'], m['elbowFlex.left'], m['forearmAngle.left'], m['wristHeight.left']];
    expect(arms(measure(landmarks(BODIES.relaxedFront)))).toEqual([
      expect.closeTo(47.7263, 2),
      expect.closeTo(41.1444, 2),
      expect.closeTo(173.4181, 2),
      expect.closeTo(-0.7667, 3),
    ]);
    expect(arms(measure(landmarks(BODIES.frontLatSpread)))).toEqual([
      expect.closeTo(50.4403, 2),
      expect.closeTo(107.329, 2),
      expect.closeTo(123.1113, 2),
      expect.closeTo(-0.5667, 3),
    ]);
    expect(arms(measure(landmarks(BODIES.backDoubleBiceps)))).toEqual([
      expect.closeTo(96.8428, 2),
      expect.closeTo(111.1003, 2),
      expect.closeTo(27.943, 2),
      expect.closeTo(0.4433, 3),
    ]);
  });

  it('corrects for the aspect ratio, so a body reads the same in a landscape and a portrait frame', () => {
    for (const aspect of [16 / 9, 3 / 4]) {
      const m = measure(landmarks(BODIES.frontDoubleBiceps, { aspect }));
      expect([m['abduction.left'], m.elbowSpan, m.wristGap]).toEqual([
        expect.closeTo(95.7106, 2),
        expect.closeTo(2.25, 3),
        expect.closeTo(1.3667, 3),
      ]);
    }
  });

  it('skips every metric that needs a hidden landmark and still reports the wrist visibility', () => {
    const m = measure(landmarks(BODIES.frontDoubleBiceps, { hidden: ['leftWrist', 'rightWrist'] }));
    expect(Object.keys(m).sort()).toEqual([
      'abduction.left',
      'abduction.right',
      'elbowHeight.left',
      'elbowHeight.right',
      'elbowSpan',
      'headYaw',
      'heelLift.left',
      'heelLift.right',
      'hipWidth',
      'kneeFlex.left',
      'kneeFlex.right',
      'shoulderWidth',
      'stagger',
      'stanceRatio',
      'wristVis.left',
      'wristVis.right',
    ]);
    expect(m['wristVis.left']).toBe(HIDDEN_VISIBILITY);
  });

  it('measures twist and shrug against a relaxed-front calibration', () => {
    expect(calibration).toEqual(close({ shoulderWidth: 0.8, hipWidth: 0.4, earDrop: 0.3333 }));
    const m = measure(landmarks(BODIES.frontDoubleBiceps), { calibration });
    expect([m.twist, m.shrug]).toEqual([expect.closeTo(0, 3), expect.closeTo(1, 3)]);

    const turned = moved(BODIES.relaxedFront, { leftShoulder: [0.6, 0.3], rightShoulder: [0.4, 0.3] });
    expect(measure(landmarks(turned), { calibration }).twist).toBeCloseTo(-33.557, 2);

    const shrugged = moved(BODIES.relaxedFront, { leftShoulder: [0.62, 0.27], rightShoulder: [0.38, 0.27] });
    const s = measure(landmarks(shrugged), { calibration });
    expect([s.shrug, s.twist]).toEqual([expect.closeTo(0.6364, 3), expect.closeTo(0, 3)]);
  });

  it('calibrates only from a front view', () => {
    expect(calibrate(landmarks(BODIES.backDoubleBiceps))).toBeUndefined();
    expect(calibrate(landmarks(BODIES.frontDoubleBiceps))).toEqual(close({ shoulderWidth: 0.8, hipWidth: 0.4, earDrop: 0.3333 }));
  });

  it('reproduces the pose-spec measurements of the 26 reference photos, visible landmarks only', () => {
    const angle = /abduction|elbowFlex|forearmAngle|kneeFlex/;
    for (const ref of REFS) {
      const actual = new Map(Object.entries(measure(ref.landmarks)));
      for (const key of ['twist', 'shrug', 'headYaw']) actual.delete(key);
      expect([ref.id, [...actual.keys()].sort()]).toEqual([ref.id, Object.keys(ref.measured).sort()]);
      const off = Object.entries(ref.measured).filter(
        ([key, value]) => !(Math.abs((actual.get(key) ?? NaN) - value) <= (angle.test(key) ? 0.06 : 0.006)),
      );
      expect([ref.id, off]).toEqual([ref.id, []]);
    }
  });
});

describe('classifyFacing', () => {
  it('tells front from back by the shoulder order and the side views by the toes and nose', () => {
    expect(classifyFacing(landmarks(BODIES.relaxedFront))).toBe('front');
    expect(classifyFacing(landmarks(BODIES.backDoubleBiceps))).toBe('back');
    expect(classifyFacing(landmarks(BODIES.leftSide))).toBe('leftSide');
    expect(classifyFacing(landmarks(turnedAround(BODIES.leftSide)))).toBe('rightSide');
  });

  it('needs both shoulders and both hips', () => {
    expect(classifyFacing(landmarks(BODIES.relaxedFront, { hidden: ['leftHip'] }))).toBeUndefined();
  });

  it('classifies all 26 reference photos as the pose-spec facing', () => {
    expect(REFS.map((r) => [r.id, classifyFacing(r.landmarks)])).toEqual(REFS.map((r) => [r.id, r.facing]));
  });
});

describe('poseLandmarks', () => {
  it('keeps the image aspect ratio and rejects a landmark list of the wrong length', () => {
    const points = landmarks(BODIES.relaxedFront).points;
    expect(poseLandmarks(points, 1280, 720).aspect).toBeCloseTo(16 / 9, 6);
    expect(() => poseLandmarks(points.slice(1), 1280, 720)).toThrow('expected 33 BlazePose landmarks, got 32');
  });
});
