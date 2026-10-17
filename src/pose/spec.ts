import { MIN_VISIBILITY, SIDE_VIEW_HIP_WIDTH } from './metrics';
import type { Band, BodySide, Check, Cue, Facing, MetricId, MetricSide, PoseId, PoseSpec } from './types';

// Targets, bands, cues and build-up steps come from docs/pose-spec.md (NPC / IFBB Pro conventions).
// Source tags refer to its sources list; ESTIMATE marks a cue for a fault the spec does not list. A band that departs
// from the spec says why. An angle or visibility band ends at the metric's limit (180°, 1) rather than open, so the
// score falls off over the real band width. Metrics the camera cannot read for a pose (lean, depth, a hidden
// wrist's position) are left out, and their coaching moves to `coachOnly`.

const cue = (text: string, source: string): Cue => ({ text, source });
const band = (target: number, min: number, max: number): Band => ({ target, min, max });
const atLeast = (target: number, min: number): Band => ({ target, min, max: Infinity });
const atMost = (target: number, max: number): Band => ({ target, min: -Infinity, max });

type Target = Omit<Check, 'metric' | 'side'>;
const check = (metric: MetricId, target: Target, side?: MetricSide): Check => ({ metric, side, ...target });
const eachSide = (metric: MetricId, target: Target): Check[] => [
  check(metric, target, 'left'),
  check(metric, target, 'right'),
];

/** The athlete's side a check reads. `near` is the side facing the camera, so it exists only in side views. */
export function resolveSide(side: MetricSide, facing: Facing): BodySide | undefined {
  if (side === 'left' || side === 'right') return side;
  const near: BodySide | undefined = facing === 'leftSide' ? 'left' : facing === 'rightSide' ? 'right' : undefined;
  if (near === undefined || side === 'near') return near;
  return near === 'left' ? 'right' : 'left';
}

/**
 * The fault reported when the athlete faces the wrong way, by required facing. The band is the hip-width half of
 * the facing rule; its one finite edge carries the turn cue, and the fault is a miss on that edge.
 */
export const FACING_CHECKS: { readonly [F in Facing]: Check } = {
  front: check('hipWidth', { band: atLeast(0.38, SIDE_VIEW_HIP_WIDTH), weight: 1, low: cue('Turn to face the camera.', 'S1') }),
  back: check('hipWidth', { band: atLeast(0.38, SIDE_VIEW_HIP_WIDTH), weight: 1, low: cue('Turn your back to the camera.', 'S1') }),
  leftSide: check('hipWidth', {
    band: atMost(0.17, SIDE_VIEW_HIP_WIDTH),
    weight: 1,
    high: cue('Turn your left side to the camera.', 'S1'),
  }),
  rightSide: check('hipWidth', {
    band: atMost(0.17, SIDE_VIEW_HIP_WIDTH),
    weight: 1,
    high: cue('Turn your right side to the camera.', 'S1'),
  }),
};

const relaxedFront: PoseSpec = {
  id: 'relaxedFront',
  name: 'Relaxed front',
  facing: 'front',
  description:
    'Face the judges with the heels close and the knees unbent, arms hanging away from the body with the elbows slightly bent, hands in fists [S3][S6].',
  checks: [
    ...eachSide('abduction', {
      band: band(50, 30, 65),
      weight: 1.5,
      low: cue('Lift your arms away from your sides.', 'S6'),
      high: cue('Bring your arms in a little.', 'S6'),
    }),
    check('elbowSpan', {
      band: band(1.9, 1.6, 2.2),
      weight: 1,
      low: cue('Lift your arms away from your sides.', 'S6'),
      high: cue('Bring your arms in a little.', 'S6'),
    }),
    ...eachSide('elbowFlex', {
      band: band(40, 20, 55),
      weight: 1.5,
      low: cue('Soften your elbows a little.', 'S3'),
      high: cue('Let your arms hang naturally.', 'ESTIMATE'),
    }),
    ...eachSide('forearmAngle', { band: band(170, 150, 180), weight: 1, low: cue('Let your arms hang naturally.', 'ESTIMATE') }),
    ...eachSide('wristHeight', {
      band: band(-0.64, -0.85, -0.4),
      weight: 0.5,
      low: cue('Soften your elbows a little.', 'ESTIMATE'),
      high: cue('Let your arms hang naturally.', 'ESTIMATE'),
    }),
    // Hands hang beside the hips, in view: the reference wrists read 0.98..0.99.
    ...eachSide('wristVis', { band: band(0.9, 0.5, 1), weight: 0.5, low: cue('Let your arms hang naturally.', 'S3') }),
    check('stanceRatio', { band: band(0.45, 0, 0.65), weight: 1, high: cue('Bring your heels closer together.', 'S3') }),
    ...eachSide('kneeFlex', { band: band(5, 0, 15), weight: 0.5, high: cue('Straighten your legs.', 'S3') }),
    check('twist', {
      band: band(0, -10, 10),
      weight: 1,
      low: cue('Square your shoulders to the camera.', 'S3'),
      high: cue('Square your shoulders to the camera.', 'S3'),
    }),
    check('headYaw', {
      band: band(0, -0.15, 0.15),
      weight: 0.5,
      low: cue('Look straight at the camera.', 'S3'),
      high: cue('Look straight at the camera.', 'S3'),
    }),
    check('shrug', { band: atLeast(1, 0.8), weight: 1, low: cue('Drop your shoulders down.', 'S14') }),
  ],
  buildUp: [
    'Set your heels close together, toes slightly out.',
    'Straighten your knees and lightly tense your thighs.',
    'Point your hips straight at the camera.',
    'Lift your chest and pull your stomach in.',
    'Spread your lats so your arms hang away from your sides.',
    'Make soft fists with your palms toward you.',
    'Lift your chin, look at the camera, and smile.',
    'Widen your lats a little more and hold still.',
  ],
  coachOnly: [
    'Lat flare beyond what the elbow span shows [S6].',
    'Stomach in, chest out, shoulders back [S3].',
    'Even, light tension without single-muscle flexing [S6].',
    'Chin up, not dropped below the ear line [S3].',
    'A relaxed smile and shallow breathing [S14].',
  ],
};

/** Relaxed side: the first quarter turn to the right shows the left side, the third shows the right side [S3]. */
function quarterTurn(near: BodySide): PoseSpec {
  const looksAlongBody = cue('Look straight ahead, along your body.', 'S3');
  return {
    id: near === 'left' ? 'quarterTurnLeftSide' : 'quarterTurnRightSide',
    name: `Quarter turn, ${near} side`,
    facing: near === 'left' ? 'leftSide' : 'rightSide',
    description: `${near === 'left' ? 'Left' : 'Right'} side to the judges: heels together, knees unbent, the near arm slightly back and the far arm slightly forward, the upper body turned slightly toward the judges [S3].`,
    checks: [
      check(
        'abduction',
        {
          band: band(27, 10, 40),
          weight: 1.5,
          low: cue('Let your arms hang naturally.', 'S6'),
          high: cue('Let your arms hang naturally.', 'S6'),
        },
        'near',
      ),
      check(
        'elbowFlex',
        {
          band: band(25, 5, 40),
          weight: 1,
          low: cue('Soften your elbows a little.', 'ESTIMATE'),
          high: cue('Let your arms hang naturally.', 'ESTIMATE'),
        },
        'near',
      ),
      check(
        'elbowFlex',
        {
          band: band(22, 5, 40),
          weight: 0.5,
          low: cue('Soften your elbows a little.', 'ESTIMATE'),
          high: cue('Let your arms hang naturally.', 'ESTIMATE'),
        },
        'far',
      ),
      check('forearmAngle', { band: band(170, 150, 180), weight: 0.5, low: cue('Let your arms hang naturally.', 'ESTIMATE') }, 'near'),
      check(
        'wristHeight',
        {
          band: band(-1.03, -1.15, -0.85),
          weight: 0.5,
          low: cue('Let your arms hang naturally.', 'ESTIMATE'),
          high: cue('Let your arms hang naturally.', 'ESTIMATE'),
        },
        'near',
      ),
      // The far arm hangs in front of the body [S3], in view: the reference far wrists read 0.79..0.96.
      check('wristVis', { band: band(0.9, 0.5, 1), weight: 1, low: cue('Let your arms hang naturally.', 'S3') }, 'far'),
      check('stagger', { band: atMost(0, 0.15), weight: 1, high: cue('Bring your feet closer together.', 'S3') }),
      ...eachSide('kneeFlex', { band: band(4, 0, 15), weight: 0.5, high: cue('Straighten your knees.', 'S3') }),
      check('twist', {
        band: band(15, 0, 35),
        weight: 1,
        low: cue('Turn your chest slightly toward the camera.', 'S3'),
        high: cue('Turn your shoulders back to the side.', 'S3'),
      }),
      check('shoulderWidth', { band: atMost(0.53, 0.65), weight: 0.5, high: cue('Turn your shoulders back to the side.', 'S3') }),
      // A profile head puts the nose far ahead of the ears (the reference photos read -1.87 and +3.30); facing the
      // camera brings head_yaw toward 0. The sign follows the side: the nose points image left in a left-side view.
      check('headYaw', near === 'left'
        ? { band: atMost(-2, -1), weight: 0.5, high: looksAlongBody }
        : { band: atLeast(2, 1), weight: 0.5, low: looksAlongBody }),
    ],
    buildUp: [
      `Turn a quarter to your ${near === 'left' ? 'right' : 'left'} and set your heels together.`,
      'Straighten your knees and keep them together.',
      'Point your hips at the side wall.',
      'Lift your chest and turn your upper body slightly toward the camera.',
      'Let the near arm hang slightly back and the far arm slightly forward.',
      'Make soft fists.',
      'Keep your head in line with your body.',
      'Tighten your stomach and hold still.',
    ],
    coachOnly: [
      'How much of the rear shoulder shows [S6].',
      'Stomach in, chest out, shoulders back [S3].',
      'Even tension without single-muscle flexing [S6].',
      'An upright torso, not leaning [S6].',
    ],
  };
}

const relaxedBack: PoseSpec = {
  id: 'relaxedBack',
  name: 'Relaxed back',
  facing: 'back',
  description:
    'Back to the judges with the heels close and the knees unbent, arms down at the sides with the elbows slightly bent, lats spread [S3][S6].',
  checks: [
    ...eachSide('abduction', {
      band: band(35, 25, 55),
      weight: 1.5,
      low: cue('Spread your lats, arms away.', 'S6'),
      high: cue('Bring your arms in a little.', 'S6'),
    }),
    check('elbowSpan', {
      band: band(1.75, 1.6, 2.1),
      weight: 1,
      low: cue('Spread your lats, arms away.', 'S6'),
      high: cue('Bring your arms in a little.', 'S6'),
    }),
    ...eachSide('elbowFlex', {
      band: band(47, 25, 60),
      weight: 1.5,
      low: cue('Soften your elbows a little.', 'S3'),
      high: cue('Let your arms hang naturally.', 'ESTIMATE'),
    }),
    ...eachSide('forearmAngle', { band: band(168, 150, 180), weight: 1, low: cue('Let your arms hang naturally.', 'ESTIMATE') }),
    ...eachSide('wristHeight', {
      band: band(-0.8, -0.95, -0.65),
      weight: 0.5,
      low: cue('Soften your elbows a little.', 'ESTIMATE'),
      high: cue('Let your arms hang naturally.', 'ESTIMATE'),
    }),
    // Arms hang at the sides [S3], so the hands stay in view from behind: the reference wrists read 0.79..0.99.
    // This keeps a back lat spread, whose hands hide on the waist, from passing as a relaxed back.
    ...eachSide('wristVis', { band: band(0.9, 0.5, 1), weight: 1.5, low: cue('Let your arms hang naturally.', 'S3') }),
    check('stanceRatio', { band: band(0.4, 0, 0.65), weight: 1, high: cue('Bring your heels closer together.', 'S3') }),
    ...eachSide('kneeFlex', { band: band(2, 0, 15), weight: 0.5, high: cue('Straighten your legs.', 'S3') }),
    check('twist', {
      band: band(0, -10, 10),
      weight: 1,
      low: cue('Square your shoulders to the back wall.', 'S3'),
      high: cue('Square your shoulders to the back wall.', 'S3'),
    }),
    check('headYaw', {
      band: band(0, -0.15, 0.15),
      weight: 0.5,
      low: cue('Head straight, chin level.', 'S3'),
      high: cue('Head straight, chin level.', 'S3'),
    }),
    check('shrug', { band: atLeast(1, 0.8), weight: 1, low: cue('Drop your shoulders down.', 'S14') }),
  ],
  buildUp: [
    'Turn your back to the camera with your heels close and level.',
    'Straighten your knees and tense your hamstrings lightly.',
    'Keep your hips square to the back wall.',
    'Lift your chest and keep your back tall.',
    'Spread your lats so your arms hang away from your sides.',
    'Make soft fists.',
    'Keep your head straight with your chin level.',
    'Widen your back a little more and hold still.',
  ],
  coachOnly: [
    'Lat spread width beyond what the elbow span shows [S6][S8].',
    'Stomach in, chest out, shoulders back [S3].',
    'Glute and hamstring tension.',
    'Feet level, neither one ahead of the other [S8].',
  ],
};

const frontDoubleBiceps: PoseSpec = {
  id: 'frontDoubleBiceps',
  name: 'Front double biceps',
  facing: 'front',
  description:
    'Face the judges, raise both arms to shoulder level and bend the elbows, fists clenched and turned down to flex the biceps and forearms [S1].',
  checks: [
    ...eachSide('elbowHeight', {
      band: band(0.05, -0.1, 0.2),
      weight: 2,
      low: cue('Raise your elbows to shoulder height.', 'S10'),
      high: cue('Lower your elbows a little.', 'S10'),
    }),
    ...eachSide('abduction', {
      band: band(97, 80, 112),
      weight: 2,
      low: cue('Raise your elbows to shoulder height.', 'S1'),
      high: cue('Lower your elbows a little.', 'S10'),
    }),
    ...eachSide('wristVsNose', { band: atLeast(0.1, -0.05), weight: 1, low: cue('Bring your fists up to your ears.', 'S6') }),
    ...eachSide('forearmAngle', {
      band: band(30, 12, 50),
      weight: 1,
      low: cue('Curl your fists toward your head.', 'S13'),
      high: cue('Bring your fists up to your ears.', 'S10'),
    }),
    ...eachSide('elbowFlex', {
      band: band(115, 97, 131),
      weight: 1,
      low: cue('Curl your fists toward your head.', 'S13'),
      high: cue('Ease your fists away from your head.', 'ESTIMATE'),
    }),
    check('elbowSpan', { band: atLeast(2.35, 2.15), weight: 1, low: cue('Spread your lats and elbows wide.', 'S6') }),
    check('stanceRatio', {
      band: band(0.95, 0.6, 1.4),
      weight: 1,
      low: cue('Set your feet about shoulder width.', 'S8'),
      high: cue('Bring your feet a little closer.', 'S10'),
    }),
    ...eachSide('kneeFlex', { band: band(10, 0, 30), weight: 0.5, high: cue('Bend your knees only slightly.', 'S6') }),
    check('twist', {
      band: band(0, -10, 10),
      weight: 1,
      low: cue('Square your shoulders to the camera.', 'S1'),
      high: cue('Square your shoulders to the camera.', 'S1'),
    }),
    check('headYaw', {
      band: band(0, -0.15, 0.15),
      weight: 0.5,
      low: cue('Look straight at the camera.', 'S14'),
      high: cue('Look straight at the camera.', 'S14'),
    }),
    // The spec's 0.80 flags the reference athletes: raised arms lift the shoulder landmarks, and the two photos
    // with a same-athlete relaxed front read 0.78 and 0.81. The band is that range widened by 0.10.
    check('shrug', { band: atLeast(0.8, 0.68), weight: 1, low: cue('Drop your shoulders, stay wide.', 'S13') }),
  ],
  buildUp: [
    'Set your feet about shoulder width, toes turned out.',
    'Bend your knees slightly and flex your quads and calves.',
    'Point your hips straight at the camera.',
    'Lift your chest and tighten your waist.',
    'Spread your lats, then raise your elbows to shoulder height.',
    'Close your fists and curl them toward your head.',
    'Look at the camera and smile.',
    'Squeeze both biceps and hold.',
  ],
  coachOnly: [
    'Biceps peak and contraction, and the small wrist turn that fills the gap between biceps and delt [S10].',
    'Lats spread forward [S6].',
    'Elbows about 10 to 20 degrees in front of the body [S12].',
    'Flexed quads and calves [S10][S14].',
    'The abdominal style: sternum lifted with the abs stretched, or crunched down with the abs flexed [S10].',
    'Chest up, not leaning forward [S13].',
    'A relaxed face with a smile and shallow breathing [S12][S14].',
  ],
};

const frontLatSpread: PoseSpec = {
  id: 'frontLatSpread',
  name: 'Front lat spread',
  facing: 'front',
  description:
    'Face the judges with the feet in line and close, open hands or fists on the lower waist, and spread the lats; pulling up the trunks is forbidden [S1][S5].',
  checks: [
    ...eachSide('elbowFlex', {
      band: band(102, 89, 116),
      weight: 2,
      low: cue('Put your hands on your lower waist.', 'S1'),
      high: cue('Put your hands on your lower waist.', 'S1'),
    }),
    ...eachSide('forearmAngle', {
      band: band(128, 115, 141),
      weight: 1,
      low: cue('Put your hands on your lower waist.', 'S1'),
      high: cue('Put your hands on your lower waist.', 'S1'),
    }),
    ...eachSide('wristHeight', {
      band: band(-0.57, -0.7, -0.44),
      weight: 1,
      low: cue('Put your hands on your lower waist.', 'S1'),
      high: cue('Put your hands on your lower waist.', 'S1'),
    }),
    check('wristGap', {
      band: band(0.79, 0.65, 0.95),
      weight: 1,
      low: cue('Put your hands on your lower waist.', 'S1'),
      high: cue('Put your hands on your lower waist.', 'S1'),
    }),
    ...eachSide('abduction', {
      band: band(51, 39, 63),
      weight: 1.5,
      low: cue('Spread your lats wider.', 'S6'),
      high: cue('Put your hands on your lower waist.', 'S1'),
    }),
    ...eachSide('elbowHeight', {
      band: band(-0.3, -0.41, -0.19),
      weight: 1,
      low: cue('Spread your lats wider.', 'S6'),
      high: cue('Put your hands on your lower waist.', 'S1'),
    }),
    check('elbowSpan', { band: atLeast(2, 1.85), weight: 2, low: cue('Spread your lats wider.', 'S6') }),
    // The spec's band starts at 0.30, but the rule allows feet in line "up to 15 cm apart" [S1], so touching
    // feet pass.
    check('stanceRatio', { band: band(0.5, 0, 0.85), weight: 1, high: cue('Set your feet close and level.', 'S1') }),
    ...eachSide('kneeFlex', { band: band(5, 0, 20), weight: 0.5, high: cue('Keep your knees almost straight.', 'ESTIMATE') }),
    check('twist', {
      band: band(0, -10, 10),
      weight: 1,
      low: cue('Square your shoulders to the camera.', 'S1'),
      high: cue('Square your shoulders to the camera.', 'S1'),
    }),
    check('headYaw', {
      band: band(0, -0.15, 0.15),
      weight: 0.5,
      low: cue('Look straight at the camera.', 'S14'),
      high: cue('Look straight at the camera.', 'S14'),
    }),
    check('shrug', { band: atLeast(1, 0.8), weight: 1, low: cue('Drop your shoulders down.', 'S6') }),
  ],
  buildUp: [
    'Set your feet level and close, toes turned out.',
    'Flex your quads with your knees almost straight.',
    'Point your hips straight at the camera.',
    'Lift your chest and pull your shoulders down.',
    'Bring your elbows forward and out to the sides.',
    'Set your fists on your lower waist, thumbs behind.',
    'Look at the camera and smile.',
    'Press into your waist and spread your lats wide.',
  ],
  coachOnly: [
    'Real lat expansion, with the shoulders pulled down and forward [S13][S6].',
    'Elbows forward of the body [S15].',
    'Chest held high and the rib cage lifted [S6][S8].',
    'Pecs flexed [S12].',
    'A tight waist and flexed quads [S13].',
    'Upright, neither leaning back nor hunching forward [S6][S13].',
    'Hands never pull up the trunks [S1][S5].',
  ],
};

const sideChestChecks: readonly Check[] = [
  check(
    'elbowFlex',
    {
      band: band(90, 70, 115),
      weight: 2,
      low: cue('Bend your front arm to ninety degrees.', 'S1'),
      high: cue('Bend your front arm to ninety degrees.', 'S1'),
    },
    'near',
  ),
  check(
    'forearmAngle',
    {
      band: band(100, 83, 121),
      weight: 1,
      low: cue('Bend your front arm across your body.', 'S1'),
      high: cue('Bend your front arm across your body.', 'S1'),
    },
    'near',
  ),
  check(
    'wristHeight',
    {
      band: band(-0.62, -0.8, -0.47),
      weight: 1,
      low: cue('Bend your front arm across your body.', 'S1'),
      high: cue('Bend your front arm across your body.', 'S1'),
    },
    'near',
  ),
  check('wristGap', { band: atMost(0.27, 0.4), weight: 1.5, high: cue('Grab your front wrist.', 'S1') }),
  check('abduction', { band: band(5, 0, 20), weight: 1, high: cue('Keep your upper arm against your side.', 'ESTIMATE') }, 'near'),
  check(
    'kneeFlex',
    {
      band: band(64, 50, 77),
      weight: 1.5,
      low: cue('Bend your front knee more.', 'S1'),
      high: cue('Bend your front knee a little less.', 'ESTIMATE'),
    },
    'near',
  ),
  check(
    'kneeFlex',
    {
      band: band(22, 5, 45),
      weight: 1,
      low: cue('Bend your back knee slightly.', 'S6'),
      high: cue('Straighten your back knee a little.', 'ESTIMATE'),
    },
    'far',
  ),
  check('heelLift', { band: atLeast(0.6, 0.3), weight: 1.5, low: cue('Rise onto your front toes.', 'S1') }, 'near'),
  check('heelLift', { band: atMost(0.1, 0.25), weight: 0.5, high: cue('Keep your back foot flat.', 'ESTIMATE') }, 'far'),
  check('stagger', { band: atMost(0.05, 0.18), weight: 1, high: cue('Squeeze your thighs together.', 'S12') }),
  check('twist', {
    band: band(20, 10, 40),
    weight: 1,
    low: cue('Turn your chest toward the camera.', 'S6'),
    high: cue('Turn your shoulders back to the side.', 'ESTIMATE'),
  }),
  check('shoulderWidth', {
    band: band(0.53, 0.42, 0.65),
    weight: 1,
    low: cue('Turn your chest toward the camera.', 'S6'),
    high: cue('Turn your shoulders back to the side.', 'ESTIMATE'),
  }),
  check('headYaw', {
    band: band(0, -0.3, 0.3),
    weight: 0.5,
    low: cue('Look at the camera and smile.', 'S14'),
    high: cue('Look at the camera and smile.', 'S14'),
  }),
  check('shrug', { band: atLeast(1, 0.8), weight: 1, low: cue('Drop your shoulders down.', 'S13') }),
];

const backDoubleBiceps: PoseSpec = {
  id: 'backDoubleBiceps',
  name: 'Back double biceps',
  facing: 'back',
  description:
    'Back to the judges with the arms and wrists as in the front double biceps and one foot back on its toes, then flex the arms, shoulders, back, thighs and calves [S1].',
  checks: [
    ...eachSide('elbowHeight', {
      band: band(0.06, -0.07, 0.2),
      weight: 2,
      low: cue('Lift your elbows above your shoulders.', 'S16'),
      high: cue('Lower your elbows a little.', 'ESTIMATE'),
    }),
    ...eachSide('abduction', {
      band: band(96, 85, 110),
      weight: 2,
      low: cue('Lift your elbows above your shoulders.', 'S1'),
      high: cue('Lower your elbows a little.', 'ESTIMATE'),
    }),
    ...eachSide('wristHeight', {
      band: band(0.43, 0.29, 0.58),
      weight: 1,
      low: cue('Bring your fists up to your ears.', 'S6'),
      high: cue('Lower your fists to ear level.', 'ESTIMATE'),
    }),
    ...eachSide('forearmAngle', {
      band: band(28, 3, 53),
      weight: 1,
      low: cue('Curl your fists toward your head.', 'ESTIMATE'),
      high: cue('Bring your fists up to your ears.', 'S11'),
    }),
    ...eachSide('elbowFlex', {
      band: band(111, 84, 132),
      weight: 1,
      low: cue('Curl your fists toward your head.', 'ESTIMATE'),
      high: cue('Ease your fists away from your head.', 'ESTIMATE'),
    }),
    check('elbowSpan', { band: atLeast(2.35, 2.1), weight: 1, low: cue('Keep your back wide and open.', 'S16') }),
    check('stanceRatio', {
      band: band(1.1, 0.8, 1.4),
      weight: 1,
      low: cue('Step one foot back, heel up.', 'S1'),
      high: cue('Shorten your back step.', 'S6'),
    }),
    ...eachSide('kneeFlex', { band: band(17, 0, 43), weight: 0.5, high: cue('Shorten your back step.', 'S6') }),
    check('twist', {
      band: band(0, -10, 10),
      weight: 1,
      low: cue('Square your shoulders to the back wall.', 'S1'),
      high: cue('Square your shoulders to the back wall.', 'S1'),
    }),
    check('shrug', { band: atLeast(1, 0.8), weight: 1, low: cue('Drop your shoulders, spread your back.', 'S13') }),
  ],
  buildUp: [
    'Turn your back to the camera and step one foot back onto its toes.',
    'Bend your knees slightly and flex your hamstrings and calves.',
    'Keep your hips square to the back wall.',
    'Lift your chest and lean back only slightly.',
    'Raise your elbows just above shoulder height.',
    'Make fists and bring them up to ear level.',
    'Turn your head to one side.',
    'Flex your arms and spread your whole back.',
  ],
  coachOnly: [
    'Back width and density, the spread of the lats [S11].',
    'Wrist position on the biceps [S21].',
    // The reference photos read head_yaw -0.02..+0.08 from behind, so the camera cannot check the turn.
    'Head turned to one side [S11][S15].',
    'One foot back on its toes with the calf flexed [S1][S6].',
    'Shoulder blades kept wide, not pinched [S16][S12].',
    'Only a slight lean back [S13][S16].',
    'Flexed hamstrings, glutes and calves, with the core braced [S13][S15].',
  ],
};

const backLatSpread: PoseSpec = {
  id: 'backLatSpread',
  name: 'Back lat spread',
  facing: 'back',
  description:
    'Back to the judges with the hands on the waist and the elbows wide, feet in line and close, then spread the lats as wide as possible; pulling up the trunks is forbidden [S1][S5].',
  checks: [
    check('elbowSpan', { band: atLeast(1.77, 1.65), weight: 2, low: cue('Spread your lats wider.', 'S1') }),
    ...eachSide('elbowHeight', {
      band: band(-0.34, -0.45, -0.23),
      weight: 1.5,
      low: cue('Put your hands on your waist.', 'S1'),
      high: cue('Put your hands on your waist.', 'S1'),
    }),
    ...eachSide('abduction', {
      band: band(42, 28, 54),
      weight: 1.5,
      low: cue('Drive your elbows forward and wide.', 'S13'),
      high: cue('Put your hands on your waist.', 'ESTIMATE'),
    }),
    // Hands on the waist hide from behind: the reference wrists read 0.09..0.26. Where a wrist does show, the
    // elbow and forearm still have to put it on the waist. The band ends at the app's hidden cut, MIN_VISIBILITY
    // (tracking gate: the figure's hidden wrists read 0.44..0.57).
    ...eachSide('wristVis', { band: band(0.15, 0, MIN_VISIBILITY), weight: 1, high: cue('Put your hands on your waist.', 'S1') }),
    ...eachSide('elbowFlex', {
      band: band(97, 79, 113),
      weight: 1,
      low: cue('Put your hands on your waist.', 'S1'),
      high: cue('Put your hands on your waist.', 'S1'),
    }),
    ...eachSide('forearmAngle', {
      band: band(125, 110, 140),
      weight: 1,
      low: cue('Put your hands on your waist.', 'S1'),
      high: cue('Put your hands on your waist.', 'S1'),
    }),
    // The spec's band starts at 0.40, but the rule allows feet in line "up to 15 cm apart" [S1].
    check('stanceRatio', { band: band(0.7, 0, 0.9), weight: 1, high: cue('Set your feet close and level.', 'S1') }),
    ...eachSide('kneeFlex', { band: band(12, 0, 35), weight: 0.5, high: cue('Straighten your legs a little.', 'ESTIMATE') }),
    check('twist', {
      band: band(0, -10, 10),
      weight: 1,
      low: cue('Square your shoulders to the back wall.', 'S1'),
      high: cue('Square your shoulders to the back wall.', 'S1'),
    }),
    check('shrug', { band: atLeast(1, 0.8), weight: 1, low: cue('Drop your shoulders down.', 'S6') }),
  ],
  buildUp: [
    'Keep your back to the camera with your feet close and level.',
    'Flex the calf you did not show in the double biceps.',
    'Keep your hips square to the back wall.',
    'Push your chest forward and drop your shoulders.',
    'Bring your elbows forward and wide.',
    'Set your fists on your waist.',
    'Turn your head to one side, or keep it straight.',
    'Roll your shoulder blades out and spread your lats.',
  ],
  coachOnly: [
    'Lat width, with the shoulder blades rolled forward and outward [S20].',
    'Elbows driven forward [S13][S6].',
    'Chest lifted, not caved [S14].',
    'The calf opposite to the one shown in the back double biceps, flexed [S1].',
    'Glute, hamstring and calf tension [S13].',
    'Hands never pull up the trunks [S1][S5].',
  ],
};

const sideTricepsChecks: readonly Check[] = [
  check('elbowFlex', { band: band(10, 0, 23), weight: 2, high: cue('Straighten your front arm fully.', 'S6') }, 'near'),
  check('abduction', { band: band(9, 0, 22), weight: 1.5, high: cue('Keep your arm tight to your side.', 'S13') }, 'near'),
  check('forearmAngle', { band: band(175, 160, 180), weight: 1, low: cue('Keep your arm tight to your side.', 'S8') }, 'near'),
  check(
    'wristHeight',
    {
      band: band(-1.03, -1.15, -0.9),
      weight: 1,
      low: cue('Keep your arm tight to your side.', 'ESTIMATE'),
      high: cue('Straighten your front arm fully.', 'ESTIMATE'),
    },
    'near',
  ),
  // The rear hand hides behind the back. The band ends at the app's hidden cut, MIN_VISIBILITY.
  check('wristVis', { band: band(0.02, 0, MIN_VISIBILITY), weight: 1.5, high: cue('Reach behind and grab your wrist.', 'S1') }, 'far'),
  check(
    'kneeFlex',
    {
      band: band(45, 20, 70),
      weight: 1,
      low: cue('Bend both knees slightly.', 'S1'),
      high: cue('Straighten your front knee a little.', 'ESTIMATE'),
    },
    'near',
  ),
  check(
    'kneeFlex',
    {
      band: band(50, 33, 67),
      weight: 1,
      low: cue('Bend both knees slightly.', 'S1'),
      high: cue('Straighten your back knee a little.', 'ESTIMATE'),
    },
    'far',
  ),
  // IFBB feet, which NPC and IFBB Pro athletes follow: the near foot flat and the far heel up [S1].
  check('heelLift', { band: atMost(0.07, 0.25), weight: 0.5, high: cue('Front foot flat, back heel up.', 'S1') }, 'near'),
  check('heelLift', { band: atLeast(0.68, 0.3), weight: 0.5, low: cue('Front foot flat, back heel up.', 'S1') }, 'far'),
  check('stagger', { band: band(0.3, 0, 0.6), weight: 0.5, high: cue('Press your legs together.', 'S12') }),
  check('twist', {
    band: band(20, 5, 45),
    weight: 1,
    low: cue('Twist your chest toward the camera.', 'S6'),
    high: cue('Turn your shoulders back to the side.', 'ESTIMATE'),
  }),
  check('shoulderWidth', {
    band: band(0.55, 0.42, 0.7),
    weight: 1,
    low: cue('Twist your chest toward the camera.', 'S6'),
    high: cue('Turn your shoulders back to the side.', 'ESTIMATE'),
  }),
  check('headYaw', {
    band: band(0, -0.3, 0.3),
    weight: 0.5,
    low: cue('Look at the camera and smile.', 'S14'),
    high: cue('Look at the camera and smile.', 'S14'),
  }),
];

/** Side chest and side triceps: the athlete may show either side [S1]; the left side is the default. */
function sided(spec: Omit<PoseSpec, 'facing'>): readonly [PoseSpec, PoseSpec] {
  return [
    { ...spec, name: `${spec.name}, left side`, facing: 'leftSide' },
    { ...spec, name: `${spec.name}, right side`, facing: 'rightSide' },
  ];
}

const sideChest = sided({
  id: 'sideChest',
  name: 'Side chest',
  description:
    'Side to the judges, the near arm bent at a right angle with the fist clenched and the other hand gripping its wrist, the near knee bent with the foot on its toes [S1].',
  checks: sideChestChecks,
  buildUp: [
    'Turn your side to the camera and rise onto your front toes.',
    'Bend both knees and press your thighs together.',
    'Keep your hips facing the side wall.',
    'Lift your rib cage and turn your chest toward the camera.',
    'Bend your front arm to a right angle across your body.',
    'Make a fist and grab that wrist with your back hand.',
    'Look at the camera and smile.',
    'Press your front arm up and squeeze your chest and calf.',
  ],
  coachOnly: [
    'Chest expansion and the arch of the rib cage [S1].',
    'The upward press of the front arm and the biceps contraction [S1][S6].',
    'The flexed far pec [S6][S15].',
    'Calf tension, with the front hamstring soft and pressed on the rear leg [S12].',
    'The rear arm flexed too [S13].',
  ],
});

const sideTriceps = sided({
  id: 'sideTriceps',
  name: 'Side triceps',
  description:
    'Side to the judges with both arms behind the back, the rear hand gripping the front wrist, the front arm straight; the near foot flat and the far foot on its toes [S1].',
  checks: sideTricepsChecks,
  buildUp: [
    'Turn your side to the camera, front foot flat and back heel up.',
    'Bend both knees and press your legs together.',
    'Keep your hips facing the side wall.',
    'Lift your chest and twist it slightly toward the camera.',
    'Straighten your front arm down along your side.',
    'Reach behind your back and grab your front wrist.',
    'Look at the camera and smile.',
    'Press your arm into your hand and tighten your stomach.',
  ],
  coachOnly: [
    'Triceps contraction from pressing the front arm into the rear hand [S12].',
    'No over-pressing, which flattens the arm [S13].',
    'Chest raised and stomach pulled in [S14].',
    'The breathing style: air-filled lungs or exhaled [S6][S8].',
    'Chest up, not crunching forward [S13].',
  ],
});

const absAndThighs: PoseSpec = {
  id: 'absAndThighs',
  name: 'Abdominals and thighs',
  facing: 'front',
  description:
    'Face the judges with both hands behind the head and one leg forward, then crunch the abs slightly forward and flex the front thigh [S1].',
  // Hands behind the head hide the wrists, so the arms are scored from the shoulders and elbows. No twist check:
  // overhead arms pull the shoulder landmarks in (shoulder width 0.54..0.60), which the 2D twist model reads as
  // a turn of 7..19 degrees on the reference photos.
  checks: [
    check('elbowSpan', { band: atLeast(1.55, 1.3), weight: 2, low: cue('Open your elbows wide.', 'S6') }),
    ...eachSide('abduction', { band: band(155, 130, 180), weight: 1.5, low: cue('Lift your elbows higher.', 'ESTIMATE') }),
    ...eachSide('elbowHeight', { band: atLeast(0.35, 0.2), weight: 1.5, low: cue('Lift your elbows higher.', 'ESTIMATE') }),
    // The app calls a landmark hidden below MIN_VISIBILITY everywhere, so the hands-behind-head check uses the same
    // cut; the reference photos read 0.00..0.02, well inside it.
    ...eachSide('wristVis', { band: band(0.02, 0, MIN_VISIBILITY), weight: 1, high: cue('Put both hands behind your head.', 'S1') }),
    check('stanceRatio', {
      band: band(0.35, 0.2, 1.2),
      weight: 0.5,
      low: cue('Step one leg forward.', 'S1'),
      high: cue('Bring your feet a little closer.', 'ESTIMATE'),
    }),
    ...eachSide('kneeFlex', { band: band(10, 0, 32), weight: 0.5, high: cue('Straighten your legs a little.', 'ESTIMATE') }),
    check('headYaw', {
      band: band(0, -0.15, 0.15),
      weight: 0.5,
      low: cue('Look straight at the camera.', 'S13'),
      high: cue('Look straight at the camera.', 'S13'),
    }),
  ],
  buildUp: [
    'Step one foot forward with the toe pointed.',
    'Flex the quad of your front leg.',
    'Point your hips straight at the camera.',
    'Breathe out and crunch your abs slightly forward.',
    'Lift your arms and open your elbows wide.',
    'Lock your fingers behind your head.',
    'Keep your head up and look at the camera.',
    'Squeeze your abs and front thigh together.',
  ],
  coachOnly: [
    'Abdominal contraction: breathe out fully and crunch without crushing the torso [S13].',
    'One leg forward, the front quad flexed and the rear leg held tight [S1][S13].',
    'Shoulders square to the camera [S1].',
    'Lat flare and serratus [S6][S12].',
    'Breath control, without gasping [S13].',
    'Head up, not pulled down by the hands [S13].',
  ],
};

const MOST_MUSCULAR_COACH = 'Full-body contraction: traps, delts, pecs, arms, abs and legs [S17][S6].';

const mostMuscularCrab: PoseSpec = {
  id: 'mostMuscular',
  name: 'Most muscular, crab',
  facing: 'front',
  description:
    'Face the judges, lean forward slightly and flex the whole upper body, arms curled in front with the fists a few inches apart [S6][S17].',
  checks: [
    check('wristGap', { band: atMost(0.16, 0.3), weight: 1.5, high: cue('Bring your fists closer together.', 'S17') }),
    ...eachSide('abduction', { band: band(7, 0, 30), weight: 1.5, high: cue('Bring your arms in front of you.', 'ESTIMATE') }),
    ...eachSide('elbowFlex', {
      band: band(90, 75, 110),
      weight: 1,
      low: cue('Bend your elbows in front of you.', 'ESTIMATE'),
      high: cue('Bend your elbows in front of you.', 'ESTIMATE'),
    }),
    ...eachSide('forearmAngle', {
      band: band(95, 81, 111),
      weight: 1,
      low: cue('Fists together in front of your abs.', 'ESTIMATE'),
      high: cue('Fists together in front of your abs.', 'ESTIMATE'),
    }),
    ...eachSide('wristHeight', {
      band: band(-0.75, -0.9, -0.6),
      weight: 1,
      low: cue('Fists together in front of your abs.', 'ESTIMATE'),
      high: cue('Fists together in front of your abs.', 'ESTIMATE'),
    }),
    check('elbowSpan', { band: atMost(1.16, 1.5), weight: 1, high: cue('Bring your arms in front of you.', 'ESTIMATE') }),
    check('stanceRatio', {
      band: band(0.8, 0.4, 1.2),
      weight: 0.5,
      low: cue('Step one foot slightly forward.', 'ESTIMATE'),
      high: cue('Bring your feet a little closer.', 'ESTIMATE'),
    }),
    ...eachSide('kneeFlex', { band: band(7, 0, 20), weight: 0.5, high: cue('Straighten your legs a little.', 'ESTIMATE') }),
    check('headYaw', {
      band: band(0, -0.15, 0.15),
      weight: 0.5,
      low: cue('Look straight at the camera.', 'ESTIMATE'),
      high: cue('Look straight at the camera.', 'ESTIMATE'),
    }),
    check('shrug', { band: atLeast(1, 0.8), weight: 1, low: cue('Keep your shoulders down.', 'S12') }),
  ],
  buildUp: [
    'Step one foot slightly forward with your toes out.',
    'Point your knees out and flex your quads.',
    'Keep your hips square to the camera.',
    'Lean forward slightly from the waist.',
    'Bring your arms in front of you with your elbows bent.',
    'Make fists a few inches apart.',
    'Look at the camera.',
    'Flex your traps, chest, and arms all together.',
  ],
  coachOnly: [MOST_MUSCULAR_COACH, 'A forward lean that still shows the abs [S6][S13].', 'A tight midsection [S13].'],
};

const mostMuscularHandsOnHips: PoseSpec = {
  id: 'mostMuscular',
  name: 'Most muscular, hands on hips',
  facing: 'front',
  description:
    'Face the judges with the hands turned down on the hips and the elbows rotated forward, crunching the abs slightly [S6].',
  checks: [
    check('wristGap', {
      band: band(0.76, 0.6, 0.95),
      weight: 1.5,
      low: cue('Set your hands on your hips.', 'S6'),
      high: cue('Set your hands on your hips.', 'S6'),
    }),
    ...eachSide('abduction', {
      band: band(41, 30, 55),
      weight: 1.5,
      low: cue('Set your hands on your hips.', 'S6'),
      high: cue('Set your hands on your hips.', 'S6'),
    }),
    ...eachSide('elbowFlex', {
      band: band(87, 75, 100),
      weight: 1,
      low: cue('Set your hands on your hips.', 'S6'),
      high: cue('Set your hands on your hips.', 'S6'),
    }),
    ...eachSide('forearmAngle', {
      band: band(135, 121, 149),
      weight: 1,
      low: cue('Set your hands on your hips.', 'S6'),
      high: cue('Set your hands on your hips.', 'S6'),
    }),
    ...eachSide('wristHeight', {
      band: band(-0.75, -0.85, -0.6),
      weight: 1,
      low: cue('Set your hands on your hips.', 'S6'),
      high: cue('Set your hands on your hips.', 'S6'),
    }),
    check('elbowSpan', {
      band: band(1.88, 1.7, 2),
      weight: 1,
      low: cue('Set your hands on your hips.', 'S6'),
      high: cue('Roll your elbows forward.', 'S6'),
    }),
    // The spec's band starts at 0.10, but "legs together" is one of its stances [S17].
    check('stanceRatio', { band: band(0.25, 0, 0.8), weight: 0.5, high: cue('Bring your feet a little closer.', 'ESTIMATE') }),
    ...eachSide('kneeFlex', { band: band(11, 0, 25), weight: 0.5, high: cue('Straighten your legs a little.', 'ESTIMATE') }),
    check('headYaw', {
      band: band(0, -0.15, 0.15),
      weight: 0.5,
      low: cue('Look straight at the camera.', 'ESTIMATE'),
      high: cue('Look straight at the camera.', 'ESTIMATE'),
    }),
    check('shrug', { band: atLeast(1, 0.8), weight: 1, low: cue('Keep your shoulders down.', 'S12') }),
  ],
  buildUp: [
    'Set your feet close, or one foot slightly forward.',
    'Point your knees out slightly and flex your quads.',
    'Keep your hips square to the camera.',
    'Lean forward slightly and crunch your abs.',
    'Rotate your elbows as far forward as you can.',
    'Turn your hands down and press them on your hips.',
    'Look at the camera.',
    'Flex your traps, chest, arms, and abs together.',
  ],
  coachOnly: [MOST_MUSCULAR_COACH, 'Elbows rotated forward [S6].', 'A slight forward lean crunching the abs [S6].'],
};

const mostMuscularHandsInFront: PoseSpec = {
  id: 'mostMuscular',
  name: 'Most muscular, hands in front',
  facing: 'front',
  description:
    'Face the judges with the hands together in front of the waist, gripping a wrist or pressing the fists together, and flex everything [S17].',
  checks: [
    // The hands together in front are what set this variant apart from a relaxed front.
    check('wristGap', { band: atMost(0.1, 0.2), weight: 3, high: cue('Press your fists together in front.', 'S17') }),
    ...eachSide('abduction', { band: band(15, 0, 35), weight: 1.5, high: cue('Bring your arms in front of you.', 'ESTIMATE') }),
    ...eachSide('elbowFlex', {
      band: band(45, 20, 70),
      weight: 1,
      low: cue('Bend your elbows in front of you.', 'ESTIMATE'),
      high: cue('Lower your hands to your waist.', 'ESTIMATE'),
    }),
    ...eachSide('forearmAngle', { band: band(160, 140, 180), weight: 1, low: cue('Lower your hands to your waist.', 'ESTIMATE') }),
    ...eachSide('wristHeight', {
      band: band(-0.75, -0.95, -0.6),
      weight: 1,
      low: cue('Hands in front of your waist.', 'ESTIMATE'),
      high: cue('Hands in front of your waist.', 'ESTIMATE'),
    }),
    check('elbowSpan', { band: atMost(1.2, 1.4), weight: 1.5, high: cue('Bring your arms in front of you.', 'ESTIMATE') }),
    check('stanceRatio', { band: band(0.4, 0, 0.8), weight: 0.5, high: cue('Bring your feet a little closer.', 'ESTIMATE') }),
    ...eachSide('kneeFlex', {
      band: band(10, 5, 15),
      weight: 0.5,
      low: cue('Flex your legs, knees out.', 'S17'),
      high: cue('Straighten your legs a little.', 'ESTIMATE'),
    }),
    check('headYaw', {
      band: band(0, -0.15, 0.15),
      weight: 0.5,
      low: cue('Look straight at the camera.', 'ESTIMATE'),
      high: cue('Look straight at the camera.', 'ESTIMATE'),
    }),
    check('shrug', { band: atLeast(1, 0.8), weight: 1, low: cue('Keep your shoulders down.', 'S12') }),
  ],
  buildUp: [
    'Set your feet fairly close, toes out.',
    'Point your knees out slightly and flex your quads.',
    'Keep your hips square to the camera.',
    'Stand tall with your chest up.',
    'Bring your arms down in front of your waist.',
    'Grip one wrist, or press your fists together.',
    'Look at the camera.',
    'Pull or push your hands and flex everything.',
  ],
  coachOnly: [MOST_MUSCULAR_COACH, 'Hands pulling apart against a wrist grip, or pushing together [S17].', 'A tight midsection [S13].'],
};

/** Every way an athlete may answer a pose call. The first variant is the judges' default and the one taught. */
export const POSE_SPECS: { readonly [P in PoseId]: readonly [PoseSpec, ...PoseSpec[]] } = {
  relaxedFront: [relaxedFront],
  quarterTurnLeftSide: [quarterTurn('left')],
  relaxedBack: [relaxedBack],
  quarterTurnRightSide: [quarterTurn('right')],
  frontDoubleBiceps: [frontDoubleBiceps],
  frontLatSpread: [frontLatSpread],
  sideChest,
  backDoubleBiceps: [backDoubleBiceps],
  backLatSpread: [backLatSpread],
  sideTriceps,
  absAndThighs: [absAndThighs],
  mostMuscular: [mostMuscularCrab, mostMuscularHandsOnHips, mostMuscularHandsInFront],
};
