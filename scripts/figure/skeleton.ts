import type { BoneName, BPt, V3 } from './types';
import type { BoneKey, FigurePose, LimbBone, MidBone } from '../../src/pose/types';
import type { RigManifest } from '../../src/figure/rig';

/** Rest-pose joint positions for the LEFT side (+X) and the midline. */
export const JOINTS: Record<BoneName, V3> = {
  pelvis: [0, 0.98, 0],
  lumbar: [0, 1.03, -0.03],
  chest: [0, 1.18, -0.04],
  neck: [0, 1.5, -0.05],
  head: [0, 1.6, -0.01],
  scap: [0.025, 1.465, 0.07],
  upperarm: [0.205, 1.445, -0.005],
  forearm: [0.33, 1.185, -0.02],
  hand: [0.385, 0.935, 0.03],
  thigh: [0.092, 0.925, 0],
  shin: [0.115, 0.505, 0],
  foot: [0.14, 0.085, -0.02],
};

const PARENT: Record<BoneName, BoneName | null> = {
  pelvis: null, lumbar: 'pelvis', chest: 'lumbar', neck: 'chest', head: 'neck',
  scap: 'chest', upperarm: 'scap', forearm: 'upperarm', hand: 'forearm',
  thigh: 'pelvis', shin: 'thigh', foot: 'shin',
};

/** Pose: local rotation per bone as axis-angle [ax, ay, az, degrees], defined for the LEFT side
 * in world-rest axes. The right side is mirrored automatically. */
export type Pose = Partial<Record<BoneName, [number, number, number, number]>>;
const SIDED: Partial<Record<BoneName, true>> = {
  scap: true, upperarm: true, forearm: true, hand: true, thigh: true, shin: true, foot: true,
};

type M = number[]; // 3x4 affine, row-major [r00 r01 r02 tx, r10 ... ]

function axisAngle(ax: number, ay: number, az: number, deg: number): number[] {
  const l = Math.hypot(ax, ay, az) || 1;
  const x = ax / l, y = ay / l, z = az / l;
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), t = 1 - c;
  return [
    t * x * x + c, t * x * y - s * z, t * x * z + s * y,
    t * x * y + s * z, t * y * y + c, t * y * z - s * x,
    t * x * z - s * y, t * y * z + s * x, t * z * z + c,
  ];
}

function mul(a: M, b: M): M {
  const r = new Array(12);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) r[i * 4 + j] = a[i * 4] * b[j] + a[i * 4 + 1] * b[4 + j] + a[i * 4 + 2] * b[8 + j];
    r[i * 4 + 3] = a[i * 4] * b[3] + a[i * 4 + 1] * b[7] + a[i * 4 + 2] * b[11] + a[i * 4 + 3];
  }
  return r;
}

export function apply(m: M, p: V3): V3 {
  return [
    m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3],
    m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7],
    m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11],
  ];
}

export function applyDir(m: M, p: V3): V3 {
  return [
    m[0] * p[0] + m[1] * p[1] + m[2] * p[2],
    m[4] * p[0] + m[5] * p[1] + m[6] * p[2],
    m[8] * p[0] + m[9] * p[1] + m[10] * p[2],
  ];
}

const ID: M = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];

export function solvePose(pose: Pose): (bone: BoneName, side: 1 | -1) => M {
  const cache = new Map<string, M>();
  const get = (bone: BoneName, side: 1 | -1): M => {
    const s: 1 | -1 = SIDED[bone] ? side : 1;
    const key = bone + s;
    const hit = cache.get(key);
    if (hit) return hit;
    const parent = PARENT[bone];
    const pm = parent ? get(parent, side) : ID;
    const j = JOINTS[bone];
    const jx = j[0] * s, jy = j[1], jz = j[2];
    const aa = pose[bone];
    let local: M = ID;
    if (aa) {
      const r = s === 1 ? axisAngle(aa[0], aa[1], aa[2], aa[3]) : axisAngle(aa[0], -aa[1], -aa[2], aa[3]);
      local = [
        r[0], r[1], r[2], jx - (r[0] * jx + r[1] * jy + r[2] * jz),
        r[3], r[4], r[5], jy - (r[3] * jx + r[4] * jy + r[5] * jz),
        r[6], r[7], r[8], jz - (r[6] * jx + r[7] * jy + r[8] * jz),
      ];
    }
    const w = mul(pm, local);
    cache.set(key, w);
    return w;
  };
  return get;
}

export function posePt(xf: (b: BoneName, s: 1 | -1) => M, pt: BPt, side: 1 | -1): V3 {
  const p: V3 = [pt.p[0] * side, pt.p[1], pt.p[2]];
  return apply(xf(pt.bone, side), p);
}

export const POSES: Record<string, Pose> = {
  relaxed: { upperarm: [0, 0, 1, 4] },
};

const MID_BONES: readonly MidBone[] = ['pelvis', 'lumbar', 'chest', 'neck', 'head'];
const LIMB_BONES: readonly LimbBone[] = ['scap', 'upperarm', 'forearm', 'hand', 'thigh', 'shin', 'foot'];

/** Skinning bones in skin-index order: the midline, then the left limbs, then the right limbs. */
export const SKIN_BONES: readonly { key: BoneKey; bone: BoneName; side: 1 | -1 }[] = [
  ...MID_BONES.map((bone) => ({ key: bone, bone, side: 1 as const })),
  ...LIMB_BONES.map((bone) => ({ key: `${bone}L` as const, bone, side: 1 as const })),
  ...LIMB_BONES.map((bone) => ({ key: `${bone}R` as const, bone, side: -1 as const })),
];

export function skinSlot(bone: BoneName, side: 1 | -1): number {
  const s = SIDED[bone] ? side : 1;
  return SKIN_BONES.findIndex((b) => b.bone === bone && b.side === s);
}

const SOLE: V3[] = [[0.134, 0, -0.075], [0.135, 0, 0.185]];

/** The skeleton for the runtime rig (src/figure/rig.ts); the build pose becomes its bind pose. */
export function rigManifest(poseName: string): RigManifest {
  const pose = POSES[poseName] ?? {};
  const bones: FigurePose['bones'] = {};
  for (const s of SKIN_BONES) {
    const aa = pose[s.bone];
    if (aa) bones[s.key] = [s.side === 1 ? aa : [aa[0], -aa[1], -aa[2], aa[3]]];
  }
  return {
    bones: SKIN_BONES.map((s) => s.key),
    parent: SKIN_BONES.map((s) => { const p = PARENT[s.bone]; return p ? skinSlot(p, s.side) : -1; }),
    joints: SKIN_BONES.map(({ bone, side }) => [JOINTS[bone][0] * side, JOINTS[bone][1], JOINTS[bone][2]]),
    contacts: ([1, -1] as const).flatMap((side) => SOLE.map((p) => ({ bone: skinSlot('foot', side), p: [p[0] * side, p[1], p[2]] as V3 }))),
    bind: { yaw: 0, bones },
  };
}
