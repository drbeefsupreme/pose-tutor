import type { CoreDef, FatDeposit, MuscleDef, VeinDef } from '../types';
import { P, B, ell, cone, regionModule } from './common';

const muscles: MuscleDef[] = [];
const cores: CoreDef[] = [];
const veins: VeinDef[] = [];
const fat: FatDeposit[] = [];

// Sizes in this file are final half-widths (region scale 1). Bundles that start on the spine begin
// slightly past the midline so the left and right sheets overlap instead of leaving a notch.

// --- Trapezius: a kite from the occiput to T12 and out to the clavicle, acromion and scapular spine.
// Upper fibers run down-lateral over the shoulder, middle fibers run horizontal, lower fibers run up-lateral.
muscles.push({
  name: 'trap', region: 'traps', sep: 0.8, intra: 0.5, k: 0.02,
  bundles: [
    B([P('head', 0.014, 1.638, -0.088), P('neck', 0.048, 1.582, -0.08), P('scap', 0.1, 1.535, -0.042), P('scap', 0.15, 1.5, 0.02)], 0.011, 0.02, 0.011, 0.5, 0.8, [0.5, 0.7, -0.5], 'up'),
    B([P('neck', 0.002, 1.595, -0.098), P('neck', 0.055, 1.558, -0.084), P('scap', 0.13, 1.524, -0.048), P('scap', 0.192, 1.503, -0.006)], 0.014, 0.031, 0.012, 0.45, 0.85, [0.3, 1, -0.5], 'up'),
    B([P('neck', 0.0, 1.538, -0.104), P('scap', 0.075, 1.525, -0.095), P('scap', 0.15, 1.507, -0.064), P('scap', 0.205, 1.5, -0.03)], 0.02, 0.028, 0.012, 0.4, 0.8, [0.1, 1, -0.6], 'up'),
    B([P('chest', 0.0, 1.478, -0.114), P('scap', 0.09, 1.482, -0.118), P('scap', 0.185, 1.487, -0.068)], 0.02, 0.026, 0.012, 0.4, 0.6, [0.1, 0.5, -1], 'mid'),
    B([P('chest', 0.0, 1.425, -0.122), P('scap', 0.07, 1.447, -0.126), P('scap', 0.14, 1.465, -0.1)], 0.016, 0.026, 0.012, 0.4, 0.5, [0.1, 0.2, -1], 'mid'),
    B([P('chest', -0.008, 1.35, -0.124), P('chest', 0.05, 1.408, -0.127), P('scap', 0.1, 1.445, -0.124)], 0.024, 0.027, 0.012, 0.3, 0.42, [0, 0, -1], 'low'),
    B([P('chest', -0.008, 1.272, -0.125), P('chest', 0.045, 1.36, -0.13), P('scap', 0.09, 1.44, -0.127)], 0.025, 0.027, 0.011, 0.3, 0.4, [0, 0, -1], 'low'),
    B([P('chest', -0.008, 1.198, -0.121), P('chest', 0.035, 1.29, -0.13), P('scap', 0.082, 1.433, -0.128)], 0.02, 0.025, 0.01, 0.3, 0.38, [0, 0, -1], 'low'),
  ],
});
// Tendinous diamond of the trapezius around C7-T1 (flat aponeurosis, a shallow depression with the C7 tip in it).
cores.push({
  name: 'trapTendon', region: 'traps', k: 0.012, sep: 0.4,
  prims: [ell(P('chest', 0, 1.492, -0.106), [0.042, 0.055, 0.016]), ell(P('neck', 0, 1.505, -0.116), [0.009, 0.009, 0.009])],
});
// Deep bed under the trapezius: neck extensors (splenius and semispinalis, the two columns of the nuchal
// furrow, reaching down to the upper thoracic spine), levator scapulae and supraspinatus.
cores.push({
  name: 'neckExtensors', region: 'traps', k: 0.015, sep: 0,
  prims: [ell(P('neck', 0.022, 1.54, -0.086), [0.03, 0.11, 0.022], [8, 0, 0])],
});
cores.push({
  name: 'trapBed', region: 'traps', k: 0.015, sep: 0,
  prims: [
    cone(P('neck', 0.035, 1.575, -0.05), P('scap', 0.1, 1.49, -0.088), 0.022, 0.028),
    cone(P('scap', 0.085, 1.475, -0.095), P('scap', 0.19, 1.49, -0.04), 0.022, 0.016),
    cone(P('neck', 0.042, 1.57, -0.025), P('scap', 0.115, 1.49, -0.035), 0.016, 0.02),
  ],
});

// --- Rhomboids (deep to the trapezius): from C7-T5 down-lateral to the medial border of the scapula.
muscles.push({
  name: 'rhomboid', region: 'back', sep: 0.35, intra: 0.2,
  bundles: [
    B([P('chest', -0.005, 1.49, -0.106), P('scap', 0.04, 1.47, -0.112), P('scap', 0.078, 1.44, -0.114)], 0.012, 0.016, 0.012, 0.5, 0.6, [0, 0.2, -1], 'min'),
    B([P('chest', -0.005, 1.455, -0.11), P('scap', 0.045, 1.415, -0.118), P('scap', 0.085, 1.385, -0.118)], 0.014, 0.02, 0.014, 0.5, 0.6, [0, 0, -1], 'maj'),
    B([P('chest', -0.005, 1.41, -0.112), P('scap', 0.05, 1.37, -0.12), P('scap', 0.098, 1.335, -0.116)], 0.014, 0.02, 0.013, 0.5, 0.6, [0, 0, -1], 'maj'),
  ],
});

// --- Rotator cuff and teres on the scapula. The scapula plane faces back and out (about 30 degrees).
muscles.push({
  name: 'infraspinatus', region: 'back', sep: 0.75, intra: 0.35,
  bundles: [
    B([P('scap', 0.088, 1.425, -0.117), P('scap', 0.15, 1.447, -0.098), P('upperarm', 0.228, 1.452, -0.05)], 0.014, 0.026, 0.012, 0.45, 0.48, [0.2, 0.2, -1], 'sup'),
    B([P('scap', 0.088, 1.39, -0.12), P('scap', 0.15, 1.415, -0.104), P('upperarm', 0.232, 1.442, -0.052)], 0.016, 0.03, 0.012, 0.45, 0.5, [0.25, 0, -1], 'inf'),
    B([P('scap', 0.1, 1.348, -0.118), P('scap', 0.152, 1.383, -0.104), P('upperarm', 0.23, 1.432, -0.055)], 0.014, 0.026, 0.011, 0.45, 0.5, [0.35, -0.1, -1], 'inf'),
  ],
});
muscles.push({
  name: 'teresMinor', region: 'back', sep: 0.6, intra: 0,
  bundles: [B([P('scap', 0.13, 1.36, -0.112), P('scap', 0.18, 1.39, -0.098), P('upperarm', 0.226, 1.42, -0.062)], 0.011, 0.019, 0.01, 0.45, 0.6, [0.5, -0.2, -1])],
});
muscles.push({
  name: 'teresMajor', region: 'back', sep: 0.85, intra: 0,
  bundles: [B([P('scap', 0.112, 1.318, -0.118), P('scap', 0.16, 1.342, -0.1), P('upperarm', 0.195, 1.372, -0.05), P('upperarm', 0.2, 1.39, -0.015)], 0.014, 0.027, 0.012, 0.4, 0.62, [0.4, -0.4, -1])],
});

// --- Latissimus dorsi: from T7-T12, the thoracolumbar fascia and the iliac crest, wrapping the ribcage
// to the intertubercular groove. The upper bundles start on the spine under the lower trapezius; the
// lower bundles start at the muscular border lateral to the erectors, which outlines the "Christmas tree".
muscles.push({
  name: 'lat', region: 'back', sep: 0.85, intra: 0.25, k: 0.02,
  bundles: [
    B([P('chest', -0.005, 1.32, -0.116), P('chest', 0.051, 1.316, -0.128), P('scap', 0.104, 1.312, -0.114), P('chest', 0.146, 1.318, -0.081), P('upperarm', 0.175, 1.333, -0.08), P('upperarm', 0.198, 1.356, -0.048), P('upperarm', 0.206, 1.378, -0.025)],
      0.022, 0.03, 0.014, 0.5, 0.45, [0.3, 0, -1], 'up'),
    B([P('chest', -0.005, 1.27, -0.119), P('chest', 0.062, 1.268, -0.132), P('chest', 0.119, 1.27, -0.113), P('chest', 0.155, 1.283, -0.082), P('chest', 0.183, 1.305, -0.058), P('upperarm', 0.203, 1.34, -0.032), P('upperarm', 0.207, 1.375, -0.015)],
      0.024, 0.036, 0.014, 0.5, 0.5, [0.5, 0, -1], 'up'),
    B([P('chest', 0.035, 1.22, -0.123), P('chest', 0.078, 1.215, -0.126), P('chest', 0.134, 1.228, -0.102), P('chest', 0.165, 1.25, -0.066), P('chest', 0.192, 1.285, -0.035), P('upperarm', 0.208, 1.33, -0.015), P('upperarm', 0.208, 1.372, -0.005)],
      0.01, 0.036, 0.014, 0.45, 0.55, [0.65, 0, -0.85], 'up'),
    B([P('lumbar', 0.071, 1.165, -0.102), P('chest', 0.113, 1.18, -0.09), P('chest', 0.146, 1.215, -0.072), P('chest', 0.169, 1.26, -0.052), P('chest', 0.19, 1.3, -0.03), P('upperarm', 0.205, 1.335, -0.01), P('upperarm', 0.208, 1.37, 0.002)],
      0.01, 0.034, 0.014, 0.45, 0.58, [0.8, 0, -0.7], 'low'),
    B([P('lumbar', 0.101, 1.105, -0.079), P('lumbar', 0.132, 1.15, -0.067), P('chest', 0.16, 1.21, -0.05), P('chest', 0.175, 1.27, -0.034), P('chest', 0.193, 1.31, -0.016), P('upperarm', 0.206, 1.368, 0.006)],
      0.01, 0.03, 0.013, 0.45, 0.6, [0.9, 0, -0.5], 'low'),
    B([P('pelvis', 0.108, 1.058, -0.075), P('lumbar', 0.135, 1.11, -0.053), P('chest', 0.154, 1.17, -0.038), P('chest', 0.17, 1.235, -0.029), P('chest', 0.188, 1.29, -0.012), P('upperarm', 0.205, 1.366, 0.012)],
      0.01, 0.026, 0.012, 0.45, 0.6, [1, 0, -0.3], 'low'),
  ],
});

// --- Erector spinae: thick lumbar columns either side of the spinal groove, thinning upward under the lats.
muscles.push({
  name: 'erector', region: 'lowerback', sep: 0.8, intra: 0.15, k: 0.026,
  bundles: [
    B([P('pelvis', 0.026, 0.96, -0.11), P('lumbar', 0.044, 1.05, -0.118), P('lumbar', 0.046, 1.13, -0.118), P('chest', 0.046, 1.24, -0.115)], 0.02, 0.03, 0.01, 0.35, 0.65, [0.1, 0, -1], 'long'),
    B([P('pelvis', 0.052, 0.985, -0.096), P('lumbar', 0.08, 1.07, -0.094), P('lumbar', 0.088, 1.15, -0.095), P('chest', 0.092, 1.23, -0.096)], 0.016, 0.03, 0.012, 0.4, 0.42, [0.45, 0, -1], 'ilio'),
  ],
});

// --- Glutes: gluteus maximus fibers run down-lateral from sacrum and posterior crest to the IT band and
// gluteal tuberosity; gluteus medius fans from the outer ilium to the greater trochanter.
muscles.push({
  name: 'gluteMax', region: 'glutes', sep: 0.8, intra: 0.35, k: 0.022,
  bundles: [
    B([P('pelvis', 0.07, 1.035, -0.107), P('pelvis', 0.12, 0.985, -0.12), P('thigh', 0.168, 0.915, -0.055)], 0.016, 0.032, 0.014, 0.45, 0.65, [0.4, 0.4, -1], 'up'),
    B([P('pelvis', 0.025, 1.0, -0.12), P('pelvis', 0.1, 0.945, -0.132), P('thigh', 0.175, 0.875, -0.05)], 0.018, 0.042, 0.016, 0.45, 0.85, [0.25, 0.1, -1], 'up'),
    B([P('pelvis', 0.004, 0.95, -0.126), P('pelvis', 0.085, 0.895, -0.136), P('thigh', 0.17, 0.835, -0.055)], 0.018, 0.042, 0.016, 0.45, 0.85, [0.15, -0.2, -1], 'low'),
    B([P('pelvis', 0.004, 0.895, -0.116), P('pelvis', 0.07, 0.858, -0.124), P('thigh', 0.15, 0.81, -0.06)], 0.014, 0.032, 0.014, 0.45, 0.8, [0.1, -0.5, -1], 'low'),
  ],
});
muscles.push({
  name: 'gluteMed', region: 'glutes', sep: 0.7, intra: 0,
  bundles: [
    B([P('pelvis', 0.085, 1.035, -0.095), P('thigh', 0.165, 0.915, -0.035)], 0.018, 0.034, 0.014, 0.4, 0.7, [0.7, 0.3, -0.7]),
    B([P('pelvis', 0.12, 1.045, -0.065), P('thigh', 0.172, 0.92, -0.018)], 0.018, 0.035, 0.014, 0.4, 0.7, [1, 0.3, -0.3]),
    B([P('pelvis', 0.148, 1.035, -0.018), P('thigh', 0.178, 0.925, 0.0)], 0.016, 0.03, 0.013, 0.4, 0.7, [1, 0.3, 0.2]),
  ],
});

// --- Bony landmarks and deep fill.
// Spinous processes and supraspinous ligament: the floor of the spinal groove.
cores.push({ name: 'spine', region: 'back', k: 0.01, sep: 0.6, prims: [cone(P('pelvis', 0, 0.97, -0.098), P('chest', 0, 1.47, -0.1), 0.026, 0.024)] });
// Deep back muscles and posterior rib angles: flatten the back of the ribcage under the lats and traps.
cores.push({ name: 'backBed', region: 'back', k: 0.02, sep: 0, prims: [ell(P('chest', 0.07, 1.27, -0.082), [0.085, 0.15, 0.033], [0, -22, 0])] });
// Thoracolumbar fascia over the quadratus lumborum, lateral to the erectors: a smooth slope down to the flank.
cores.push({ name: 'lumbarFascia', region: 'lowerback', k: 0.02, sep: 0, prims: [ell(P('lumbar', 0.1, 1.09, -0.075), [0.03, 0.07, 0.013], [0, -40, 0])] });
// Axillary fat and subscapularis behind the side of the ribcage, under the posterior axillary fold.
cores.push({ name: 'axillaFill', region: 'back', k: 0.02, sep: 0, prims: [ell(P('chest', 0.158, 1.37, -0.05), [0.028, 0.07, 0.035])] });
// Scapula with subscapularis: the base the infraspinatus and teres lie on.
cores.push({ name: 'scapula', region: 'back', k: 0.015, sep: 0.2, prims: [ell(P('scap', 0.125, 1.395, -0.082), [0.052, 0.078, 0.022], [0, -30, 0])] });
cores.push({ name: 'scapSpine', region: 'back', k: 0.01, sep: 0.3, prims: [cone(P('scap', 0.08, 1.432, -0.124), P('scap', 0.19, 1.488, -0.07), 0.01, 0.01)] });
// Sacrum between the gluteal origins.
cores.push({ name: 'sacrum', region: 'glutes', k: 0.012, sep: 0.3, prims: [cone(P('pelvis', 0, 0.985, -0.112), P('pelvis', 0, 0.9, -0.112), 0.016, 0.009)] });

export const BACK = regionModule({ muscles, cores, veins, fat }, {});
