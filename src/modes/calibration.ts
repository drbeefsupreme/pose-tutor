import type { PoseLandmarks } from '../pose/landmarks';
import { calibrate, type Calibration } from '../pose/metrics';
import { inView } from '../pose/session';

// The relaxed-front capture at the start of a tutor session. The athlete stands relaxed, facing the camera, in
// full view; after `steadyMs` of such frames the baseline is the mean of their calibrations.

export const CALIBRATION_STEADY_MS = 1500;

export interface Capture {
  /** When the current run of usable frames began. */
  readonly since: number | undefined;
  readonly samples: readonly Calibration[];
}

export const NEW_CAPTURE: Capture = { since: undefined, samples: [] };

export type CaptureStep =
  | { readonly kind: 'waiting'; readonly capture: Capture; readonly progress: number }
  | { readonly kind: 'captured'; readonly calibration: Calibration };

export function captureStep(capture: Capture, lm: PoseLandmarks | undefined, now: number, steadyMs = CALIBRATION_STEADY_MS): CaptureStep {
  const sample = lm && inView(lm) ? calibrate(lm) : undefined;
  if (!sample) return { kind: 'waiting', capture: NEW_CAPTURE, progress: 0 };
  const since = capture.since ?? now;
  const samples = [...capture.samples, sample];
  if (now - since < steadyMs) return { kind: 'waiting', capture: { since, samples }, progress: (now - since) / steadyMs };
  const mean = (key: keyof Calibration) => samples.reduce((sum, s) => sum + s[key], 0) / samples.length;
  return { kind: 'captured', calibration: { shoulderWidth: mean('shoulderWidth'), hipWidth: mean('hipWidth'), earDrop: mean('earDrop') } };
}
