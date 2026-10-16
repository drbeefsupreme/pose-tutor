import { IconX } from './Icons';
import type { Command } from '../modes/commands';
import { SCHEDULER, type FramingReason } from '../pose/session';
import type { Stage, Summary } from '../modes/mode';
import type { CallResult } from '../modes/judge';
import type { NewBests } from '../modes/records';
import { POSE_LABELS, scoreTone } from '../progress/format';
import type { CameraFailure } from '../platform/types';
import type { DebriefState, Heard } from './engine';

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

export function ScoreMeter({ score, scored }: { score: number | undefined; scored: boolean }) {
  const value = scored && score !== undefined ? Math.round(score) : undefined;
  return (
    <div className={`tutor-score ${value === undefined ? '' : scoreTone(value)}`} aria-live="off">
      <span className="tutor-score-label">Score</span>
      <span className="tutor-score-value" data-testid="score">{value ?? '–'}</span>
      <div className="tutor-score-bar" aria-hidden="true">
        <span className="tutor-score-fill" style={{ width: `${value ?? 0}%` }} />
        <span className="tutor-score-hit" style={{ left: `${SCHEDULER.hitScore}%` }} />
      </div>
    </div>
  );
}

const FRAMING_TEXT: Record<FramingReason, string> = {
  nobody: 'Step in front of the camera',
  cropped: 'Step back: your whole body must be in view',
  facing: 'Turn to face the way the figure faces',
  unclear: 'Step back so the camera sees you clearly',
};

/** The session phase as a label, with the hold's progress. */
export function PhaseLine({ stage, paused }: { stage: Stage; paused: boolean }) {
  if (paused) return <p className="tutor-phase" data-phase="paused">Paused · say "resume" or press P</p>;
  switch (stage.kind) {
    case 'step':
      return (
        <div className="tutor-phase" data-phase="step">
          <span className="tutor-phase-tag">
            Step {stage.index + 1} / {stage.count}
          </span>
          <p className="tutor-step">{stage.text}</p>
          <p className="hint">Say "next" or press Space for the next step.</p>
        </div>
      );
    case 'framing':
      return <p className="tutor-phase" data-phase="framing">Framing · {FRAMING_TEXT[stage.reason]}</p>;
    case 'correcting':
      return <p className="tutor-phase" data-phase="correcting">Correcting</p>;
    case 'holding':
      return (
        <div className="tutor-phase" data-phase="holding">
          Holding · {seconds(stage.heldMs)} of {seconds(stage.goalMs)}
          <div className="tutor-hold-bar">
            <span style={{ width: `${Math.min(100, (100 * stage.heldMs) / stage.goalMs)}%` }} />
          </div>
        </div>
      );
    case 'rest':
      return <p className="tutor-phase" data-phase="rest">Relax · next call coming</p>;
    case 'mirror':
      return <p className="tutor-phase" data-phase="mirror">Mirror · move and the figure follows</p>;
    case 'done':
      return <p className="tutor-phase" data-phase="hit">Hit</p>;
  }
}

export function FramingGuide({ reason }: { reason: FramingReason }) {
  return (
    <div className="tutor-framing" role="status">
      <div className="tutor-framing-box" aria-hidden="true" />
      <p>{FRAMING_TEXT[reason]}</p>
    </div>
  );
}

export function DebriefCard({ debrief, onDismiss }: { debrief: DebriefState; onDismiss: () => void }) {
  if (debrief.kind === 'idle') return null;
  if (debrief.kind === 'looking') {
    return (
      <div className="tutor-debrief looking" role="status" data-testid="debrief">
        <span className="tutor-dots" aria-hidden="true" />
        The coach is looking at your {POSE_LABELS[debrief.pose].toLowerCase()}…{debrief.waiting ? ' (one more waiting)' : ''}
      </div>
    );
  }
  return (
    <div className="tutor-debrief" role="status" data-testid="debrief">
      <button type="button" className="icon-btn tutor-debrief-close" aria-label="Dismiss the coach note" onClick={onDismiss}>
        <IconX size={16} />
      </button>
      <h4>Coach · {POSE_LABELS[debrief.pose]}</h4>
      <p>{debrief.note}</p>
      {debrief.cues.length > 0 && (
        <ul>
          {debrief.cues.map((cue) => (
            <li key={cue}>{cue}</li>
          ))}
        </ul>
      )}
      <p className="hint">
        {debrief.model} · {seconds(debrief.ms)}
      </p>
    </div>
  );
}

const CONTROLS: readonly (readonly [Command, string])[] = [
  ['next', 'Next'],
  ['skip', 'Skip'],
  ['repeat', 'Repeat'],
  ['whatsWrong', "What's wrong"],
];

/** The voice commands as buttons, for a screen without a keyboard. */
export function RunControls({ paused, disabled, onCommand }: { paused: boolean; disabled: boolean; onCommand: (command: Command) => void }) {
  return (
    <nav className="tutor-controls" aria-label="Drill commands">
      {CONTROLS.map(([command, label]) => (
        <button key={command} type="button" className="pill" disabled={disabled} onClick={() => onCommand(command)}>
          {label}
        </button>
      ))}
      <button type="button" className="pill" disabled={disabled} aria-pressed={paused} onClick={() => onCommand(paused ? 'resume' : 'pause')}>
        {paused ? 'Resume' : 'Pause'}
      </button>
    </nav>
  );
}

export function HeardToast({ heard }: { heard: Heard }) {
  const jev = heard.confidence === undefined ? undefined : `jev ${Math.round(heard.confidence * 100)}%`;
  const how = heard.via === 'jev' ? jev : jev ? `keywords (${jev})` : 'keywords';
  return (
    <div className="tutor-heard" role="status" data-testid="heard">
      <span>“{heard.text}”</span>
      <b>{heard.command === undefined || heard.command === 'other' ? 'no command' : heard.command}</b>
      <small>{how}</small>
    </div>
  );
}

const CAMERA_HELP: Record<CameraFailure | 'tracker', { title: string; body: string }> = {
  denied: {
    title: 'The camera is blocked',
    body: 'Allow the camera for Pose Tutor in the Android app settings, then try again. The video stays on this phone.',
  },
  noDevice: { title: 'No front camera found', body: 'This phone has no front camera that the app can open.' },
  busy: { title: 'The camera is busy', body: 'Another app uses the camera, such as a video call. Close it, then try again.' },
  unsupported: { title: 'Pose tracking cannot run', body: 'The pose tracker could not start on this phone.' },
  tracker: { title: 'The pose tracker did not start', body: 'Close the app, open it again, then try again.' },
};

export function CameraProblem({ failure, message, onRetry, onHome }: { failure: CameraFailure | 'tracker'; message: string; onRetry: () => void; onHome: () => void }) {
  const help = CAMERA_HELP[failure];
  return (
    <div className="tutor-problem" role="alert" data-failure={failure}>
      <div className="tutor-card">
        <span className="tutor-badge">Camera</span>
        <h2 className="display big">{help.title}</h2>
        <p>{help.body}</p>
        <p className="hint">{message}</p>
        <div className="tutor-problem-actions">
          <button type="button" className="btn" onClick={onRetry}>
            Try again
          </button>
          <button type="button" className="pill" onClick={onHome}>
            Back to the tutor
          </button>
        </div>
      </div>
    </div>
  );
}

const OUTCOME: Record<CallResult['outcome'], string> = { hit: 'Hit', timeout: 'Time', skipped: 'Skipped' };

function JudgeTable({ calls, bests }: { calls: readonly CallResult[]; bests: NewBests | undefined }) {
  return (
    <table className="tutor-calls">
      <thead>
        <tr>
          <th>Call</th>
          <th>Result</th>
          <th>Score</th>
          <th>Time</th>
        </tr>
      </thead>
      <tbody>
        {calls.map((c) => (
          <tr key={c.pose} data-outcome={c.outcome}>
            <td>
              {POSE_LABELS[c.pose]}
              {bests?.poses.includes(c.pose) && <span className="tutor-pb">best</span>}
            </td>
            <td>{OUTCOME[c.outcome]}</td>
            <td>{c.score === undefined ? '–' : Math.round(c.score)}</td>
            <td>{seconds(c.timeMs)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function SummaryPanel({ summary, bests, onAgain, onHome }: { summary: Summary; bests: NewBests | undefined; onAgain: () => void; onHome: () => void }) {
  const body = (() => {
    switch (summary.mode) {
      case 'learn':
        return summary.result ? (
          <p>
            {POSE_LABELS[summary.pose]} hit in {seconds(summary.result.timeToHitMs)} with a score of {Math.round(summary.result.meanScore)}.
          </p>
        ) : (
          <p>Stopped before the hit.</p>
        );
      case 'hold':
        return summary.result ? (
          <p>
            {seconds(summary.goalMs)} hold: mean score {Math.round(summary.result.meanScore)}, steadiness ±{summary.result.scoreSd.toFixed(1)} points
            {summary.result.resets > 0 ? `, restarted ${summary.result.resets} time${summary.result.resets === 1 ? '' : 's'}` : ''}.
          </p>
        ) : (
          <p>Stopped before the end of the hold.</p>
        );
      case 'judge':
        return (
          <>
            <p>
              {summary.complete ? 'Round complete' : 'Round stopped'}: average score {Math.round(summary.meanScore)}
              {bests?.round ? ' · a new personal best!' : ''}
            </p>
            <JudgeTable calls={summary.calls} bests={bests} />
          </>
        );
      case 'mirror':
        return <p>Mirror ended.</p>;
    }
  })();
  return (
    <div className="tutor-summary" role="dialog" aria-labelledby="tutor-summary-title" data-testid="summary">
      <div className="tutor-card">
        <span className="tutor-badge">Done</span>
        <h2 id="tutor-summary-title" className="display big">
          Summary
        </h2>
        {body}
        <div className="tutor-problem-actions">
          <button type="button" className="btn" onClick={onAgain}>
            Again
          </button>
          <button type="button" className="pill" onClick={onHome}>
            Back to the tutor
          </button>
        </div>
      </div>
    </div>
  );
}
