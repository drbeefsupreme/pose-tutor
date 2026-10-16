import { useCallback, useEffect, useRef, useState } from 'react';
import { parseSettings, SETTINGS_KEY, type TutorSettings } from '../modes/settings';
import { usePlatform } from '../platform/context';
import { Speech } from '../platform/speech';
import type { Health } from '../platform/types';
import type { Calibration } from '../pose/metrics';
import type { PoseId } from '../pose/types';
import { ProgressView } from '../progress/ProgressView';
import type { RunSpec, SessionCalibration } from './engine';
import { Home, type HomeChoice } from './Home';
import { TutorRun } from './TutorRun';
import './tutor.css';

type Screen =
  | { readonly kind: 'home' }
  | { readonly kind: 'run'; readonly spec: RunSpec; readonly attempt: number }
  | { readonly kind: 'progress' };

/** The tutor: home (modes, pose, settings), a running drill, or the progress photos. */
export function TutorApp() {
  const platform = usePlatform();
  const [speech] = useState(() => new Speech(platform.speechEngine(), platform.store));
  const [settings, setSettings] = useState<TutorSettings>(() => parseSettings(platform.store.getItem(SETTINGS_KEY)));
  const [calibration, setCalibration] = useState<SessionCalibration>(undefined);
  const [pose, setPose] = useState<PoseId>('frontDoubleBiceps');
  const [screen, setScreen] = useState<Screen>({ kind: 'home' });
  const [health, setHealth] = useState<Health | undefined>();
  const latestCheck = useRef(0);

  /** Asks the coach client for its health; a newer check always wins over an older one. */
  const recheck = useCallback(() => {
    const check = ++latestCheck.current;
    platform.coach.health().then(
      (next) => check === latestCheck.current && setHealth(next),
      (err: unknown) => console.warn('The coach did not answer the health check.', err),
    );
  }, [platform]);

  useEffect(recheck, [recheck]);

  useEffect(() => {
    platform.store.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [platform, settings]);

  const choose = (choice: HomeChoice) => {
    if (choice === 'progress') setScreen({ kind: 'progress' });
    else setScreen({ kind: 'run', spec: { mode: choice, pose, holdGoal: settings.holdGoal }, attempt: 0 });
  };
  const home = () => setScreen({ kind: 'home' });

  switch (screen.kind) {
    case 'home':
      return <Home pose={pose} onPose={setPose} onChoose={choose} settings={settings} onSettings={setSettings} speech={speech} health={health} onRecheck={recheck} />;
    case 'progress':
      return (
        <div className="tutor-progress">
          <button type="button" className="pill tutor-back" onClick={home}>
            ← Back to the tutor
          </button>
          <ProgressView />
        </div>
      );
    case 'run':
      return (
        <TutorRun
          key={screen.attempt}
          spec={screen.spec}
          settings={settings}
          speech={speech}
          calibration={calibration}
          onCalibration={(c: Calibration | 'skipped') => setCalibration(c)}
          onAgain={() => setScreen({ ...screen, attempt: screen.attempt + 1 })}
          onHome={home}
        />
      );
  }
}
