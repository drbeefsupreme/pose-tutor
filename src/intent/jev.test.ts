import { describe, expect, it } from 'vitest';
import { chooseIntent, JEV_ENDPOINT, JEV_TIMEOUT_MS, parseChoiceAnswer, type JsonReply, type PostJson } from './jev';

const OPTIONS = { next: 'Move on.', stop: 'Stop practicing.' };
const ANSWER = { answers: { intent: { type: 'choice', choice: 'next', confidence: 0.93, probabilities: { next: 0.93, stop: 0.07 } } } };

interface Sent {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: object;
  readonly timeoutMs: number;
}

/** A POST that records each request and answers with `reply`, or rejects with `reply` when it is an Error. */
function fakePost(reply: JsonReply | Error): { post: PostJson; sent: Sent[] } {
  const sent: Sent[] = [];
  const post: PostJson = async (url, headers, body, timeoutMs) => {
    sent.push({ url, headers, body, timeoutMs });
    if (reply instanceof Error) throw reply;
    return reply;
  };
  return { post, sent };
}

describe('parseChoiceAnswer', () => {
  it('returns choice, confidence and a probability for every option', () => {
    const body = { answers: { intent: { type: 'choice', choice: 'next', confidence: 0.9, probabilities: { next: 0.95, repeat: 0.05 } } } };
    expect(parseChoiceAnswer(body, ['next', 'repeat', 'stop'])).toEqual({
      choice: 'next',
      confidence: 0.9,
      probabilities: { next: 0.95, repeat: 0.05, stop: 0 },
    });
  });

  it('rejects a choice outside the options and malformed bodies', () => {
    expect(parseChoiceAnswer({ answers: { intent: { choice: 'jump', confidence: 1, probabilities: {} } } }, ['next'])).toBeNull();
    expect(parseChoiceAnswer(null, ['next'])).toBeNull();
    expect(parseChoiceAnswer('oops', ['next'])).toBeNull();
  });
});

describe('chooseIntent', () => {
  it('posts one Choice question with the transcript to jev and reads the answer', async () => {
    const { post, sent } = fakePost({ status: 200, body: ANSWER });
    expect(await chooseIntent(post, 'k-1', 'could you go on', OPTIONS)).toEqual({
      choice: 'next',
      confidence: 0.93,
      probabilities: { next: 0.93, stop: 0.07 },
    });
    expect(sent).toEqual([
      {
        url: 'https://api.typesafe.ai/v1/systemone',
        headers: { authorization: 'Bearer k-1', 'content-type': 'application/json' },
        body: {
          state: { transcript: 'could you go on' },
          model: 'jev-latest',
          questions: { intent: { type: 'choice', instructions: expect.stringContaining('Which command'), criteria: OPTIONS } },
        },
        timeoutMs: JEV_TIMEOUT_MS,
      },
    ]);
    expect(new URL(JEV_ENDPOINT).host).toBe('api.typesafe.ai');
  });

  it('rejects with the reason when jev cannot answer', async () => {
    await expect(chooseIntent(fakePost(new Error('timed out after 2000 ms')).post, 'k', 'next', OPTIONS)).rejects.toThrow('jev unreachable: timed out after 2000 ms');
    await expect(chooseIntent(fakePost({ status: 401, body: { error: 'bad key' } }).post, 'k', 'next', OPTIONS)).rejects.toThrow('jev returned HTTP 401');
    await expect(chooseIntent(fakePost({ status: 200, body: { answers: {} } }).post, 'k', 'next', OPTIONS)).rejects.toThrow('unexpected answer shape');
  });
});
