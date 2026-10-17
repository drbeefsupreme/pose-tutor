import type { SpeechSynthesisVoice as PluginVoice, TTSOptions } from '@capacitor-community/text-to-speech';
import { describe, expect, it } from 'vitest';
import { nativeSpeech, type SpeechLogEntry, type TtsPlugin } from './androidSpeech';

const VOICES: PluginVoice[] = [
  { voiceURI: 'de-de-x-deb-local', name: 'German Germany', lang: 'de-DE', localService: true, default: false },
  { voiceURI: 'en-gb-x-gba-local', name: 'English United Kingdom', lang: 'en-GB', localService: true, default: false },
  { voiceURI: 'en-us-x-iob-local', name: 'English United States', lang: 'en-US', localService: true, default: false },
  { voiceURI: 'en-us-x-iob-network', name: 'English United States', lang: 'en-US', localService: false, default: false },
];

function fakeTts() {
  const calls: { options: TTSOptions; resolve: () => void; reject: (err: Error) => void }[] = [];
  let stops = 0;
  const plugin: TtsPlugin = {
    speak: (options) => {
      const { promise, resolve, reject } = Promise.withResolvers<void>();
      calls.push({ options, resolve, reject });
      return promise;
    },
    stop: async () => void stops++,
    getSupportedVoices: async () => ({ voices: VOICES }),
  };
  return { plugin, calls, stops: () => stops };
}

async function tick() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

async function engine() {
  const tts = fakeTts();
  const log: SpeechLogEntry[] = [];
  const speech = nativeSpeech(tts.plugin, log);
  await tick();
  const ended: string[] = [];
  const say = (text: string, voiceURI?: string) => {
    const voice = voiceURI ? speech.voices().find((v) => v.voiceURI === voiceURI) : undefined;
    speech.speak({ text, voice, done: () => ended.push(text) });
  };
  return { tts, log, speech, ended, say };
}

describe('nativeSpeech', () => {
  it('lists the English voices by engine id', async () => {
    const { speech } = await engine();
    expect(speech.voices().map((v) => `${v.voiceURI} ${v.lang}`)).toEqual([
      'en-gb-x-gba-local en-GB',
      'en-us-x-iob-local en-US',
      'en-us-x-iob-network en-US',
    ]);
  });

  it('says a line with the local en-US voice and ends it once when the engine finishes', async () => {
    const { tts, log, ended, say } = await engine();
    say('Turn the left wrist out.');
    expect(tts.calls[0].options).toEqual({ text: 'Turn the left wrist out.', lang: 'en-US', voice: 2 });
    tts.calls[0].resolve();
    await tick();
    expect(ended).toEqual(['Turn the left wrist out.']);
    expect(log).toMatchObject([{ text: 'Turn the left wrist out.', voice: 'en-us-x-iob-local', end: 'done' }]);
  });

  it('says the line again with the next local voice when one fails, and skips the failed voice later', async () => {
    const { tts, log, ended, say } = await engine();
    say('Hold it.');
    tts.calls[0].reject(new Error('Failed to read text.'));
    await tick();
    expect(tts.calls[1].options).toEqual({ text: 'Hold it.', lang: 'en-GB', voice: 1 });
    expect(ended).toEqual([]);
    tts.calls[1].resolve();
    await tick();
    expect(ended).toEqual(['Hold it.']);
    expect(log[0]).toMatchObject({ voice: 'en-gb-x-gba-local', failedVoice: 'en-us-x-iob-local', end: 'done' });

    say('Next pose.');
    expect(tts.calls[2].options.voice).toBe(1);
  });

  it('tries local, then network, then the engine default, and ends with an error when all fail', async () => {
    const { tts, log, ended, say } = await engine();
    say('Relax.', 'en-us-x-iob-network');
    const tried: (number | undefined)[] = [];
    for (let i = 0; i < 4; i++) {
      tried.push(tts.calls[i].options.voice);
      tts.calls[i].reject(new Error(i === 3 ? 'Failed to read text.' : 'no voice data'));
      await tick();
    }
    expect(tried).toEqual([3, 2, 1, undefined]);
    expect(ended).toEqual(['Relax.']);
    expect(log[0]).toMatchObject({ end: 'error', error: 'Failed to read text.', failedVoice: 'en-us-x-iob-network' });
  });

  it('ends a cancelled or replaced line at once, and ignores the engine settling it later', async () => {
    const { tts, log, speech, ended, say } = await engine();
    say('First.');
    say('Second.');
    expect(ended).toEqual(['First.']);
    speech.cancel();
    expect(ended).toEqual(['First.', 'Second.']);
    expect(tts.stops()).toBe(1);
    tts.calls[0].resolve();
    tts.calls[1].reject(new Error('Failed to read text.'));
    await tick();
    expect(ended).toEqual(['First.', 'Second.']);
    expect(log.map((e) => e.end)).toEqual(['cancelled', 'cancelled']);
  });
});
