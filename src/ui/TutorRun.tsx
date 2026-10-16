import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Command } from '../modes/commands';
import type { FigureTarget } from '../modes/mode';
import type { TutorSettings } from '../modes/settings';
import { platform } from '../platform/android';
import type { Calibration } from '../pose/metrics';
import { IconSwap, IconX } from './Icons';
import { TutorEngine, type DebriefState, type RunSpec, type SessionCalibration, type Snapshot } from './engine';
import { FigureView } from './FigureView';
import { CameraProblem, DebriefCard, FramingGuide, HeardToast, PhaseLine, RunControls, ScoreMeter, SummaryPanel } from './RunParts';

declare global {
  interface Window {
    /** Test hook: the tutor screen's current state. */
    __tutorState?: () => Snapshot;
  }
}

const KEYS: Record<string, Command> = {
  ' ': 'next',
  ArrowRight: 'next',
  s: 'skip',
  r: 'repeat',
  w: 'whatsWrong',
  Escape: 'stop',
};

const HEARD_SHOW_MS = 4000;
const RELAXED: FigureTarget = { kind: 'pose', pose: 'relaxedFront' };

interface Props {
  readonly spec: RunSpec;
  readonly settings: TutorSettings;
  readonly calibration: SessionCalibration;
  readonly onCalibration: (calibration: Calibration | 'skipped') => void;
  readonly onAgain: () => void;
  readonly onHome: () => void;
}

/** One drill: an engine per mount. Remount (a new key) to start again. */
export function TutorRun(props: Props) {
  const [engine, setEngine] = useState<TutorEngine | undefined>();
  const initial = useRef(props);

  useEffect(() => {
    const { spec, settings, calibration, onCalibration } = initial.current;
    const e = new TutorEngine({ spec, settings, calibration, onCalibration, platform });
    setEngine(e);
    return () => {
      e.dispose();
      setEngine(undefined);
    };
  }, []);

  useEffect(() => {
    engine?.setSettings(props.settings);
  }, [engine, props.settings]);

  return engine ? <RunView engine={engine} {...props} /> : null;
}

function RunView({ engine, onAgain, onHome }: Props & { engine: TutorEngine }) {
  const snap = useSyncExternalStore(engine.subscribe, engine.snapshot);
  const pane = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const [now, setNow] = useState(() => performance.now());
  const [figureBig, setFigureBig] = useState(false);
  const [dismissed, setDismissed] = useState<DebriefState>();

  useEffect(() => {
    if (pane.current && overlay.current) void engine.start(pane.current, overlay.current);
    window.__tutorState = engine.snapshot;
    return () => {
      window.__tutorState = undefined;
    };
  }, [engine]);

  const paused = snap.view?.paused ?? false;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.repeat) return;
      const command: Command | undefined = e.key === 'p' || e.key === 'P' ? (paused ? 'resume' : 'pause') : KEYS[e.key];
      if (!command) return;
      e.preventDefault();
      engine.command(command);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [engine, paused]);

  useEffect(() => {
    if (!snap.heard) return;
    const timer = window.setTimeout(() => setNow(performance.now()), HEARD_SHOW_MS);
    setNow(performance.now());
    return () => window.clearTimeout(timer);
  }, [snap.heard]);

  const { camera, view, calibration } = snap;
  const stage = view?.stage;
  const scored = view?.scoring !== undefined;
  const showHeard = snap.heard && now - snap.heard.at < HEARD_SHOW_MS;
  const swapped = figureBig && calibration.kind === 'ready' && stage?.kind !== 'done';

  return (
    <section className="tutor-run" data-mode={view ? undefined : 'loading'}>
      <header className="tutor-run-bar">
        <button type="button" className="pill" onClick={onHome} aria-label="Back to the tutor home">
          <IconX size={14} /> Exit
        </button>
        <div className="tutor-run-title">
          <h2 className="display">{view?.title ?? 'Getting ready'}</h2>
          {view?.detail && <span className="hint">{view.detail}</span>}
        </div>
        {view?.clock && (
          <div className="tutor-clock" aria-label={view.clock.label}>
            <small>{view.clock.label}</small>
            {Math.ceil(view.clock.ms / 1000)} s
          </div>
        )}
        <span className={`tutor-mic ${snap.listening}`} title="Voice commands">
          mic: {snap.listening}
          {(snap.listening === 'error' || snap.listening === 'denied') && snap.listenError ? ` (${snap.listenError})` : ''}
          {snap.listenError === 'network' ? ' · this browser has no speech service; use Google Chrome' : ''}
        </span>
        <span className="tutor-keys hint">Space next · S skip · R repeat · W what's wrong · P pause · Esc stop</span>
      </header>

      <div className="tutor-stage" data-swapped={swapped || undefined}>
        <figure className="tutor-figure">
          <FigureView figure={view?.figure ?? RELAXED} />
          <figcaption>Target</figcaption>
        </figure>

        <div className="tutor-camera">
          <div ref={pane} className="tutor-camera-feed" />
          <canvas ref={overlay} aria-hidden="true" />
          {stage?.kind === 'framing' && <FramingGuide reason={stage.reason} />}
          {camera.kind === 'starting' && <p className="tutor-camera-status">Starting the camera and the pose tracker…</p>}
          {camera.kind === 'live' && calibration.kind === 'capturing' && (
            <div className="tutor-calibrate" role="status">
              <p>Stand relaxed, facing the camera, arms by your sides.</p>
              <div className="tutor-hold-bar">
                <span style={{ width: `${Math.round(calibration.progress * 100)}%` }} />
              </div>
              <button type="button" className="pill" onClick={() => engine.skipCalibration()}>
                Skip calibration
              </button>
            </div>
          )}
          {showHeard && snap.heard && <HeardToast heard={snap.heard} />}
          <span className="tutor-camera-label">You (mirrored)</span>
          {stage?.kind === 'done' && <SummaryPanel summary={stage.summary} bests={snap.bests} onAgain={onAgain} onHome={onHome} />}
        </div>

        <button type="button" className="tutor-swap" aria-pressed={swapped} aria-label={swapped ? 'Show the camera big' : 'Show the target figure big'} onClick={() => setFigureBig(!swapped)}>
          <IconSwap size={18} />
        </button>

        <aside className="tutor-side">
          <ScoreMeter score={snap.score} scored={scored} />
          {stage && <PhaseLine stage={stage} paused={paused} />}
          {view?.said && (
            <p className="tutor-cue" aria-live="polite" data-testid="cue">
              “{view.said}”
            </p>
          )}
          {scored && snap.faults.length > 0 && (
            <ol className="tutor-faults" aria-label="Corrections">
              {snap.faults.slice(0, 4).map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ol>
          )}
          {snap.debrief !== dismissed && <DebriefCard debrief={snap.debrief} onDismiss={() => setDismissed(snap.debrief)} />}
          {snap.photo && (
            <p className="tutor-photo" data-testid="photo">
              Photo saved · {Math.round(snap.photo.score)}
            </p>
          )}
          {snap.notice && <p className="tutor-notice">{snap.notice}</p>}
        </aside>
      </div>

      <RunControls paused={paused} disabled={!view || stage?.kind === 'done'} onCommand={(command) => engine.command(command)} />

      {camera.kind === 'failed' && <CameraProblem failure={camera.failure} message={camera.message} onRetry={onAgain} onHome={onHome} />}
    </section>
  );
}
