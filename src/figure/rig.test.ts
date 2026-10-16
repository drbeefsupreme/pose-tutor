import { describe, expect, it } from 'vitest';
import { Rig, type Vec3 } from './rig';
import { POSES, SKIN_BONES, apply, rigManifest, solvePose } from '../../scripts/figure/skeleton';
import type { FigurePose } from '../pose/types';

const manifest = rigManifest('relaxed');
const rig = new Rig(manifest);
const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Applies bone i's skinning dual quaternion to a point (the shader's formula, one bone). */
function skinPoint(real: Float32Array, dual: Float32Array, i: number, p: Vec3): Vec3 {
  const [x, y, z, w] = real.subarray(i * 4, i * 4 + 4);
  const [dx, dy, dz, dw] = dual.subarray(i * 4, i * 4 + 4);
  const cx = y * p[2] - z * p[1] + w * p[0], cy = z * p[0] - x * p[2] + w * p[1], cz = x * p[1] - y * p[0] + w * p[2];
  return [
    p[0] + 2 * (y * cz - z * cy) + 2 * (w * dx - dw * x + (y * dz - z * dy)),
    p[1] + 2 * (z * cx - x * cz) + 2 * (w * dy - dw * y + (z * dx - x * dz)),
    p[2] + 2 * (x * cy - y * cx) + 2 * (w * dz - dw * z + (x * dy - y * dx)),
  ];
}

const FLEXED: FigurePose = {
  yaw: 30,
  bones: {
    chest: [[0, 1, 0, 20]],
    upperarmL: [[0.4327, -0.9, -0.0519, -90], [0, 0, 1, 60]],
    forearmL: [[-0.9012, -0.4333, 0, 95]],
    thighR: [[1, 0, 0, -40]],
    shinR: [[1, 0, 0, 70]],
  },
};

describe('Rig', () => {
  it('reproduces the build skeleton in the bind pose', () => {
    const xf = solvePose(POSES.relaxed);
    let worst = 0;
    for (const { key, bone, side } of SKIN_BONES) {
      const p: Vec3 = [0.1 * side, 1.2, 0.05];
      worst = Math.max(worst, dist(rig.locate(rig.bind, key, p), apply(xf(bone, side), [p[0], p[1], p[2]])));
    }
    expect(worst).toBeLessThan(1e-12);
  });

  it('skins the bind pose with identity transforms', () => {
    const real = new Float32Array(SKIN_BONES.length * 4), dual = new Float32Array(SKIN_BONES.length * 4);
    rig.skin(rig.bind, real, dual);
    for (let i = 0; i < SKIN_BONES.length; i++) {
      expect([...real.subarray(i * 4, i * 4 + 4)].map((v) => Math.round(v * 1e6) / 1e6)).toEqual([0, 0, 0, 1]);
      expect(Math.max(...dual.subarray(i * 4, i * 4 + 4).map(Math.abs))).toBeLessThan(1e-7);
    }
  });

  it('moves points of the baked mesh to their posed positions', () => {
    const pose = rig.compile(FLEXED);
    const real = new Float32Array(SKIN_BONES.length * 4), dual = new Float32Array(SKIN_BONES.length * 4);
    rig.skin(pose, real, dual);
    let worst = 0;
    SKIN_BONES.forEach(({ key, side }, i) => {
      const rest: Vec3 = [0.15 * side, 0.9, -0.05];
      worst = Math.max(worst, dist(skinPoint(real, dual, i, rig.locate(rig.bind, key, rest)), rig.locate(pose, key, rest)));
    });
    expect(worst).toBeLessThan(1e-5);
  });

  it('turns the left side toward a camera at +Z for yaw 90', () => {
    const [x, y, z] = rig.locate(rig.compile({ yaw: 90, bones: {} }), 'upperarmL');
    expect([x, y, z].map((v) => Math.round(v * 1000) / 1000)).toEqual([0.005, 1.445, 0.205]);
  });

  it('keeps the lowest sole point on the floor when the knees bend', () => {
    const flat: FigurePose['bones'] = { thighL: [[1, 0, 0, -30]], shinL: [[1, 0, 0, 60]], footL: [[1, 0, 0, -30]] };
    const squat = rig.compile({ yaw: 0, bones: { ...flat, thighR: flat.thighL, shinR: flat.shinL, footR: flat.footL } });
    const soles = manifest.contacts.map((c) => rig.locate(squat, manifest.bones[c.bone], c.p)[1]);
    expect(Math.round(Math.min(...soles) * 1e9) / 1e9).toBe(0);
    // flat feet on the floor: the ankles keep their rest height and the pelvis comes down
    expect(rig.locate(squat, 'footL')[1]).toBeCloseTo(0.085, 9);
    expect(rig.locate(squat, 'pelvis')[1]).toBeLessThan(0.88);
  });

  it('blends halfway: half of each rotation and the shorter turn', () => {
    const a = rig.compile({ yaw: 270, bones: {} });
    const b = rig.compile({ yaw: 0, bones: { forearmL: [[1, 0, 0, 90]] } });
    const mid = rig.blend(a, b, 0.5, rig.compile({ yaw: 0, bones: {} }));
    expect(mid.yaw).toBe(315);
    expect((rig.maxAngle(a, mid) * 180) / Math.PI).toBeCloseTo(45, 9);
    expect((rig.maxAngle(mid, b) * 180) / Math.PI).toBeCloseTo(45, 9);
  });
});
