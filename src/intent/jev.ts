// Jev (TypeSafe) picks the voice command that a transcript means. The app (src/platform/androidCoach.ts) sends the
// request over CapacitorHttp; the caller gives the HTTP POST, so the module uses no network API itself.

export const JEV_ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
export const JEV_TIMEOUT_MS = 2000;
const MODEL = 'jev-latest';
const QUESTION_ID = 'intent';
const INSTRUCTIONS =
  'The `transcript` is what speech recognition heard while a user practiced bodybuilding poses in a training app. ' +
  'Which command did the user mean?';

export interface IntentAnswer {
  readonly choice: string;
  readonly confidence: number;
}

export interface JsonReply {
  readonly status: number;
  readonly body: unknown;
}

/** One JSON POST. Rejects when no reply arrives (network error or timeout), with the reason as the message. */
export type PostJson = (url: string, headers: Readonly<Record<string, string>>, body: object, timeoutMs: number) => Promise<JsonReply>;

/** Asks jev one Choice question: which of `options` (option → description) the transcript `heard` means. */
export async function chooseIntent(post: PostJson, key: string, heard: string, options: Readonly<Record<string, string>>): Promise<IntentAnswer> {
  let res: JsonReply;
  try {
    res = await post(
      JEV_ENDPOINT,
      { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      {
        state: { transcript: heard },
        model: MODEL,
        questions: { [QUESTION_ID]: { type: 'choice', instructions: INSTRUCTIONS, criteria: options } },
      },
      JEV_TIMEOUT_MS,
    );
  } catch (err) {
    throw new Error(`jev unreachable: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (res.status < 200 || res.status > 299) throw new Error(`jev returned HTTP ${res.status}`);
  const answer = parseChoiceAnswer(res.body, Object.keys(options));
  if (!answer) throw new Error('jev returned an unexpected answer shape');
  return answer;
}

interface JevResponse {
  answers?: Record<string, { choice?: unknown; confidence?: unknown; probabilities?: unknown } | null>;
}

/** Reads the Choice answer out of a jev response body, or null if the body does not have the expected shape. */
export function parseChoiceAnswer(body: unknown, options: readonly string[]): IntentAnswer | null {
  const answer = (body as JevResponse | null)?.answers?.[QUESTION_ID];
  const choice = answer?.choice;
  const confidence = answer?.confidence;
  const probabilities = answer?.probabilities;
  if (typeof choice !== 'string' || !options.includes(choice)) return null;
  if (typeof confidence !== 'number' || typeof probabilities !== 'object' || probabilities === null) return null;
  return { choice, confidence };
}
