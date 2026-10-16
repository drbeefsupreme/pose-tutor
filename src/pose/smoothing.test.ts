import { describe, expect, it } from 'vitest';
import { LANDMARK_COUNT, poseLandmarks, type PoseLandmarks } from './landmarks';
import { LandmarkSmoother } from './smoothing';

const FRAME_MS = 1000 / 30;

/** Every landmark at (x, 0.5) with the given visibility. */
function pose(x: number, visibility = 1): PoseLandmarks {
  return poseLandmarks(Array.from({ length: LANDMARK_COUNT }, () => ({ x, y: 0.5, visibility })), 1, 1);
}

describe('LandmarkSmoother', () => {
  it('turns a 0.02 jitter of a held pose into less than 0.003 after a second', () => {
    const smoother = new LandmarkSmoother();
    const xs: number[] = [];
    for (let f = 0; f < 60; f++) {
      const x = smoother.next(pose(f % 2 ? 0.51 : 0.49), f * FRAME_MS)?.points[0].x;
      if (f >= 30 && x !== undefined) xs.push(x);
    }
    expect(xs.length).toBe(30);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(0.003);
  });

  it('follows a sudden move of 0.2 to within 0.02 in 100 ms, where a plain filter at the still cutoff lags 0.11', () => {
    const smoother = new LandmarkSmoother();
    for (let f = 0; f < 30; f++) smoother.next(pose(0.5), f * FRAME_MS);
    let x: number | undefined;
    for (let f = 30; f < 33; f++) x = smoother.next(pose(0.7), f * FRAME_MS)?.points[0].x;
    expect(x).toBeGreaterThan(0.68);
    expect(x).toBeLessThan(0.7);
  });

  it('keeps a landmark visible through a one-frame visibility drop', () => {
    const smoother = new LandmarkSmoother();
    for (let f = 0; f < 30; f++) smoother.next(pose(0.5, 0.9), f * FRAME_MS);
    expect(smoother.next(pose(0.5, 0), 30 * FRAME_MS)?.points[0].visibility).toBeCloseTo(0.744, 3);
  });

  it('repeats the last pose through a gap of up to 300 ms, then reports none and starts fresh', () => {
    const smoother = new LandmarkSmoother();
    smoother.next(pose(0.5), 0);
    const last = smoother.next(pose(0.6), 33);
    expect([smoother.next(undefined, 333), smoother.next(undefined, 334)]).toEqual([last, undefined]);
    expect(smoother.next(pose(0.9), 367)?.points[0].x).toBe(0.9);
  });
});
