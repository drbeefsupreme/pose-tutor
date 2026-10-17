import { Field, type VeinPath } from './field';
import { ANATOMY } from './anatomy';
import type { FieldState, V3 } from './types';

declare const self: Worker;

const fields = new Map<string, Field>();
function getField(state: FieldState, pose: string, veins?: VeinPath[]): Field {
  const key = JSON.stringify(state) + pose + (veins ? veins.length : 0);
  let f = fields.get(key);
  if (!f) { f = new Field(ANATOMY, state, pose, veins); fields.set(key, f); }
  return f;
}

export type Job =
  | { type: 'blocks'; state: FieldState; pose: string; origin: number[]; h: number; B: number; blocks: Int32Array }
  | { type: 'refine'; state: FieldState; pose: string; pos: Float32Array; iters: number }
  | { type: 'project'; state: FieldState; pose: string; veins?: VeinPath[]; pos: Float32Array; nrm: Float32Array; maxDist: number };

export interface JobResult {
  id: number;
  out?: Float32Array; nrm?: Float32Array; ao?: Float32Array; fail?: Uint8Array;
}

type BlocksJob = Extract<Job, { type: 'blocks' }>;
type RefineJob = Extract<Job, { type: 'refine' }>;
type ProjectJob = Extract<Job, { type: 'project' }>;

const PROJECT_STEP = 0.001;
const BISECT_STEPS = 14;
const AO_SAMPLES = 5;
const AO_SPACING = 0.0045;
const AO_FALLOFF = 0.6;
const AO_GAIN = 32;

function sampleBlocks(job: BlocksJob): Float32Array {
  const f = getField(job.state, job.pose);
  const n = job.B + 1;
  const nb = job.blocks.length / 3;
  const out = new Float32Array(nb * n * n * n);
  let o = 0;
  for (let b = 0; b < nb; b++) {
    const bx = job.blocks[b * 3], by = job.blocks[b * 3 + 1], bz = job.blocks[b * 3 + 2];
    for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      out[o++] = f.eval(job.origin[0] + (bx * job.B + i) * job.h, job.origin[1] + (by * job.B + j) * job.h, job.origin[2] + (bz * job.B + k) * job.h);
    }
  }
  return out;
}

function snapToSurface(job: RefineJob): { out: Float32Array; nrm: Float32Array } {
  const f = getField(job.state, job.pose);
  const p = job.pos;
  const nrm = new Float32Array(p.length);
  for (let v = 0; v < p.length; v += 3) {
    let x = p[v], y = p[v + 1], z = p[v + 2];
    for (let it = 0; it < job.iters; it++) {
      const d = f.eval(x, y, z);
      const g = f.grad(x, y, z);
      x -= g[0] * d; y -= g[1] * d; z -= g[2] * d;
    }
    p[v] = x; p[v + 1] = y; p[v + 2] = z;
    const g = f.grad(x, y, z);
    nrm[v] = g[0]; nrm[v + 1] = g[1]; nrm[v + 2] = g[2];
  }
  return { out: p, nrm };
}

function bracketNearestRoot(at: (s: number) => number, maxDist: number): { lo: number; hi: number } | undefined {
  const f0 = at(0);
  if (Math.abs(f0) < 1e-7) return { lo: 0, hi: 0 };
  let pPrev = 0, fPrev = f0, mPrev = 0, gPrev = f0;
  for (let k = 1; k * PROJECT_STEP <= maxDist; k++) {
    const sp = k * PROJECT_STEP, fp = at(sp);
    if ((fp < 0) !== (fPrev < 0)) return { lo: pPrev, hi: sp };
    pPrev = sp; fPrev = fp;
    const sm = -k * PROJECT_STEP, fm = at(sm);
    if ((fm < 0) !== (gPrev < 0)) return { lo: sm, hi: mPrev };
    mPrev = sm; gPrev = fm;
  }
  return undefined;
}

function bisectRoot(at: (s: number) => number, lo: number, hi: number): number {
  let flo = at(lo);
  for (let it = 0; it < BISECT_STEPS; it++) {
    const mid = 0.5 * (lo + hi), fm = at(mid);
    if ((fm < 0) === (flo < 0)) { lo = mid; flo = fm; } else hi = mid;
  }
  return 0.5 * (lo + hi);
}

function ambientOcclusion(f: Field, x: number, y: number, z: number, g: V3): number {
  let occ = 0, w = 1;
  for (let i = 1; i <= AO_SAMPLES; i++) {
    const h = AO_SPACING * i;
    const d = f.eval(x + g[0] * h, y + g[1] * h, z + g[2] * h);
    occ += (h - d) * w;
    w *= AO_FALLOFF;
  }
  return Math.max(0, Math.min(1, 1 - occ * AO_GAIN));
}

function projectAlongNormals(job: ProjectJob): { out: Float32Array; nrm: Float32Array; ao: Float32Array; fail: Uint8Array } {
  const f = getField(job.state, job.pose, job.veins);
  const p = job.pos, n = job.nrm;
  const outP = new Float32Array(p.length), outN = new Float32Array(p.length);
  const ao = new Float32Array(p.length / 3);
  const fail = new Uint8Array(p.length / 3);
  for (let v = 0; v < p.length; v += 3) {
    const nx = n[v], ny = n[v + 1], nz = n[v + 2];
    const at = (s: number) => f.eval(p[v] + nx * s, p[v + 1] + ny * s, p[v + 2] + nz * s);
    const root = bracketNearestRoot(at, job.maxDist);
    let s = 0;
    if (root && root.hi !== root.lo) s = bisectRoot(at, root.lo, root.hi);
    else if (!root) fail[v / 3] = 1;
    const x = p[v] + nx * s, y = p[v + 1] + ny * s, z = p[v + 2] + nz * s;
    outP[v] = x; outP[v + 1] = y; outP[v + 2] = z;
    const g = f.grad(x, y, z, 0.0006);
    outN[v] = g[0]; outN[v + 1] = g[1]; outN[v + 2] = g[2];
    ao[v / 3] = ambientOcclusion(f, x, y, z, g);
  }
  return { out: outP, nrm: outN, ao, fail };
}

self.onmessage = (ev: MessageEvent<{ id: number; job: Job }>) => {
  const { id, job } = ev.data;
  if (job.type === 'blocks') {
    const out = sampleBlocks(job);
    self.postMessage({ id, out }, [out.buffer]);
  } else if (job.type === 'refine') {
    const { out, nrm } = snapToSurface(job);
    self.postMessage({ id, out, nrm }, [out.buffer, nrm.buffer]);
  } else if (job.type === 'project') {
    const { out, nrm, ao, fail } = projectAlongNormals(job);
    self.postMessage({ id, out, nrm, ao, fail }, [out.buffer, nrm.buffer, ao.buffer, fail.buffer]);
  }
};
