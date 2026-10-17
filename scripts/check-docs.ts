// Checks that every repo path and npm script named in the agent and human docs exists.
// Usage: node scripts/check-docs.ts
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const SKILLS = join(ROOT, '.agents/skills');
const DOCS = [
  'AGENTS.md',
  'README.md',
  ...readdirSync(join(ROOT, 'docs')).filter((f) => f.endsWith('.md')).map((f) => `docs/${f}`),
  ...readdirSync(SKILLS, { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.md')).map((f) => relative(ROOT, join(SKILLS, f))),
];
const PATH = /^(?:\.{1,2}\/)?[\w.@-]+(?:\/[\w.@-]*)+$|^[\w-]+\.(?:md|json|ts|tsx|html|sh)$/;
const pkg: unknown = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const SCRIPTS: object = pkg && typeof pkg === 'object' && 'scripts' in pkg && pkg.scripts && typeof pkg.scripts === 'object' ? pkg.scripts : {};

const ignored = (path: string): boolean => {
  try {
    execFileSync('git', ['check-ignore', '-q', '--no-index', path], { cwd: ROOT });
    return true;
  } catch {
    return false;
  }
};

/**
 * The code spans, fenced code lines and link targets of a line, where the doc names paths and commands. An adb
 * command names paths on the device, so it is left out.
 */
function references(line: string, fenced: boolean): string[] {
  const spans = fenced ? [line] : [...line.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  const links = fenced ? [] : [...line.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1].split('#')[0]);
  return [...spans.filter((span) => !span.trimStart().startsWith('adb ')), ...links];
}

const missing: string[] = [];
let paths = 0;
let scripts = 0;
for (const doc of DOCS) {
  let fenced = false;
  readFileSync(join(ROOT, doc), 'utf8')
    .split('\n')
    .forEach((line, i) => {
      if (line.trimStart().startsWith('```')) {
        fenced = !fenced;
        return;
      }
      const at = `${doc}:${i + 1}`;
      for (const m of line.matchAll(/npm (?:run ([\w:-]+)|(test)\b)/g)) {
        const name = m[1] ?? m[2];
        scripts++;
        if (!Object.hasOwn(SCRIPTS, name)) missing.push(`${at}: npm script "${name}" is not in package.json`);
      }
      for (const text of references(line, fenced)) {
        for (const raw of text.split(/[\s'"=(),;]+/)) {
          const token = raw.replace(/[.:]+$/, '');
          if (!PATH.test(token) || /:\/\/|[$<>*{}~]|^-/.test(token) || token.includes('..') !== token.startsWith('..')) continue;
          paths++;
          const asDir = token.endsWith('/') ? '/' : '';
          const found = [join(ROOT, token), join(ROOT, dirname(doc), token)].some((p) => existsSync(p) || ignored(relative(ROOT, p) + asDir));
          if (!found) missing.push(`${at}: ${token} does not exist`);
        }
      }
    });
}

for (const line of missing) console.log(line);
console.log(`${DOCS.length} docs, ${paths} paths, ${scripts} npm scripts: ${missing.length === 0 ? 'all exist' : `${missing.length} missing`}.`);
process.exit(missing.length === 0 ? 0 : 1);
