import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../..');

/** One file per boundary, each placed where the repo's lint overrides apply. */
const FILES: Readonly<Record<string, string>> = {
  'src/ui/seam.tsx': [
    "import { Capacitor } from '@capacitor/core';",
    "import { DIFFERENT_MAX } from '../gate/criteria';",
    "export const saved = localStorage.getItem('k');",
    'export const camera = window.navigator.mediaDevices;',
    "export const api = globalThis['fetch'];",
    'export const ok = window.setTimeout;',
    'export const used = [Capacitor, DIFFERENT_MAX];',
  ].join('\n'),
  'src/progress/seam.ts': ['export const say = new SpeechSynthesisUtterance();', 'export const ok = document.title;'].join('\n'),
  'src/pose/pure.ts': [
    "import * as THREE from 'three';",
    "import { useState } from 'react';",
    "import { platform } from '../platform/android';",
    "import { TextToSpeech } from '@capacitor-community/text-to-speech';",
    "import { POSE_SPECS } from './spec';",
    'export const used = [THREE, useState, platform, TextToSpeech, POSE_SPECS];',
  ].join('\n'),
  'src/intent/pure.ts': "export { judge } from '../gate/criteria';",
  'src/figure/app.ts': "import * as THREE from 'three';\nimport { median } from '../gate/criteria';\nexport const used = [THREE, median];",
  'src/gate/inside.ts': "export { runGate } from './gate';",
  'scripts/tool.ts': "export type { FrameSpec } from '../src/gate/page.ts';",
  'src/modes/types.ts': [
    'declare function make(): { n: number };',
    'export type Made = ReturnType<typeof make>;',
    'export type Fine = ReturnType<() => number>;',
    'export const wait = new Promise<void>((resolve) => setTimeout(resolve, 10));',
    'export const value: any = 1;',
    '// @ts-ignore',
    'export const a: number = "x";',
    '// @ts-expect-error',
    'export const b: number = "x";',
    '// @ts-expect-error: the test feeds a string on purpose',
    'export const c: number = "x";',
  ].join('\n'),
};

interface Diagnostic {
  readonly code: string;
  readonly filename: string;
  readonly labels: readonly { readonly span: { readonly line: number } }[];
}

const dir = mkdtempSync(join(tmpdir(), 'lint-rules-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function lint(): string[] {
  const config = readFileSync(join(ROOT, '.oxlintrc.json'), 'utf8').replace('./scripts/lint/plugin.ts', join(ROOT, 'scripts/lint/plugin.ts'));
  writeFileSync(join(dir, '.oxlintrc.json'), config);
  for (const [file, source] of Object.entries(FILES)) {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), `${source}\n`);
  }
  const run = spawnSync(join(ROOT, 'node_modules/.bin/oxlint'), ['-f', 'json', '.'], { cwd: dir, encoding: 'utf8' });
  const { diagnostics } = JSON.parse(run.stdout) as { diagnostics: readonly Diagnostic[] };
  return diagnostics.map((d) => `${d.filename}:${d.labels[0]?.span.line} ${d.code}`).sort();
}

describe('the lint rules', () => {
  it('flag each banned pattern where it is banned, and nothing else', () => {
    expect(lint()).toEqual([
      'src/figure/app.ts:2 eslint(no-restricted-imports)',
      'src/intent/pure.ts:1 eslint(no-restricted-imports)',
      'src/modes/types.ts:2 pose-tutor(no-return-type-of-typeof)',
      'src/modes/types.ts:4 pose-tutor(no-new-promise)',
      'src/modes/types.ts:5 typescript(no-explicit-any)',
      'src/modes/types.ts:6 typescript(ban-ts-comment)',
      'src/modes/types.ts:8 typescript(ban-ts-comment)',
      'src/pose/pure.ts:1 eslint(no-restricted-imports)',
      'src/pose/pure.ts:2 eslint(no-restricted-imports)',
      'src/pose/pure.ts:3 eslint(no-restricted-imports)',
      'src/pose/pure.ts:4 eslint(no-restricted-imports)',
      'src/progress/seam.ts:1 pose-tutor(no-device-api)',
      'src/ui/seam.tsx:1 eslint(no-restricted-imports)',
      'src/ui/seam.tsx:2 eslint(no-restricted-imports)',
      'src/ui/seam.tsx:3 pose-tutor(no-device-api)',
      'src/ui/seam.tsx:4 pose-tutor(no-device-api)',
      'src/ui/seam.tsx:5 pose-tutor(no-device-api)',
    ]);
  });
});
