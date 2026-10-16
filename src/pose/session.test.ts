import { describe, expect, it } from 'vitest';
import { BODIES, landmarks, moved } from './fixtures';
import { advance, inView, startSession, type SessionEvent, type Sighting } from './session';
import { FACING_CHECKS } from './spec';
import type { CheckResult } from './types';

const ELBOWS = 'Raise your elbows to shoulder height.';
const FISTS = 'Bring your fists up to your ears.';

function body(score: number | undefined, ...cues: string[]): Sighting {
  const faults: CheckResult[] = cues.map((text) => ({
    check: { metric: 'elbowHeight', band: { target: 0, min: -1, max: 1 }, weight: 1, low: { text, source: 'TEST' } },
    value: -2,
    score: 0.2,
    miss: 'low',
  }));
  return { kind: 'body', score: { pose: 'frontDoubleBiceps', score, facing: 'front', results: faults, faults } };
}

const turnedAway: Sighting = {
  kind: 'body',
  score: {
    pose: 'frontDoubleBiceps',
    score: undefined,
    facing: 'back',
    results: [],
    faults: [{ check: FACING_CHECKS.front, value: 0.1, score: 0, miss: 'low' }],
  },
};

function run(script: readonly (readonly [number, Sighting])[]): SessionEvent[] {
  let state = startSession(0);
  const events: SessionEvent[] = [];
  for (const [now, sighting] of script) {
    const next = advance(state, sighting, now);
    state = next.state;
    events.push(...next.events);
  }
  return events;
}

const cue = (at: number, text: string): SessionEvent => ({ kind: 'cue', at, say: { text, interrupt: false } });

describe('cue scheduler', () => {
  it('runs a call from framing through one fixed fault and the hold to the hit, then stays quiet', () => {
    expect(
      run([
        [0, { kind: 'nobody' }],
        [500, body(40, ELBOWS, FISTS)],
        [2400, body(40, ELBOWS, FISTS)],
        [3000, body(60, FISTS)],
        [4800, body(60, FISTS)],
        [5200, body(60, FISTS)],
        [8000, body(88)],
        [9000, body(92)],
        [10000, body(88)],
        [11000, body(92)],
        [12000, body(95)],
      ]),
    ).toEqual([
      cue(0, 'Step in front of the camera.'),
      { kind: 'correcting', at: 500 },
      cue(2400, ELBOWS),
      { kind: 'praise', at: 4800, say: { text: 'Good.', interrupt: false } },
      cue(5200, FISTS),
      { kind: 'holding', at: 8000, say: { text: 'Hold it.', interrupt: true } },
      {
        kind: 'hit',
        at: 11000,
        say: { text: 'Pose hit. Relax.', interrupt: true },
        result: { score: 92, timeToHitMs: 8000, meanScore: 90, scoreSd: 2 },
      },
    ]);
  });

  it('says a persisting correction again only after it had time to be fixed', () => {
    expect(
      run([
        [0, body(50, ELBOWS)],
        [2400, body(50, ELBOWS)],
        [4000, body(50, ELBOWS)],
        [4899, body(50, ELBOWS)],
        [4900, body(50, ELBOWS)],
      ]),
    ).toEqual([{ kind: 'correcting', at: 0 }, cue(0, ELBOWS), cue(4900, ELBOWS)]);
  });

  it('keeps the last correction until it had time to be fixed, then moves to the new top fault', () => {
    expect(
      run([
        [0, body(50, ELBOWS)],
        [1000, body(50, FISTS, ELBOWS)],
        [4800, body(50, FISTS, ELBOWS)],
        [4900, body(50, FISTS, ELBOWS)],
      ]),
    ).toEqual([{ kind: 'correcting', at: 0 }, cue(0, ELBOWS), cue(4900, FISTS)]);
  });

  it('does not say a correction again within 4 s, even right after praise for fixing it', () => {
    expect(
      run([
        [0, body(50, ELBOWS)],
        [2400, body(60)],
        [2800, body(50, ELBOWS)],
        [3999, body(50, ELBOWS)],
        [4000, body(50, ELBOWS)],
      ]),
    ).toEqual([
      { kind: 'correcting', at: 0 },
      cue(0, ELBOWS),
      { kind: 'praise', at: 2400, say: { text: 'Good.', interrupt: false } },
      cue(4000, ELBOWS),
    ]);
  });

  it('asks the athlete to turn with the turn cue of the score, then to step back when cropped', () => {
    expect(
      run([
        [0, turnedAway],
        [2000, turnedAway],
        [4500, turnedAway],
        [5000, { kind: 'cropped' }],
        [6600, { kind: 'cropped' }],
        [7000, body(50, ELBOWS)],
        [10199, body(50, ELBOWS)],
        [10200, body(50, ELBOWS)],
      ]),
    ).toEqual([
      { kind: 'framing', at: 0, reason: 'facing' },
      cue(0, 'Turn to face the camera.'),
      cue(4500, 'Turn to face the camera.'),
      { kind: 'framing', at: 5000, reason: 'cropped' },
      cue(6600, 'Step back so your whole body is in view.'),
      { kind: 'correcting', at: 7000 },
      cue(10200, ELBOWS),
    ]);
  });

  it('asks the athlete to step back when the body faces right but too little is visible to score', () => {
    expect(run([[0, body(undefined)]])).toEqual([
      { kind: 'framing', at: 0, reason: 'unclear' },
      cue(0, 'Step back so your whole body is in view.'),
    ]);
  });

  it('keeps the hold through a dip to the slack, restarts it after a deeper dip, and stops corrections while held', () => {
    expect(
      run([
        [0, body(90, ELBOWS)],
        [1000, body(81, ELBOWS)],
        [2000, body(79, ELBOWS)],
        [2500, body(86)],
        [4000, body(86)],
        [5500, body(86)],
      ]),
    ).toEqual([
      { kind: 'holding', at: 0, say: { text: 'Hold it.', interrupt: true } },
      { kind: 'correcting', at: 2000 },
      cue(2000, ELBOWS),
      { kind: 'holding', at: 2500, say: { text: 'Hold it.', interrupt: true } },
      {
        kind: 'hit',
        at: 5500,
        say: { text: 'Pose hit. Relax.', interrupt: true },
        result: { score: 86, timeToHitMs: 2500, meanScore: 86, scoreSd: 0 },
      },
    ]);
  });

  it('ignores a single unscorable frame during the hold, but not a longer dropout', () => {
    expect(
      run([
        [0, body(90)],
        [1000, body(90)],
        [1100, turnedAway],
        [1200, body(90)],
        [3000, body(90)],
      ]),
    ).toEqual([
      { kind: 'holding', at: 0, say: { text: 'Hold it.', interrupt: true } },
      {
        kind: 'hit',
        at: 3000,
        say: { text: 'Pose hit. Relax.', interrupt: true },
        result: { score: 90, timeToHitMs: 0, meanScore: 90, scoreSd: 0 },
      },
    ]);
    expect(
      run([
        [0, body(90)],
        [1000, body(90)],
        [1400, turnedAway],
      ]).map((e) => e.kind),
    ).toEqual(['holding', 'framing', 'cue']);
  });

  it('keeps the hold through a 100 ms dip under the line and counts the dip in the mean and steadiness', () => {
    expect(
      run([
        [0, body(90)],
        [1000, body(90)],
        [1100, body(76)],
        [1200, body(90)],
        [3000, body(90)],
      ]),
    ).toEqual([
      { kind: 'holding', at: 0, say: { text: 'Hold it.', interrupt: true } },
      {
        kind: 'hit',
        at: 3000,
        say: { text: 'Pose hit. Relax.', interrupt: true },
        result: { score: 90, timeToHitMs: 0, meanScore: 87.2, scoreSd: expect.closeTo(5.6, 9) },
      },
    ]);
  });

  it('ends the hold after a 400 ms dip under the line', () => {
    expect(
      run([
        [0, body(90)],
        [1000, body(90)],
        [1100, body(76)],
        [1400, body(76)],
        [1500, body(90)],
      ]),
    ).toEqual([
      { kind: 'holding', at: 0, say: { text: 'Hold it.', interrupt: true } },
      { kind: 'correcting', at: 1400 },
      { kind: 'holding', at: 1500, say: { text: 'Hold it.', interrupt: true } },
    ]);
  });

  it('starts the hold with the session when the athlete is already in the pose on a frame older than the session', () => {
    let state = startSession(5000);
    const events: SessionEvent[] = [];
    for (const now of [4700, 5000, 6000, 7000, 7700, 8000]) {
      const next = advance(state, body(92), now);
      state = next.state;
      events.push(...next.events);
    }
    expect(events).toEqual([
      { kind: 'holding', at: 4700, say: { text: 'Hold it.', interrupt: true } },
      {
        kind: 'hit',
        at: 8000,
        say: { text: 'Pose hit. Relax.', interrupt: true },
        result: { score: 92, timeToHitMs: 0, meanScore: 92, scoreSd: 0 },
      },
    ]);
  });

  it('does not correct faults that cost almost nothing', () => {
    const minor: Sighting = {
      kind: 'body',
      score: {
        pose: 'frontDoubleBiceps',
        score: 70,
        facing: 'front',
        results: [],
        faults: [
          {
            check: { metric: 'elbowHeight', band: { target: 0, min: -1, max: 1 }, weight: 1, low: { text: ELBOWS, source: 'TEST' } },
            value: -1.01,
            score: 0.95,
            miss: 'low',
          },
        ],
      },
    };
    expect(run([[0, minor]])).toEqual([{ kind: 'correcting', at: 0 }]);
  });
});

describe('inView', () => {
  it('accepts a body inside the image and rejects one whose feet or fists leave it', () => {
    const fdb = BODIES.frontDoubleBiceps;
    expect([
      inView(landmarks(fdb)),
      inView(landmarks(moved(fdb, { leftFootIndex: [0.65, 1.02], rightFootIndex: [0.35, 1.02] }))),
      inView(landmarks(moved(fdb, { leftWrist: [0.705, -0.01] }))),
    ]).toEqual([true, false, false]);
  });
});
