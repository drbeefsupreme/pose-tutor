// Figure rig: forward kinematics of the skinning bones from a FigurePose, and the per-bone dual
// quaternions that the skin shader blends (skinMaterial.ts). Plain math, no three.js, so the model
// build and tests can use it too.
import type { BoneKey, FigurePose } from '../pose/types';

export type Vec3 = readonly [number, number, number];

/** Skeleton that the model build writes next to the mesh (scripts/figure/skeleton.ts, rigManifest). */
export interface RigManifest {
  /** Bone names in skin-index order. */
  readonly bones: readonly BoneKey[];
  /** Skin index of each bone's parent, -1 for the root; parents come before their children. */
  readonly parent: readonly number[];
  /** Rest-pose joint (pivot) of each bone in meters: +Y up, the figure faces +Z, +X is its left. */
  readonly joints: readonly Vec3[];
  /** Sole points as bone index and rest position. The lowest one stays on the floor. */
  readonly contacts: readonly { readonly bone: number; readonly p: Vec3 }[];
  /** Pose the mesh was baked in. */
  readonly bind: FigurePose;
}

/** A compiled pose: one local rotation quaternion [x, y, z, w] per bone, and the body yaw in degrees. */
export interface PoseState {
  yaw: number;
  readonly q: Float64Array;
}

/** Signed yaw change in (-180, 180]; a half turn goes to the athlete's right (positive yaw). */
const turn = (deg: number) => deg - 360 * Math.ceil(deg / 360 - 0.5);

/** Hamilton product a ⊗ b of quaternions at offsets ia / ib, written to out at io. */
function mul(a: ArrayLike<number>, ia: number, b: ArrayLike<number>, ib: number, out: Float64Array, io: number): void {
  const ax = a[ia], ay = a[ia + 1], az = a[ia + 2], aw = a[ia + 3];
  const bx = b[ib], by = b[ib + 1], bz = b[ib + 2], bw = b[ib + 3];
  out[io] = aw * bx + ax * bw + ay * bz - az * by;
  out[io + 1] = aw * by - ax * bz + ay * bw + az * bx;
  out[io + 2] = aw * bz + ax * by - ay * bx + az * bw;
  out[io + 3] = aw * bw - ax * bx - ay * by - az * bz;
}

/** Rotates (x, y, z) by the unit quaternion at q[iq], written to out at io. */
function rotate(q: ArrayLike<number>, iq: number, x: number, y: number, z: number, out: Float64Array, io: number): void {
  const qx = q[iq], qy = q[iq + 1], qz = q[iq + 2], qw = q[iq + 3];
  // v + 2·q.xyz × (q.xyz × v + w·v)
  const cx = qy * z - qz * y + qw * x, cy = qz * x - qx * z + qw * y, cz = qx * y - qy * x + qw * z;
  out[io] = x + 2 * (qy * cz - qz * cy);
  out[io + 1] = y + 2 * (qz * cx - qx * cz);
  out[io + 2] = z + 2 * (qx * cy - qy * cx);
}

export class Rig {
  readonly bones: readonly BoneKey[];
  /** The pose the mesh was baked in; skinning it gives identity transforms. */
  readonly bind: PoseState;
  private readonly m: RigManifest;
  private readonly restFloor: number;
  // world transforms (rotation quaternion, translation) of the last solved pose and of the bind pose
  private readonly wq: Float64Array;
  private readonly wt: Float64Array;
  private readonly bq: Float64Array;
  private readonly bt: Float64Array;
  private readonly yq = new Float64Array(4);
  private readonly tmp = new Float64Array(4);

  constructor(m: RigManifest) {
    const n = m.bones.length;
    if (!n || m.parent.length !== n || m.joints.length !== n || !m.contacts.length) throw new Error('Rig: malformed skeleton in the model');
    m.parent.forEach((p, i) => { if (p >= i) throw new Error(`Rig: bone ${m.bones[i]} comes before its parent`); });
    this.m = m;
    this.bones = m.bones;
    this.restFloor = Math.min(...m.contacts.map((c) => c.p[1]));
    this.wq = new Float64Array(n * 4);
    this.wt = new Float64Array(n * 3);
    this.bind = this.compile(m.bind);
    this.solve(this.bind);
    this.bq = this.wq.slice();
    this.bt = this.wt.slice();
  }

  /** Composes each bone's axis-angle list (world-rest axes, first rotation first) into a quaternion. */
  compile(pose: FigurePose): PoseState {
    const q = new Float64Array(this.bones.length * 4);
    const r = new Float64Array(4);
    this.bones.forEach((bone, i) => {
      q[i * 4 + 3] = 1;
      for (const [ax, ay, az, deg] of pose.bones[bone] ?? []) {
        const l = Math.hypot(ax, ay, az);
        if (l === 0) throw new Error(`Rig: zero rotation axis on ${bone}`);
        const s = Math.sin((deg * Math.PI) / 360) / l;
        r[0] = ax * s; r[1] = ay * s; r[2] = az * s; r[3] = Math.cos((deg * Math.PI) / 360);
        mul(r, 0, q, i * 4, q, i * 4);
      }
    });
    return { yaw: pose.yaw, q };
  }

  /** Per-bone slerp from a to b (shortest path) and the yaw along the shorter turn; writes `out`. */
  blend(a: PoseState, b: PoseState, t: number, out: PoseState): PoseState {
    const qa = a.q, qb = b.q, qo = out.q;
    for (let o = 0; o < qa.length; o += 4) {
      let d = qa[o] * qb[o] + qa[o + 1] * qb[o + 1] + qa[o + 2] * qb[o + 2] + qa[o + 3] * qb[o + 3];
      const sign = d < 0 ? -1 : 1;
      d *= sign;
      let wa = 1 - t, wb = t;
      if (d < 0.9995) {
        const th = Math.acos(d), s = Math.sin(th);
        wa = Math.sin((1 - t) * th) / s;
        wb = Math.sin(t * th) / s;
      }
      wb *= sign;
      const x = wa * qa[o] + wb * qb[o], y = wa * qa[o + 1] + wb * qb[o + 1];
      const z = wa * qa[o + 2] + wb * qb[o + 2], w = wa * qa[o + 3] + wb * qb[o + 3];
      const l = Math.hypot(x, y, z, w);
      qo[o] = x / l; qo[o + 1] = y / l; qo[o + 2] = z / l; qo[o + 3] = w / l;
    }
    out.yaw = a.yaw + turn(b.yaw - a.yaw) * t;
    return out;
  }

  /** Largest rotation between two poses in radians: any bone, or the body turn. */
  maxAngle(a: PoseState, b: PoseState): number {
    let m = (Math.abs(turn(b.yaw - a.yaw)) * Math.PI) / 180;
    for (let o = 0; o < a.q.length; o += 4) {
      const d = Math.abs(a.q[o] * b.q[o] + a.q[o + 1] * b.q[o + 1] + a.q[o + 2] * b.q[o + 2] + a.q[o + 3] * b.q[o + 3]);
      m = Math.max(m, 2 * Math.acos(Math.min(1, d)));
    }
    return m;
  }

  /**
   * Skinning transform of every bone (posed world · bind world⁻¹) as a unit dual quaternion:
   * real part to `real`, dual part to `dual`, [x, y, z, w] per bone.
   */
  skin(s: PoseState, real: Float32Array, dual: Float32Array): void {
    this.solve(s);
    const { wq, wt, bq, bt, tmp } = this;
    const n = this.bones.length;
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      // R = Q · conj(Q0)
      tmp[0] = -bq[o]; tmp[1] = -bq[o + 1]; tmp[2] = -bq[o + 2]; tmp[3] = bq[o + 3];
      mul(wq, o, tmp, 0, tmp, 0);
      // Keep neighbors in one hemisphere so the shader's blend does not cancel.
      const p = this.m.parent[i];
      const ref = p < 0 ? -1 : p * 4;
      const d = ref < 0 ? tmp[3] : tmp[0] * real[ref] + tmp[1] * real[ref + 1] + tmp[2] * real[ref + 2] + tmp[3] * real[ref + 3];
      if (d < 0) { tmp[0] = -tmp[0]; tmp[1] = -tmp[1]; tmp[2] = -tmp[2]; tmp[3] = -tmp[3]; }
      const rx = tmp[0], ry = tmp[1], rz = tmp[2], rw = tmp[3];
      // t = T − R·T0
      rotate(tmp, 0, bt[i * 3], bt[i * 3 + 1], bt[i * 3 + 2], tmp, 0);
      const tx = wt[i * 3] - tmp[0], ty = wt[i * 3 + 1] - tmp[1], tz = wt[i * 3 + 2] - tmp[2];
      real[o] = rx; real[o + 1] = ry; real[o + 2] = rz; real[o + 3] = rw;
      // dual = ½ (t, 0) · R
      dual[o] = 0.5 * (tx * rw + ty * rz - tz * ry);
      dual[o + 1] = 0.5 * (-tx * rz + ty * rw + tz * rx);
      dual[o + 2] = 0.5 * (tx * ry - ty * rx + tz * rw);
      dual[o + 3] = -0.5 * (tx * rx + ty * ry + tz * rz);
    }
  }

  /** Posed world position of a rest-pose point carried by a bone (default: the bone's own joint). */
  locate(s: PoseState, bone: BoneKey, p: Vec3 = this.m.joints[this.bones.indexOf(bone)]): [number, number, number] {
    const i = this.bones.indexOf(bone);
    if (i < 0) throw new Error(`Rig: unknown bone ${bone}`);
    this.solve(s);
    rotate(this.wq, i * 4, p[0], p[1], p[2], this.tmp, 0);
    return [this.tmp[0] + this.wt[i * 3], this.tmp[1] + this.wt[i * 3 + 1], this.tmp[2] + this.wt[i * 3 + 2]];
  }

  /**
   * World transforms of a pose: W = W_parent · T(j) · R · T(−j), with the yaw turn (about +Y, positive
   * shows the left side to a camera at +Z) above the root, then lowered or raised so that the lowest
   * sole point sits at its rest height.
   */
  private solve(s: PoseState): void {
    const { wq, wt, yq, tmp } = this;
    const { parent, joints, contacts } = this.m;
    const half = (-s.yaw * Math.PI) / 360;
    yq[0] = 0; yq[1] = Math.sin(half); yq[2] = 0; yq[3] = Math.cos(half);
    for (let i = 0; i < joints.length; i++) {
      const p = parent[i], o = i * 4;
      const [jx, jy, jz] = joints[i];
      // t = t_parent + Q_parent · (j − q·j)
      rotate(s.q, o, jx, jy, jz, tmp, 0);
      const pq = p < 0 ? yq : wq, po = p < 0 ? 0 : p * 4;
      rotate(pq, po, jx - tmp[0], jy - tmp[1], jz - tmp[2], tmp, 0);
      wt[i * 3] = tmp[0] + (p < 0 ? 0 : wt[p * 3]);
      wt[i * 3 + 1] = tmp[1] + (p < 0 ? 0 : wt[p * 3 + 1]);
      wt[i * 3 + 2] = tmp[2] + (p < 0 ? 0 : wt[p * 3 + 2]);
      mul(pq, po, s.q, o, wq, o);
    }
    let low = Infinity;
    for (const c of contacts) {
      rotate(wq, c.bone * 4, c.p[0], c.p[1], c.p[2], tmp, 0);
      low = Math.min(low, tmp[1] + wt[c.bone * 3 + 1]);
    }
    const lift = this.restFloor - low;
    for (let i = 0; i < joints.length; i++) wt[i * 3 + 1] += lift;
  }
}
