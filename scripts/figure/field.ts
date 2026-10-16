import { POSES, solvePose, posePt, applyDir, JOINTS, skinSlot } from './skeleton';
import type { Anatomy, FieldState, V3, MuscleDef, CoreDef } from './types';

const LOFT_SLOTS = [skinSlot('pelvis', 1), skinSlot('lumbar', 1), skinSlot('chest', 1)];
const SMOOTH_STEPS = 5;
const SWEEP_STRIDE = 10;
const SWEEP_T = 9;
const GROOVE_HALF_WIDTH = 0.007;
const DISTANCE_GAP_PER_BORDER_DISTANCE = 2;
const GROOVE_GAP_SCALE = DISTANCE_GAP_PER_BORDER_DISTANCE * GROOVE_HALF_WIDTH;

interface Skinned {
  skinSlots: number[];
  skinSlotT: number[];
}

interface SpindlePrim extends Skinned {
  kind: 'spindle';
  neg: false;
  // sweep: per vertex [px py pz tx ty tz ux uy uz t]
  sweep: Float64Array; n: number;
  r0: number; rp: number; r1: number; tp: number; bulge: number; dr: number;
  head: number;
}

interface ConePrim extends Skinned {
  kind: 'cone';
  neg: boolean;
  ax: number; ay: number; az: number;
  bx: number; by: number; bz: number;
  ra: number; rb: number;
}

interface LoftPrim {
  kind: 'loft';
  neg: boolean;
  levels: Float64Array; n: number;
}

interface EllipsoidPrim extends Skinned {
  kind: 'ell';
  neg: boolean;
  cx: number; cy: number; cz: number;
  inverseRotation: number[];
  rx: number; ry: number; rz: number;
}

type Prim = SpindlePrim | ConePrim | LoftPrim | EllipsoidPrim;

interface Fiber { t: number }

interface Part {
  id: number;
  isMuscle: boolean;
  prims: Prim[];
  k: number;
  sep: number;
  intra: number;
  min: V3; max: V3;
}

function smin(a: number, b: number, k: number): number {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
function smax(a: number, b: number, k: number): number {
  return -smin(-a, -b, k);
}

function sub(a: V3, b: V3): V3 { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function len(a: V3): number { return Math.hypot(a[0], a[1], a[2]); }
function norm(a: V3): V3 { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
function cross(a: V3, b: V3): V3 { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function dot(a: V3, b: V3): number { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

function eulerMatrix(rot: V3): number[] {
  const [rx, ry, rz] = rot.map((d) => (d * Math.PI) / 180);
  const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
  // R = Rz * Ry * Rx
  return [
    cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx,
    sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx,
    -sy, cy * sx, cy * cx,
  ];
}

const smoothedIndex = (k: number, ctrlCount: number) => (ctrlCount < 3 ? k : k * SMOOTH_STEPS);

function smoothPath(ctrl: V3[]): V3[] {
  if (ctrl.length < 3) return ctrl;
  const out: V3[] = [];
  const per = SMOOTH_STEPS;
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
    for (let s = 0; s < per; s++) {
      const t = s / per, t2 = t * t, t3 = t2 * t;
      out.push([0, 1, 2].map((k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)) as V3);
    }
  }
  out.push(ctrl[ctrl.length - 1]);
  return out;
}

function profile(p: SpindlePrim, t: number): number {
  if (t < p.tp) {
    const x = t / p.tp;
    return p.r0 + (p.rp - p.r0) * (1 - Math.pow(1 - x, p.bulge));
  }
  const x = (1 - t) / (1 - p.tp);
  return p.r1 + (p.rp - p.r1) * (1 - Math.pow(1 - x, p.bulge));
}

const UNUSED_FIBER: Fiber = { t: 0 };

function evalPrim(p: Prim, x: number, y: number, z: number, fiber: Fiber = UNUSED_FIBER): number {
  switch (p.kind) {
    case 'spindle': return evalSpindle(p, x, y, z, fiber);
    case 'cone': return evalCone(p, x, y, z, fiber);
    case 'loft': return evalLoft(p, x, y, z, fiber);
    case 'ell': return evalEllipsoid(p, x, y, z, fiber);
  }
}

function evalSpindle(p: SpindlePrim, x: number, y: number, z: number, fiber: Fiber): number {
  const sw = p.sweep, n = p.n;
  let best = 1e30, bi = 0, bs = 0, braw = 0;
  for (let i = 0; i < n - 1; i++) {
    const o = i * SWEEP_STRIDE, o2 = o + SWEEP_STRIDE;
    const ax = sw[o], ay = sw[o + 1], az = sw[o + 2];
    const abx = sw[o2] - ax, aby = sw[o2 + 1] - ay, abz = sw[o2 + 2] - az;
    const l2 = abx * abx + aby * aby + abz * abz;
    const raw = ((x - ax) * abx + (y - ay) * aby + (z - az) * abz) / l2;
    const s = raw < 0 ? 0 : raw > 1 ? 1 : raw;
    const dx = x - ax - abx * s, dy = y - ay - aby * s, dz = z - az - abz * s;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < best) { best = d2; bi = i; bs = s; braw = raw; }
  }
  const o = bi * SWEEP_STRIDE, o2 = o + SWEEP_STRIDE;
  const cx = sw[o] + (sw[o2] - sw[o]) * bs, cy = sw[o + 1] + (sw[o2 + 1] - sw[o + 1]) * bs, cz = sw[o + 2] + (sw[o2 + 2] - sw[o + 2]) * bs;
  let tx = sw[o + 3] + (sw[o2 + 3] - sw[o + 3]) * bs, ty = sw[o + 4] + (sw[o2 + 4] - sw[o + 4]) * bs, tz = sw[o + 5] + (sw[o2 + 5] - sw[o + 5]) * bs;
  const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
  let ux = sw[o + 6] + (sw[o2 + 6] - sw[o + 6]) * bs, uy = sw[o + 7] + (sw[o2 + 7] - sw[o + 7]) * bs, uz = sw[o + 8] + (sw[o2 + 8] - sw[o + 8]) * bs;
  const ud = ux * tx + uy * ty + uz * tz;
  ux -= tx * ud; uy -= ty * ud; uz -= tz * ud;
  const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
  const wx = uy * tz - uz * ty, wy = uz * tx - ux * tz, wz = ux * ty - uy * tx;
  const vx = x - cx, vy = y - cy, vz = z - cz;
  const lx = vx * wx + vy * wy + vz * wz;
  const ly = vx * ux + vy * uy + vz * uz;
  const atEnd = (bi === 0 && braw < 0) || (bi === n - 2 && braw > 1);
  const lz = atEnd ? vx * tx + vy * ty + vz * tz : 0;
  const t = sw[o + SWEEP_T] + (sw[o2 + SWEEP_T] - sw[o + SWEEP_T]) * bs;
  const rw = Math.max(profile(p, t), 1e-4);
  const rd = rw * p.dr;
  const rz = Math.min(rw, rd);
  const k0 = Math.sqrt((lx / rw) ** 2 + (ly / rd) ** 2 + (lz / rz) ** 2);
  const k1 = Math.sqrt((lx / (rw * rw)) ** 2 + (ly / (rd * rd)) ** 2 + (lz / (rz * rz)) ** 2);
  fiber.t = t;
  if (k1 < 1e-9) return -rz;
  return (k0 * (k0 - 1)) / k1;
}

function evalCone(p: ConePrim, x: number, y: number, z: number, fiber: Fiber): number {
  // Inigo Quilez, round cone between arbitrary points.
  const bax = p.bx - p.ax, bay = p.by - p.ay, baz = p.bz - p.az;
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = p.ra - p.rb;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  const pax = x - p.ax, pay = y - p.ay, paz = z - p.az;
  const yy = pax * bax + pay * bay + paz * baz;
  const zz = yy - l2;
  const cx = pax * l2 - bax * yy, cy = pay * l2 - bay * yy, cz = paz * l2 - baz * yy;
  const x2 = cx * cx + cy * cy + cz * cz;
  const y2 = yy * yy * l2;
  const z2 = zz * zz * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  fiber.t = Math.min(1, Math.max(0, yy * il2));
  if (Math.sign(zz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - p.rb;
  if (Math.sign(yy) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - p.ra;
  return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - p.ra;
}

function evalLoft(p: LoftPrim, x: number, y: number, z: number, fiber: Fiber): number {
  const sw = p.levels, n = p.n;
  const y0 = sw[0], y1 = sw[(n - 1) * 5];
  const yc = y < y0 ? y0 : y > y1 ? y1 : y;
  let i = 0;
  while (i < n - 2 && sw[(i + 1) * 5] <= yc) i++;
  const t = (yc - sw[i * 5]) / (sw[(i + 1) * 5] - sw[i * 5]);
  const i0 = Math.max(0, i - 1), i3 = Math.min(n - 1, i + 2);
  const cr = (k: number) => {
    const q0 = sw[i0 * 5 + k], q1 = sw[i * 5 + k], q2 = sw[(i + 1) * 5 + k], q3 = sw[i3 * 5 + k];
    return 0.5 * (2 * q1 + (-q0 + q2) * t + (2 * q0 - 5 * q1 + 4 * q2 - q3) * t * t + (-q0 + 3 * q1 - 3 * q2 + q3) * t * t * t);
  };
  const cx = cr(1), cz = cr(2), a = cr(3), b = cr(4);
  const lx = x - cx, lz = z - cz;
  const k0 = Math.sqrt((lx / a) ** 2 + (lz / b) ** 2);
  const k1 = Math.sqrt((lx / (a * a)) ** 2 + (lz / (b * b)) ** 2);
  const d2 = k1 < 1e-9 ? -Math.min(a, b) : (k0 * (k0 - 1)) / k1;
  const dy = Math.abs(y - yc);
  fiber.t = 0.5;
  return dy > 0 ? (d2 > 0 ? Math.hypot(d2, dy) : dy) : d2;
}

function evalEllipsoid(p: EllipsoidPrim, x: number, y: number, z: number, fiber: Fiber): number {
  // ellipsoid (IQ bound approximation)
  const dx = x - p.cx, dy = y - p.cy, dz = z - p.cz;
  const m = p.inverseRotation;
  const lx = m[0] * dx + m[1] * dy + m[2] * dz;
  const ly = m[3] * dx + m[4] * dy + m[5] * dz;
  const lz = m[6] * dx + m[7] * dy + m[8] * dz;
  const k0 = Math.sqrt((lx / p.rx) ** 2 + (ly / p.ry) ** 2 + (lz / p.rz) ** 2);
  const k1 = Math.sqrt((lx / (p.rx * p.rx)) ** 2 + (ly / (p.ry * p.ry)) ** 2 + (lz / (p.rz * p.rz)) ** 2);
  fiber.t = 0.5;
  if (k1 < 1e-9) return -Math.min(p.rx, p.ry, p.rz);
  return (k0 * (k0 - 1)) / k1;
}

const GRID_CELL = 0.03;
const MARGIN = 0.05;
const BLUR_DIRS = (() => {
  const g = (1 + Math.sqrt(5)) / 2;
  const v = [[-1, g, 0], [1, g, 0], [-1, -g, 0], [1, -g, 0], [0, -1, g], [0, 1, g], [0, -1, -g], [0, 1, -g], [g, 0, -1], [g, 0, 1], [-g, 0, -1], [-g, 0, 1]];
  return Float64Array.from(v.flatMap((d) => { const l = Math.hypot(d[0], d[1], d[2]); return d.map((c) => c / l); }));
})();

export interface VeinPath { pts: V3[]; r: number[] }

export class Field {
  parts: Part[] = [];
  veinPrims: ConePrim[] = [];
  st: FieldState;
  kInter: number;
  grooveDepth: number;
  intraDepth: number;
  intraK: number;
  fat: { c: V3; ir: V3; a: number }[] = [];
  fatBase: number;
  blurR: number;
  gmin: V3 = [0, 0, 0];
  gdim: V3 = [0, 0, 0];
  cells: Int32Array[] = [];
  veinCells: Int32Array[] = [];

  constructor(anat: Anatomy, st: FieldState, poseName = 'relaxed', veins?: VeinPath[]) {
    this.st = st;
    const fatAtt = 1 - 0.85 * st.fat;
    this.kInter = 0.009 + 0.012 * st.fat;
    this.grooveDepth = 0.0068 * st.sep * fatAtt;
    this.intraDepth = 0.0036 * st.detail * fatAtt;
    this.intraK = 0.009 * st.fat;
    this.fatBase = 0.0035 * st.fat;
    this.blurR = 0.014 * st.fat;
    const xf = solvePose(POSES[poseName] ?? {});


    const addMuscle = (m: MuscleDef, side: 1 | -1) => {
      const part: Part = {
        id: this.parts.length, isMuscle: true, prims: [], k: (m.k ?? 0.009) + this.intraK, sep: m.sep, intra: m.intra,
        min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9],
      };
      const heads: string[] = [];
      m.bundles.forEach((bd) => {
        const ctrl = bd.pts.map((q) => posePt(xf, q, side));
        const restCtrl = bd.pts.map((q) => [q.p[0] * side, q.p[1], q.p[2]] as V3);
        const pts = smoothPath(ctrl);
        const restPts = smoothPath(restCtrl);
        let L = 0, Lr = 0;
        const segL: number[] = [];
        for (let i = 1; i < pts.length; i++) { const l = len(sub(pts[i], pts[i - 1])); segL.push(l); L += l; Lr += len(sub(restPts[i], restPts[i - 1])); }
        const stretch = Math.min(1.35, Math.max(0.8, Math.sqrt(Lr / L)));
        const upRest: V3 = [bd.up[0] * side, bd.up[1], bd.up[2]];
        const up = norm(applyDir(xf(bd.pts[0].bone, side), upRest));
        const h = bd.head ?? 'main';
        let hid = heads.indexOf(h); if (hid < 0) { heads.push(h); hid = heads.length - 1; }
        const n = pts.length;
        const sw = new Float64Array(n * SWEEP_STRIDE);
        let acc = 0;
        for (let i = 0; i < n; i++) {
          const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
          const e = norm(sub(b, a));
          let u: V3 = sub(up, [e[0] * dot(up, e), e[1] * dot(up, e), e[2] * dot(up, e)]);
          if (len(u) < 1e-4) u = norm(cross(e, [0, 0, 1]));
          u = norm(u);
          if (i > 0) acc += segL[i - 1];
          sw.set([pts[i][0], pts[i][1], pts[i][2], e[0], e[1], e[2], u[0], u[1], u[2], acc / L], i * SWEEP_STRIDE);
        }
        const p: SpindlePrim = {
          kind: 'spindle', neg: false, sweep: sw, n,
          r0: bd.r0, rp: bd.rp * stretch, r1: bd.r1, tp: bd.tp, bulge: bd.bulge ?? 2, dr: bd.dr,
          head: hid,
          skinSlots: bd.pts.map((q) => skinSlot(q.bone, side)),
          skinSlotT: bd.pts.map((_, k) => sw[smoothedIndex(k, bd.pts.length) * SWEEP_STRIDE + SWEEP_T]),
        };
        part.prims.push(p);
        const rmax = Math.max(p.r0, p.rp, p.r1);
        for (const q of pts) for (let c = 0; c < 3; c++) {
          part.min[c] = Math.min(part.min[c], q[c] - rmax);
          part.max[c] = Math.max(part.max[c], q[c] + rmax);
        }
      });
      this.parts.push(part);
    };

    const addCore = (c: CoreDef, side: 1 | -1) => {
      const part: Part = {
        id: this.parts.length, isMuscle: false, prims: [], k: c.k, sep: c.sep, intra: 0,
        min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9],
      };
      for (const cp of c.prims) {
        let p: Prim;
        if (cp.kind === 'cone') {
          const a = posePt(xf, cp.a, side), b = posePt(xf, cp.b, side);
          p = {
            kind: 'cone', neg: !!cp.neg, ax: a[0], ay: a[1], az: a[2], bx: b[0], by: b[1], bz: b[2], ra: cp.ra, rb: cp.rb,
            skinSlots: [skinSlot(cp.a.bone, side), skinSlot(cp.b.bone, side)], skinSlotT: [0, 1],
          };
          const r = Math.max(cp.ra, cp.rb);
          if (!p.neg) for (const q of [a, b]) for (let k = 0; k < 3; k++) {
            part.min[k] = Math.min(part.min[k], q[k] - r); part.max[k] = Math.max(part.max[k], q[k] + r);
          }
        } else if (cp.kind === 'loft') {
          p = { kind: 'loft', neg: !!cp.neg, n: cp.levels.length, levels: Float64Array.from(cp.levels.flat()) };
          for (const [y, cx, cz, a, b] of cp.levels) {
            part.min[0] = Math.min(part.min[0], cx - a); part.max[0] = Math.max(part.max[0], cx + a);
            part.min[1] = Math.min(part.min[1], y - 0.02); part.max[1] = Math.max(part.max[1], y + 0.02);
            part.min[2] = Math.min(part.min[2], cz - b); part.max[2] = Math.max(part.max[2], cz + b);
          }
        } else {
          const c0 = posePt(xf, cp.c, side);
          const rot = cp.rot ?? [0, 0, 0];
          const rotS: V3 = side === 1 ? rot : [rot[0], -rot[1], -rot[2]];
          const R = eulerMatrix(rotS);
          const bx = xf(cp.c.bone, side);
          const cols: V3[] = [0, 1, 2].map((j) => applyDir(bx, [R[j], R[3 + j], R[6 + j]]));
          p = {
            kind: 'ell', neg: !!cp.neg, cx: c0[0], cy: c0[1], cz: c0[2],
            inverseRotation: [cols[0][0], cols[0][1], cols[0][2], cols[1][0], cols[1][1], cols[1][2], cols[2][0], cols[2][1], cols[2][2]],
            rx: cp.r[0], ry: cp.r[1], rz: cp.r[2],
            skinSlots: [skinSlot(cp.c.bone, side)], skinSlotT: [0],
          };
          const r = Math.max(...cp.r);
          if (!p.neg) for (let k = 0; k < 3; k++) {
            part.min[k] = Math.min(part.min[k], c0[k] - r); part.max[k] = Math.max(part.max[k], c0[k] + r);
          }
        }
        part.prims.push(p);
      }
      this.parts.push(part);
    };

    const isMid = (pts: { p: V3 }[]) => pts.every((q) => Math.abs(q.p[0]) < 1e-9);
    for (const m of anat.muscles) {
      addMuscle(m, 1);
      if (!isMid(m.bundles.flatMap((b) => b.pts))) addMuscle(m, -1);
    }
    for (const c of anat.cores) {
      addCore(c, 1);
      const pts = c.prims.flatMap((p) => (p.kind === 'cone' ? [p.a, p.b] : p.kind === 'ell' ? [p.c] : []));
      if (!isMid(pts)) addCore(c, -1);
    }
    for (const f of anat.fat) {
      for (const side of [1, -1] as const) {
        if (side === -1 && Math.abs(f.c.p[0]) < 1e-9) continue;
        this.fat.push({ c: posePt(xf, f.c, side), ir: [1 / f.r[0], 1 / f.r[1], 1 / f.r[2]], a: f.amount });
      }
    }
    if (veins && st.vein > 0) {
      for (const v of veins) {
        for (let i = 1; i < v.pts.length; i++) {
          const a = v.pts[i - 1], b = v.pts[i];
          this.veinPrims.push({
            kind: 'cone', neg: false, ax: a[0], ay: a[1], az: a[2], bx: b[0], by: b[1], bz: b[2],
            ra: v.r[i - 1] * st.vein, rb: v.r[i] * st.vein, skinSlots: [], skinSlotT: [],
          });
        }
      }
    }
    this.buildGrid();
  }

  private buildGrid() {
    const lo: V3 = [1e9, 1e9, 1e9], hi: V3 = [-1e9, -1e9, -1e9];
    for (const p of this.parts) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p.min[k]); hi[k] = Math.max(hi[k], p.max[k]); }
    for (let k = 0; k < 3; k++) { lo[k] -= MARGIN * 2; hi[k] += MARGIN * 2; }
    this.gmin = lo;
    this.gdim = [0, 1, 2].map((k) => Math.ceil((hi[k] - lo[k]) / GRID_CELL)) as V3;
    const [nx, ny, nz] = this.gdim;
    const lists: number[][] = Array.from({ length: nx * ny * nz }, () => []);
    const vlists: number[][] = Array.from({ length: nx * ny * nz }, () => []);
    const stamp = (min: V3, max: V3, id: number, target: number[][]) => {
      const i0 = Math.max(0, Math.floor((min[0] - MARGIN - lo[0]) / GRID_CELL));
      const j0 = Math.max(0, Math.floor((min[1] - MARGIN - lo[1]) / GRID_CELL));
      const k0 = Math.max(0, Math.floor((min[2] - MARGIN - lo[2]) / GRID_CELL));
      const i1 = Math.min(nx - 1, Math.floor((max[0] + MARGIN - lo[0]) / GRID_CELL));
      const j1 = Math.min(ny - 1, Math.floor((max[1] + MARGIN - lo[1]) / GRID_CELL));
      const k1 = Math.min(nz - 1, Math.floor((max[2] + MARGIN - lo[2]) / GRID_CELL));
      for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) target[i + nx * (j + ny * k)].push(id);
    };
    for (const p of this.parts) stamp(p.min, p.max, p.id, lists);
    this.veinPrims.forEach((p, i) => {
      const r = Math.max(p.ra, p.rb);
      stamp([Math.min(p.ax, p.bx) - r, Math.min(p.ay, p.by) - r, Math.min(p.az, p.bz) - r],
        [Math.max(p.ax, p.bx) + r, Math.max(p.ay, p.by) + r, Math.max(p.az, p.bz) + r], i, vlists);
    });
    this.cells = lists.map((l) => Int32Array.from(l));
    this.veinCells = vlists.map((l) => Int32Array.from(l));
  }

  bounds(): { min: V3; max: V3 } {
    const lo: V3 = [1e9, 1e9, 1e9], hi: V3 = [-1e9, -1e9, -1e9];
    for (const p of this.parts) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p.min[k]); hi[k] = Math.max(hi[k], p.max[k]); }
    return { min: lo, max: hi };
  }

  private cellOf(x: number, y: number, z: number): number {
    const i = Math.floor((x - this.gmin[0]) / GRID_CELL);
    const j = Math.floor((y - this.gmin[1]) / GRID_CELL);
    const k = Math.floor((z - this.gmin[2]) / GRID_CELL);
    const [nx, ny, nz] = this.gdim;
    if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) return -1;
    return i + nx * (j + ny * k);
  }

  private pd = new Float64Array(256);
  private pid = new Int32Array(256);

  partDist(part: Part, x: number, y: number, z: number): number {
    const prims = part.prims;
    let d = 1e9;
    let dh1 = 1e9, h1 = -1, dh2 = 1e9;
    let dneg = -1e9;
    for (let i = 0; i < prims.length; i++) {
      const p = prims[i];
      const di = evalPrim(p, x, y, z);
      if (p.neg) { dneg = Math.max(dneg, -di); continue; }
      d = i === 0 ? di : smin(d, di, part.k);
      if (part.intra > 0 && p.kind === 'spindle') {
        if (p.head === h1) { if (di < dh1) dh1 = di; }
        else if (di < dh1) { dh2 = h1 >= 0 ? dh1 : dh2; dh1 = di; h1 = p.head; }
        else if (di < dh2) dh2 = di;
      }
    }
    if (dneg > -1e9) d = smax(d, dneg, part.k);
    if (part.intra > 0 && dh2 < 1e8 && this.intraDepth > 0) {
      const g = (dh2 - dh1) / (GROOVE_GAP_SCALE * 0.8);
      d += this.intraDepth * part.intra * Math.exp(-g * g);
    }
    return d;
  }

  fatThickness(x: number, y: number, z: number): number {
    const t = 0.0015;
    if (this.st.fat <= 0) return t;
    let s = 0;
    for (const f of this.fat) {
      const dx = (x - f.c[0]) * f.ir[0], dy = (y - f.c[1]) * f.ir[1], dz = (z - f.c[2]) * f.ir[2];
      const q = dx * dx + dy * dy + dz * dz;
      if (q < 9) s += f.a * Math.exp(-q);
    }
    return t + this.st.fat * (this.fatBase / Math.max(this.st.fat, 1e-6) + s);
  }

  evalSharp(x: number, y: number, z: number): number {
    const c = this.cellOf(x, y, z);
    if (c < 0) return MARGIN;
    const list = this.cells[c];
    if (list.length === 0) return MARGIN;
    const n = list.length;
    const pd = this.pd, pid = this.pid;
    for (let i = 0; i < n; i++) {
      const part = this.parts[list[i]];
      const d = this.partDist(part, x, y, z);
      let j = i;
      while (j > 0 && pd[j - 1] > d) { pd[j] = pd[j - 1]; pid[j] = pid[j - 1]; j--; }
      pd[j] = d; pid[j] = list[i];
    }
    let dm = 1e9, dc = 1e9, cMin = 1e9, wsum = 0, ksum = 0;
    for (let i = 0; i < n; i++) {
      const part = this.parts[pid[i]];
      if (part.isMuscle) dm = dm > 1e8 ? pd[i] : smin(dm, pd[i], this.kInter);
      else if (pd[i] < cMin) cMin = pd[i];
    }
    for (let i = 0; i < n; i++) {
      const part = this.parts[pid[i]];
      if (part.isMuscle) continue;
      const w = Math.exp(-(pd[i] - cMin) / 0.004);
      wsum += w; ksum += w * part.k;
      dc = dc > 1e8 ? pd[i] : smin(dc, pd[i], Math.max(this.kInter, part.k));
    }
    const kMC = Math.max(this.kInter, wsum > 0 ? ksum / wsum : 0);
    let d = dm > 1e8 ? dc : dc > 1e8 ? dm : smin(dm, dc, kMC);
    if (n > 1 && this.grooveDepth > 0) {
      let i0 = -1;
      for (let i = 0; i < n; i++) if (this.parts[pid[i]].sep > 0) { i0 = i; break; }
      const lag = i0 >= 0 ? pd[i0] - pd[0] : 1;
      if (i0 >= 0 && lag < 0.012) {
        const u = Math.min(1, Math.max(0, (lag - 0.006) / 0.006));
        const fade = 1 - u * u * (3 - 2 * u);
        const s0 = this.parts[pid[i0]].sep;
        let best = 0;
        for (let j = i0 + 1; j < n; j++) {
          const g = (pd[j] - pd[i0]) / GROOVE_GAP_SCALE;
          if (g > 3) break;
          const sj = this.parts[pid[j]].sep;
          if (sj <= 0) continue;
          best = Math.max(best, Math.min(s0, sj) * Math.exp(-g * g));
        }
        d += this.grooveDepth * best * fade;
      }
    }
    return d;
  }

  eval(x: number, y: number, z: number): number {
    let d: number;
    const R = this.blurR;
    if (R > 0) {
      let s = 0;
      for (let i = 0; i < BLUR_DIRS.length; i += 3) s += this.evalSharp(x + BLUR_DIRS[i] * R, y + BLUR_DIRS[i + 1] * R, z + BLUR_DIRS[i + 2] * R);
      d = 0.3 * this.evalSharp(x, y, z) + 0.7 * s / (BLUR_DIRS.length / 3);
    } else d = this.evalSharp(x, y, z);
    d -= this.fatThickness(x, y, z);
    if (this.veinPrims.length) {
      const c = this.cellOf(x, y, z);
      if (c >= 0) {
        const vl = this.veinCells[c];
        for (let i = 0; i < vl.length; i++) d = smin(d, evalPrim(this.veinPrims[vl[i]], x, y, z), 0.0035);
      }
    }
    return d;
  }

  grad(x: number, y: number, z: number, eps = 0.0004): V3 {
    const a = this.eval(x + eps, y - eps, z - eps);
    const b = this.eval(x - eps, y - eps, z + eps);
    const c = this.eval(x - eps, y + eps, z - eps);
    const d = this.eval(x + eps, y + eps, z + eps);
    const gx = a - b - c + d, gy = -a - b + c + d, gz = -a + b - c + d;
    const l = Math.hypot(gx, gy, gz) || 1;
    return [gx / l, gy / l, gz / l];
  }

  private skinScratch = new Float64Array(0);
  private skinFiber: Fiber = { t: 0 };

  /** Skin weights at a point, one per SKIN_BONES slot. Returns false when no part is near. */
  boneWeights(x: number, y: number, z: number, out: Float64Array): boolean {
    out.fill(0);
    const c = this.cellOf(x, y, z);
    if (c < 0 || this.cells[c].length === 0) return false;
    const list = this.cells[c], pd = this.pd;
    let dmin = 1e9;
    for (let i = 0; i < list.length; i++) { pd[i] = this.partDist(this.parts[list[i]], x, y, z); dmin = Math.min(dmin, pd[i]); }
    for (let i = 0; i < list.length; i++) {
      const wPart = Math.exp(-(pd[i] - dmin) / 0.004);
      if (wPart < 1e-3) continue;
      const prims = this.parts[list[i]].prims, n = prims.length;
      if (this.skinScratch.length < 2 * n) this.skinScratch = new Float64Array(2 * n);
      const ds = this.skinScratch;
      let pmin = 1e9;
      for (let k = 0; k < n; k++) {
        ds[k] = prims[k].neg ? 1e9 : evalPrim(prims[k], x, y, z, this.skinFiber);
        ds[n + k] = this.skinFiber.t;
        pmin = Math.min(pmin, ds[k]);
      }
      for (let k = 0; k < n; k++) {
        const p = prims[k];
        const w = wPart * Math.exp(-(ds[k] - pmin) / 0.004);
        if (w < 1e-4) continue;
        if (p.kind === 'loft') {
          const sl = Math.min(1, Math.max(0, (y - JOINTS.lumbar[1] + 0.04) / 0.08));
          const sc = Math.min(1, Math.max(0, (y - JOINTS.chest[1] + 0.04) / 0.08));
          out[LOFT_SLOTS[0]] += w * (1 - sl);
          out[LOFT_SLOTS[1]] += w * (sl - sc);
          out[LOFT_SLOTS[2]] += w * sc;
          continue;
        }
        if (p.skinSlots.length === 1) { out[p.skinSlots[0]] += w; continue; }
        const t = ds[n + k];
        let j = 0;
        while (j < p.skinSlotT.length - 2 && t > p.skinSlotT[j + 1]) j++;
        const u = Math.min(1, Math.max(0, (t - p.skinSlotT[j]) / Math.max(1e-6, p.skinSlotT[j + 1] - p.skinSlotT[j])));
        out[p.skinSlots[j]] += w * (1 - u);
        out[p.skinSlots[j + 1]] += w * u;
      }
    }
    let s = 0;
    for (let i = 0; i < out.length; i++) s += out[i];
    if (s <= 0) return false;
    for (let i = 0; i < out.length; i++) out[i] /= s;
    return true;
  }
}
