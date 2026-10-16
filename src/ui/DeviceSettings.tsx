// The device parts of Settings: Gemini Nano on the phone (status, download, self-test) and the TypeSafe key for voice
// commands. The key is write-only here: the page shows whether one is stored, never the key.

import { useState, type FormEvent } from 'react';
import type { NanoDownloadProgress, NanoStatus } from '../platform/coachPlugin';
import type { CoachNote, DeviceSetup, Health } from '../platform/types';

type Tone = 'good' | 'warn' | 'bad' | 'muted';

const COACH_STATE: Readonly<Record<NanoStatus, { readonly tone: Tone; readonly text: string }>> = {
  available: { tone: 'good', text: 'Gemini Nano is ready on this phone.' },
  downloadable: { tone: 'warn', text: 'Gemini Nano can run on this phone, but its model is not downloaded yet.' },
  downloading: { tone: 'warn', text: 'The Gemini Nano model is downloading.' },
  unavailable: { tone: 'bad', text: 'Gemini Nano is not available on this phone.' },
};

type Download =
  | { readonly kind: 'idle' }
  | { readonly kind: 'running'; readonly progress: NanoDownloadProgress | undefined }
  | { readonly kind: 'failed'; readonly error: string };

type SelfTest =
  | { readonly kind: 'idle' }
  | { readonly kind: 'running' }
  | { readonly kind: 'done'; readonly note: CoachNote }
  | { readonly kind: 'failed'; readonly error: string };

const errorText = (err: unknown): string => (err instanceof Error ? err.message : String(err));
const megabytes = (bytes: number): string => (bytes / 1e6).toFixed(0);

function DownloadProgress({ progress }: { progress: NanoDownloadProgress | undefined }) {
  const total = progress?.totalBytes;
  return (
    <div className="tutor-device-progress" data-testid="coach-download">
      <progress max={total} value={total === undefined ? undefined : progress?.downloadedBytes} />
      <span className="hint">
        {progress === undefined
          ? 'Starting the download…'
          : total === undefined
            ? `${megabytes(progress.downloadedBytes)} MB downloaded`
            : `${megabytes(progress.downloadedBytes)} of ${megabytes(total)} MB`}
      </span>
    </div>
  );
}

function SelfTestResult({ test }: { test: SelfTest }) {
  switch (test.kind) {
    case 'idle':
      return null;
    case 'running':
      return (
        <p className="hint" data-testid="coach-self-test" data-state="running">
          The coach is looking at a side chest render…
        </p>
      );
    case 'failed':
      return (
        <p className="tutor-field-error" role="alert" data-testid="coach-self-test" data-state="failed">
          Self-test failed: {test.error}
        </p>
      );
    case 'done':
      return (
        <div className="tutor-device-result" data-testid="coach-self-test" data-state="done">
          <p>{test.note.note}</p>
          {test.note.cues.length > 0 && (
            <ul>
              {test.note.cues.map((cue) => (
                <li key={cue}>{cue}</li>
              ))}
            </ul>
          )}
          <p className="hint">
            {test.note.model} · {test.note.ms} ms
          </p>
        </div>
      );
  }
}

function OnDeviceCoach({ setup, health, onRecheck }: { setup: DeviceSetup; health: Health | undefined; onRecheck: () => void }) {
  const [download, setDownload] = useState<Download>({ kind: 'idle' });
  const [test, setTest] = useState<SelfTest>({ kind: 'idle' });
  const status = health?.coach;
  const state = status ? COACH_STATE[status.status] : { tone: 'muted' as const, text: 'Checking the on-device coach…' };
  const canDownload = (status?.status === 'downloadable' || status?.status === 'downloading') && download.kind !== 'running';

  const startDownload = async () => {
    setDownload({ kind: 'running', progress: undefined });
    try {
      await setup.downloadCoach((progress) => setDownload({ kind: 'running', progress }));
      setDownload({ kind: 'idle' });
    } catch (err) {
      setDownload({ kind: 'failed', error: errorText(err) });
    }
    onRecheck();
  };

  const runSelfTest = async () => {
    setTest({ kind: 'running' });
    try {
      setTest({ kind: 'done', note: await setup.selfTest() });
    } catch (err) {
      setTest({ kind: 'failed', error: errorText(err) });
    }
  };

  return (
    <section className="tutor-device" aria-labelledby="tutor-coach-title" data-testid="device-coach">
      <h4 id="tutor-coach-title">On-device coach</h4>
      <p className="tutor-device-state" data-tone={state.tone} data-state={status?.status ?? 'checking'}>
        {state.text}
        {status?.status === 'unavailable' && status.reason && <span className="hint"> {status.reason}</span>}
      </p>
      {download.kind === 'running' && <DownloadProgress progress={download.progress} />}
      {download.kind === 'failed' && (
        <p className="tutor-field-error" role="alert">
          Download failed: {download.error}
        </p>
      )}
      <div className="tutor-device-actions">
        {canDownload && (
          <button type="button" className="btn" onClick={() => void startDownload()}>
            {status?.status === 'downloading' ? 'Show the download' : 'Download the model'}
          </button>
        )}
        <button type="button" className="pill" disabled={status === undefined || test.kind === 'running'} onClick={() => void runSelfTest()}>
          Self-test
        </button>
      </div>
      <SelfTestResult test={test} />
    </section>
  );
}

function VoiceCommandKey({ setup, health, onRecheck }: { setup: DeviceSetup; health: Health | undefined; onRecheck: () => void }) {
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const stored = health?.keyStored;

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(undefined);
    try {
      await action();
      setDraft('');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
      onRecheck();
    }
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    void run(() => setup.saveKey(draft));
  };

  return (
    <section className="tutor-device" aria-labelledby="tutor-key-title" data-testid="device-key">
      <h4 id="tutor-key-title">Voice commands</h4>
      <p
        className="tutor-device-state"
        data-tone={stored === undefined ? 'muted' : stored ? 'good' : 'warn'}
        data-state={stored === undefined ? 'checking' : stored ? 'saved' : 'not-saved'}
      >
        {stored === undefined
          ? 'Checking for a saved key…'
          : stored
            ? 'TypeSafe key saved on this phone. Jev picks the command from what you say.'
            : 'No TypeSafe key saved. Keywords pick the command.'}
      </p>
      <form className="tutor-device-form" onSubmit={save}>
        <label className="tutor-field">
          <span>TypeSafe API key</span>
          <input
            type="password"
            value={draft}
            placeholder={stored ? 'Paste a new key to replace it' : 'Paste your key'}
            autoComplete="off"
            spellCheck={false}
            autoCapitalize="off"
            onChange={(e) => setDraft(e.target.value)}
          />
        </label>
        <p className="hint">The key is kept in the Android Keystore. The app never shows it again.</p>
        {error && (
          <p className="tutor-field-error" role="alert">
            {error}
          </p>
        )}
        <div className="tutor-device-actions">
          <button type="submit" className="btn" disabled={busy || draft.trim() === ''}>
            Save the key
          </button>
          {stored && (
            <button type="button" className="pill progress-danger-pill" disabled={busy} onClick={() => void run(() => setup.clearKey())}>
              Clear the key
            </button>
          )}
        </div>
      </form>
    </section>
  );
}

export function DeviceSettings(props: { setup: DeviceSetup; health: Health | undefined; onRecheck: () => void }) {
  return (
    <>
      <OnDeviceCoach {...props} />
      <VoiceCommandKey {...props} />
    </>
  );
}
