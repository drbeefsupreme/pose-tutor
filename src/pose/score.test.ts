import { describe, expect, it } from 'vitest';
import { BODIES, landmarks, moved, REFS, type Body, type Framing, type RefPhoto } from './fixtures';
import { calibrate, classifyFacing, measure } from './metrics';
import { faultCue, scoreCall, scorePose } from './score';
import { POSE_SPECS } from './spec';
import type { Band, Metrics, PoseId, PoseSpec } from './types';

const calibration = calibrate(landmarks(BODIES.relaxedFront));

function call(id: PoseId, body: Body, framing?: Framing) {
  const lm = landmarks(body, framing);
  return scoreCall(id, measure(lm, { calibration }), classifyFacing(lm));
}

function spec(...bands: readonly [Band, number][]): PoseSpec {
  return {
    id: 'relaxedFront',
    name: 'test',
    facing: 'front',
    checks: bands.map(([band, weight], i) => ({
      metric: i === 0 ? 'stanceRatio' : 'wristGap',
      band,
      weight,
      low: { text: `low ${i}`, source: 'ESTIMATE' },
      high: { text: `high ${i}`, source: 'ESTIMATE' },
    })),
    buildUp: [],
    coachOnly: [],
    description: '',
  };
}

describe('scoreCall on hand-built poses', () => {
  it('scores each pose 100 for itself and below 60 for clearly different poses', () => {
    const cases: readonly [Body, PoseId, readonly PoseId[]][] = [
      [BODIES.relaxedFront, 'relaxedFront', ['frontDoubleBiceps', 'absAndThighs']],
      [BODIES.frontDoubleBiceps, 'frontDoubleBiceps', ['relaxedFront', 'frontLatSpread', 'absAndThighs', 'mostMuscular']],
      [BODIES.frontLatSpread, 'frontLatSpread', ['frontDoubleBiceps', 'absAndThighs']],
      [BODIES.backDoubleBiceps, 'backDoubleBiceps', ['relaxedBack', 'backLatSpread']],
      [BODIES.leftSide, 'quarterTurnLeftSide', ['sideChest']],
    ];
    for (const [body, own, others] of cases) {
      expect([own, call(own, body).result.score]).toEqual([own, 100]);
      for (const other of others) expect([own, other, (call(other, body).result.score ?? 0) < 60]).toEqual([own, other, true]);
    }
  });

  it('puts "Raise your elbows to shoulder height." first when both arms drop 30 degrees', () => {
    const { result } = call('frontDoubleBiceps', BODIES.frontDoubleBicepsElbowsDropped);
    expect(result.score).toBeCloseTo(55.93, 2);
    expect(result.faults.map((f) => faultCue(f)?.text)).toEqual([
      'Raise your elbows to shoulder height.',
      'Raise your elbows to shoulder height.',
      'Raise your elbows to shoulder height.',
      'Raise your elbows to shoulder height.',
      'Curl your fists toward your head.',
      'Curl your fists toward your head.',
      'Bring your fists up to your ears.',
      'Bring your fists up to your ears.',
      'Spread your lats and elbows wide.',
    ]);
  });

  it('gives a wrong facing no score and asks the athlete to turn first', () => {
    const back = measure(landmarks(BODIES.backDoubleBiceps), { calibration });
    const asFront = scorePose(POSE_SPECS.frontDoubleBiceps[0], back, 'back');
    expect([asFront.score, asFront.facing, faultCue(asFront.faults[0])]).toEqual([
      undefined,
      'back',
      { text: 'Turn to face the camera.', source: 'S1' },
    ]);
    expect(scorePose(POSE_SPECS.backDoubleBiceps[0], back, 'back').score).toBe(100);
  });

  it('defaults a side pose to the left side and the most muscular to the crab', () => {
    const sideChest = call('sideChest', BODIES.relaxedFront);
    expect([sideChest.variant.facing, faultCue(sideChest.result.faults[0])?.text]).toEqual([
      'leftSide',
      'Turn your left side to the camera.',
    ]);
    expect(call('sideChest', BODIES.leftSide).variant.name).toBe('Side chest, left side');
    expect(scoreCall('mostMuscular', {}, undefined).variant.name).toBe('Most muscular, crab');
  });

  it('does not count hidden wrists', () => {
    const wristsAtHips = moved(BODIES.frontDoubleBiceps, { leftWrist: [0.6, 0.6], rightWrist: [0.4, 0.6] });
    const hidden = call('frontDoubleBiceps', wristsAtHips, { hidden: ['leftWrist', 'rightWrist'] }).result;
    expect(hidden.score).toBe(100);
    expect(hidden.results.filter((r) => r.check.metric === 'wristVsNose').map((r) => r.value)).toEqual([undefined, undefined]);
    expect(call('frontDoubleBiceps', wristsAtHips).result.score).toBeCloseTo(79.49, 2);
  });

  it('gives no score when less than half the weight is measurable', () => {
    const arms: Framing = { hidden: ['leftElbow', 'rightElbow', 'leftWrist', 'rightWrist'] };
    expect(call('frontDoubleBiceps', BODIES.frontDoubleBiceps, arms).result.score).toBeUndefined();
    expect(call('frontDoubleBiceps', BODIES.frontDoubleBiceps, { hidden: ['leftWrist', 'rightWrist'] }).result.score).toBe(100);
  });
});

describe('scorePose', () => {
  const at = (band: Band, stanceRatio: number) => scorePose(spec([band, 1]), { stanceRatio }, 'front').score;

  it('falls from 100 at the band edge to 0 at half a band width outside it, as a smoothstep', () => {
    const band: Band = { target: 10, min: 0, max: 20 };
    expect([at(band, 20), at(band, 22.5), at(band, 25), at(band, 30), at(band, 35), at(band, -5)]).toEqual([
      100,
      84.375,
      50,
      0,
      0,
      50,
    ]);
  });

  it('mirrors the closed side of an open band to set its width', () => {
    const band: Band = { target: 2.35, min: 2.15, max: Infinity };
    expect([at(band, 9), at(band, 2.05), at(band, 1.95)]).toEqual([100, expect.closeTo(50, 9), expect.closeTo(0, 9)]);
  });

  it('orders faults by the points they cost, weight times the score lost', () => {
    const twoChecks = spec([{ target: 1, min: 0, max: 2 }, 2], [{ target: 1, min: 0, max: 2 }, 1]);
    const metrics: Metrics = { stanceRatio: 2.25, wristGap: 2.5 };
    const { faults, score } = scorePose(twoChecks, metrics, 'front');
    expect(faults.map((f) => faultCue(f)?.text)).toEqual(['high 1', 'high 0']);
    expect(score).toBeCloseTo((100 * 2 * 0.84375) / 3 + (100 * 0.5) / 3, 9);
  });
});

describe('the 26 reference photos', () => {
  const byId = new Map(REFS.map((r) => [r.id, r]));
  const scoreRef = (ref: RefPhoto, id: PoseId) => {
    const base = ref.calibration === undefined ? undefined : byId.get(ref.calibration);
    const metrics = measure(ref.landmarks, { calibration: base && calibrate(base.landmarks) });
    return scoreCall(id, metrics, classifyFacing(ref.landmarks));
  };
  const ids = Object.keys(POSE_SPECS).filter((id): id is PoseId => id in POSE_SPECS);

  it('score at least 80 for their own pose, apart from the one whose elbows and legs read as hidden', () => {
    const own = REFS.map((ref) => [ref.id, scoreRef(ref, ref.pose).result.score] as const);
    expect(own.filter(([, score]) => score === undefined).map(([id]) => id)).toEqual(['ifbb_bb_at']);
    for (const [id, score] of own) if (score !== undefined) expect([id, score >= 80]).toEqual([id, true]);
  });

  it('pick the variant the athlete shows', () => {
    const picked = REFS.filter((r) => POSE_SPECS[r.pose].length > 1).map((r) => [r.id, scoreRef(r, r.pose).variant.name]);
    expect(picked).toEqual([
      ['ifbb_bb_sc', 'Side chest, right side'],
      ['ifbb_cp_sc', 'Side chest, right side'],
      ['wnbf_sc', 'Side chest, left side'],
      ['ifbb_bb_st', 'Side triceps, right side'],
      ['ifbb_cp_st', 'Side triceps, right side'],
      ['wnbf_st', 'Side triceps, left side'],
      ['wnbf_mm_hips', 'Most muscular, hands on hips'],
      ['wnbf_mm_crab', 'Most muscular, crab'],
    ]);
  });

  it('also reach 60 only on poses that look alike in a 2D image', () => {
    const confused = REFS.map((ref) => [
      ref.id,
      ids.filter((id) => id !== ref.pose && (scoreRef(ref, id).result.score ?? 0) >= 60),
    ]);
    expect(confused.filter(([, others]) => others.length > 0)).toEqual([
      ['ifbb_bb_front', ['frontLatSpread']],
      ['ifbb_cp_front', ['frontLatSpread', 'mostMuscular']],
      ['ifbb_cp_qt_leftside', ['sideTriceps']],
      ['ifbb_cp_back', ['backLatSpread']],
      ['ifbb_bb_fls', ['relaxedFront', 'mostMuscular']],
      ['wnbf_fls', ['relaxedFront', 'mostMuscular']],
      ['ifbb_bb_bls', ['relaxedBack']],
      ['ifbb_cp_st', ['quarterTurnRightSide']],
      ['wnbf_st', ['quarterTurnLeftSide', 'sideChest']],
      ['wnbf_mm_hips', ['relaxedFront', 'frontLatSpread']],
    ]);
  });
});
