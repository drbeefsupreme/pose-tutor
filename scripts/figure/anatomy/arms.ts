import type { CoreDef, CorePrim, FatDeposit, MuscleDef, V3, VeinDef } from '../types';
import { P, B, ell, cone, named, arm, fore, armDir, foreDir, limb, ARM, FORE, regionModule } from './common';

const muscles: MuscleDef[] = [];
const cores: CoreDef[] = [];
const veins: VeinDef[] = [];
const fat: FatDeposit[] = [];

// Limb-aligned ellipsoids: local x = lateral, y = toward the proximal joint, z = anterior.
// Euler angles for R = Rz * Rx that map local y onto -e (the bone axis, pointing up).
const DEG = 180 / Math.PI;
const ARM_ROT: V3 = [Math.asin(-ARM.e[2]) * DEG, 0, Math.atan2(ARM.e[0], -ARM.e[1]) * DEG];
const FORE_ROT: V3 = [Math.asin(-FORE.e[2]) * DEG, 0, Math.atan2(FORE.e[0], -FORE.e[1]) * DEG];
/** Upper-arm ellipsoid; radii [lateral, along the bone, anterior]. */
const armEll = (f: number, lat: number, ant: number, r: V3) => ell(arm(f, lat, ant), r, ARM_ROT);
/** Forearm ellipsoid; radii [dorsal (lateral), along the bone, radial (anterior)]. */
const foreEll = (f: number, lat: number, ant: number, r: V3) => ell(fore(f, lat, ant), r, FORE_ROT);
/**
 * Hand point in the forearm frame (forearm in neutral rotation, palm toward the thigh):
 * `a` meters past the wrist joint, `l` dorsal (+) / palmar (-), `n` radial/thumb side (+) / ulnar (-).
 */
const hp = (a: number, l: number, n: number) => limb(FORE, 'hand', 1 + a / FORE.L, l, n);
const handEll = (a: number, l: number, n: number, r: V3) => ell(hp(a, l, n), r, FORE_ROT);

// --- Deltoid: three heads wrapping the humeral head, converging on the deltoid tuberosity.
// Bundles are ordered front to back. Each belly sits on the humeral head at angle `phi` around the
// arm axis (0 = lateral, 90 = anterior); the lateral (acromial) head gives the shoulder its width.
{
  const belly = (f: number, phi: number, r: number) => arm(f, r * Math.cos(phi / DEG), r * Math.sin(phi / DEG));
  const out = (phi: number) => armDir(Math.cos(phi / DEG), Math.sin(phi / DEG));
  const tub = (dant: number) => arm(0.46, 0.028, 0.006 + dant);
  muscles.push({
    name: 'delt', region: 'shoulders', sep: 0.95, intra: 0.75, k: 0.02,
    bundles: [
      B([P('scap', 0.138, 1.476, 0.06), belly(0.08, 112, 0.056), tub(0.012)], 0.012, 0.026, 0.01, 0.42, 0.85, out(112), 'ant', 2.4),
      B([P('scap', 0.168, 1.485, 0.042), belly(0.08, 80, 0.058), tub(0.009)], 0.013, 0.027, 0.011, 0.42, 0.88, out(80), 'ant', 2.4),
      B([P('scap', 0.198, 1.492, 0.022), belly(0.1, 45, 0.061), tub(0.004)], 0.014, 0.028, 0.012, 0.41, 0.9, out(45), 'lat', 2.6),
      B([P('scap', 0.222, 1.497, 0.002), belly(0.11, 10, 0.062), tub(0)], 0.015, 0.029, 0.012, 0.41, 0.9, out(10), 'lat', 2.6),
      B([P('scap', 0.213, 1.493, -0.024), belly(0.11, -25, 0.061), tub(-0.004)], 0.014, 0.028, 0.012, 0.41, 0.88, out(-25), 'lat', 2.6),
      B([P('scap', 0.186, 1.479, -0.048), belly(0.12, -60, 0.057), tub(-0.008)], 0.013, 0.026, 0.011, 0.43, 0.74, out(-60), 'post', 2.3),
      B([P('scap', 0.148, 1.455, -0.08), belly(0.14, -95, 0.053), tub(-0.012)], 0.012, 0.024, 0.01, 0.45, 0.64, out(-95), 'post', 2.2),
    ],
  });
}

// Biceps: long head on the outer front, short head on the inner front; one belly with a groove
// between the heads (detail), peaking at about 60 % of the humerus, tendon into the elbow pit.
muscles.push({
  name: 'biceps', region: 'arms', sep: 0.9, intra: 0.55, k: 0.018,
  bundles: [
    B([arm(0.2, 0.014, 0.036), arm(0.58, 0.014, 0.054), arm(0.88, 0.005, 0.042), fore(0.05, 0.002, 0.018)], 0.011, 0.027, 0.006, 0.47, 0.9, armDir(0.3, 1), 'long', 2.3),
    B([arm(0.14, -0.03, 0.04), arm(0.56, -0.013, 0.052), arm(0.88, -0.005, 0.04), fore(0.05, -0.002, 0.018)], 0.011, 0.026, 0.006, 0.47, 0.9, armDir(-0.3, 1), 'short', 2.3),
  ],
});
// Brachialis: lower half of the front humerus to the ulna; shows as a ridge outside the lower biceps.
muscles.push({
  name: 'brachialis', region: 'arms', sep: 0.75, intra: 0.3, k: 0.016,
  bundles: [
    B([arm(0.36, 0.034, 0.006), arm(0.66, 0.048, 0.006), arm(0.9, 0.032, 0.018), fore(0.09, 0.002, 0.008)], 0.013, 0.024, 0.008, 0.42, 0.7, armDir(1, 0.2), 'lat'),
    B([arm(0.5, -0.032, 0.012), arm(0.76, -0.04, 0.012), arm(0.94, -0.03, 0.014), fore(0.09, -0.006, 0.008)], 0.01, 0.021, 0.008, 0.45, 0.7, armDir(-1, 0.3), 'med'),
  ],
});
// Triceps: lateral head (outer arm of the horseshoe), long head (inner arm, from under the
// deltoid), medial head (deep, shows above the elbow on both sides of the tendon).
// Bundles ordered lateral to medial.
muscles.push({
  name: 'triceps', region: 'arms', sep: 0.9, intra: 0.85, k: 0.018,
  bundles: [
    B([arm(0.6, 0.032, -0.02), arm(0.85, 0.03, -0.03), arm(0.98, 0.012, -0.032)], 0.01, 0.016, 0.009, 0.5, 0.65, armDir(1, -0.4), 'med'),
    B([arm(0.08, 0.03, -0.022), arm(0.3, 0.052, -0.018), arm(0.54, 0.045, -0.036), arm(0.74, 0.014, -0.04)], 0.012, 0.03, 0.007, 0.42, 0.8, armDir(0.85, -0.5), 'lat', 2.3),
    B([arm(0.04, -0.028, -0.02), arm(0.35, -0.012, -0.052), arm(0.62, -0.004, -0.058), arm(0.82, 0.0, -0.038)], 0.012, 0.03, 0.007, 0.45, 0.85, armDir(-0.2, -1), 'long', 2.3),
    B([arm(0.06, -0.042, -0.01), arm(0.38, -0.038, -0.036), arm(0.68, -0.026, -0.044), arm(0.88, -0.01, -0.034)], 0.012, 0.026, 0.007, 0.45, 0.85, armDir(-0.8, -0.6), 'long', 2.3),
    B([arm(0.48, -0.036, -0.016), arm(0.8, -0.04, -0.022), arm(0.97, -0.016, -0.028)], 0.012, 0.021, 0.01, 0.55, 0.7, armDir(-1, -0.35), 'med'),
  ],
});
muscles.push({
  name: 'coracobrachialis', region: 'arms', sep: 0.4, intra: 0,
  bundles: [B([arm(0.0, -0.04, 0.03), arm(0.22, -0.042, 0.018), arm(0.45, -0.025, 0.006)], 0.01, 0.015, 0.008, 0.4, 0.8, armDir(-1, 0.3))],
});

// --- Forearm (neutral rotation: dorsal side faces out, thumb side faces forward).
// Around the bone at the widest level (~20 %): brachioradialis (front-out), ECRL, ECRB, extensor
// digitorum, ECU (back), the subcutaneous ulna (ulnar furrow), FCU, FDS/palmaris (inner), FCR,
// pronator teres (front-in). Bellies turn to tendon in the lower half.
// Lateral (radial) group from the supracondylar ridge: brachioradialis and ECRL.
muscles.push({
  name: 'brachioradialis', region: 'forearms', sep: 0.85, intra: 0, k: 0.014,
  bundles: [B([arm(0.62, 0.046, 0.004), arm(0.86, 0.054, 0.014), fore(0.2, 0.021, 0.036), fore(0.55, 0.012, 0.031), fore(0.82, 0.004, 0.02)], 0.011, 0.025, 0.005, 0.45, 0.7, foreDir(0.47, 0.88))],
});
muscles.push({
  name: 'ecrl', region: 'forearms', sep: 0.7, intra: 0, k: 0.012,
  bundles: [B([arm(0.8, 0.052, -0.008), fore(0.2, 0.034, 0.016), fore(0.5, 0.026, 0.016), fore(0.75, 0.014, 0.01)], 0.01, 0.022, 0.005, 0.4, 0.7, foreDir(0.9, 0.42))],
});
// Common extensor origin (lateral epicondyle): ECRB, extensor digitorum, ECU down the back.
muscles.push({
  name: 'extensors', region: 'forearms', sep: 0.75, intra: 0.5, k: 0.014,
  bundles: [
    B([arm(0.99, 0.038, -0.01), fore(0.2, 0.036, -0.003), fore(0.55, 0.028, 0.0), fore(0.82, 0.016, 0.002)], 0.01, 0.022, 0.005, 0.36, 0.7, foreDir(1, -0.09), 'ecrb'),
    B([arm(0.99, 0.035, -0.02), fore(0.2, 0.028, -0.02), fore(0.6, 0.024, -0.016), fore(0.85, 0.014, -0.008)], 0.01, 0.022, 0.005, 0.36, 0.7, foreDir(0.82, -0.57), 'edc'),
    B([arm(0.99, 0.03, -0.028), fore(0.2, 0.012, -0.032), fore(0.6, 0.01, -0.028), fore(0.88, 0.008, -0.018)], 0.009, 0.02, 0.005, 0.36, 0.7, foreDir(0.35, -0.94), 'ecu'),
  ],
});
muscles.push({
  name: 'anconeus', region: 'forearms', sep: 0.5, intra: 0,
  bundles: [B([arm(0.96, 0.032, -0.026), fore(0.1, 0.018, -0.034), fore(0.24, 0.006, -0.036)], 0.012, 0.019, 0.006, 0.4, 0.6, foreDir(0.5, -1))],
});
// Abductor pollicis longus / extensor pollicis brevis cross the radial side above the wrist.
muscles.push({
  name: 'outcropper', region: 'forearms', sep: 0.45, intra: 0,
  bundles: [B([fore(0.42, 0.028, -0.008), fore(0.68, 0.024, 0.01), fore(0.92, 0.008, 0.024)], 0.006, 0.011, 0.004, 0.45, 0.6, foreDir(0.8, 0.6))],
});
// Common flexor origin (medial epicondyle): pronator teres across the elbow pit, then FCR,
// FDS/palmaris and FCU down the inner (palm) side.
muscles.push({
  name: 'pronatorTeres', region: 'forearms', sep: 0.6, intra: 0, k: 0.012,
  bundles: [B([arm(0.9, -0.042, 0.014), fore(0.2, -0.013, 0.036), fore(0.45, 0.012, 0.03)], 0.011, 0.02, 0.007, 0.38, 0.75, foreDir(-0.34, 0.94))],
});
muscles.push({
  name: 'flexors', region: 'forearms', sep: 0.7, intra: 0.45, k: 0.016,
  bundles: [
    B([arm(0.99, -0.044, 0.006), fore(0.2, -0.033, 0.02), fore(0.55, -0.022, 0.02), fore(0.82, -0.014, 0.012)], 0.011, 0.023, 0.005, 0.36, 0.7, foreDir(-0.8, 0.6), 'fcr'),
    B([arm(0.99, -0.046, -0.008), fore(0.2, -0.042, -0.014), fore(0.6, -0.03, -0.008), fore(0.85, -0.018, -0.002)], 0.012, 0.026, 0.005, 0.36, 0.7, foreDir(-0.94, -0.34), 'fds'),
    B([arm(0.99, -0.038, -0.024), fore(0.2, -0.014, -0.033), fore(0.6, -0.01, -0.028), fore(0.88, -0.01, -0.018)], 0.011, 0.022, 0.005, 0.38, 0.7, foreDir(-0.35, -0.94), 'fcu'),
  ],
});

cores.push({
  name: 'elbow', region: 'arms', k: 0.016, sep: 0.4,
  prims: [
    named('olecranon', armEll(1.0, 0.0, -0.028, [0.015, 0.021, 0.013])),
    named('medialEpicondyle', armEll(0.99, -0.043, -0.008, [0.012, 0.014, 0.012])),
    named('medialSupracondylarRidge', armEll(0.9, -0.038, -0.006, [0.012, 0.03, 0.013])),
    named('lateralEpicondyle', armEll(0.99, 0.034, -0.012, [0.009, 0.011, 0.009])),
  ],
});
// Flat common tendon of the triceps on the lower back of the arm (inside the horseshoe).
cores.push({
  name: 'tricepsTendon', region: 'arms', k: 0.012, sep: 0.5,
  prims: [armEll(0.8, 0.003, -0.02, [0.034, 0.09, 0.028])],
});
cores.push({
  name: 'wrist', region: 'forearms', k: 0.01, sep: 0.2,
  prims: [
    named('radialStyloid', foreEll(0.97, 0.004, 0.026, [0.009, 0.012, 0.008])),
    named('ulnarHead', foreEll(0.95, 0.012, -0.02, [0.009, 0.01, 0.009])),
  ],
});

// --- Hand: relaxed loose fist, palm toward the thigh, thumb resting on the index finger.
{
  const palm: CorePrim[] = [
    named('carpus', handEll(0.016, -0.002, -0.002, [0.0145, 0.02, 0.027])),
    named('metacarpus', handEll(0.055, -0.003, -0.001, [0.0145, 0.038, 0.04])),
    named('thenarEminence', handEll(0.045, -0.013, 0.024, [0.014, 0.026, 0.015])),
    named('firstWebSpace', handEll(0.056, -0.009, 0.031, [0.011, 0.02, 0.011])),
    named('hypothenarEminence', handEll(0.055, -0.011, -0.03, [0.012, 0.03, 0.012])),
    named('curledFingersInside', handEll(0.086, -0.03, 0.006, [0.013, 0.02, 0.03])),
  ];
  // [MCP a, MCP n, segment lengths, radii at MCP/PIP/DIP/tip, sideways drift per segment]
  const fingers: [number, number, V3, number[], number][] = [
    [0.088, 0.029, [0.041, 0.025, 0.019], [0.0102, 0.0094, 0.0086, 0.0074], -0.003],
    [0.092, 0.0095, [0.046, 0.028, 0.021], [0.0105, 0.0097, 0.0088, 0.0076], -0.001],
    [0.089, -0.0095, [0.043, 0.027, 0.02], [0.01, 0.0092, 0.0084, 0.0072], 0.001],
    [0.082, -0.027, [0.034, 0.021, 0.018], [0.009, 0.0083, 0.0076, 0.0066], 0.003],
  ];
  const flex = [70, 160, 200].map((d) => d / DEG); // cumulative segment flexion toward the palm
  fingers.forEach(([a0, n0, lens, rad, drift], fi) => {
    palm.push(named('metacarpalHead', handEll(a0 - 0.002, 0.004, n0, [0.011, 0.011, 0.0105])));
    const prims: CorePrim[] = [];
    let a = a0, l = 0, n = n0;
    lens.forEach((L, i) => {
      const a1 = a + L * Math.cos(flex[i]), l1 = l - L * Math.sin(flex[i]), n1 = n + drift;
      prims.push(cone(hp(a, l, n), hp(a1, l1, n1), rad[i], rad[i + 1]));
      a = a1; l = l1; n = n1;
    });
    cores.push({ name: `finger${fi + 1}`, region: 'hands', k: 0.004, sep: 0.3, prims });
  });
  // Thumb: first metacarpal from the trapezium, phalanges flexed onto the index finger.
  cores.push({
    name: 'thumb', region: 'hands', k: 0.005, sep: 0.3,
    prims: [
      cone(hp(0.022, -0.006, 0.024), hp(0.052, -0.02, 0.037), 0.0125, 0.011),
      cone(hp(0.052, -0.02, 0.037), hp(0.074, -0.036, 0.034), 0.011, 0.0102),
      cone(hp(0.074, -0.036, 0.034), hp(0.088, -0.05, 0.027), 0.0102, 0.0088),
    ],
  });
  cores.push({ name: 'hand', region: 'hands', k: 0.012, sep: 0.15, prims: palm });
}

cores.push({
  name: 'armEnvelope', region: 'core', k: 0.02, sep: 0,
  prims: [
    named('humeralHeadAndRotatorCuff', ell(P('upperarm', 0.212, 1.44, -0.005), [0.05, 0.05, 0.05])),
    armEll(0.32, 0.004, -0.006, [0.044, 0.12, 0.048]),
    armEll(0.62, 0.002, -0.006, [0.045, 0.11, 0.054]),
    named('distalHumerus', armEll(0.93, 0.0, -0.008, [0.043, 0.05, 0.027])),
  ],
});
cores.push({
  name: 'forearmEnvelope', region: 'core', k: 0.02, sep: 0,
  prims: [
    foreEll(0.18, -0.004, 0.0, [0.046, 0.085, 0.04]),
    foreEll(0.52, 0.0, 0.0, [0.034, 0.11, 0.031]),
    foreEll(0.88, 0.003, 0.0, [0.0205, 0.07, 0.027]),
    named('ulnarBorder', cone(fore(0.06, 0.004, -0.032), fore(0.9, 0.01, -0.02), 0.012, 0.008)),
  ],
});

// Superficial veins. Paths are projected onto the skin.
veins.push(
  // Dorsal venous network of the hand: arch across the back of the metacarpals, fed by the knuckle gaps.
  { name: 'dorsalArch', region: 'hands', r: 0.0017, pts: [hp(0.075, 0.014, 0.03), hp(0.058, 0.017, 0.012), hp(0.062, 0.017, -0.01), hp(0.045, 0.015, -0.03)] },
  { name: 'dorsalMetacarpal', region: 'hands', r: 0.0014, taper: 0.7, pts: [hp(0.06, 0.017, 0.0), hp(0.08, 0.015, -0.002), hp(0.09, 0.013, -0.001)] },
  // Cephalic: snuffbox, around the radial border to the front, lateral to the biceps tendon,
  // up the outer biceps groove, then the deltopectoral groove.
  { name: 'cephalic', region: 'forearms', r: 0.0028, pts: [hp(0.03, 0.012, 0.03), fore(0.92, 0.01, 0.03), fore(0.65, 0.004, 0.045), fore(0.35, -0.006, 0.055), fore(0.1, 0.0, 0.052), arm(0.92, 0.032, 0.048), arm(0.72, 0.044, 0.056), arm(0.5, 0.044, 0.058), arm(0.32, 0.02, 0.07), arm(0.18, -0.02, 0.075), P('scap', 0.165, 1.44, 0.085), P('scap', 0.145, 1.462, 0.078)] },
  // Accessory cephalic: oblique line across the back of the forearm, joins the cephalic below the elbow.
  { name: 'accessoryCephalic', region: 'forearms', r: 0.0021, pts: [fore(0.8, 0.026, -0.012), fore(0.55, 0.04, 0.0), fore(0.3, 0.04, 0.028), fore(0.14, 0.022, 0.05)] },
  // Basilic: up the back of the ulnar forearm, forward in front of the medial epicondyle, along the
  // inner biceps border to mid-arm where it goes deep.
  { name: 'basilic', region: 'forearms', r: 0.0026, taper: 0.6, pts: [hp(0.04, 0.012, -0.026), fore(0.85, 0.01, -0.03), fore(0.55, -0.012, -0.042), fore(0.25, -0.045, -0.02), arm(0.95, -0.05, 0.012), arm(0.78, -0.044, 0.035), arm(0.6, -0.045, 0.035), arm(0.48, -0.048, 0.025)] },
  // Median cubital: from the cephalic below the elbow, up and inward across the elbow pit to the basilic.
  { name: 'medianCubital', region: 'arms', r: 0.0027, pts: [fore(0.14, 0.0, 0.052), fore(0.04, -0.016, 0.048), arm(0.93, -0.036, 0.034), arm(0.86, -0.046, 0.03)] },
  // Median antebrachial: up the ulnar side of the front (palm side) of the forearm.
  { name: 'medianAntebrachial', region: 'forearms', r: 0.002, pts: [fore(0.92, -0.02, 0.004), fore(0.6, -0.042, 0.004), fore(0.3, -0.052, 0.016), fore(0.1, -0.036, 0.036)] },
  // Superficial branch over the biceps belly to the cephalic, typical of very vascular arms.
  { name: 'bicepsVein', region: 'arms', r: 0.0024, taper: 0.6, pts: [arm(0.9, -0.004, 0.05), arm(0.68, 0.006, 0.078), arm(0.45, 0.022, 0.074), arm(0.3, 0.036, 0.066)] },
);

export const ARMS = regionModule({ muscles, cores, veins, fat }, { arms: 1.03, forearms: 1.08, shoulders: 1.05 });
