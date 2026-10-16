import type { BoneName, BPt, Bundle, CoreDef, CorePrim, FatDeposit, MuscleDef, V3, VeinDef } from '../types';
import { P, B, ell, cone, arm, regionModule } from './common';

const muscles: MuscleDef[] = [];
const cores: CoreDef[] = [];
const veins: VeinDef[] = [];
const fat: FatDeposit[] = [];

// Torso core: horizontal cross-sections [y, cx, cz, halfWidth, halfDepth] about 1.5-3 cm inside the
// skin. The sheet muscles of the front and flank (pecs, abs, obliques, serratus) are seated on this
// surface with `front` / `ring`, so they pack against it without pockets.
const LOFT: [number, number, number, number, number][] = [
  [0.86, 0, -0.025, 0.11, 0.085],
  [0.93, 0, -0.02, 0.14, 0.1],
  [1.0, 0, -0.0085, 0.142, 0.0965],
  [1.07, 0, -0.004, 0.138, 0.096],
  [1.15, 0, -0.0065, 0.145, 0.0985],
  [1.24, 0, -0.011, 0.155, 0.099],
  [1.32, 0, -0.01, 0.16, 0.1],
  [1.42, 0, -0.0075, 0.15, 0.0975],
  [1.5, 0, -0.0175, 0.12, 0.0725],
];

/** Loft ellipse [cx, cz, a, b] at height y (same Catmull-Rom interpolation as the field). */
function loftAt(y: number): [number, number, number, number] {
  const n = LOFT.length;
  const yc = Math.min(LOFT[n - 1][0], Math.max(LOFT[0][0], y));
  let i = 0;
  while (i < n - 2 && LOFT[i + 1][0] <= yc) i++;
  const t = (yc - LOFT[i][0]) / (LOFT[i + 1][0] - LOFT[i][0]);
  const q0 = LOFT[Math.max(0, i - 1)], q1 = LOFT[i], q2 = LOFT[i + 1], q3 = LOFT[Math.min(n - 1, i + 2)];
  const cr = (k: number) => 0.5 * (2 * q1[k] + (-q0[k] + q2[k]) * t + (2 * q0[k] - 5 * q1[k] + 4 * q2[k] - q3[k]) * t * t
    + (-q0[k] + 3 * q1[k] - 3 * q2[k] + q3[k]) * t * t * t);
  return [cr(1), cr(2), cr(3), cr(4)];
}
const boneAt = (y: number): BoneName => (y > 1.18 ? 'chest' : y > 1.03 ? 'lumbar' : 'pelvis');

/** Outward normal of the core at height y, parametric angle deg (0 = side, 90 = front, -90 = back). */
function ringN(y: number, deg: number): V3 {
  const [, , a, b] = loftAt(y);
  const t = (deg * Math.PI) / 180;
  const nx = Math.cos(t) / a, nz = Math.sin(t) / b, l = Math.hypot(nx, nz);
  return [nx / l, 0, nz / l];
}
/** Point on the core surface at (y, deg), lifted `out` meters along the surface normal. */
function ring(y: number, deg: number, out = 0, bone = boneAt(y)): BPt {
  const [cx, cz, a, b] = loftAt(y);
  const t = (deg * Math.PI) / 180;
  const n = ringN(y, deg);
  return P(bone, cx + a * Math.cos(t) + out * n[0], y, cz + b * Math.sin(t) + out * n[2]);
}
/** Parametric angle of the front core surface point at (x, y). */
function degAt(x: number, y: number): number {
  const [cx, , a] = loftAt(y);
  return (Math.acos(Math.min(0.999, Math.max(-0.999, (x - cx) / a))) * 180) / Math.PI;
}
/** Point over the core's front surface at (x, y), lifted `out` along the surface normal. */
function front(x: number, y: number, out = 0, bone = boneAt(y)): BPt {
  return ring(y, degAt(x, y), out, bone);
}
/** Sheet bundle lying on the core from (y0, deg0) to (y1, deg1); `lift` raises the belly above the
 * ends, and the depth axis follows the surface normal. */
function sheet(y0: number, d0: number, y1: number, d1: number, out: number,
  r0: number, rp: number, r1: number, tp: number, dr: number, lift: number): Bundle {
  const pts = [0, 0.5, 1].map((f) => ring(y0 + (y1 - y0) * f, d0 + (d1 - d0) * f, out + lift * Math.sin(Math.PI * f)));
  const n0 = ringN(y0, d0), n1 = ringN(y1, d1);
  return B(pts, r0, rp, r1, tp, dr, [n0[0] + n1[0], 0, n0[2] + n1[2]]);
}

// --- Pectoralis major: a thick fan from the clavicle, the sternum and the 6th costal cartilage to the
// crest of the greater tubercle. Sternal origins sit on one vertical line next to the midline and
// overlap, so the two pecs meet in one straight sternal valley. The lowest fibers sweep up into the
// anterior axillary fold; the clavicular head forms the upper-chest shelf.
{
  const ins = (dy: number, dz: number) => P('upperarm', 0.222, 1.388 + dy, 0.028 + dz);
  muscles.push({
    name: 'pec', region: 'chest', sep: 0.9, intra: 0.45, k: 0.026,
    bundles: [
      B([P('scap', 0.118, 1.462, 0.071), P('chest', 0.168, 1.43, 0.072), ins(0.014, 0.012)], 0.013, 0.022, 0.01, 0.4, 0.62, [0.4, 0.45, 1], 'clav'),
      B([P('scap', 0.07, 1.461, 0.083), front(0.13, 1.425, 0.014), ins(0.01, 0.01)], 0.016, 0.028, 0.011, 0.42, 0.66, [0.3, 0.4, 1], 'clav'),
      B([front(0.011, 1.447, 0.008), front(0.11, 1.412, 0.016), ins(0.005, 0.008)], 0.023, 0.034, 0.011, 0.42, 0.74, [0.2, 0.2, 1], 'stern'),
      B([front(0.011, 1.414, 0.009), front(0.11, 1.386, 0.018), ins(0.0, 0.006)], 0.024, 0.037, 0.011, 0.42, 0.76, [0.2, 0.1, 1], 'stern'),
      B([front(0.011, 1.381, 0.01), front(0.11, 1.358, 0.019), ins(-0.004, 0.004)], 0.024, 0.04, 0.011, 0.42, 0.76, [0.2, 0, 1], 'stern'),
      B([front(0.011, 1.348, 0.01), front(0.11, 1.332, 0.019), ins(-0.008, 0.002)], 0.024, 0.041, 0.011, 0.44, 0.76, [0.25, -0.1, 1], 'stern'),
      B([front(0.011, 1.315, 0.01), front(0.105, 1.31, 0.018), P('chest', 0.17, 1.335, 0.05), ins(-0.012, 0.0)], 0.024, 0.041, 0.011, 0.46, 0.76, [0.3, -0.2, 1], 'stern'),
      B([front(0.012, 1.287, 0.009), front(0.105, 1.29, 0.014), P('chest', 0.168, 1.318, 0.048), ins(-0.016, -0.002)], 0.022, 0.038, 0.011, 0.48, 0.78, [0.3, -0.25, 1], 'stern'),
      B([front(0.045, 1.272, 0.005), front(0.11, 1.272, 0.009), P('chest', 0.165, 1.3, 0.044), ins(-0.02, -0.004)], 0.017, 0.032, 0.011, 0.5, 0.8, [0.4, -0.35, 1], 'stern'),
    ],
  });
}

// --- Serratus anterior: finger-like slips on ribs 5-8 between the pec's lateral border and the
// oblique. Each slip starts as a pointed tip on its rib and runs back and up to the scapula, under
// the lat.
for (let i = 0; i < 4; i++) {
  const y = 1.315 - 0.032 * i;
  muscles.push({
    name: `serratus${i}`, region: 'serratus', sep: 0.85, intra: 0,
    bundles: [sheet(y, 50 - 2 * i, y + 0.035, -6, -0.002, 0.007, 0.016, 0.012, 0.4, 0.5, 0.004)],
  });
}

// --- External oblique: a broad sheet over the flank, from ribs 5-12 down and forward to the linea
// semilunaris, the inguinal ligament and the iliac crest ("hands in pockets"). The upper slips start
// between the serratus tips and thin out into the aponeurosis at the rectus border; the lower fibers
// form the flank pad over the iliac crest.
muscles.push({
  name: 'oblique', region: 'obliques', sep: 0.8, intra: 0, k: 0.02,
  bundles: [
    sheet(1.235, 36, 1.15, 58, -0.003, 0.009, 0.021, 0.011, 0.4, 0.42, 0.003),
    sheet(1.203, 26, 1.1, 58, -0.003, 0.01, 0.024, 0.011, 0.42, 0.42, 0.003),
    sheet(1.17, 14, 1.055, 55, -0.003, 0.011, 0.026, 0.012, 0.45, 0.42, 0.003),
    sheet(1.145, 2, 1.02, 44, -0.003, 0.012, 0.028, 0.014, 0.52, 0.44, 0.004),
    sheet(1.125, -12, 1.03, 22, -0.003, 0.012, 0.029, 0.017, 0.55, 0.46, 0.005),
    sheet(1.11, -26, 1.04, -2, -0.003, 0.011, 0.025, 0.016, 0.55, 0.46, 0.004),
  ],
});

// --- Rectus abdominis: four blocks per side between the tendinous intersections (three above the
// navel, one long segment below it). Blocks are bundles buried about half their depth in the
// abdominal wall, so only a broad rounded top shows, rising at about 45 degrees from the wall. The
// upper blocks use a medial and a lateral bundle so they follow the curve of the wall. The linea alba
// is the midline strip (`lineaAlba` core) between the two columns, where `sep` cuts a soft valley;
// the intersections are the grooves where blocks of one column meet.
{
  // [yTop, yBottom, visible medial edge x, visible lateral edge x at top, at bottom]
  const rows: [number, number, number, number, number][] = [
    [1.268, 1.212, 0.011, 0.084, 0.083],
    [1.216, 1.148, 0.011, 0.083, 0.08],
    [1.152, 1.084, 0.011, 0.08, 0.075],
    [1.088, 0.925, 0.009, 0.075, 0.047],
  ];
  rows.forEach(([y0, y1, xm, xl0, xl1], i) => {
    const lower = i === 3;
    const ya = y0 - 0.005, yb = y1 + (lower ? 0 : 0.005), ym = (ya + yb) / 2;
    // A buried bundle shows its top from 0.85 half-widths on either side of its center line.
    const bundle = (xa: number, xb: number, wa: number, wb: number, tilt: number, dr: number, out: number): Bundle => {
      const xc = (xa + xb) / 2, n = ringN(ym, degAt(xc, ym));
      return B([front(xa, ya, out), front(xc, ym, out), front(xb, yb, out)], wa * 0.9, (wa + wb) / 2, wb * (lower ? 0.75 : 0.9),
        lower ? 0.35 : 0.5, dr, [n[0] * tilt, 0.08, n[2]], undefined, 3);
    };
    let bundles: Bundle[];
    if (lower) {
      const wa = (xl0 - xm) / 1.7, wb = (xl1 - xm) / 1.7;
      bundles = [bundle(xm + 0.85 * wa, xm + 0.85 * wb, wa, wb, 0.8, 0.55, -0.011)];
    } else {
      // Two overlapping bundles span 2.4 half-widths.
      const wa = (xl0 - xm) / 2.4, wb = (xl1 - xm) / 2.4;
      bundles = [bundle(xm + 0.85 * wa, xm + 0.85 * wb, wa, wb, 0.5, 0.85, -0.011), bundle(xl0 - 0.85 * wa, xl1 - 0.85 * wb, wa, wb, 1, 0.85, -0.013)];
    }
    muscles.push({ name: `abs${i}`, region: 'abs', sep: 1.0, intra: 0, k: 0.018, bundles });
  });
}

// --- Neck: sternocleidomastoid, sternal and clavicular heads from the mastoid process behind the ear.
muscles.push({
  name: 'scm', region: 'neck', sep: 0.8, intra: 0.3,
  bundles: [
    B([P('head', 0.06, 1.628, -0.03), P('neck', 0.036, 1.548, 0.038), P('chest', 0.018, 1.474, 0.078)], 0.011, 0.017, 0.009, 0.5, 0.8, [0.5, 0, 1], 'st'),
    B([P('head', 0.064, 1.625, -0.034), P('neck', 0.054, 1.538, 0.024), P('scap', 0.05, 1.474, 0.074)], 0.01, 0.013, 0.009, 0.5, 0.8, [0.8, 0, 0.6], 'cl'),
  ],
});

cores.push({ name: 'torsoCore', region: 'core', k: 0.02, sep: 0, prims: [{ kind: 'loft', levels: LOFT }] });
// Sternum: a low ridge under the pec origins; it shows only at the epigastric notch.
cores.push({ name: 'sternum', region: 'chest', k: 0.01, sep: 0.3, prims: [cone(P('chest', 0, 1.462, 0.074), P('chest', 0, 1.262, 0.084), 0.011, 0.01)] });
cores.push({
  name: 'neckCore', region: 'neck', k: 0.02, sep: 0.2,
  prims: [cone(P('neck', 0, 1.44, -0.02), P('head', 0, 1.6, -0.01), 0.064, 0.055), ell(P('neck', 0, 1.536, 0.047), [0.014, 0.019, 0.011]),
    ell(P('head', 0, 1.566, 0.03), [0.044, 0.02, 0.04]), ell(P('head', 0, 1.618, -0.045), [0.05, 0.028, 0.045])],
});

// --- Head: calm, statue-like adult male head about 23 cm tall (vertex 1.785, chin 1.552). Smooth,
// broad cranium (buzz cut implied), soft brow, eye sockets with neutral eyes, straight nose, closed
// lips, square jaw, simple ears. One core holds both sides, so the eye sockets carve both halves.
{
  const h = (x: number, y: number, z: number) => P('head', x, y, z);
  const pair = (f: (s: number) => CorePrim) => [f(1), f(-1)];
  // Deliberately simplified mannequin head (like an artist's anatomical figure): smooth facial
  // planes, a soft brow and nose, no eyes or lips. The body is the subject of this tool.
  // Proportions: vertex 1.785, chin 1.550. Width about 15.5 cm, depth about 20 cm.
  cores.push({
    name: 'head', region: 'head', k: 0.016, sep: 0,
    prims: [
      ell(h(0, 1.706, -0.016), [0.077, 0.079, 0.094]),            // cranium
      ell(h(0, 1.712, 0.032), [0.064, 0.052, 0.056]),              // forehead
      ell(h(0, 1.682, 0.068), [0.05, 0.011, 0.016]),               // soft brow plane
      ell(h(0, 1.635, 0.04), [0.057, 0.05, 0.05]),                 // mid-face
      ell(h(0, 1.594, 0.044), [0.046, 0.032, 0.04]),               // lower face
      ...pair((s) => cone(h(0.056 * s, 1.6, -0.012), h(0.022 * s, 1.563, 0.056), 0.013, 0.012)), // jawline
      ell(h(0, 1.559, 0.064), [0.021, 0.014, 0.014]),              // chin
      ell(h(0, 1.647, 0.08), [0.0075, 0.024, 0.0095], [-22, 0, 0]), // nose
      ...pair((s) => ell(h(0.075 * s, 1.655, -0.016), [0.0085, 0.027, 0.016], [-10, 0, 0])), // ears
    ],
  });
}
// Supraclavicular fill: fat and scalenes between SCM, trapezius and clavicle (avoids deep pockets).
cores.push({ name: 'supraclavicular', region: 'neck', k: 0.02, sep: 0, prims: [ell(P('neck', 0.088, 1.492, 0.025), [0.048, 0.022, 0.034], [0, 0, -12])] });
// Bony landmarks that show under the skin.
cores.push({
  name: 'clavicle', region: 'shoulders', k: 0.01, sep: 0.3,
  prims: [cone(P('scap', 0.025, 1.468, 0.072), P('scap', 0.1, 1.473, 0.074), 0.01, 0.01), cone(P('scap', 0.1, 1.473, 0.074), P('scap', 0.195, 1.488, 0.01), 0.01, 0.012),
    ell(P('scap', 0.205, 1.495, 0.0), [0.025, 0.012, 0.022])],
});
// Iliac crest from the ASIS back to the posterior superior spine; the flank pad of the oblique rests
// on it. The V line (inguinal ligament) is the border groove of the oblique pad, not a ridge.
cores.push({
  name: 'iliacCrest', region: 'obliques', k: 0.01, sep: 0.5,
  prims: [cone(P('pelvis', 0.122, 1.0, 0.072), P('pelvis', 0.15, 1.04, 0.02), 0.01, 0.012), cone(P('pelvis', 0.15, 1.04, 0.02), P('pelvis', 0.13, 1.05, -0.06), 0.012, 0.012),
    cone(P('pelvis', 0.13, 1.05, -0.06), P('pelvis', 0.07, 1.03, -0.1), 0.012, 0.01)],
});
// Lower abdominal wall and pelvic rim between the ASIS and the rectus: fills the front of the pelvis,
// which is flatter and wider than the loft ellipse, so the ASIS and the oblique pad do not float.
cores.push({ name: 'lowerAbdomen', region: 'core', k: 0.02, sep: 0, prims: [ell(P('pelvis', 0.07, 1.0, 0.022), [0.075, 0.07, 0.062])] });
// Linea alba: the tendinous midline between the rectus columns. It lifts the floor of the groove so
// the line reads as a soft valley (cut by `sep`) instead of a sharp V that folds under the soft-tissue layer.
cores.push({ name: 'lineaAlba', region: 'abs', k: 0.02, sep: 0, prims: [cone(P('chest', 0, 1.255, 0.083), P('pelvis', 0, 0.95, 0.086), 0.012, 0.01)] });
cores.push({ name: 'groin', region: 'core', k: 0.02, sep: 0, prims: [ell(P('pelvis', 0, 0.86, 0.085), [0.04, 0.045, 0.03])] });
veins.push(
  { name: 'thoracoepigastric', region: 'obliques', r: 0.0021, taper: 0.7, pts: [P('chest', 0.17, 1.33, 0.05), P('chest', 0.16, 1.2, 0.06), P('lumbar', 0.14, 1.1, 0.08), P('pelvis', 0.11, 1.0, 0.095)] },
  { name: 'epigastric', region: 'abs', r: 0.0022, taper: 1.2, pts: [P('lumbar', 0.078, 1.035, 0.1), P('pelvis', 0.07, 0.97, 0.1), P('pelvis', 0.058, 0.9, 0.095)] },
);
fat.push(
  { c: P('pelvis', 0, 1.0, 0.1), r: [0.12, 0.08, 0.06], amount: 0.012 },
  { c: P('lumbar', 0, 1.08, 0.1), r: [0.1, 0.07, 0.05], amount: 0.009 },
  { c: P('pelvis', 0.15, 1.06, -0.01), r: [0.05, 0.06, 0.07], amount: 0.014 },
  { c: P('pelvis', 0.06, 1.05, -0.11), r: [0.06, 0.06, 0.04], amount: 0.01 },
  { c: P('pelvis', 0.08, 0.88, -0.13), r: [0.08, 0.08, 0.05], amount: 0.009 },
  { c: P('chest', 0.1, 1.3, 0.1), r: [0.07, 0.05, 0.04], amount: 0.006 },
  { c: arm(0.5, 0, -0.06), r: [0.04, 0.08, 0.04], amount: 0.004 },
  { c: P('thigh', 0.06, 0.78, 0.0), r: [0.04, 0.1, 0.06], amount: 0.006 },
  { c: P('chest', 0.12, 1.22, -0.09), r: [0.06, 0.08, 0.05], amount: 0.004 },
);

export const TORSO = regionModule({ muscles, cores, veins, fat }, { neck: 1.25 });
