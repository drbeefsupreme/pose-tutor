import type { PoseLandmarks } from '../pose/landmarks';
import type { PhotoFault, SavePhotoRequest } from '../progress/types';
import { faultCue } from '../pose/score';
import type { HitResult } from '../pose/session';
import { POSE_SPECS } from '../pose/spec';
import type { PoseId, PoseScore } from '../pose/types';
import type { HoldResult, ModeId } from './mode';

// What the tutor records at a hit: the progress photo request and the coach's tracking summary.

export interface Hit {
  readonly mode: ModeId;
  readonly pose: PoseId;
  readonly result: HitResult | HoldResult;
  /** The score of the frame that completed the hit. */
  readonly score: PoseScore | undefined;
  readonly landmarks: PoseLandmarks | undefined;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

/** The faults that have a spoken cue, most important first. */
function hitFaults(score: PoseScore | undefined): PhotoFault[] {
  return (score?.faults ?? []).flatMap((f) => {
    const cue = faultCue(f);
    if (!cue) return [];
    return [f.check.side === undefined ? { metric: f.check.metric, cue: cue.text } : { metric: f.check.metric, side: f.check.side, cue: cue.text }];
  });
}

export function photoRequest(hit: Hit, imageDataUrl: string): SavePhotoRequest {
  return {
    pose: hit.pose,
    imageDataUrl,
    score: round1(Math.min(100, Math.max(0, hit.result.meanScore))),
    faults: hitFaults(hit.score),
    ...(hit.landmarks ? { landmarks: hit.landmarks } : {}),
    mode: hit.mode,
  };
}

/** The tracking summary the coach model reads next to the snapshot. */
export function coachSummary(hit: Hit): object {
  const { result } = hit;
  return {
    pose: POSE_SPECS[hit.pose][0].name,
    mode: hit.mode,
    meanScore: round1(result.meanScore),
    finalScore: round1(result.score),
    steadinessSd: round1(result.scoreSd),
    secondsToHit: round1(result.timeToHitMs / 1000),
    ...('goalMs' in result ? { holdSeconds: result.goalMs / 1000, holdRestarts: result.resets } : {}),
    faults: [...new Set(hitFaults(hit.score).map((f) => f.cue))],
    coachOnly: POSE_SPECS[hit.pose][0].coachOnly,
  };
}
