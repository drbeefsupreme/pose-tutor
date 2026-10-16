// Units: meters. +Y up, figure faces +Z, +X is the figure's LEFT side.

export type V3 = [number, number, number];

export type BoneName =
  | 'pelvis' | 'lumbar' | 'chest' | 'neck' | 'head'
  | 'scap' | 'upperarm' | 'forearm' | 'hand'
  | 'thigh' | 'shin' | 'foot';

export interface BPt { bone: BoneName; p: V3 }

export type Region =
  | 'head' | 'neck' | 'traps' | 'shoulders' | 'chest' | 'arms' | 'forearms'
  | 'abs' | 'obliques' | 'serratus' | 'back' | 'lowerback' | 'glutes'
  | 'quads' | 'hamstrings' | 'adductors' | 'calves' | 'shins' | 'hands' | 'feet' | 'core';

export interface Bundle {
  /** Polyline from origin to insertion (>= 2 points). */
  pts: BPt[];
  /** Half-width at origin, at the belly peak, at insertion. */
  r0: number; rp: number; r1: number;
  /** Belly peak position along the bundle (0..1). */
  tp: number;
  /** Depth / width ratio of the cross-section (flatness). */
  dr: number;
  /** Outward direction for the depth axis (world, rest pose). */
  up: V3;
  /** Sub-head label; intramuscular grooves form only between different heads. */
  head?: string;
  /** Bulge exponent for the belly profile (default 2). */
  bulge?: number;
}

export interface MuscleDef {
  name: string;
  region: Region;
  bundles: Bundle[];
  /** Weight of the groove at borders with other muscles (0..1). */
  sep: number;
  /** Weight of grooves between heads of this muscle (detail / "maturity"). */
  intra: number;
  /** Intramuscular smooth-union radius. */
  k?: number;
}

export type CorePrim =
  | { kind: 'cone'; a: BPt; b: BPt; ra: number; rb: number; neg?: boolean }
  | { kind: 'ell'; c: BPt; r: V3; rot?: V3; neg?: boolean }
  /** Midline torso loft: horizontal ellipses [y, cx, cz, halfWidth, halfDepth]. Not posed. */
  | { kind: 'loft'; levels: [number, number, number, number, number][]; neg?: boolean };

export interface CoreDef {
  name: string;
  region: Region;
  prims: CorePrim[];
  k: number;
  /** Groove weight at borders with muscles (bony edges). */
  sep: number;
}

export interface VeinDef {
  name: string;
  region: Region;
  pts: BPt[];
  r: number;
  /** Radius multiplier at the end of the path (tapering). */
  taper?: number;
}

export interface FatDeposit { c: BPt; r: V3; amount: number }

export interface Anatomy {
  muscles: MuscleDef[];
  cores: CoreDef[];
  veins: VeinDef[];
  fat: FatDeposit[];
}

export interface FieldState {
  fat: number;       // 0 lean .. 1 soft/off-season
  sep: number;       // 0 .. 1 groove depth at muscle borders
  detail: number;    // 0 .. 1 intramuscular head detail
  vein: number;      // 0 .. 1 raised superficial veins
}

export const BASE_STATE: FieldState = { fat: 0, sep: 0.35, detail: 0.15, vein: 0 };
