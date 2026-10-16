// The coach debrief prompt for Gemini Nano on the phone (src/platform/androidCoach.ts), which gets the snapshot
// attached to the request, and the parser of its JSON reply.

const MAX_CUES = 3;
const FOCUS = 'lat flare, chest lift, waist vacuum, tension, facial expression, presentation';

interface CoachReply {
  readonly cues: readonly string[];
  readonly note: string;
}

/**
 * The prompt for Gemini Nano, with the snapshot attached: short lines for a small model, and JSON placeholders that say
 * what goes in each field.
 */
export function nanoCoachPrompt(pose: string, summary: object): string {
  return [
    `You are a bodybuilding posing coach. The image shows an athlete holding the pose ${JSON.stringify(pose)}.`,
    `Joint tracker summary (JSON): ${JSON.stringify(summary)}`,
    `Judge what the tracker cannot measure: ${FOCUS}.`,
    `Give at most ${MAX_CUES} cues, most important first, each under 12 words, and a note of one or two sentences.`,
    'Reply with JSON only, no other text, in this form: {"cues": ["first cue", "second cue"], "note": "one or two sentences"}',
  ].join('\n');
}

/** Extracts the last `{"cues": string[], "note": string}` object from a model's reply, tolerating text and fences around it. */
export function parseCoachReply(text: string): CoachReply | null {
  let found: CoachReply | null = null;
  for (let start = text.indexOf('{'); start !== -1; start = text.indexOf('{', start + 1)) {
    const end = matchingBrace(text, start);
    if (end === -1) continue;
    let value: { cues?: unknown; note?: unknown } | null;
    try {
      value = JSON.parse(text.slice(start, end + 1)) as { cues?: unknown; note?: unknown } | null;
    } catch {
      continue;
    }
    const cues = value?.cues;
    if (!Array.isArray(cues) || !cues.every((c) => typeof c === 'string')) continue;
    found = { cues: cues.slice(0, MAX_CUES), note: typeof value?.note === 'string' ? value.note : '' };
  }
  return found;
}

/** Index of the `}` that closes the `{` at `start`, skipping braces inside JSON strings; -1 if unclosed. */
function matchingBrace(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i;
  }
  return -1;
}
