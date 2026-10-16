import { describe, expect, it } from 'vitest';
import { decide, keywordCommand } from './commands';

describe('voice commands', () => {
  it("acts on jev's choice at confidence 0.7 or more", () => {
    expect(decide('next one please', { kind: 'answer', choice: 'next', confidence: 0.92 })).toEqual({ command: 'next', via: 'jev', confidence: 0.92 });
    expect(decide('mumble', { kind: 'answer', choice: 'other', confidence: 0.7 })).toEqual({ command: 'other', via: 'jev', confidence: 0.7 });
  });

  it('falls back to keywords when jev is unsure or unavailable', () => {
    expect(decide('hold on a second', { kind: 'answer', choice: 'stop', confidence: 0.5 })).toEqual({ command: 'pause', via: 'keywords', confidence: 0.5 });
    expect(decide('what am I doing wrong', { kind: 'unavailable' })).toEqual({ command: 'whatsWrong', via: 'keywords', confidence: undefined });
    expect(decide('nice weather today', { kind: 'unavailable' })).toEqual({ command: undefined, via: 'keywords', confidence: undefined });
  });

  it('reads the common phrases with the keyword table', () => {
    const phrases: Record<string, string | undefined> = {
      'next one please': 'next',
      'what am I doing wrong': 'whatsWrong',
      'hold on a second': 'pause',
      'say that again': 'repeat',
      "OK I'm ready": 'resume',
      'stop the drill': 'stop',
      'skip to the next one': 'skip',
      'nice weather today': undefined,
    };
    for (const [heard, command] of Object.entries(phrases)) expect([heard, keywordCommand(heard)]).toEqual([heard, command]);
  });
});
