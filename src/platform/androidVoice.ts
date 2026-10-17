import { CapacitorException } from '@capacitor/core';
import type { ListenState, VoiceInput } from './types';
import type { TutorVoicePlugin } from './voicePlugin';

/** Quiet time after the tutor stops speaking before the microphone opens again (room echo). */
const AFTER_SPEECH_MS = 400;
const RETRY_MS = 3000;
const LANGUAGE = 'en-US';

const QUIET: Readonly<Record<string, true>> = { aborted: true, 'no-speech': true, 'no-match': true };
const BLOCKED: Readonly<Record<string, ListenState>> = { 'not-allowed': 'denied', unavailable: 'unsupported' };

function errorCode(err: unknown): string {
  if (err instanceof CapacitorException && err.code) return err.code;
  return err instanceof Error ? err.name : 'start-failed';
}

export class NativeVoiceInput implements VoiceInput {
  private enabled = false;
  private suppressed = false;
  private blocked = false;
  private session: number | undefined;
  private sessions = 0;
  private timer: number | undefined;
  private current: ListenState = 'off';
  private lastError: string | undefined;

  constructor(
    private readonly plugin: TutorVoicePlugin,
    private readonly onPhrase: (text: string) => void,
    private readonly onState: (state: ListenState) => void,
  ) {}

  get state(): ListenState {
    return this.current;
  }

  get error(): string | undefined {
    return this.lastError;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.update(0);
  }

  setSuppressed(suppressed: boolean): void {
    if (suppressed === this.suppressed) return;
    this.suppressed = suppressed;
    this.update(suppressed ? 0 : AFTER_SPEECH_MS);
  }

  dispose(): void {
    this.enabled = false;
    this.update(0);
  }

  /** Test hook: hands `text` to the voice commands as if recognition heard it. False when voice commands are off. */
  inject(text: string): boolean {
    if (!this.enabled) return false;
    this.onPhrase(text);
    return true;
  }

  private wanted(): boolean {
    return this.enabled && !this.suppressed && !this.blocked;
  }

  private set(state: ListenState): void {
    if (state === this.current) return;
    this.current = state;
    this.onState(state);
  }

  private update(delayMs: number): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (!this.wanted()) {
      if (this.session !== undefined) {
        this.session = undefined;
        this.plugin.cancel().catch((err: unknown) => console.warn('speech recognition cancel failed:', err));
      }
      if (!this.blocked) this.set(this.enabled ? 'paused' : 'off');
      return;
    }
    if (this.session !== undefined) return;
    this.timer = setTimeout(() => this.open(), delayMs);
  }

  private open(): void {
    if (!this.wanted() || this.session !== undefined) return;
    const id = ++this.sessions;
    this.session = id;
    if (this.current !== 'error') this.set('listening');
    this.plugin.listen({ language: LANGUAGE }).then(
      ({ text }) => {
        if (this.session !== id) return;
        this.session = undefined;
        this.lastError = undefined;
        this.set('listening');
        if (text) this.onPhrase(text);
        this.update(0);
      },
      (err: unknown) => {
        if (this.session !== id) return;
        this.session = undefined;
        const code = errorCode(err);
        if (QUIET[code]) {
          this.update(0);
          return;
        }
        console.warn('speech recognition error:', code, err instanceof Error ? err.message : err);
        this.lastError = code;
        const blocked = BLOCKED[code];
        if (blocked) {
          this.blocked = true;
          this.set(blocked);
          return;
        }
        this.set('error');
        this.update(RETRY_MS);
      },
    );
  }
}
