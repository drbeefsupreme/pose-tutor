import type { CoreDef, FatDeposit, MuscleDef, VeinDef } from '../types';
import { P, B, ell, cone, regionModule } from './common';

// Left leg (+X). Landmarks (m): ASIS (0.122, 1.0, 0.072), AIIS (0.108, 0.96, 0.07), pubic tubercle (0.025, 0.9, 0.085),
// ischial tuberosity (0.058, 0.87, -0.075), greater trochanter (0.17, 0.91, -0.01), knee joint (0.115, 0.505, 0),
// patella center (0.12, 0.54, 0.041), tibial tuberosity (0.121, 0.457, 0.03), fibular head (0.163, 0.462, -0.028),
// medial / lateral malleolus (0.117, 0.088, -0.01) / (0.166, 0.075, -0.035), ankle (0.14, 0.085, -0.02).
const muscles: MuscleDef[] = [];
const cores: CoreDef[] = [];
const veins: VeinDef[] = [];
const fat: FatDeposit[] = [];

/** Foot frame: `along` runs from below the ankle toward the toes (toe-out 8 deg), `lat` is lateral, `h` is height above the floor. */
const TOE_OUT = (8 * Math.PI) / 180;
const fp = (along: number, lat: number, h: number) =>
  P('foot', 0.14 + along * Math.sin(TOE_OUT) + lat * Math.cos(TOE_OUT), h, -0.02 + along * Math.cos(TOE_OUT) - lat * Math.sin(TOE_OUT));

// --- Hip: tensor fasciae latae, from the iliac crest behind the ASIS into the iliotibial tract.
muscles.push({
  name: 'tfl', region: 'quads', sep: 0.85, intra: 0,
  bundles: [B([P('pelvis', 0.138, 1.0, 0.062), P('thigh', 0.168, 0.93, 0.05), P('thigh', 0.19, 0.855, 0.03)], 0.014, 0.025, 0.01, 0.4, 0.6, [1, 0, 0.75])],
});

// --- Quadriceps
// Rectus femoris: AIIS to the quadriceps tendon, the central spindle of the front of the thigh.
muscles.push({
  name: 'rectusFemoris', region: 'quads', sep: 0.9, intra: 0.35,
  bundles: [B([P('pelvis', 0.108, 0.955, 0.068), P('thigh', 0.115, 0.86, 0.098), P('thigh', 0.123, 0.73, 0.1), P('thigh', 0.123, 0.62, 0.086), P('thigh', 0.121, 0.578, 0.066)],
    0.016, 0.046, 0.012, 0.45, 0.62, [0.1, 0, 1])],
});
// Vastus lateralis: trochanter and lateral linea aspera to the lateral patella. One mass wrapping the outer thigh (the
// sweep); the posterior strip lies behind the iliotibial tract.
muscles.push({
  name: 'vastusLat', region: 'quads', sep: 0.9, intra: 0.3, k: 0.03,
  bundles: [
    B([P('thigh', 0.148, 0.86, 0.05), P('thigh', 0.168, 0.75, 0.08), P('thigh', 0.165, 0.64, 0.08), P('thigh', 0.143, 0.565, 0.06)], 0.016, 0.035, 0.012, 0.5, 0.8, [0.65, 0, 0.75], 'a'),
    B([P('thigh', 0.165, 0.89, 0.0), P('thigh', 0.198, 0.78, 0.008), P('thigh', 0.203, 0.68, 0.012), P('thigh', 0.182, 0.6, 0.022), P('thigh', 0.158, 0.55, 0.035)], 0.025, 0.055, 0.016, 0.45, 0.6, [1, 0, 0.1], 'a'),
    B([P('thigh', 0.16, 0.845, -0.05), P('thigh', 0.185, 0.72, -0.065), P('thigh', 0.178, 0.62, -0.045), P('thigh', 0.165, 0.575, -0.02)], 0.016, 0.034, 0.012, 0.45, 0.7, [0.8, 0, -1], 'b'),
  ],
});
// Vastus medialis: long fibers down the medial thigh, oblique fibers forming the teardrop above the medial knee.
muscles.push({
  name: 'vastusMed', region: 'quads', sep: 0.95, intra: 0.3, k: 0.025,
  bundles: [
    B([P('thigh', 0.098, 0.82, 0.06), P('thigh', 0.08, 0.72, 0.07), P('thigh', 0.074, 0.63, 0.068), P('thigh', 0.098, 0.565, 0.055)], 0.014, 0.03, 0.014, 0.6, 0.8, [-0.6, 0, 0.8]),
    B([P('thigh', 0.068, 0.69, 0.015), P('thigh', 0.055, 0.62, 0.035), P('thigh', 0.07, 0.57, 0.055), P('thigh', 0.102, 0.548, 0.052)], 0.012, 0.04, 0.012, 0.55, 0.85, [-0.8, 0, 0.6]),
    B([P('thigh', 0.098, 0.7, 0.076), P('thigh', 0.102, 0.62, 0.078), P('thigh', 0.113, 0.575, 0.06)], 0.012, 0.024, 0.012, 0.5, 0.7, [-0.3, 0, 1]),
  ],
});
// Vastus intermedius: deep, fills the front of the femur under the rectus femoris and between the vasti.
muscles.push({
  name: 'vastusInt', region: 'quads', sep: 0, intra: 0,
  bundles: [B([P('thigh', 0.13, 0.86, 0.03), P('thigh', 0.13, 0.72, 0.05), P('thigh', 0.122, 0.62, 0.05), P('thigh', 0.12, 0.57, 0.04)], 0.025, 0.05, 0.024, 0.5, 0.85, [0, 0, 1])],
});
// Sartorius: ASIS across the front of the thigh to the medial side, behind the medial condyle to the pes anserinus.
muscles.push({
  name: 'sartorius', region: 'quads', sep: 1.0, intra: 0,
  bundles: [B([P('pelvis', 0.122, 0.99, 0.075), P('thigh', 0.11, 0.9, 0.106), P('thigh', 0.08, 0.79, 0.105), P('thigh', 0.05, 0.69, 0.07), P('thigh', 0.037, 0.61, 0.025),
    P('thigh', 0.05, 0.535, -0.025), P('shin', 0.088, 0.455, 0.02)], 0.01, 0.019, 0.009, 0.4, 0.5, [-0.7, 0, 0.7])],
});
// Iliopsoas: deep floor of the femoral triangle. Hip fill: gluteus minimus, iliacus and hip capsule under the TFL.
cores.push({ name: 'iliopsoas', region: 'quads', k: 0.02, sep: 0.2, prims: [cone(P('pelvis', 0.085, 0.97, 0.068), P('thigh', 0.098, 0.85, 0.04), 0.026, 0.024)] });
cores.push({ name: 'hipFill', region: 'quads', k: 0.025, sep: 0, prims: [ell(P('pelvis', 0.14, 0.935, 0.03), [0.045, 0.06, 0.042])] });
// Inner-thigh bridge: the thighs press together below the crotch (midline, not mirrored).
cores.push({ name: 'thighBridge', region: 'adductors', k: 0.02, sep: 0, prims: [ell(P('pelvis', 0, 0.82, -0.025), [0.022, 0.06, 0.06])] });

// --- Adductors: pubis / ischium to the linea aspera and adductor tubercle.
muscles.push({
  name: 'adductor', region: 'adductors', sep: 0.75, intra: 0.4, k: 0.028,
  bundles: [
    B([P('pelvis', 0.045, 0.89, 0.075), P('thigh', 0.078, 0.845, 0.064), P('thigh', 0.105, 0.8, 0.03)], 0.014, 0.022, 0.01, 0.4, 0.6, [-0.2, 0, 1], 'pect'),
    B([P('pelvis', 0.025, 0.885, 0.072), P('thigh', 0.032, 0.8, 0.066), P('thigh', 0.04, 0.72, 0.05), P('thigh', 0.06, 0.64, 0.025)], 0.012, 0.036, 0.012, 0.35, 0.8, [-0.75, 0, 0.65], 'long'),
    B([P('pelvis', 0.028, 0.87, 0.015), P('thigh', 0.022, 0.77, -0.005), P('thigh', 0.035, 0.66, -0.012), P('thigh', 0.06, 0.58, -0.02)], 0.016, 0.04, 0.014, 0.4, 0.9, [-1, 0, 0], 'mag'),
    B([P('pelvis', 0.052, 0.875, -0.06), P('thigh', 0.035, 0.76, -0.058), P('thigh', 0.05, 0.64, -0.048), P('thigh', 0.072, 0.565, -0.015)], 0.018, 0.043, 0.012, 0.4, 0.85, [-0.8, 0, -0.6], 'mag'),
  ],
});
muscles.push({
  name: 'gracilis', region: 'adductors', sep: 0.6, intra: 0,
  bundles: [B([P('pelvis', 0.012, 0.87, 0.03), P('thigh', 0.008, 0.8, 0.008), P('thigh', 0.018, 0.7, -0.012), P('thigh', 0.032, 0.62, -0.025), P('shin', 0.06, 0.52, -0.04), P('shin', 0.088, 0.457, 0.012)],
    0.012, 0.022, 0.007, 0.3, 0.55, [-1, 0, -0.1])],
});

// --- Hamstrings: ischial tuberosity to the fibular head (biceps femoris) and the medial tibia (semi-).
muscles.push({
  name: 'bicepsFemoris', region: 'hamstrings', sep: 0.85, intra: 0.6,
  bundles: [
    B([P('pelvis', 0.062, 0.87, -0.078), P('thigh', 0.11, 0.77, -0.105), P('thigh', 0.142, 0.65, -0.094), P('shin', 0.158, 0.545, -0.055), P('shin', 0.163, 0.47, -0.03)], 0.016, 0.04, 0.008, 0.4, 0.78, [0.35, 0, -1], 'long'),
    B([P('thigh', 0.15, 0.77, -0.065), P('thigh', 0.172, 0.65, -0.064), P('shin', 0.165, 0.535, -0.04)], 0.012, 0.028, 0.01, 0.5, 0.8, [0.9, 0, -0.9], 'short'),
  ],
});
muscles.push({
  name: 'semitendinosus', region: 'hamstrings', sep: 0.85, intra: 0,
  bundles: [B([P('pelvis', 0.056, 0.87, -0.082), P('thigh', 0.072, 0.76, -0.11), P('thigh', 0.072, 0.645, -0.1), P('thigh', 0.07, 0.565, -0.065), P('shin', 0.075, 0.495, -0.04), P('shin', 0.092, 0.457, 0.012)],
    0.014, 0.03, 0.006, 0.3, 0.85, [-0.3, 0, -1])],
});
muscles.push({
  name: 'semimembranosus', region: 'hamstrings', sep: 0.8, intra: 0,
  bundles: [B([P('pelvis', 0.068, 0.865, -0.068), P('thigh', 0.068, 0.74, -0.086), P('thigh', 0.072, 0.625, -0.09), P('shin', 0.082, 0.535, -0.055), P('shin', 0.085, 0.49, -0.032)],
    0.012, 0.038, 0.012, 0.58, 0.8, [-0.4, 0, -1])],
});

// --- Lower leg
// Gastrocnemius: the medial head is larger and reaches lower than the lateral head (the calf "diamond").
muscles.push({
  name: 'gastroc', region: 'calves', sep: 0.85, intra: 0.8, k: 0.028,
  bundles: [
    B([P('thigh', 0.094, 0.535, -0.03), P('shin', 0.085, 0.45, -0.066), P('shin', 0.085, 0.37, -0.082), P('shin', 0.112, 0.27, -0.078)], 0.016, 0.045, 0.01, 0.45, 0.78, [-0.55, 0, -1], 'med'),
    B([P('thigh', 0.14, 0.54, -0.03), P('shin', 0.149, 0.45, -0.066), P('shin', 0.147, 0.37, -0.076), P('shin', 0.133, 0.31, -0.072)], 0.014, 0.035, 0.01, 0.42, 0.76, [0.45, 0, -1], 'lat'),
  ],
});
// Soleus: under the gastrocnemius, showing on both sides of its lower half down to the Achilles tendon.
muscles.push({
  name: 'soleus', region: 'calves', sep: 0.75, intra: 0.3, k: 0.03,
  bundles: [
    B([P('shin', 0.162, 0.44, -0.04), P('shin', 0.176, 0.32, -0.05), P('shin', 0.165, 0.2, -0.053), P('shin', 0.15, 0.12, -0.058)], 0.01, 0.024, 0.01, 0.45, 0.6, [1, 0, -0.6], 'lat'),
    B([P('shin', 0.128, 0.42, -0.058), P('shin', 0.13, 0.3, -0.07), P('shin', 0.137, 0.17, -0.066)], 0.016, 0.034, 0.012, 0.45, 0.72, [0, 0, -1], 'mid'),
    B([P('shin', 0.103, 0.42, -0.03), P('shin', 0.094, 0.31, -0.036), P('shin', 0.106, 0.2, -0.045), P('shin', 0.13, 0.12, -0.058)], 0.01, 0.026, 0.01, 0.45, 0.6, [-1, 0, -0.45], 'med'),
  ],
});
// Flexor digitorum longus: fills the strip between the medial border of the tibia and the soleus, behind the medial malleolus.
muscles.push({
  name: 'flexorDig', region: 'calves', sep: 0.4, intra: 0,
  bundles: [B([P('shin', 0.1, 0.4, -0.02), P('shin', 0.098, 0.3, -0.022), P('shin', 0.105, 0.2, -0.025), P('shin', 0.112, 0.12, -0.028), P('shin', 0.116, 0.08, -0.028)],
    0.008, 0.014, 0.006, 0.45, 0.8, [-1, 0, -0.2])],
});
// Anterior compartment: tibialis anterior beside the shin bone, extensor digitorum lateral to it.
muscles.push({
  name: 'tibialisAnt', region: 'shins', sep: 0.75, intra: 0.3, k: 0.025,
  bundles: [
    B([P('shin', 0.142, 0.48, 0.01), P('shin', 0.149, 0.4, 0.025), P('shin', 0.146, 0.3, 0.026), P('shin', 0.137, 0.2, 0.024), P('shin', 0.13, 0.13, 0.03)], 0.008, 0.024, 0.005, 0.3, 0.75, [0.6, 0, 1], 'ta', 1.3),
    B([P('shin', 0.163, 0.47, -0.004), P('shin', 0.172, 0.36, 0.0), P('shin', 0.166, 0.24, 0.006), P('shin', 0.156, 0.14, 0.018)], 0.007, 0.018, 0.006, 0.35, 0.75, [1, 0, 0.35], 'edl', 1.8),
  ],
});
// Peroneus longus (upper) and brevis (lower) on the lateral side, behind the lateral malleolus.
muscles.push({
  name: 'peroneus', region: 'shins', sep: 0.5, intra: 0.2, k: 0.022,
  bundles: [
    B([P('shin', 0.17, 0.47, -0.026), P('shin', 0.184, 0.36, -0.028), P('shin', 0.18, 0.24, -0.032), P('shin', 0.169, 0.12, -0.046)], 0.008, 0.019, 0.007, 0.35, 0.75, [1, 0, -0.15], 'longus'),
    B([P('shin', 0.172, 0.34, -0.014), P('shin', 0.18, 0.22, -0.012), P('shin', 0.172, 0.13, -0.03), P('shin', 0.168, 0.085, -0.05)], 0.008, 0.018, 0.006, 0.45, 0.75, [1, 0, 0.15], 'brevis'),
  ],
});

// --- Bones and deep fill
cores.push({
  name: 'femur', region: 'quads', k: 0.015, sep: 0.2,
  prims: [cone(P('thigh', 0.135, 0.89, -0.005), P('thigh', 0.118, 0.56, -0.005), 0.016, 0.018), ell(P('thigh', 0.168, 0.905, -0.012), [0.02, 0.028, 0.026])],
});
// Knee: condyles, tibial plateau, fibular head; fat pads beside the patellar ligament, medial knee pad, pes anserinus.
cores.push({
  name: 'knee', region: 'quads', k: 0.025, sep: 0.15,
  prims: [
    ell(P('thigh', 0.083, 0.53, -0.01), [0.027, 0.032, 0.036]),
    ell(P('thigh', 0.148, 0.53, -0.01), [0.023, 0.03, 0.036]),
    ell(P('thigh', 0.116, 0.525, 0.0), [0.03, 0.035, 0.032]),
    ell(P('shin', 0.09, 0.48, 0.0), [0.03, 0.028, 0.034]),
    ell(P('shin', 0.145, 0.48, -0.004), [0.027, 0.026, 0.032]),
    ell(P('shin', 0.163, 0.462, -0.028), [0.011, 0.012, 0.011]),
    ell(P('shin', 0.104, 0.5, 0.027), [0.016, 0.024, 0.013]),
    ell(P('shin', 0.137, 0.5, 0.027), [0.016, 0.024, 0.013]),
    ell(P('thigh', 0.07, 0.555, 0.012), [0.022, 0.04, 0.026]),
    ell(P('shin', 0.082, 0.455, -0.015), [0.022, 0.028, 0.028]),
    ell(P('shin', 0.12, 0.54, 0.026), [0.034, 0.034, 0.02]),
  ],
});
// Patella with the quadriceps tendon above it, flat patellar ligament and tibial tuberosity.
cores.push({
  name: 'patella', region: 'quads', k: 0.012, sep: 0.45,
  prims: [ell(P('shin', 0.12, 0.54, 0.041), [0.025, 0.027, 0.013]), ell(P('thigh', 0.12, 0.574, 0.045), [0.024, 0.022, 0.011]), ell(P('shin', 0.1205, 0.49, 0.033), [0.014, 0.03, 0.007]),
    ell(P('shin', 0.121, 0.457, 0.03), [0.015, 0.012, 0.01])],
});
// Popliteal fat: fills the diamond between the hamstring tendons and the heads of the gastrocnemius.
cores.push({ name: 'popliteal', region: 'hamstrings', k: 0.02, sep: 0, prims: [ell(P('thigh', 0.117, 0.525, -0.05), [0.032, 0.09, 0.028]), ell(P('thigh', 0.112, 0.61, -0.072), [0.026, 0.05, 0.02])] });
// Tibia: the flat anteromedial face lies under the skin; the crest is its lateral edge.
cores.push({
  name: 'tibia', region: 'shins', k: 0.015, sep: 0.5,
  prims: [
    ell(P('shin', 0.115, 0.37, 0.012), [0.022, 0.11, 0.013], [0, -53, 0]),
    ell(P('shin', 0.122, 0.2, 0.004), [0.018, 0.11, 0.011], [0, -53, 0]),
    ell(P('shin', 0.117, 0.088, -0.01), [0.013, 0.016, 0.016]),
  ],
});
cores.push({ name: 'fibula', region: 'shins', k: 0.01, sep: 0.3, prims: [cone(P('shin', 0.163, 0.44, -0.03), P('shin', 0.165, 0.11, -0.035), 0.008, 0.008), ell(P('shin', 0.166, 0.075, -0.035), [0.012, 0.016, 0.013])] });
cores.push({ name: 'achilles', region: 'calves', k: 0.01, sep: 0.6, prims: [cone(P('shin', 0.132, 0.24, -0.07), P('foot', 0.14, 0.05, -0.066), 0.012, 0.008)] });
// Kager's fat pad between the Achilles tendon and the ankle bones (the soft hollows beside the tendon).
cores.push({ name: 'ankleFill', region: 'calves', k: 0.02, sep: 0, prims: [ell(P('shin', 0.14, 0.11, -0.048), [0.02, 0.045, 0.02])] });
// Deep fill of the leg: anterior (bones, interosseous membrane) and posterior (popliteus, deep flexors).
cores.push({
  name: 'shinCore', region: 'shins', k: 0.02, sep: 0,
  prims: [cone(P('shin', 0.122, 0.5, -0.004), P('shin', 0.134, 0.13, -0.012), 0.035, 0.022), cone(P('shin', 0.122, 0.48, -0.04), P('shin', 0.132, 0.2, -0.045), 0.03, 0.02)],
});
// Thigh fill about 2.5 cm under the skin (femur, deep muscles); two cones give the oval cross-section.
cores.push({
  name: 'legEnvelope', region: 'core', k: 0.03, sep: 0,
  prims: [
    cone(P('thigh', 0.11, 0.84, 0.016), P('thigh', 0.12, 0.7, 0.02), 0.083, 0.078),
    cone(P('thigh', 0.12, 0.7, 0.02), P('thigh', 0.121, 0.62, 0.012), 0.078, 0.058),
    cone(P('thigh', 0.108, 0.84, -0.028), P('thigh', 0.118, 0.7, -0.02), 0.083, 0.078),
    cone(P('thigh', 0.118, 0.7, -0.02), P('thigh', 0.12, 0.62, -0.012), 0.078, 0.058),
    ell(P('pelvis', 0.075, 0.9, -0.07), [0.07, 0.07, 0.06]),
  ],
});
// Iliotibial tract: shows as a flat cord on the outer knee down to Gerdy's tubercle.
cores.push({ name: 'itBand', region: 'quads', k: 0.015, sep: 0.25, prims: [cone(P('thigh', 0.19, 0.66, 0.0), P('thigh', 0.17, 0.57, 0.012), 0.008, 0.008), cone(P('thigh', 0.17, 0.57, 0.012), P('shin', 0.151, 0.478, 0.022), 0.008, 0.007)] });

// --- Foot: heel, arch, ball and five toes.
cores.push({
  name: 'foot', region: 'feet', k: 0.012, sep: 0.2,
  prims: [
    ell(fp(-0.032, 0.0, 0.034), [0.031, 0.034, 0.04], [0, 8, 0]),
    ell(fp(0.0, 0.002, 0.045), [0.03, 0.035, 0.05], [0, 8, 0]),
    ell(fp(0.06, -0.005, 0.035), [0.04, 0.03, 0.07], [12, 8, 0]),
    ell(fp(0.07, 0.03, 0.017), [0.018, 0.017, 0.07], [0, 8, 0]),
    ell(fp(0.135, -0.008, 0.022), [0.05, 0.022, 0.03], [0, 23, 0]),
    cone(P('shin', 0.137, 0.16, -0.02), P('shin', 0.14, 0.075, -0.015), 0.027, 0.029),
    ell(P('shin', 0.138, 0.095, -0.005), [0.027, 0.035, 0.03]),
  ],
});
cores.push({
  name: 'toes', region: 'feet', k: 0.01, sep: 0.2,
  prims: [
    cone(fp(0.15, -0.033, 0.02), fp(0.198, -0.036, 0.014), 0.0135, 0.0115),
    cone(fp(0.155, -0.009, 0.016), fp(0.2, -0.008, 0.009), 0.009, 0.0075),
    cone(fp(0.15, 0.009, 0.015), fp(0.19, 0.012, 0.008), 0.0085, 0.007),
    cone(fp(0.143, 0.025, 0.014), fp(0.177, 0.029, 0.008), 0.008, 0.0065),
    cone(fp(0.13, 0.04, 0.013), fp(0.162, 0.045, 0.008), 0.0075, 0.006),
  ],
});
cores.push({
  name: 'ankleTendons', region: 'feet', k: 0.015, sep: 0.3,
  prims: [cone(P('shin', 0.13, 0.15, 0.022), fp(0.04, -0.03, 0.046), 0.0045, 0.0045), cone(fp(0.04, -0.03, 0.046), fp(0.07, -0.035, 0.037), 0.0045, 0.004),
    cone(P('shin', 0.156, 0.15, 0.01), fp(0.075, 0.012, 0.047), 0.0042, 0.0038)],
});

// --- Superficial veins
veins.push(
  { name: 'greatSaphenous', region: 'adductors', r: 0.0028, taper: 0.8, pts: [fp(0.05, -0.04, 0.045), P('shin', 0.108, 0.1, 0.015), P('shin', 0.085, 0.25, -0.012), P('shin', 0.075, 0.4, -0.03), P('thigh', 0.062, 0.52, -0.035), P('thigh', 0.03, 0.65, -0.01), P('thigh', 0.035, 0.78, 0.04), P('thigh', 0.055, 0.86, 0.075)] },
  { name: 'anteriorThigh', region: 'quads', r: 0.0024, taper: 0.8, pts: [P('thigh', 0.18, 0.6, 0.06), P('thigh', 0.15, 0.68, 0.1), P('thigh', 0.12, 0.76, 0.115), P('thigh', 0.085, 0.82, 0.105), P('thigh', 0.06, 0.86, 0.085)] },
  { name: 'quadMedial', region: 'quads', r: 0.002, taper: 0.7, pts: [P('thigh', 0.075, 0.56, 0.07), P('thigh', 0.062, 0.64, 0.07), P('thigh', 0.045, 0.72, 0.045)] },
  { name: 'lateralThigh', region: 'quads', r: 0.0019, taper: 0.6, pts: [P('thigh', 0.21, 0.62, 0.0), P('thigh', 0.225, 0.72, 0.012), P('thigh', 0.205, 0.82, 0.02)] },
  { name: 'smallSaphenous', region: 'calves', r: 0.0022, taper: 0.8, pts: [P('shin', 0.168, 0.08, -0.05), P('shin', 0.155, 0.15, -0.07), P('shin', 0.128, 0.28, -0.095), P('shin', 0.12, 0.4, -0.105), P('shin', 0.115, 0.49, -0.07)] },
  { name: 'posteriorArch', region: 'calves', r: 0.002, taper: 0.8, pts: [P('shin', 0.112, 0.1, -0.035), P('shin', 0.085, 0.22, -0.055), P('shin', 0.065, 0.35, -0.07), P('shin', 0.07, 0.45, -0.04)] },
  { name: 'calfMedial', region: 'calves', r: 0.0018, taper: 0.7, pts: [P('shin', 0.06, 0.3, -0.06), P('shin', 0.058, 0.38, -0.08), P('shin', 0.075, 0.46, -0.075)] },
  { name: 'dorsalArch', region: 'feet', r: 0.0018, pts: [fp(0.05, -0.04, 0.045), fp(0.075, -0.012, 0.05), fp(0.08, 0.02, 0.042), fp(0.04, 0.045, 0.03)] },
);
// Off-season leg fat: medial knee pad and outer upper thigh (the inner-thigh deposit lives in torso.ts).
fat.push(
  { c: P('thigh', 0.07, 0.56, 0.02), r: [0.03, 0.04, 0.035], amount: 0.004 },
  { c: P('thigh', 0.2, 0.86, 0.0), r: [0.04, 0.07, 0.06], amount: 0.005 },
);

export const LEGS = regionModule({ muscles, cores, veins, fat }, { quads: 1, hamstrings: 1, adductors: 1, calves: 1, shins: 1 });
