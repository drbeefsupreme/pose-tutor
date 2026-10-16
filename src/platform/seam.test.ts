import { describe, expect, it } from 'vitest';

const FORBIDDEN: Readonly<Record<string, RegExp>> = {
  camera: /navigator\s*\.\s*mediaDevices|getUserMedia/,
  'speech output': /speechSynthesis|SpeechSynthesisUtterance/,
  'speech recognition': /SpeechRecognition/,
  'wake lock': /navigator\s*\.\s*wakeLock/,
  'local API': /\bfetch\s*\(|['"`]\/api\//,
  storage: /\blocalStorage\b|\bsessionStorage\b/,
};

const SOURCES = import.meta.glob<string>(['../ui/**/*.{ts,tsx}', '../progress/**/*.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

describe('the platform seam', () => {
  it('reads the tutor UI and progress sources', () => {
    expect(Object.keys(SOURCES)).toEqual(
      expect.arrayContaining(['../ui/engine.ts', '../ui/TutorApp.tsx', '../ui/TutorRun.tsx', '../progress/ProgressView.tsx']),
    );
  });

  it('keeps browser and local-API calls out of src/ui and src/progress', () => {
    const uses = Object.entries(SOURCES).flatMap(([file, source]) =>
      source.split('\n').flatMap((line, i) =>
        Object.entries(FORBIDDEN)
          .filter(([, pattern]) => pattern.test(line))
          .map(([what]) => `${file}:${i + 1} uses ${what}: ${line.trim()}`),
      ),
    );
    expect(uses).toEqual([]);
  });
});
