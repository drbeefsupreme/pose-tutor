import type { Landmark, PoseLandmarks } from './landmarks';

/** Cutoff in Hz while a landmark is still. Lower is steadier and lags more. */
const MIN_CUTOFF = 1;
/** Cutoff rise in Hz per image height per second of landmark speed. Higher follows fast moves with less lag. */
const BETA = 4;
/** Cutoff in Hz of the speed estimate. */
const SPEED_CUTOFF = 1;
/** A gap without a pose up to this long repeats the last pose; a longer gap ends the track. */
const MAX_GAP_MS = 300;

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
 * still cutoff only. Frames without a pose are dropped: a gap up to `MAX_GAP_MS` repeats the last pose, a longer one
 * ends the track, and the next pose starts a new one.
 *
 * MediaPipe's VIDEO mode already smooths: on a noisy still clip, elbows and wrists moved 1.49 px a frame in IMAGE
 * mode, 0.16 px in VIDEO mode and 0.06 px after this filter. This stage is the part we can tune.
 */
export class LandmarkSmoother {
  private track: Track | undefined;

  next(lm: PoseLandmarks | undefined, timestampMs: number): PoseLandmarks | undefined {
    const live = this.track !== undefined && timestampMs - this.track.t <= MAX_GAP_MS ? this.track : undefined;
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
    const toSpeed = alpha(SPEED_CUTOFF, dt);
    const toVisibility = alpha(MIN_CUTOFF, dt);
    const follow = (k: number, s: number, raw: number, perSecond: number): number => {
      speed[s] += toSpeed * ((raw - value[k]) * perSecond - speed[s]);
      value[k] += alpha(MIN_CUTOFF + BETA * Math.abs(speed[s]), dt) * (raw - value[k]);
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
