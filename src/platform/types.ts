// What the tutor needs from the device. The app implements it with Capacitor plugins and the native pose plugin
// (src/platform/android.ts); tests implement it with fakes. The engine and the views use only this, never browser or
// plugin APIs directly.

import type { IntentReply } from '../modes/commands';
import type { PoseLandmarks } from '../pose/landmarks';
import type { PoseId } from '../pose/types';
import type { PhotoId, PhotoMeta, SavePhotoRequest } from '../progress/types';
import type { NanoDownloadProgress, NanoStatusResult } from './coachPlugin';
import type { SpeechEngine, SpeechStore } from './speech';

export type Delegate = 'GPU' | 'CPU';
export type CameraFailure = 'denied' | 'noDevice' | 'busy' | 'unsupported';

/** One tracked camera frame. `landmarks` is undefined when nobody is in view. */
export interface PoseFrame {
  readonly landmarks: PoseLandmarks | undefined;
  /** Monotonic milliseconds on the phone's uptime clock. */
  readonly timestampMs: number;
  /** Camera frame size in pixels, as the user sees it (after rotation). */
  readonly width: number;
  readonly height: number;
}

export type PoseSourceStart =
  | { readonly ok: true; readonly delegate: Delegate }
  | { readonly ok: false; readonly failure: CameraFailure; readonly message: string };

/**
 * The front camera plus pose detection. A native camera preview is drawn behind the transparent WebView, positioned
 * and sized to `pane`'s on-screen box, and the source keeps it there when the box moves or resizes. Frames arrive on
 * `onFrame` at camera rate.
 */
export interface PoseSource {
  start(pane: HTMLElement, onFrame: (frame: PoseFrame) => void): Promise<PoseSourceStart>;
  /** Makes the next frames come from a fresh detection (a call changed the expected facing). */
  reset(): void;
  /** The current camera frame as a JPEG data URL, at most `maxWidth` pixels wide, unmirrored. */
  capturePhoto(maxWidth: number): Promise<string | undefined>;
  stop(): void;
}

export type ListenState = 'off' | 'listening' | 'paused' | 'unsupported' | 'denied' | 'error';

/** Voice commands: final phrases only, paused while the tutor speaks so it never hears itself. */
export interface VoiceInput {
  readonly state: ListenState;
  /** The platform's error code for the last failure, if any. */
  readonly error: string | undefined;
  setEnabled(enabled: boolean): void;
  setSuppressed(suppressed: boolean): void;
  dispose(): void;
}

export interface PhotoStore {
  list(pose?: PoseId): Promise<PhotoMeta[]>;
  save(req: SavePhotoRequest): Promise<PhotoMeta>;
  /** A URL an <img> can show. */
  imageSrc(meta: PhotoMeta): string;
  remove(id: PhotoId): Promise<void>;
  removeAll(scope: { readonly pose: PoseId } | 'all'): Promise<number>;
}

/** A coach debrief: the cues to try next and a short note, with the model that wrote it and how long it took. */
export interface CoachNote {
  readonly cues: readonly string[];
  readonly note: string;
  readonly model: string;
  readonly ms: number;
}

export interface CoachAsk {
  readonly pose: string;
  readonly summary: object;
  readonly imageDataUrl: string;
}

/** The Gemini Nano status and whether a TypeSafe key is stored, for Settings and the home screen. */
export interface Health {
  readonly coach: NanoStatusResult;
  readonly keyStored: boolean;
}

/** The coach model and the voice-command intent: Gemini Nano and jev, both called from the phone. */
export interface CoachClient {
  health(): Promise<Health>;
  askCoach(ask: CoachAsk): Promise<CoachNote>;
  askIntent(heard: string): Promise<IntentReply>;
}

/**
 * The phone's own coach and voice-command setup, for Settings. The coach status and whether a key is stored come from
 * `CoachClient.health`. The TypeSafe key is write-only here: nothing reads it back into the page's UI.
 */
export interface DeviceSetup {
  /** Starts or joins the Gemini Nano download and resolves when the model is available. */
  downloadCoach(onProgress: (progress: NanoDownloadProgress) => void): Promise<void>;
  /** Runs a bundled figure render through the coach, as a debrief does. */
  selfTest(): Promise<CoachNote>;
  saveKey(key: string): Promise<void>;
  clearKey(): Promise<void>;
}

export interface KeepAwake {
  acquire(): Promise<void>;
  release(): Promise<void>;
}

export interface Platform {
  poseSource(): PoseSource;
  speechEngine(): SpeechEngine;
  voiceInput(onPhrase: (text: string) => void, onState: (state: ListenState) => void): VoiceInput;
  readonly photos: PhotoStore;
  readonly coach: CoachClient;
  readonly setup: DeviceSetup;
  readonly keepAwake: KeepAwake;
  readonly store: SpeechStore;
}
