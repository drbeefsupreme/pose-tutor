import type { BPt, BoneName, Bundle, CoreDef, CorePrim, FatDeposit, MuscleDef, Region, V3, VeinDef } from '../types';
import { JOINTS } from '../skeleton';

const P = (bone: BoneName, x: number, y: number, z: number): BPt => ({ bone, restPos: [x, y, z] });

interface Frame { a: V3; e: V3; L: number; f: V3; lat: V3 }

function frame(a: V3, b: V3, front: V3): Frame {
  const d: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const L = Math.hypot(...d);
  const e: V3 = [d[0] / L, d[1] / L, d[2] / L];
  const fd = front[0] * e[0] + front[1] * e[1] + front[2] * e[2];
  let f: V3 = [front[0] - e[0] * fd, front[1] - e[1] * fd, front[2] - e[2] * fd];
  const fl = Math.hypot(...f); f = [f[0] / fl, f[1] / fl, f[2] / fl];
  const lat: V3 = [f[1] * e[2] - f[2] * e[1], f[2] * e[0] - f[0] * e[2], f[0] * e[1] - f[1] * e[0]];
  return { a, e, L, f, lat };
}
const S = JOINTS.upperarm, E = JOINTS.forearm, W = JOINTS.hand;
const ARM = frame(S, E, [0, 0, 1]);
const FORE = frame(E, W, [0, 0, 1]);

/** Point on a limb: fraction along the bone, lateral offset, anterior offset (meters). */
function limb(fr: Frame, bone: BoneName, f: number, lat: number, ant: number): BPt {
  return {
    bone,
    restPos: [
      fr.a[0] + fr.e[0] * fr.L * f + fr.lat[0] * lat + fr.f[0] * ant,
      fr.a[1] + fr.e[1] * fr.L * f + fr.lat[1] * lat + fr.f[1] * ant,
      fr.a[2] + fr.e[2] * fr.L * f + fr.lat[2] * lat + fr.f[2] * ant,
    ],
  };
}
const arm = (f: number, lat: number, ant: number) => limb(ARM, 'upperarm', f, lat, ant);
const fore = (f: number, lat: number, ant: number) => limb(FORE, 'forearm', f, lat, ant);
const armDir = (lat: number, ant: number, along = 0): V3 => [
  ARM.lat[0] * lat + ARM.f[0] * ant + ARM.e[0] * along,
  ARM.lat[1] * lat + ARM.f[1] * ant + ARM.e[1] * along,
  ARM.lat[2] * lat + ARM.f[2] * ant + ARM.e[2] * along,
];
const foreDir = (lat: number, ant: number): V3 => [
  FORE.lat[0] * lat + FORE.f[0] * ant, FORE.lat[1] * lat + FORE.f[1] * ant, FORE.lat[2] * lat + FORE.f[2] * ant,
];

function B(pts: BPt[], r0: number, rp: number, r1: number, tp: number, dr: number, up: V3, head?: string, bulge?: number): Bundle {
  return { pts, r0, rp, r1, tp, dr, up, head, bulge };
}

const ell = (c: BPt, r: V3, rot?: V3, neg?: boolean): CorePrim => ({ kind: 'ell', c, r, rot, neg });
const cone = (a: BPt, b: BPt, ra: number, rb: number): CorePrim => ({ kind: 'cone', a, b, ra, rb });
const named = (name: string, prim: CorePrim): CorePrim => ({ ...prim, name });

export { P, B, ell, cone, named, arm, fore, armDir, foreDir, limb, S, E, W, ARM, FORE };

interface RegionModule { muscles: MuscleDef[]; cores: CoreDef[]; veins: VeinDef[]; fat: FatDeposit[] }

export function regionModule(m: RegionModule, scale: Partial<Record<Region, number>>): RegionModule {
  for (const mu of m.muscles) {
    const s = scale[mu.region] ?? 1;
    for (const b of mu.bundles) { b.rp *= s; b.r0 *= 1 + (s - 1) * 0.5; b.r1 *= 1 + (s - 1) * 0.4; }
  }
  return m;
}
