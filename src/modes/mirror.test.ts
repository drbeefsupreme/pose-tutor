import { describe, expect, it } from 'vitest';
import { BODIES, landmarks, moved } from '../pose/fixtures';
import { mirrorFigure, nextLimbs, readLimbs, REST_ANGLES, REST_LIMBS } from './mirror';

const RIGHT_OUT_LEFT_UP = moved(BODIES.relaxedFront, {
  rightShoulder: [0.38, 0.3],
  rightElbow: [0.24, 0.3],
  rightWrist: [0.12, 0.3],
  leftShoulder: [0.62, 0.3],
  leftElbow: [0.62, 0.16],
  leftWrist: [0.7, 0.08],
});

describe('Mirror retarget', () => {
  it("drives the figure's left side with the athlete's right side, as a mirror does", () => {
    const limbs = readLimbs(landmarks(RIGHT_OUT_LEFT_UP));
    expect(limbs.upperarmL).toBeCloseTo(90);
    expect(limbs.forearmL).toBeCloseTo(90);
    expect(limbs.upperarmR).toBeCloseTo(180);
    expect(limbs.forearmR).toBeCloseTo(135);
  });

  it('measures the same angles in a wide image', () => {
    const square = readLimbs(landmarks(RIGHT_OUT_LEFT_UP));
    const wide = readLimbs(landmarks(RIGHT_OUT_LEFT_UP, { aspect: 16 / 9 }));
    for (const key of Object.keys(square) as (keyof typeof square)[]) expect(wide[key]).toBeCloseTo(square[key] ?? NaN);
  });

  it('turns each segment relative to its parent about the frontal axis, mirrored on the right', () => {
    const figure = mirrorFigure({ ...REST_LIMBS, upperarmL: 90, forearmL: 90, upperarmR: 180, forearmR: 135 });
    expect(figure.bones.upperarmL?.[0]).toEqual([0, 0, 1, 90 - REST_ANGLES.upperarm]);
    expect(figure.bones.forearmL?.[0]?.[3]).toBeCloseTo(-(REST_ANGLES.forearm - REST_ANGLES.upperarm));
    expect(figure.bones.upperarmR?.[0]).toEqual([0, 0, -1, 180 - REST_ANGLES.upperarm]);
    expect(figure.bones.forearmR?.[0]?.[3]).toBeCloseTo(-45 - (REST_ANGLES.forearm - REST_ANGLES.upperarm));
    expect(mirrorFigure(REST_LIMBS).bones.thighL).toEqual([[0, 0, 1, 0]]);
  });

  it('keeps the last angle of a hidden segment', () => {
    const lm = landmarks(RIGHT_OUT_LEFT_UP, { hidden: ['rightWrist'] });
    const next = nextLimbs(REST_LIMBS, lm);
    expect(next.forearmL).toBe(REST_LIMBS.forearmL);
    expect(next.upperarmL).toBeCloseTo(90);
    expect(nextLimbs(next, undefined)).toBe(next);
  });
});
