// Procedural anatomy for a heavyweight male bodybuilder (about 1.78 m), relaxed front stance.
// Region modules live in ./anatomy/*. Each module authors the LEFT side (+X); the field mirrors it.
// Fiber directions follow origin -> insertion of each bundle (see research/detail-vascularity.md).
import type { Anatomy } from './types';
import { TORSO } from './anatomy/torso';
import { BACK } from './anatomy/back';
import { ARMS } from './anatomy/arms';
import { LEGS } from './anatomy/legs';

const modules = [TORSO, BACK, ARMS, LEGS];

export const ANATOMY: Anatomy = {
  muscles: modules.flatMap((m) => m.muscles),
  cores: modules.flatMap((m) => m.cores),
  veins: modules.flatMap((m) => m.veins),
  fat: modules.flatMap((m) => m.fat),
};
