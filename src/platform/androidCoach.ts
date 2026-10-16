import { nanoCoachPrompt, parseCoachReply } from '../coach/prompt';
import { chooseIntent, type PostJson } from '../intent/jev';
import { COMMAND_OPTIONS, type IntentReply } from '../modes/commands';
import { POSE_SPECS } from '../pose/spec';
import type { NanoGenerateResult, NanoStatusResult, TutorCoachPlugin } from './coachPlugin';
import type { SecretKey, TutorSecretsPlugin } from './secretsPlugin';
import type { CoachAsk, CoachClient, CoachNote, DeviceSetup, Health } from './types';

const KEY: SecretKey = 'typesafe-api-key';
const MODEL = 'gemini-nano';
const GENERATE = { temperature: 0.2, maxOutputTokens: 256 } as const;
const SELF_TEST_POSE = POSE_SPECS.sideChest[0].name;

interface DeviceCoachDeps {
  readonly coach: TutorCoachPlugin;
  readonly secrets: TutorSecretsPlugin;
  readonly post: PostJson;
  readonly selfTestImage: string;
}

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err));

function notReady(status: NanoStatusResult): string {
  switch (status.status) {
    case 'downloadable':
      return 'the Gemini Nano model is not downloaded yet. Download it in Settings, On-device coach.';
    case 'downloading':
      return 'the Gemini Nano model is still downloading.';
    default:
      return status.reason ?? 'Android gave no reason.';
  }
}

export function deviceCoach({ coach, secrets, post, selfTestImage }: DeviceCoachDeps): { client: CoachClient; setup: DeviceSetup } {
  const askCoach = async (ask: CoachAsk): Promise<CoachNote> => {
    const started = performance.now();
    const unavailable = (reason: string): CoachNote => ({
      cues: [],
      note: `On-device coach is not available on this phone: ${reason}`,
      model: MODEL,
      ms: Math.round(performance.now() - started),
    });
    const status = await coach.status();
    if (status.status !== 'available') return unavailable(notReady(status));
    let reply: NanoGenerateResult;
    try {
      reply = await coach.generate({ prompt: nanoCoachPrompt(ask.pose, ask.summary), imageDataUrl: ask.imageDataUrl, ...GENERATE });
    } catch (err) {
      const code = typeof err === 'object' && err !== null && 'code' in err ? err.code : undefined;
      if (code === 'unavailable') return unavailable(message(err));
      throw new Error(`the on-device coach failed: ${message(err)}`);
    }
    const parsed = parseCoachReply(reply.text);
    if (!parsed) throw new Error(`the on-device coach reply had no {"cues", "note"} JSON: ${reply.text.slice(-200)}`);
    return { ...parsed, model: reply.model, ms: reply.ms };
  };

  const client: CoachClient = {
    async health(): Promise<Health> {
      const [status, key] = await Promise.all([
        coach.status().catch((err: unknown): NanoStatusResult => ({ status: 'unavailable', reason: `the status check failed: ${message(err)}` })),
        secrets.get({ key: KEY }).then(
          ({ value }) => Boolean(value),
          (err: unknown) => {
            console.warn(`Reading the TypeSafe key failed: ${message(err)}`);
            return false;
          },
        ),
      ]);
      return { coach: status, keyStored: key };
    },

    askCoach,

    async askIntent(heard: string): Promise<IntentReply> {
      try {
        const { value: key } = await secrets.get({ key: KEY });
        if (!key) return { kind: 'unavailable' };
        const { choice, confidence } = await chooseIntent(post, key, heard, COMMAND_OPTIONS);
        return { kind: 'answer', choice, confidence };
      } catch (err) {
        console.warn(`The jev intent call failed; voice commands use keywords: ${message(err)}`);
        return { kind: 'unavailable' };
      }
    },
  };

  const setup: DeviceSetup = {
    async downloadCoach(onProgress) {
      const listener = await coach.addListener('downloadProgress', onProgress);
      try {
        await coach.download();
      } finally {
        await listener.remove();
      }
    },
    selfTest: () =>
      askCoach({ pose: SELF_TEST_POSE, summary: { pose: SELF_TEST_POSE, mode: 'self-test', faults: [] }, imageDataUrl: selfTestImage }),
    async saveKey(key) {
      const value = key.trim();
      if (value === '') throw new Error('The key is empty.');
      await secrets.set({ key: KEY, value });
    },
    clearKey: () => secrets.remove({ key: KEY }),
  };

  return { client, setup };
}
