import { HOLD_GOALS_S, type HoldGoal } from './hold';
import { field, storedObject } from './stored';

// Tutor settings kept in localStorage. The speech voice and mute live in the Speech wrapper (src/platform/speech.ts).

export const SETTINGS_KEY = 'pose-tutor-settings';

export interface TutorSettings {
  readonly voiceCommands: boolean;
  readonly debrief: boolean;
  readonly holdGoal: HoldGoal;
}

export const DEFAULT_SETTINGS: TutorSettings = { voiceCommands: true, debrief: true, holdGoal: 10 };

export function parseSettings(raw: string | null): TutorSettings {
  const stored = storedObject(raw);
  const voiceCommands = field(stored, 'voiceCommands');
  const debrief = field(stored, 'debrief');
  const holdGoal = field(stored, 'holdGoal');
  return {
    voiceCommands: typeof voiceCommands === 'boolean' ? voiceCommands : DEFAULT_SETTINGS.voiceCommands,
    debrief: typeof debrief === 'boolean' ? debrief : DEFAULT_SETTINGS.debrief,
    holdGoal: HOLD_GOALS_S.find((g) => g === holdGoal) ?? DEFAULT_SETTINGS.holdGoal,
  };
}
