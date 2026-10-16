// The figure's pose for every PoseId, authored from docs/pose-spec.md for the judges'
// view (NPC / IFBB Pro). Rotations are axis-angles in world-rest axes (+Y up, the figure faces +Z, +X
// is its left), applied in order, child after parent (src/figure/rig.ts). Side poses show the
// athlete's left side; in sideChest and sideTriceps the right arm grips. mostMuscular is the crab.
import type { AxisAngle, FigurePose, LimbBone, MidBone, PoseId } from '../pose/types';

type Axis = readonly [number, number, number];

const X: Axis = [1, 0, 0];
const Y: Axis = [0, 1, 0];
const Z: Axis = [0, 0, 1];
// Joint axes of the left arm in the rest skeleton (scripts/figure/skeleton.ts JOINTS).
/** Humerus, shoulder to elbow: + turns the arm inward (internal rotation), - outward. */
const HUM: Axis = [0.4327, -0.9, -0.0519];
/** Elbow hinge, perpendicular to the humerus in the frontal plane: + bends the forearm forward. */
const ELB: Axis = [-0.9012, -0.4333, 0];
// Left-limb conventions: +Z raises the arm or leg sideways; -X swings a limb forward (+X back) and
// bends the knee (+X) or points the toes (+X); +Y turns the trunk or head toward the figure's left.

const r = (axis: Axis, deg: number): AxisAngle => [axis[0], axis[1], axis[2], deg];

/** The same rotations seen in a mirror (left side to right side). */
const mirror = (list: readonly AxisAngle[]): AxisAngle[] => list.map(([x, y, z, d]) => [x, -y, -z, d] as const);

const MIDS: readonly MidBone[] = ['pelvis', 'lumbar', 'chest', 'neck', 'head'];
const LIMBS: readonly LimbBone[] = ['scap', 'upperarm', 'forearm', 'hand', 'thigh', 'shin', 'foot'];

function both(limbs: Partial<Record<LimbBone, readonly AxisAngle[]>>): FigurePose['bones'] {
  const out: FigurePose['bones'] = {};
  for (const b of LIMBS) {
    const list = limbs[b];
    if (list) {
      out[`${b}L`] = list;
      out[`${b}R`] = mirror(list);
    }
  }
  return out;
}

/** The mirror-image pose: left and right swapped, turns reversed. */
function mirrorPose(p: FigurePose): FigurePose {
  const bones: FigurePose['bones'] = {};
  for (const b of MIDS) {
    const list = p.bones[b];
    if (list) bones[b] = mirror(list);
  }
  for (const b of LIMBS) {
    const left = p.bones[`${b}L`], right = p.bones[`${b}R`];
    if (left) bones[`${b}R`] = mirror(left);
    if (right) bones[`${b}L`] = mirror(right);
  }
  return { yaw: -p.yaw, bones };
}

const quarterTurnLeftSide: FigurePose = {
  yaw: 90,
  bones: {
    ...both({ thigh: [r(X, -2), r(Z, -2), r(Y, 18)], shin: [r(X, 4)], foot: [r(X, -2)] }),
    // the arm positions twist the upper body slightly toward the judges
    lumbar: [r(Y, 6)],
    chest: [r(Y, 9)],
    upperarmL: [r(HUM, 10), r(Z, 4), r(X, 22)],
    forearmL: [r(ELB, 12)],
    upperarmR: mirror([r(HUM, 20), r(Z, 14), r(X, -14)]),
    forearmR: mirror([r(ELB, 22)]),
  },
};

export const FIGURE_POSES: Record<PoseId, FigurePose> = {
  relaxedFront: {
    yaw: 0,
    bones: both({
      upperarm: [r(HUM, 25), r(Z, 24)],
      forearm: [r(ELB, 22)],
      thigh: [r(X, -2.5), r(Z, -2), r(Y, 18)],
      shin: [r(X, 5)],
      foot: [r(X, -2.5)],
    }),
  },
  quarterTurnLeftSide,
  relaxedBack: {
    yaw: 180,
    bones: both({
      upperarm: [r(HUM, 25), r(Z, 12)],
      forearm: [r(ELB, 30)],
      thigh: [r(X, -1), r(Z, -2), r(Y, 18)],
      shin: [r(X, 2)],
      foot: [r(X, -1)],
    }),
  },
  quarterTurnRightSide: mirrorPose(quarterTurnLeftSide),
  frontDoubleBiceps: {
    yaw: 0,
    bones: {
      ...both({
        scap: [r(Z, 10)],
        upperarm: [r(HUM, -90), r(Z, 60), r(Y, -12)],
        forearm: [r(ELB, 96)],
        hand: [r(ELB, 25)],
      }),
      // IFBB: one leg forward and to the side; feet turned out from the hips
      thighL: [r(X, -12), r(Z, 4), r(Y, 30)],
      shinL: [r(X, 16)],
      footL: [r(X, -4)],
      thighR: mirror([r(X, -2.5), r(Z, 3), r(Y, 28)]),
      shinR: mirror([r(X, 5)]),
      footR: mirror([r(X, -2.5)]),
    },
  },
  frontLatSpread: {
    yaw: 0,
    bones: both({
      scap: [r(Y, -8)],
      upperarm: [r(HUM, 75), r(Z, 26), r(X, -13)],
      forearm: [r(ELB, 90)],
      hand: [r(ELB, 20)],
      thigh: [r(X, -2.5), r(Y, 25)],
      shin: [r(X, 5)],
      foot: [r(X, -2.5)],
    }),
  },
  sideChest: {
    yaw: 90,
    bones: {
      // chest turned about 30° toward the judges, face to the judges
      lumbar: [r(Y, 18)],
      chest: [r(Y, 30)],
      neck: [r(Y, 30)],
      head: [r(Y, 30)],
      // near arm bent across the body; the far hand holds its wrist
      upperarmL: [r(HUM, 55), r(Z, -20), r(X, -24)],
      forearmL: [r(ELB, 71)],
      upperarmR: mirror([r(HUM, 44), r(Z, -15), r(X, -9)]),
      forearmR: mirror([r(ELB, 77)]),
      // near knee bent onto the toes, back leg slightly bent with the foot flat
      thighL: [r(X, -38), r(Z, -3), r(Y, -5)],
      shinL: [r(X, 64)],
      footL: [r(X, 14)],
      thighR: mirror([r(X, -11)]),
      shinR: mirror([r(X, 22)]),
      footR: mirror([r(X, -11)]),
    },
  },
  backDoubleBiceps: {
    yaw: 180,
    bones: {
      ...both({
        scap: [r(Z, 10)],
        upperarm: [r(HUM, -90), r(Z, 62), r(Y, 4)],
        forearm: [r(ELB, 92)],
        hand: [r(ELB, 25)],
      }),
      lumbar: [r(X, -4)],
      chest: [r(X, -4)],
      neck: [r(Y, 30)],
      head: [r(Y, 25)],
      // left foot back on its toes, both legs turned out
      thighL: [r(Y, 25), r(X, 10), r(Z, 8)],
      shinL: [r(X, 30)],
      footL: [r(X, 30)],
      thighR: mirror([r(Y, 22), r(X, -5), r(Z, 8)]),
      shinR: mirror([r(X, 10)]),
      footR: mirror([r(X, -5)]),
    },
  },
  backLatSpread: {
    yaw: 180,
    bones: {
      ...both({
        scap: [r(Y, -10)],
        upperarm: [r(HUM, 100), r(Z, 20.5), r(X, -8)],
        forearm: [r(ELB, 88)],
        hand: [r(ELB, 20)],
      }),
      // the calf not shown in the back double biceps: right heel raised
      thighL: [r(X, -3), r(Y, 20)],
      shinL: [r(X, 6)],
      footL: [r(X, -3)],
      thighR: mirror([r(Y, 15), r(X, 4)]),
      shinR: mirror([r(X, 12)]),
      footR: mirror([r(X, 18)]),
    },
  },
  sideTriceps: {
    yaw: 90,
    bones: {
      lumbar: [r(Y, 12)],
      chest: [r(Y, 27)],
      neck: [r(Y, 30)],
      head: [r(Y, 30)],
      // near arm straight down against the side; the far arm reaches behind the back toward it
      upperarmL: [r(Z, -22), r(X, 12)],
      forearmL: [r(ELB, -8)],
      scapR: mirror([r(Z, -6)]),
      upperarmR: mirror([r(HUM, 37), r(Z, -36), r(X, 30)]),
      forearmR: mirror([r(ELB, 24)]),
      // IFBB: near foot flat, far heel up, both knees bent and close
      thighL: [r(X, -25), r(Y, -5)],
      shinL: [r(X, 43)],
      footL: [r(X, -18)],
      thighR: mirror([r(X, -30)]),
      shinR: mirror([r(X, 64)]),
      footR: mirror([r(X, -12)]),
    },
  },
  absAndThighs: {
    yaw: 0,
    bones: {
      ...both({
        scap: [r(Z, 18)],
        // turned out far enough that the forearms pass behind the head, not over it
        upperarm: [r(HUM, -160), r(Z, 115)],
        forearm: [r(ELB, 115)],
      }),
      // crunch the trunk slightly, head up
      lumbar: [r(X, 6)],
      chest: [r(X, 6)],
      neck: [r(X, -8)],
      // left leg forward, toes pointed
      thighL: [r(X, -12), r(Y, 15)],
      shinL: [r(X, 15)],
      footL: [r(X, 10)],
      thighR: mirror([r(Z, 3), r(Y, 35)]),
    },
  },
  mostMuscular: {
    yaw: 0,
    bones: {
      ...both({
        scap: [r(Y, -12), r(Z, 8)],
        upperarm: [r(HUM, 31), r(Z, -23.5), r(X, -12.5)],
        forearm: [r(ELB, 71)],
      }),
      // lean forward from the waist, face up to the judges
      lumbar: [r(X, 12)],
      chest: [r(X, 14)],
      neck: [r(X, -12)],
      head: [r(X, -10)],
      thighL: [r(X, -8), r(Y, 25)],
      shinL: [r(X, 7)],
      thighR: mirror([r(X, -3), r(Y, 25)]),
      shinR: mirror([r(X, 7)]),
      footR: mirror([r(X, -3)]),
    },
  },
};
