/** A text-to-speech voice. `localService` is false for a network voice, which sends the text to Google. */
export interface Voice {
  readonly voiceURI: string;
  readonly lang: string;
  readonly localService: boolean;
}

/** One sentence handed to an engine. The engine calls `done` once when it ends, fails or is cancelled. */
export interface Line {
  readonly text: string;
  readonly voice: Voice | undefined;
  readonly done: () => void;
}

/** What `Speech` needs from a speech engine: Android text-to-speech (`nativeSpeech`), a fake in tests. */
export interface SpeechEngine {
  speak(line: Line): void;
  cancel(): void;
  voices(): readonly Voice[];
  onVoicesChanged(listener: () => void): void;
}

export type SpeechStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** `spoken`: handed to the engine now. `queued`: waits for the sentence in flight. */
export type SayResult = 'spoken' | 'queued' | 'muted';

const VOICE_KEY = 'pose-tutor-voice';
const MUTED_KEY = 'pose-tutor-muted';

/**
 * Speaks one sentence at a time, matching the cue scheduler: a sentence said while another is in flight waits, and
 * only the newest waiting sentence is kept, so a late correction never piles up behind stale ones. An interrupting
 * sentence (the hold started, the pose was hit) cuts off the one in flight. Mute and the chosen voice persist in
 * the store.
 */
export class Speech {
  private readonly listeners = new Set<() => void>();
  private current: Line | undefined;
  private pending: string | undefined;
  private isMuted: boolean;
  private voiceURI: string | undefined;

  constructor(
    private readonly engine: SpeechEngine,
    private readonly store: SpeechStore,
  ) {
    this.isMuted = store.getItem(MUTED_KEY) === 'true';
    this.voiceURI = store.getItem(VOICE_KEY) ?? undefined;
    engine.onVoicesChanged(() => this.notify());
  }

  /** True while a sentence is being spoken. */
  get speaking(): boolean {
    return this.current !== undefined;
  }

  get muted(): boolean {
    return this.isMuted;
  }

  /** URI of the chosen voice; undefined lets the engine pick an English voice. */
  get voice(): string | undefined {
    return this.voiceURI;
  }

  voices(): readonly Voice[] {
    return this.engine.voices();
  }

  /** Calls `listener` when `speaking`, `muted`, `voice` or the voice list changes. Returns the unsubscribe call. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  say(text: string, interrupt: boolean): SayResult {
    if (this.isMuted) return 'muted';
    if (interrupt) {
      this.cancel();
    } else if (this.current !== undefined) {
      this.pending = text;
      return 'queued';
    }
    this.start(text);
    return 'spoken';
  }

  /** Stops the sentence in flight and forgets the waiting one. */
  cancel(): void {
    this.pending = undefined;
    if (this.current === undefined) return;
    this.current = undefined;
    this.engine.cancel();
    this.notify();
  }

  setMuted(muted: boolean): void {
    this.isMuted = muted;
    this.store.setItem(MUTED_KEY, String(muted));
    if (muted) this.cancel();
    this.notify();
  }

  setVoice(voiceURI: string | undefined): void {
    this.voiceURI = voiceURI;
    if (voiceURI === undefined) this.store.removeItem(VOICE_KEY);
    else this.store.setItem(VOICE_KEY, voiceURI);
    this.notify();
  }

  private start(text: string): void {
    const line: Line = {
      text,
      voice: this.voices().find((v) => v.voiceURI === this.voiceURI),
      done: () => {
        if (this.current !== line) return;
        this.current = undefined;
        const next = this.pending;
        this.pending = undefined;
        if (next === undefined) this.notify();
        else this.start(next);
      },
    };
    this.current = line;
    this.engine.speak(line);
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}
