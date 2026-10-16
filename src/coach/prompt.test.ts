import { describe, expect, it } from 'vitest';
import { nanoCoachPrompt, parseCoachReply } from './prompt';

const SUMMARY = { pose: 'Side chest', meanScore: 91.2, faults: ['Lift the chest.'] };

describe('parseCoachReply', () => {
  it('reads the JSON from a fenced reply with prose around it', () => {
    const out = 'Looking at the image.\n```json\n{"cues": ["Flare the lats", "Lift the chest"], "note": "Good {shape}."}\n```\nDone.';
    expect(parseCoachReply(out)).toEqual({ cues: ['Flare the lats', 'Lift the chest'], note: 'Good {shape}.' });
  });

  it('keeps at most three cues and takes the last valid object', () => {
    const out = '{"cues": ["old"], "note": "draft"} then {"cues": ["a", "b", "c", "d"], "note": "final"}';
    expect(parseCoachReply(out)).toEqual({ cues: ['a', 'b', 'c'], note: 'final' });
  });

  it('returns null when no object has string cues', () => {
    expect(parseCoachReply('{"cues": string[], "note": string}')).toBeNull();
    expect(parseCoachReply('{"cues": [1, 2]}')).toBeNull();
  });

  it('returns null for a reply cut off before its JSON closes', () => {
    expect(parseCoachReply('{"cues": ["Lift the chest"], "note": "Good')).toBeNull();
  });
});

describe('the coach prompt', () => {
  it('gives Gemini Nano the pose, the tracking summary and what to judge', () => {
    const prompt = nanoCoachPrompt('Side chest', SUMMARY);
    expect(prompt).toContain('"Side chest"');
    expect(prompt).toContain(JSON.stringify(SUMMARY));
    expect(prompt).toContain('lat flare');
  });

  it('ask Gemini Nano for JSON that parseCoachReply reads', () => {
    const form = /in this form: (\{.*\})$/.exec(nanoCoachPrompt('Side chest', SUMMARY))?.[1] ?? '';
    expect(parseCoachReply(form)).toEqual({ cues: ['first cue', 'second cue'], note: 'one or two sentences' });
  });
});
