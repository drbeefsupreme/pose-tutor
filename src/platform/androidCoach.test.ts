import { describe, expect, it } from 'vitest';
import type { JsonReply, PostJson } from '../intent/jev';
import { deviceCoach } from './androidCoach';
import type { NanoDownloadProgress, NanoGenerateOptions, NanoGenerateResult, NanoStatusResult, TutorCoachPlugin } from './coachPlugin';
import type { SecretKey, TutorSecretsPlugin } from './secretsPlugin';
import type { CoachAsk } from './types';

const ASK: CoachAsk = { pose: 'Front double biceps', summary: { meanScore: 92 }, imageDataUrl: 'data:image/jpeg;base64,AAAA' };
const SELF_TEST_IMAGE = 'data:image/png;base64,SELFTEST';
const JEV_ANSWER = { answers: { intent: { choice: 'next', confidence: 0.91, probabilities: { next: 0.91 } } } };

/** A plugin rejection as Capacitor delivers it: an Error with the plugin's `code`. */
const rejection = (code: string, message: string) => Object.assign(new Error(message), { code });

interface FakeCoach {
  readonly plugin: TutorCoachPlugin;
  readonly generated: NanoGenerateOptions[];
  readonly listeners: { removed: boolean }[];
}

function fakeCoach(status: NanoStatusResult, generate: () => Promise<NanoGenerateResult> = async () => ({ text: '', ms: 0, model: '' })): FakeCoach {
  const generated: NanoGenerateOptions[] = [];
  const listeners: { removed: boolean }[] = [];
  let onProgress: ((p: NanoDownloadProgress) => void) | undefined;
  const plugin: TutorCoachPlugin = {
    status: async () => status,
    async download() {
      onProgress?.({ downloadedBytes: 10, totalBytes: 40 });
      onProgress?.({ downloadedBytes: 40, totalBytes: 40 });
    },
    generate(options) {
      generated.push(options);
      return generate();
    },
    async addListener(_event, listener) {
      onProgress = listener;
      const handle = { removed: false };
      listeners.push(handle);
      return {
        remove: async () => {
          handle.removed = true;
          onProgress = undefined;
        },
      };
    },
  };
  return { plugin, generated, listeners };
}

function fakeSecrets(initial: string | null): { plugin: TutorSecretsPlugin; values: Map<SecretKey, string> } {
  const values = new Map<SecretKey, string>();
  if (initial !== null) values.set('typesafe-api-key', initial);
  const plugin: TutorSecretsPlugin = {
    get: async ({ key }) => ({ value: values.get(key) ?? null }),
    async set({ key, value }) {
      values.set(key, value);
    },
    async remove({ key }) {
      values.delete(key);
    },
  };
  return { plugin, values };
}

function fakePost(reply: JsonReply | Error): { post: PostJson; urls: string[]; auth: string[] } {
  const urls: string[] = [];
  const auth: string[] = [];
  const post: PostJson = async (url, headers) => {
    urls.push(url);
    auth.push(headers.authorization ?? '');
    if (reply instanceof Error) throw reply;
    return reply;
  };
  return { post, urls, auth };
}

const AVAILABLE: NanoStatusResult = { status: 'available' };
const NO_HTTP = fakePost(new Error('no network in this test')).post;

describe('the on-device coach', () => {
  it('sends the hit photo and the Nano prompt, and returns the parsed note with the model and time from the plugin', async () => {
    const coach = fakeCoach(AVAILABLE, async () => ({ text: '```json\n{"cues": ["Lift the chest"], "note": "Good line."}\n```', ms: 1830, model: 'nano-v3' }));
    const { client } = deviceCoach({ coach: coach.plugin, secrets: fakeSecrets(null).plugin, post: NO_HTTP, selfTestImage: SELF_TEST_IMAGE });
    expect(await client.askCoach(ASK)).toEqual({ cues: ['Lift the chest'], note: 'Good line.', model: 'nano-v3', ms: 1830 });
    expect(coach.generated).toHaveLength(1);
    expect(coach.generated[0]?.imageDataUrl).toBe(ASK.imageDataUrl);
    expect(coach.generated[0]?.prompt).toContain('"Front double biceps"');
    expect(coach.generated[0]?.prompt).toContain('{"meanScore":92}');
  });

  it('answers with a plain note, not an error, when Gemini Nano cannot run', async () => {
    const coach = fakeCoach({ status: 'unavailable', reason: 'AICore is not installed.' });
    const { client } = deviceCoach({ coach: coach.plugin, secrets: fakeSecrets(null).plugin, post: NO_HTTP, selfTestImage: SELF_TEST_IMAGE });
    const note = await client.askCoach(ASK);
    expect(note).toEqual(expect.objectContaining({ cues: [], note: 'On-device coach is not available on this phone: AICore is not installed.', model: 'gemini-nano' }));
    expect(coach.generated).toEqual([]);
  });

  it('says to download the model when it is not downloaded yet', async () => {
    const { client } = deviceCoach({ coach: fakeCoach({ status: 'downloadable' }).plugin, secrets: fakeSecrets(null).plugin, post: NO_HTTP, selfTestImage: SELF_TEST_IMAGE });
    expect((await client.askCoach(ASK)).note).toMatch(/not available on this phone: .*not downloaded yet\. Download it in Settings/);
  });

  it('turns an unavailable rejection into the note and other failures into errors', async () => {
    const gone = fakeCoach(AVAILABLE, () => Promise.reject(rejection('unavailable', 'the model was removed')));
    const { client } = deviceCoach({ coach: gone.plugin, secrets: fakeSecrets(null).plugin, post: NO_HTTP, selfTestImage: SELF_TEST_IMAGE });
    expect((await client.askCoach(ASK)).note).toBe('On-device coach is not available on this phone: the model was removed');

    const failing = fakeCoach(AVAILABLE, () => Promise.reject(rejection('failed', 'out of memory')));
    const broken = deviceCoach({ coach: failing.plugin, secrets: fakeSecrets(null).plugin, post: NO_HTTP, selfTestImage: SELF_TEST_IMAGE });
    await expect(broken.client.askCoach(ASK)).rejects.toThrow('the on-device coach failed: out of memory');

    const rambling = fakeCoach(AVAILABLE, async () => ({ text: 'Nice pose!', ms: 900, model: 'nano' }));
    const unparsed = deviceCoach({ coach: rambling.plugin, secrets: fakeSecrets(null).plugin, post: NO_HTTP, selfTestImage: SELF_TEST_IMAGE });
    await expect(unparsed.client.askCoach(ASK)).rejects.toThrow('the on-device coach reply had no {"cues", "note"} JSON: Nice pose!');
  });
});

describe('the voice-command intent', () => {
  it('asks jev with the stored key over the injected HTTP', async () => {
    const http = fakePost({ status: 200, body: JEV_ANSWER });
    const { client } = deviceCoach({ coach: fakeCoach(AVAILABLE).plugin, secrets: fakeSecrets('ts-key').plugin, post: http.post, selfTestImage: SELF_TEST_IMAGE });
    expect(await client.askIntent('could you go on')).toEqual({ kind: 'answer', choice: 'next', confidence: 0.91 });
    expect(http.urls).toEqual(['https://api.typesafe.ai/v1/systemone']);
    expect(http.auth).toEqual(['Bearer ts-key']);
  });

  it('is unavailable, so keywords decide, without a key or when jev fails', async () => {
    const http = fakePost({ status: 200, body: JEV_ANSWER });
    const keyless = deviceCoach({ coach: fakeCoach(AVAILABLE).plugin, secrets: fakeSecrets(null).plugin, post: http.post, selfTestImage: SELF_TEST_IMAGE });
    expect(await keyless.client.askIntent('next')).toEqual({ kind: 'unavailable' });
    expect(http.urls).toEqual([]);

    const offline = deviceCoach({ coach: fakeCoach(AVAILABLE).plugin, secrets: fakeSecrets('ts-key').plugin, post: NO_HTTP, selfTestImage: SELF_TEST_IMAGE });
    expect(await offline.client.askIntent('next')).toEqual({ kind: 'unavailable' });
    const refused = deviceCoach({ coach: fakeCoach(AVAILABLE).plugin, secrets: fakeSecrets('bad').plugin, post: fakePost({ status: 401, body: {} }).post, selfTestImage: SELF_TEST_IMAGE });
    expect(await refused.client.askIntent('next')).toEqual({ kind: 'unavailable' });
  });
});

describe('the device health and setup', () => {
  it('reports the coach status and whether a key is stored, never the key', async () => {
    const secrets = fakeSecrets(null);
    const { client, setup } = deviceCoach({ coach: fakeCoach({ status: 'downloadable' }).plugin, secrets: secrets.plugin, post: NO_HTTP, selfTestImage: SELF_TEST_IMAGE });
    expect(await client.health()).toEqual({ coach: { status: 'downloadable' }, keyStored: false });
    await setup.saveKey('  ts-key \n');
    expect(secrets.values.get('typesafe-api-key')).toBe('ts-key');
    expect(await client.health()).toEqual({ coach: { status: 'downloadable' }, keyStored: true });
    await setup.clearKey();
    expect(await client.health()).toEqual(expect.objectContaining({ keyStored: false }));
    await expect(setup.saveKey('   ')).rejects.toThrow('The key is empty.');
  });

  it('reports a failed status check as unavailable, with the reason', async () => {
    const coach = fakeCoach(AVAILABLE);
    const plugin: TutorCoachPlugin = { ...coach.plugin, status: () => Promise.reject(new Error('AICore crashed')) };
    const { client } = deviceCoach({ coach: plugin, secrets: fakeSecrets('ts-key').plugin, post: NO_HTTP, selfTestImage: SELF_TEST_IMAGE });
    expect(await client.health()).toEqual({ coach: { status: 'unavailable', reason: 'the status check failed: AICore crashed' }, keyStored: true });
  });

  it('reports download progress and removes its listener at the end', async () => {
    const coach = fakeCoach({ status: 'downloadable' });
    const { setup } = deviceCoach({ coach: coach.plugin, secrets: fakeSecrets(null).plugin, post: NO_HTTP, selfTestImage: SELF_TEST_IMAGE });
    const seen: NanoDownloadProgress[] = [];
    await setup.downloadCoach((p) => seen.push(p));
    expect(seen).toEqual([
      { downloadedBytes: 10, totalBytes: 40 },
      { downloadedBytes: 40, totalBytes: 40 },
    ]);
    expect(coach.listeners).toEqual([{ removed: true }]);
  });

  it('runs the self-test on the bundled figure render', async () => {
    const coach = fakeCoach(AVAILABLE, async () => ({ text: '{"cues": [], "note": "A clear side chest."}', ms: 2400, model: 'nano-v3' }));
    const { setup } = deviceCoach({ coach: coach.plugin, secrets: fakeSecrets(null).plugin, post: NO_HTTP, selfTestImage: SELF_TEST_IMAGE });
    expect(await setup.selfTest()).toEqual({ cues: [], note: 'A clear side chest.', model: 'nano-v3', ms: 2400 });
    expect(coach.generated[0]?.imageDataUrl).toBe(SELF_TEST_IMAGE);
    expect(coach.generated[0]?.prompt).toContain('"Side chest, left side"');

    const unavailable = deviceCoach({ coach: fakeCoach({ status: 'unavailable', reason: 'Emulator.' }).plugin, secrets: fakeSecrets(null).plugin, post: NO_HTTP, selfTestImage: SELF_TEST_IMAGE });
    expect((await unavailable.setup.selfTest()).note).toBe('On-device coach is not available on this phone: Emulator.');
  });
});
