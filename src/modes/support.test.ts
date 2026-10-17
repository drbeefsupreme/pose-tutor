import { describe, expect, it } from 'vitest';
import { BODIES, landmarks, moved } from '../pose/fixtures';
import { calibrate } from '../pose/metrics';
import { captureStep, NEW_CAPTURE, type Capture } from './calibration';
import { EMPTY_QUEUE, enqueue, settle, type DebriefQueue } from './debrief';
import { coachSummary, photoRequest, type Hit } from './hit';
import type { CallResult } from './judge';
import { mergeBest, NO_BEST, parseBest } from './records';
import { DEFAULT_SETTINGS, parseSettings } from './settings';
import { body } from './testkit';

describe('calibration capture', () => {
  const relaxed = landmarks(BODIES.relaxedFront);

  it('captures after a steady stretch of relaxed front frames', () => {
    let capture: Capture = NEW_CAPTURE;
    for (let t = 0; t < 1500; t += 100) {
      const step = captureStep(capture, relaxed, t);
      if (step.kind !== 'waiting') throw new Error(`captured early at ${t} ms`);
      capture = step.capture;
    }
    const done = captureStep(capture, relaxed, 1500);
    const expected = calibrate(relaxed);
    if (done.kind !== 'captured' || !expected) throw new Error('no calibration after 1.5 s of relaxed front frames');
    for (const key of ['shoulderWidth', 'hipWidth', 'earDrop'] as const) expect(done.calibration[key]).toBeCloseTo(expected[key], 9);
  });

  it('starts over when the athlete leaves the frame or turns', () => {
    expect(captureStep({ since: 0, samples: [] }, relaxed, 1000)).toEqual(expect.objectContaining({ kind: 'waiting', progress: 1000 / 1500 }));
    const cropped = moved(BODIES.relaxedFront, { leftAnkle: [0.6, 1.05] });
    expect(captureStep({ since: 0, samples: [] }, landmarks(cropped), 1400)).toEqual({ kind: 'waiting', capture: NEW_CAPTURE, progress: 0 });
    expect(captureStep({ since: 0, samples: [] }, undefined, 1400)).toEqual({ kind: 'waiting', capture: NEW_CAPTURE, progress: 0 });
  });
});

describe('debrief queue', () => {
  it('runs one debrief, keeps only the newest waiting one, and starts it when the first settles', () => {
    let queue: DebriefQueue<string> = EMPTY_QUEUE;
    const a = enqueue(queue, 'a');
    expect(a.start).toBe('a');
    const b = enqueue(a.queue, 'b');
    expect([b.start, b.dropped]).toEqual([undefined, undefined]);
    const c = enqueue(b.queue, 'c');
    expect([c.start, c.dropped, c.queue]).toEqual([undefined, 'b', { running: 'a', waiting: 'c' }]);
    const next = settle(c.queue);
    expect([next.start, next.queue]).toEqual(['c', { running: 'c', waiting: undefined }]);
    queue = settle(next.queue).queue;
    expect(queue).toEqual(EMPTY_QUEUE);
  });
});

describe("Judge's calls personal best", () => {
  const calls: CallResult[] = [
    { pose: 'relaxedFront', outcome: 'hit', score: 90, timeMs: 2000 },
    { pose: 'quarterTurnLeftSide', outcome: 'timeout', score: 70, timeMs: 25_000 },
    { pose: 'relaxedBack', outcome: 'skipped', score: undefined, timeMs: 400 },
  ];

  it('records pose bests from any round and the round best from complete rounds only', () => {
    const partial = mergeBest(NO_BEST, { mode: 'judge', calls, complete: false, meanScore: 53 }, '2026-10-10T00:00:00Z');
    expect(partial.news).toEqual({ round: false, poses: ['relaxedFront', 'quarterTurnLeftSide'] });
    expect(partial.best.poses).toEqual({ relaxedFront: { score: 90, timeMs: 2000 }, quarterTurnLeftSide: { score: 70, timeMs: undefined } });

    const faster: CallResult = { pose: 'relaxedFront', outcome: 'hit', score: 88, timeMs: 1500 };
    const full = mergeBest(partial.best, { mode: 'judge', calls: [faster], complete: true, meanScore: 88 }, '2026-10-11T00:00:00Z');
    expect(full.news).toEqual({ round: true, poses: ['relaxedFront'] });
    expect(full.best.poses.relaxedFront).toEqual({ score: 90, timeMs: 1500 });
    expect(full.best.round).toEqual({ meanScore: 88, at: '2026-10-11T00:00:00Z' });
  });

  it('reads back what it stored and treats anything else as no record', () => {
    const { best } = mergeBest(NO_BEST, { mode: 'judge', calls, complete: true, meanScore: 53 }, '2026-10-10T00:00:00Z');
    expect(parseBest(JSON.stringify(best))).toEqual(best);
    expect(parseBest(null)).toEqual(NO_BEST);
    expect(parseBest('{oops')).toEqual(NO_BEST);
    expect(parseBest('{"round": {"meanScore": "high"}, "poses": {"relaxedFront": {"score": 1}, "flex": {"score": 2}}}')).toEqual({
      round: undefined,
      poses: { relaxedFront: { score: 1, timeMs: undefined } },
    });
  });
});

describe('settings', () => {
  it('fills defaults for missing or invalid values', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('{"debrief": false, "holdGoal": 20}')).toEqual({ ...DEFAULT_SETTINGS, debrief: false, holdGoal: 20 });
    expect(parseSettings('{"voiceCommands": "yes", "holdGoal": 15}')).toEqual(DEFAULT_SETTINGS);
  });
});

describe('hit records', () => {
  const sighting = body(91, ['Raise your elbows.']);
  const hit: Hit = {
    mode: 'hold',
    pose: 'frontDoubleBiceps',
    result: { score: 91.23, timeToHitMs: 4210, meanScore: 89.96, scoreSd: 1.234, goalMs: 10_000, resets: 1 },
    score: sighting.kind === 'body' ? sighting.score : undefined,
    landmarks: undefined,
  };

  it('saves the photo with the mean score, the cued faults and the mode', () => {
    expect(photoRequest(hit, 'data:image/jpeg;base64,AAAA')).toEqual({
      pose: 'frontDoubleBiceps',
      imageDataUrl: 'data:image/jpeg;base64,AAAA',
      score: 90,
      faults: [{ metric: 'elbowHeight', side: 'left', cue: 'Raise your elbows.' }],
      mode: 'hold',
    });
  });

  it('gives the coach the hold numbers and what the camera cannot see', () => {
    expect(coachSummary(hit)).toEqual(
      expect.objectContaining({
        pose: 'Front double biceps',
        meanScore: 90,
        steadinessSd: 1.2,
        secondsToHit: 4.2,
        holdSeconds: 10,
        holdRestarts: 1,
        faults: ['Raise your elbows.'],
      }),
    );
  });
});
