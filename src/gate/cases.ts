import { FIGURE_POSES } from '../figure/figurePoses';
import type { AxisAngle, BoneKey, FigurePose, PoseId } from '../pose/types';

/** A figure pose with one known fault, and the correction the tutor must give first for it. */
interface FaultCase {
  readonly id: string;
  readonly label: string;
  readonly pose: PoseId;
  readonly figure: FigurePose;
  readonly expectedCue: string;
}

type Edit = readonly [BoneKey, (list: readonly AxisAngle[]) => readonly AxisAngle[]];

function broken(pose: PoseId, edits: readonly Edit[]): FigurePose {
  const base = FIGURE_POSES[pose];
  const bones = { ...base.bones };
  for (const [bone, edit] of edits) bones[bone] = edit(base.bones[bone] ?? []);
  return { yaw: base.yaw, bones };
}

/** Lowers an arm sideways by `deg` after its pose, about the world forward axis (+Z raises the left arm). */
const lowerLeft = (deg: number) => (list: readonly AxisAngle[]): readonly AxisAngle[] => [...list, [0, 0, 1, -deg]];
const lowerRight = (deg: number) => (list: readonly AxisAngle[]): readonly AxisAngle[] => [...list, [0, 0, -1, -deg]];
/**
 * Swings an arm forward by `deg` about the vertical through the shoulder (+Y takes the left elbow back). A hand on
 * the waist lies almost below the shoulder, so it stays put while the elbow comes in front of the body.
 */
const swingForward = (side: 1 | -1, deg: number) => (list: readonly AxisAngle[]): readonly AxisAngle[] => [...list, [0, side, 0, -deg]];
/** Turns one rotation of a bone (negative index from the end) `delta` degrees further about the same axis. */
const turn = (index: number, delta: number) => (list: readonly AxisAngle[]): readonly AxisAngle[] =>
  list.map(([x, y, z, d], i) => (i === (index < 0 ? list.length + index : index) ? [x, y, z, d + delta] : [x, y, z, d]));

export const FAULTS: readonly FaultCase[] = [
  {
    id: 'fdbElbowsDropped',
    label: 'Front double biceps, both elbows dropped 30°',
    pose: 'frontDoubleBiceps',
    figure: broken('frontDoubleBiceps', [
      ['upperarmL', lowerLeft(30)],
      ['upperarmR', lowerRight(30)],
    ]),
    expectedCue: 'Raise your elbows to shoulder height.',
  },
  {
    id: 'fdbFistsLow',
    label: 'Front double biceps, upper arms turned in 65° so the forearms tip toward the camera and the fists sit low',
    pose: 'frontDoubleBiceps',
    figure: broken('frontDoubleBiceps', [
      ['upperarmL', turn(0, 65)],
      ['upperarmR', turn(0, 65)],
    ]),
    expectedCue: 'Bring your fists up to your ears.',
  },
  {
    id: 'flsElbowsIn',
    label: 'Front lat spread, both elbows swung 50° forward and in, hands kept on the waist',
    pose: 'frontLatSpread',
    figure: broken('frontLatSpread', [
      ['upperarmL', swingForward(1, 50)],
      ['upperarmR', swingForward(-1, 50)],
    ]),
    expectedCue: 'Spread your lats wider.',
  },
  {
    id: 'bdbLeftArmLow',
    label: 'Back double biceps, left arm dropped 35°',
    pose: 'backDoubleBiceps',
    figure: broken('backDoubleBiceps', [['upperarmL', lowerLeft(35)]]),
    expectedCue: 'Lift your elbows above your shoulders.',
  },
];
