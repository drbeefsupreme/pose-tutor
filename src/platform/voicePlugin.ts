// The JavaScript face of the native Android voice plugin (Capacitor plugin name "TutorVoice"). The Kotlin side
// lives in android/app/src/main/java/.../voice/ and must match this file exactly.
//
// One `listen` call is one recognition session: it ends with the final phrase, an error or `cancel`. The caller starts
// the next session for continuous listening. The plugin uses the on-device recognizer when the phone has one, else the
// system recognizer with EXTRA_PREFER_OFFLINE; when that has no language pack either, the system recognizer online.

/** Which recognizer made a result, from most to least private. */
export type RecognizerMode = 'onDevice' | 'preferOffline' | 'online';

export interface ListenResult {
  /** The best final phrase, trimmed; null when the recognizer heard no words. */
  readonly text: string | null;
  readonly mode: RecognizerMode;
}

export interface TutorVoicePlugin {
  /**
   * Asks for the microphone permission if needed, then listens for one phrase (BCP 47 `language`). A rejection has
   * `code` named after Chrome's speech recognition errors where one fits: 'not-allowed' (no microphone permission),
   * 'unavailable' (no recognizer on the phone), 'aborted' (cancel, a newer listen call, or the app went to the
   * background), 'no-speech' (silence), 'no-match' (speech, but no words), 'audio-capture', 'network', 'server',
   * 'busy', 'client', 'too-many-requests', 'server-disconnected', 'language-not-supported', 'language-unavailable',
   * 'cannot-check-support', or 'error-<n>' for an unknown SpeechRecognizer error number.
   */
  listen(options: { language: string }): Promise<ListenResult>;
  /** Ends the session in flight without a result: its `listen` rejects with 'aborted'. */
  cancel(): Promise<void>;
}
