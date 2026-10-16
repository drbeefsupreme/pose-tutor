// The device under the tutor: the native pose plugin (./posePlugin.ts) for the camera and tracking, Android
// TextToSpeech, the native voice plugin (./voicePlugin.ts) for voice commands, app-private files for the photos, Gemini
// Nano on the phone for the coach and jev for the intent (./androidCoach.ts), and the KeepAwake plugin. The WebView's
// localStorage is the store; it persists in the app's data like any app storage.

import { KeepAwake as KeepAwakePlugin } from '@capacitor-community/keep-awake';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { Capacitor, CapacitorException, CapacitorHttp, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import type { PostJson } from '../intent/jev';
import { poseLandmarks } from '../pose/landmarks';
import { deviceCoach } from './androidCoach';
import { folderPhotoStore, type PhotoFolder } from './androidPhotos';
import { nativeSpeech, type SpeechLogEntry } from './androidSpeech';
import { NativeVoiceInput } from './androidVoice';
import type { TutorCoachPlugin } from './coachPlugin';
import type { NativePoseFrame, PreviewRect, TutorPosePlugin } from './posePlugin';
import type { TutorSecretsPlugin } from './secretsPlugin';
import selfTestImage from './self-test-side-chest.png?inline';
import { Speech } from './speech';
import type { CameraFailure, Delegate, DeviceSetup, Platform, PoseFrame, PoseSource, PoseSourceStart } from './types';
import type { TutorVoicePlugin } from './voicePlugin';

declare global {
  interface Window {
    /** Test hook: hands a phrase to the live voice input as if recognition heard it. False when none listens. */
    __tutorVoice?: (text: string) => boolean;
    /** Test hook: every line the speech engine was given, with how it ended. */
    __tutorSpeech?: SpeechLogEntry[];
    /** Test hook: the on-device coach and the TypeSafe key, as Settings drives them. */
    __tutorSetup?: DeviceSetup;
  }
}

const pose = registerPlugin<TutorPosePlugin>('TutorPose');
const voice = registerPlugin<TutorVoicePlugin>('TutorVoice');

const CAMERA_FAILURES: Record<CameraFailure, true> = { denied: true, noDevice: true, busy: true, unsupported: true };
/** Set on <html> while the native preview shows, so the page lets it through (index.html). */
const PREVIEW_ATTRIBUTE = 'data-native-preview';

function cameraFailure(err: unknown): CameraFailure | undefined {
  const code: string | undefined = err instanceof CapacitorException ? err.code : undefined;
  return code !== undefined && Object.hasOwn(CAMERA_FAILURES, code) ? (code as CameraFailure) : undefined;
}

function poseFrame(frame: NativePoseFrame): PoseFrame {
  const { landmarks, timestampMs, width, height } = frame;
  return { landmarks: landmarks ? poseLandmarks(landmarks, width, height) : undefined, timestampMs, width, height };
}

/** The native camera and tracker. The preview is drawn behind the WebView at the pane's box and follows it. */
function nativePoseSource(): PoseSource {
  let stopped = false;
  let frames: PluginListenerHandle | undefined;
  let unfollow: (() => void) | undefined;

  const release = () => {
    unfollow?.();
    unfollow = undefined;
    frames?.remove().catch((err: unknown) => console.warn('Removing the frame listener failed.', err));
    frames = undefined;
    document.documentElement.removeAttribute(PREVIEW_ATTRIBUTE);
  };

  return {
    async start(pane, onFrame): Promise<PoseSourceStart> {
      const rect = (): PreviewRect => {
        const box = pane.getBoundingClientRect();
        return { x: box.left, y: box.top, width: box.width, height: box.height };
      };
      document.documentElement.setAttribute(PREVIEW_ATTRIBUTE, '');
      frames = await pose.addListener('frame', (frame) => {
        if (!stopped) onFrame(poseFrame(frame));
      });
      let delegate: Delegate;
      try {
        ({ delegate } = await pose.start({ rect: rect(), devicePixelRatio: window.devicePixelRatio }));
      } catch (err) {
        release();
        const failure = cameraFailure(err);
        if (failure) return { ok: false, failure, message: err instanceof Error ? err.message : String(err) };
        throw err;
      }
      if (stopped) return { ok: false, failure: 'busy', message: 'The camera was stopped while it started.' };

      let last = '';
      const follow = () => {
        const now = rect();
        const key = `${now.x},${now.y},${now.width},${now.height}`;
        if (key === last) return;
        last = key;
        pose.setPreviewRect({ rect: now }).catch((err: unknown) => console.warn('Moving the camera preview failed.', err));
      };
      const resized = new ResizeObserver(follow);
      resized.observe(pane);
      window.addEventListener('resize', follow);
      window.addEventListener('scroll', follow, { capture: true, passive: true });
      screen.orientation.addEventListener('change', follow);
      unfollow = () => {
        resized.disconnect();
        window.removeEventListener('resize', follow);
        window.removeEventListener('scroll', follow, { capture: true });
        screen.orientation.removeEventListener('change', follow);
      };
      follow();
      return { ok: true, delegate };
    },
    reset() {
      pose.reset().catch((err: unknown) => console.warn('Resetting the pose tracker failed.', err));
    },
    async capturePhoto(maxWidth) {
      const { dataUrl } = await pose.capturePhoto({ maxWidth });
      return dataUrl ?? undefined;
    },
    stop() {
      stopped = true;
      release();
      pose.stop().catch((err: unknown) => console.warn('Stopping the camera failed.', err));
    },
  };
}

/** A folder in the app's private files (Directory.Data), made on first use. */
function dataFolder(path: string): PhotoFolder {
  let base: Promise<string> | undefined;
  let baseUri: string | undefined;
  const ready = (): Promise<string> => {
    base ??= (async () => {
      const exists = await Filesystem.stat({ path, directory: Directory.Data }).then(
        () => true,
        () => false,
      );
      if (!exists) await Filesystem.mkdir({ path, directory: Directory.Data, recursive: true });
      baseUri = (await Filesystem.getUri({ path, directory: Directory.Data })).uri.replace(/\/$/, '');
      return baseUri;
    })().catch((err: unknown) => {
      base = undefined;
      throw err;
    });
    return base;
  };
  return {
    async names() {
      await ready();
      const { files } = await Filesystem.readdir({ path, directory: Directory.Data });
      return files.filter((f) => f.type === 'file').map((f) => f.name);
    },
    async readText(name) {
      const { data } = await Filesystem.readFile({ path: `${path}/${name}`, directory: Directory.Data, encoding: Encoding.UTF8 });
      return typeof data === 'string' ? data : data.text();
    },
    async write(name, data, base64) {
      await ready();
      await Filesystem.writeFile({ path: `${path}/${name}`, directory: Directory.Data, data, encoding: base64 ? undefined : Encoding.UTF8 });
    },
    async remove(name) {
      await Filesystem.deleteFile({ path: `${path}/${name}`, directory: Directory.Data });
    },
    src(name) {
      if (baseUri === undefined) throw new Error('the photo folder is not open yet');
      return Capacitor.convertFileSrc(`${baseUri}/${name}`);
    },
  };
}

/** Native HTTP: the page's CSP (index.html) allows no connection to another host. */
const nativePost: PostJson = async (url, headers, body, timeoutMs) => {
  const res = await CapacitorHttp.request({ method: 'POST', url, headers, data: body, connectTimeout: timeoutMs, readTimeout: timeoutMs, responseType: 'json' });
  return { status: res.status, body: res.data };
};

const { client: coach, setup } = deviceCoach({
  coach: registerPlugin<TutorCoachPlugin>('TutorCoach'),
  secrets: registerPlugin<TutorSecretsPlugin>('TutorSecrets'),
  post: nativePost,
  selfTestImage,
});
const speechLog: SpeechLogEntry[] = [];
/** The voice input of the running drill; a disposed one ignores injected phrases. */
let liveVoice: NativeVoiceInput | undefined;

export const platform: Platform = {
  poseSource: nativePoseSource,
  speech: new Speech(nativeSpeech(TextToSpeech, speechLog), localStorage),
  voiceInput(onPhrase, onState) {
    liveVoice = new NativeVoiceInput(voice, onPhrase, onState);
    return liveVoice;
  },
  photos: folderPhotoStore(dataFolder('photos')),
  coach,
  setup,
  keepAwake: { acquire: () => KeepAwakePlugin.keepAwake(), release: () => KeepAwakePlugin.allowSleep() },
  store: localStorage,
};

window.__tutorVoice = (text) => liveVoice?.inject(text) ?? false;
window.__tutorSpeech = speechLog;
window.__tutorSetup = setup;
