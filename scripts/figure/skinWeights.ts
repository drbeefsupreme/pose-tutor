// Skin weights for the baked mesh: up to four bones per vertex, taken from the anatomy (the bones of
// the nearest muscle bundle or core primitive, Field.boneWeights) and smoothed over the surface.
import type { Field } from './field';
import { SKIN_BONES } from './skeleton';

export interface SkinWeights {
  /** Four skin slots per vertex, strongest first. */
  index: Uint8Array;
  /** Four weights per vertex in 1/255 steps; every vertex sums to 255. */
  weight: Uint8Array;
  /** Vertices with no anatomy part nearby; they took their neighbors' weights. */
  filled: number;
}

/**
 * @param pos vertex positions of the bind-pose mesh
 * @param adjStart vertex adjacency (CSR offsets into adjList)
 * @param h grid step of the mesh, so the smoothing covers the same distance at every resolution
 */
export function bakeSkinWeights(field: Field, pos: Float32Array, adjStart: Int32Array, adjList: Int32Array, h: number): SkinWeights {
  const NV = pos.length / 3, NB = SKIN_BONES.length;
  const w = new Float32Array(NV * NB);
  const known = new Uint8Array(NV);
  const tmp = new Float64Array(NB);
  let missing = 0;
  for (let v = 0; v < NV; v++) {
    if (!field.boneWeights(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2], tmp)) { missing++; continue; }
    known[v] = 1;
    for (let b = 0; b < NB; b++) w[v * NB + b] = tmp[b];
  }

  // Vertices without a part take the mean of their weighted neighbors, one ring per pass.
  for (let left = missing; left > 0;) {
    const ring: number[] = [];
    for (let v = 0; v < NV; v++) {
      if (known[v]) continue;
      let n = 0;
      for (let k = adjStart[v]; k < adjStart[v + 1]; k++) {
        const u = adjList[k];
        if (!known[u]) continue;
        for (let b = 0; b < NB; b++) w[v * NB + b] += w[u * NB + b];
        n++;
      }
      if (!n) continue;
      for (let b = 0; b < NB; b++) w[v * NB + b] /= n;
      ring.push(v);
    }
    if (!ring.length) throw new Error(`skin weights: ${left} vertices have no weighted neighbor`);
    for (const v of ring) known[v] = 1;
    left -= ring.length;
  }

  // Jacobi smoothing: half the vertex, half its neighbor mean. The rig prototype tuned 20 passes on the
  // 5 mm mesh (about 16 mm of diffusion); the pass count scales with 1/h² to keep that distance.
  const iters = Math.round(20 * (0.005 / h) ** 2);
  let a = w, b = new Float32Array(w.length);
  const acc = new Float64Array(NB);
  for (let it = 0; it < iters; it++) {
    for (let v = 0; v < NV; v++) {
      const s0 = adjStart[v], s1 = adjStart[v + 1], o = v * NB;
      acc.fill(0);
      for (let j = s0; j < s1; j++) { const u = adjList[j] * NB; for (let k = 0; k < NB; k++) acc[k] += a[u + k]; }
      const inv = s1 > s0 ? 0.5 / (s1 - s0) : 0, self = s1 > s0 ? 0.5 : 1;
      for (let k = 0; k < NB; k++) b[o + k] = self * a[o + k] + acc[k] * inv;
    }
    [a, b] = [b, a];
  }

  // Four largest influences, quantized to 1/255 with the rounding error put on the strongest.
  const index = new Uint8Array(NV * 4), weight = new Uint8Array(NV * 4);
  const top = new Int32Array(4);
  for (let v = 0; v < NV; v++) {
    const o = v * NB;
    top.fill(-1);
    for (let k = 0; k < NB; k++) {
      const x = a[o + k];
      if (x <= 0 || (top[3] >= 0 && x <= a[o + top[3]])) continue;
      let p = 3;
      while (p > 0 && (top[p - 1] < 0 || x > a[o + top[p - 1]])) { top[p] = top[p - 1]; p--; }
      top[p] = k;
    }
    let sum = 0;
    for (const k of top) if (k >= 0) sum += a[o + k];
    let total = 0;
    for (let i = 0; i < 4; i++) {
      const k = top[i] >= 0 ? top[i] : top[0];
      index[v * 4 + i] = k;
      weight[v * 4 + i] = top[i] >= 0 ? Math.round((255 * a[o + k]) / sum) : 0;
      total += weight[v * 4 + i];
    }
    weight[v * 4] += 255 - total;
  }
  return { index, weight, filled: missing };
}
