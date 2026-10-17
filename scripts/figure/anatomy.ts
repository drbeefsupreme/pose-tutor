// Each module authors the LEFT side (+X); the field mirrors it.
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
