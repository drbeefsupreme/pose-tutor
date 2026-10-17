import { describe, expect, it } from 'vitest';
import { Speech, type Line, type SpeechEngine, type SpeechStore, type Voice } from './speech';

class FakeEngine implements SpeechEngine {
  readonly lines: Line[] = [];
  cancels = 0;
  private readonly list: Voice[] = [
    { voiceURI: 'a', lang: 'en-US', localService: true },
    { voiceURI: 'b', lang: 'en-GB', localService: true },
  ];
  speak(line: Line): void {
    this.lines.push(line);
  }
  cancel(): void {
    this.cancels += 1;
  }
  voices(): readonly Voice[] {
    return this.list;
  }
  onVoicesChanged(): void {}
  get texts(): string[] {
    return this.lines.map((l) => l.text);
  }
}

function memoryStore(): SpeechStore {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
  };
}

describe('Speech', () => {
  it('speaks one sentence at a time and keeps only the newest waiting one', () => {
    const engine = new FakeEngine();
    const speech = new Speech(engine, memoryStore());
    const results = [speech.say('one', false), speech.say('two', false), speech.say('three', false)];
    engine.lines[0].done();
    expect({ results, texts: engine.texts, speaking: speech.speaking }).toEqual({
      results: ['spoken', 'queued', 'queued'],
      texts: ['one', 'three'],
      speaking: true,
    });
  });

  it('cuts off the sentence in flight for an interrupting one and drops the waiting one', () => {
    const engine = new FakeEngine();
    const speech = new Speech(engine, memoryStore());
    speech.say('one', false);
    speech.say('two', false);
    speech.say('Hold it.', true);
    engine.lines[0].done();
    engine.lines[1].done();
    expect({ texts: engine.texts, cancels: engine.cancels, speaking: speech.speaking }).toEqual({
      texts: ['one', 'Hold it.'],
      cancels: 1,
      speaking: false,
    });
  });

  it('tells subscribers when speaking starts and ends', () => {
    const engine = new FakeEngine();
    const speech = new Speech(engine, memoryStore());
    const seen: boolean[] = [];
    speech.subscribe(() => seen.push(speech.speaking));
    speech.say('one', false);
    engine.lines[0].done();
    expect(seen).toEqual([true, false]);
  });

  it('keeps mute and the chosen voice across a reload', () => {
    const store = memoryStore();
    const first = new Speech(new FakeEngine(), store);
    first.setMuted(true);
    first.setVoice('b');
    const engine = new FakeEngine();
    const reloaded = new Speech(engine, store);
    const whileMuted = reloaded.say('one', false);
    reloaded.setMuted(false);
    reloaded.say('two', false);
    expect({
      muted: whileMuted,
      voice: reloaded.voice,
      lines: engine.lines.map((l) => [l.text, l.voice?.voiceURI]),
    }).toEqual({ muted: 'muted', voice: 'b', lines: [['two', 'b']] });
  });
});
