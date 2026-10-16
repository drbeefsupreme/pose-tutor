import { DIFFERENT_MAX, HIT_SCORE } from '../gate/criteria';
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

export const scoreTone = (score: number): 'good' | 'warn' | 'bad' => (score >= HIT_SCORE ? 'good' : score >= DIFFERENT_MAX ? 'warn' : 'bad');
