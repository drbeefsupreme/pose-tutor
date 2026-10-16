// The Android SpeechEngine: Android TextToSpeech through @capacitor-community/text-to-speech. It prefers an installed
// local English voice. The plugin cannot tell an installed local voice from one whose data is missing (the emulator
// has data for only some), so a voice that fails is marked and the line is said again with the next untried voice:
// local en-US first, then other local English, then a network en-US voice, then the engine's default.
// The engine keeps the last voice it was given, so "default" alone would repeat a failed voice.
//
// The plugin never settles a `speak` that `stop` or a newer `speak` cut off, so this engine ends the line itself when
// it cancels or replaces it. Every line ends exactly once: done, error or cancelled.

import type { SpeechSynthesisVoice as PluginVoice, TextToSpeechPlugin } from '@capacitor-community/text-to-speech';
import type { Line, SpeechEngine, Voice } from './speech';

export type TtsPlugin = Pick<TextToSpeechPlugin, 'speak' | 'stop' | 'getSupportedVoices'>;

export type SpeechEnd = 'done' | 'error' | 'cancelled';

/** One spoken line, for the test harness and logcat. Times are Date.now() milliseconds. */
export interface SpeechLogEntry {
  readonly text: string;
  /** The voice that said the line; undefined is the engine's default voice. */
  voice: string | undefined;
  readonly startedAt: number;
  endedAt?: number;
  end?: SpeechEnd;
  error?: string;
  /** The first voice that failed for this line; a later voice then said it. */
  failedVoice?: string;
}

interface NativeVoice extends Voice {
  readonly localService: boolean;
  /** Position in the plugin's full voice list, which `speak` takes as `voice`. */
  readonly index: number;
}

interface InFlight {
  readonly line: Line;
  readonly entry: SpeechLogEntry;
}

const VOICE_RETRY_MS = 1000;
const VOICE_TRIES = 10;

/** The English voices, named by their engine id because the plugin names every en-US voice the same. */
export function englishVoices(all: readonly PluginVoice[]): NativeVoice[] {
  return all.flatMap((v, index) =>
    v.lang.toLowerCase().startsWith('en') ? [{ voiceURI: v.voiceURI, name: v.voiceURI, lang: v.lang, default: false, localService: v.localService, index }] : [],
  );
}

export function nativeSpeech(tts: TtsPlugin, log: SpeechLogEntry[]): SpeechEngine {
  let voices: NativeVoice[] = [];
  const failed = new Set<string>();
  const listeners: (() => void)[] = [];
  let current: InFlight | undefined;

  /** The next voice to try: local en-US, other local English, then network en-US; undefined is the engine default. */
  const nextVoice = (): NativeVoice | undefined => {
    const untried = voices.filter((v) => !failed.has(v.voiceURI));
    const local = untried.filter((v) => v.localService);
    return local.find((v) => v.lang === 'en-US') ?? local[0] ?? untried.find((v) => v.lang === 'en-US');
  };

  const end = (flight: InFlight, how: SpeechEnd, error?: string): void => {
    if (current !== flight) return;
    current = undefined;
    Object.assign(flight.entry, { end: how, endedAt: Date.now(), error });
    console.info(`tts ${how}${error ? ` (${error})` : ''}: "${flight.line.text}"`);
    flight.line.done();
  };

  const say = (flight: InFlight, voice: NativeVoice | undefined): void => {
    flight.entry.voice = voice?.voiceURI;
    tts.speak({ text: flight.line.text, lang: voice?.lang ?? 'en-US', voice: voice?.index }).then(
      () => end(flight, 'done'),
      (err: unknown) => {
        if (current !== flight) return;
        const message = err instanceof Error ? err.message : String(err);
        if (!voice) {
          end(flight, 'error', message);
          return;
        }
        console.warn(`tts voice ${voice.voiceURI} failed (${message}); trying another voice`);
        failed.add(voice.voiceURI);
        flight.entry.failedVoice ??= voice.voiceURI;
        say(flight, nextVoice());
      },
    );
  };

  const loadVoices = (tries: number): void => {
    tts.getSupportedVoices().then(
      ({ voices: all }) => {
        voices = englishVoices(all);
        if (voices.length === 0 && tries > 1) {
          setTimeout(() => loadVoices(tries - 1), VOICE_RETRY_MS);
          return;
        }
        for (const listener of listeners) listener();
      },
      // The engine is still starting.
      () => tries > 1 && setTimeout(() => loadVoices(tries - 1), VOICE_RETRY_MS),
    );
  };
  loadVoices(VOICE_TRIES);

  return {
    speak(line) {
      if (current) end(current, 'cancelled');
      const entry: SpeechLogEntry = { text: line.text, voice: undefined, startedAt: Date.now() };
      log.push(entry);
      const flight = { line, entry };
      current = flight;
      const chosen = line.voice && voices.find((v) => v.voiceURI === line.voice?.voiceURI);
      say(flight, chosen && !failed.has(chosen.voiceURI) ? chosen : nextVoice());
    },
    cancel() {
      if (current) end(current, 'cancelled');
      tts.stop().catch((err: unknown) => console.warn('tts stop failed', err));
    },
    voices: () => voices,
    onVoicesChanged: (listener) => void listeners.push(listener),
  };
}
