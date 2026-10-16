import type { ComponentType, CSSProperties } from 'react';
import { HOLD_GOALS_S } from '../modes/hold';
import type { ModeId } from '../modes/mode';
import { BEST_KEY, parseBest } from '../modes/records';
import type { TutorSettings } from '../modes/settings';
import { platform } from '../platform/android';
import type { Health } from '../platform/types';
import type { PoseId } from '../pose/types';
import { POSE_LABELS } from '../progress/format';
import { IconBook, IconFlame, IconFrame, IconSwap, IconTrophy } from './Icons';
import { PosePicker } from './PosePicker';
import { Settings } from './Settings';

export type HomeChoice = ModeId | 'progress';

interface Card {
  readonly id: HomeChoice;
  readonly name: string;
  readonly blurb: string;
  readonly Icon: ComponentType<{ size?: number }>;
  /** The card uses the pose picked below. */
  readonly usesPose: boolean;
  readonly color: string;
}

const CARDS: readonly Card[] = [
  { id: 'learn', name: 'Learn a pose', blurb: 'Build it up step by step, then get corrected until you hit it.', Icon: IconBook, usesPose: true, color: '#38bdf8' },
  { id: 'hold', name: 'Hold drill', blurb: 'Hit the pose and hold it steady for 10, 20 or 30 seconds.', Icon: IconFlame, usesPose: true, color: '#ff7a45' },
  { id: 'judge', name: "Judge's calls", blurb: 'Prejudging: quarter turns and the 8 mandatories, called in order, against the clock.', Icon: IconTrophy, usesPose: false, color: '#ffd23f' },
  { id: 'mirror', name: 'Mirror', blurb: 'The figure copies you live. No score: just explore.', Icon: IconSwap, usesPose: false, color: '#4ade80' },
  { id: 'progress', name: 'Progress', blurb: 'Your saved photos per pose: timeline, side-by-side compare and score trend.', Icon: IconFrame, usesPose: false, color: '#c084fc' },
];

interface Props {
  readonly pose: PoseId;
  readonly onPose: (pose: PoseId) => void;
  readonly onChoose: (choice: HomeChoice) => void;
  readonly settings: TutorSettings;
  readonly onSettings: (settings: TutorSettings) => void;
  readonly health: Health | undefined;
  readonly onRecheck: () => void;
}

export function Home({ pose, onPose, onChoose, settings, onSettings, health, onRecheck }: Props) {
  const best = parseBest(platform.store.getItem(BEST_KEY)).round;
  return (
    <div className="tutor-home">
      <div className="tutor-home-main">
        <header className="tutor-home-head">
          <h2 className="display big">Pose Tutor</h2>
          <p className="hint">NPC / IFBB Pro prejudging poses. Stand 2 to 3 m from the camera so your whole body is in view.</p>
        </header>

        <ul className="tutor-modes" aria-label="Practice modes">
          {CARDS.map(({ id, name, blurb, Icon, usesPose, color }) => (
            <li key={id} className="tutor-mode" style={{ '--c': color } as CSSProperties}>
              <div className="tutor-mode-head">
                <Icon size={22} />
                <h3 className="display small">{name}</h3>
              </div>
              <p>{blurb}</p>
              {id === 'hold' && (
                <div className="seg seg-small" role="group" aria-label="Hold time">
                  {HOLD_GOALS_S.map((g) => (
                    <button key={g} type="button" aria-pressed={settings.holdGoal === g} onClick={() => onSettings({ ...settings, holdGoal: g })}>
                      {g} s
                    </button>
                  ))}
                </div>
              )}
              {id === 'judge' && best && <p className="tutor-mode-best">Best round: {Math.round(best.meanScore)}</p>}
              <button type="button" className="btn" data-mode={id} onClick={() => onChoose(id)}>
                {usesPose ? `Start: ${POSE_LABELS[pose]}` : id === 'progress' ? 'Open' : 'Start'}
              </button>
            </li>
          ))}
        </ul>

        <h3 className="display small">Pose</h3>
        <PosePicker pose={pose} onPose={onPose} />
      </div>
      <aside className="tutor-home-side">
        <Settings settings={settings} onSettings={onSettings} health={health} onRecheck={onRecheck} />
      </aside>
    </div>
  );
}
