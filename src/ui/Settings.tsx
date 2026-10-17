import { useCallback, useSyncExternalStore } from 'react';
import type { TutorSettings } from '../modes/settings';
import { platform } from '../platform/android';
import type { Speech } from '../platform/speech';
import type { Health } from '../platform/types';
import { DeviceSettings } from './DeviceSettings';

interface Props {
  readonly settings: TutorSettings;
  readonly onSettings: (settings: TutorSettings) => void;
  readonly health: Health | undefined;
  /** Checks the coach and the intent again, after a change in the device setup. */
  readonly onRecheck: () => void;
}

function useSpeechVersion(speech: Speech): string {
  const subscribe = useCallback((listener: () => void) => speech.subscribe(listener), [speech]);
  return useSyncExternalStore(subscribe, () => `${speech.muted}|${speech.voice ?? ''}|${speech.voices().length}`);
}

function Privacy({ network }: { network: boolean }) {
  return (
    <details className="tutor-privacy" open>
      <summary>Privacy: what leaves this phone</summary>
      <ul>
        <li>
          <b>Coach debrief:</b> Gemini Nano reads the photo of each hit pose and its scores on this phone. They do not go
          to any server.
        </li>
        <li>
          <b>Voice commands:</b> the phone recognizes your speech on the device when it can (the on-device recognizer, or
          an installed offline language pack). If not, Android's speech service can send the audio to Google. With a
          TypeSafe key saved, only the recognized text goes to jev (api.typesafe.ai) to pick the command.
        </li>
        <li>
          <b>Spoken cues:</b> {network ? 'the chosen voice is a network voice, so' : 'with a network voice,'} the cue text
          goes to Google to be spoken. A local voice speaks on the phone.
        </li>
        <li>
          <b>Google usage statistics:</b> Google's on-device libraries (MediaPipe for tracking, ML Kit for the coach) send
          usage statistics to Google (firebaselogging.googleapis.com): library version, app name, device model and
          Android version, country and language, and a random ID. They send no photos, no prompts, no coach replies and
          no scores.
        </li>
        <li>
          <b>Stays on this phone:</b> the camera video, the tracked landmarks, the coach's input and your progress
          photos, in the app's private storage with no cloud backup. Uninstalling the app deletes the photos.
        </li>
      </ul>
    </details>
  );
}

export function Settings({ settings, onSettings, health, onRecheck }: Props) {
  const { speech } = platform;
  useSpeechVersion(speech);
  const set = (patch: Partial<TutorSettings>) => onSettings({ ...settings, ...patch });
  const voices = speech.voices();
  const chosen = voices.find((v) => v.voiceURI === speech.voice);
  const network = chosen !== undefined && !chosen.localService;

  return (
    <section className="tutor-settings" aria-labelledby="tutor-settings-title">
      <h3 id="tutor-settings-title" className="display small">Settings</h3>

      <label className="tutor-field">
        <span>Voice</span>
        <select value={speech.voice ?? ''} onChange={(e) => speech.setVoice(e.target.value || undefined)}>
          <option value="">System default (English)</option>
          {voices.map((v) => (
            <option key={v.voiceURI} value={v.voiceURI}>
              {v.voiceURI} ({v.lang})
            </option>
          ))}
        </select>
      </label>
      <label className="tutor-check">
        <input type="checkbox" checked={speech.muted} onChange={(e) => speech.setMuted(e.target.checked)} />
        Mute the tutor's voice
      </label>
      <label className="tutor-check">
        <input type="checkbox" checked={settings.voiceCommands} onChange={(e) => set({ voiceCommands: e.target.checked })} />
        Voice commands ("next", "what's wrong", "pause")
      </label>
      <label className="tutor-check">
        <input type="checkbox" checked={settings.debrief} onChange={(e) => set({ debrief: e.target.checked })} />
        Coach debrief after every hit pose
      </label>
      <DeviceSettings health={health} onRecheck={onRecheck} />

      <Privacy network={network} />
    </section>
  );
}
