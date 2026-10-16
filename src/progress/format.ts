import type { PoseId } from '../pose/types';

/** Short pose names. Display order follows prejudging: quarter turns, then the mandatory poses. */
export const POSE_LABELS: Record<PoseId, string> = {
  relaxedFront: 'Relaxed front',
  quarterTurnLeftSide: 'Quarter turn left',
  relaxedBack: 'Relaxed back',
  quarterTurnRightSide: 'Quarter turn right',
  frontDoubleBiceps: 'Front double biceps',
  frontLatSpread: 'Front lat spread',
  sideChest: 'Side chest',
  backDoubleBiceps: 'Back double biceps',
  backLatSpread: 'Back lat spread',
  sideTriceps: 'Side triceps',
  absAndThighs: 'Abdominals and thighs',
  mostMuscular: 'Most muscular',
};

const DATE = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const SHORT_DATE = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });

export const formatDate = (iso: string, short = false): string => (short ? SHORT_DATE : DATE).format(new Date(iso));

/** Bands of the tracking gate (plan.md, done item 3): 85+ is the pose, below 60 is a different pose. */
export const scoreTone = (score: number): 'good' | 'warn' | 'bad' => (score >= 85 ? 'good' : score >= 60 ? 'warn' : 'bad');
