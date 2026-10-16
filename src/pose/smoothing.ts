import type { Landmark, PoseLandmarks } from './landmarks';

export interface SmoothingConfig {
  /** Cutoff in Hz while a landmark is still. Lower is steadier and lags more. */
  readonly minCutoff: number;
  /** Cutoff rise in Hz per image height per second of landmark speed. Higher follows fast moves with less lag. */
  readonly beta: number;
  /** Cutoff in Hz of the speed estimate. */
  readonly speedCutoff: number;
  /** A gap without a pose up to this long repeats the last pose; a longer gap ends the track. */
  readonly maxGapMs: number;
}

export const SMOOTHING: SmoothingConfig = { minCutoff: 1, beta: 4, speedCutoff: 1, maxGapMs: 300 };

interface Track {
  readonly t: number;
  readonly aspect: number;
  /** Filtered x, y and visibility of each landmark. */
  readonly value: Float64Array;
  /** Filtered x and y speed of each landmark, in image heights per second. */
  readonly speed: Float64Array;
  readonly pose: PoseLandmarks;
}

/** Smoothing factor of a one-pole low-pass filter with a `cutoff` in Hz over a step of `dt` seconds. */
function alpha(cutoff: number, dt: number): number {
  const r = 2 * Math.PI * cutoff * dt;
  return r / (r + 1);
}

/**
 * A One Euro filter (Casiez, Roussel and Vogel, CHI 2012) over each landmark's position: a low-pass filter whose
 * cutoff rises with speed, so a held pose stops jittering while a fast move lags little. Visibility gets the
 * still cutoff only. Frames without a pose are dropped: a gap up to `maxGapMs` repeats the last pose, a longer one
 * ends the track, and the next pose starts a new one.
 *
 * MediaPipe's VIDEO mode already smooths: on a noisy still clip, elbows and wrists moved 1.49 px a frame in IMAGE
 * mode, 0.16 px in VIDEO mode and 0.06 px after this filter. This stage is the part we can tune.
 */
export class LandmarkSmoother {
  private track: Track | undefined;
  private readonly config: SmoothingConfig;

  constructor(config: SmoothingConfig = SMOOTHING) {
    this.config = config;
  }

  next(lm: PoseLandmarks | undefined, timestampMs: number): PoseLandmarks | undefined {
    const { minCutoff, beta, speedCutoff, maxGapMs } = this.config;
    const live = this.track !== undefined && timestampMs - this.track.t <= maxGapMs ? this.track : undefined;
    if (lm === undefined) {
      this.track = live;
      return live?.pose;
    }
    if (live === undefined || live.aspect !== lm.aspect) {
      const value = new Float64Array(lm.points.length * 3);
      lm.points.forEach((p, i) => value.set([p.x, p.y, p.visibility], i * 3));
      this.track = { t: timestampMs, aspect: lm.aspect, value, speed: new Float64Array(lm.points.length * 2), pose: lm };
      return lm;
    }
    const dt = (timestampMs - live.t) / 1000;
    if (!(dt > 0)) return live.pose;
    const { value, speed } = live;
    const toSpeed = alpha(speedCutoff, dt);
    const toVisibility = alpha(minCutoff, dt);
    const follow = (k: number, s: number, raw: number, perSecond: number): number => {
      speed[s] += toSpeed * ((raw - value[k]) * perSecond - speed[s]);
      value[k] += alpha(minCutoff + beta * Math.abs(speed[s]), dt) * (raw - value[k]);
      return value[k];
    };
    const points: Landmark[] = lm.points.map((p, i) => {
      value[i * 3 + 2] += toVisibility * (p.visibility - value[i * 3 + 2]);
      return {
        x: follow(i * 3, i * 2, p.x, lm.aspect / dt),
        y: follow(i * 3 + 1, i * 2 + 1, p.y, 1 / dt),
        visibility: value[i * 3 + 2],
      };
    });
    const pose: PoseLandmarks = { aspect: lm.aspect, points };
    this.track = { t: timestampMs, aspect: lm.aspect, value, speed, pose };
    return pose;
  }
}
