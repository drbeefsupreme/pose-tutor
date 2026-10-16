// What the Android harness scripts share: the repo root, the harness device, the toolchain of env.sh, and cleanup
// that runs on success, on failure and on Ctrl-C.
import { execFileSync, spawnSync, type ExecFileSyncOptions } from 'node:child_process';
import { join } from 'node:path';

export const ROOT = join(import.meta.dirname, '../../..');
/** The harness emulator has its own AVD and port, so it never meets the emulators of other work. */
export const AVD = 'pose-tutor-harness';
export const PORT = 5564;
export const SERIAL = `emulator-${PORT}`;
export const APP_ID = 'io.github.drbeefsupreme.posetutor';
const ADB_TIMEOUT_MS = 120_000;

function toolchainEnv(): NodeJS.ProcessEnv {
  const out = execFileSync('bash', ['-c', 'source scripts/android/env.sh >/dev/null && env -0'], { cwd: ROOT, encoding: 'utf8' });
  const env: NodeJS.ProcessEnv = {};
  for (const entry of out.split('\0')) {
    const at = entry.indexOf('=');
    if (at > 0) env[entry.slice(0, at)] = entry.slice(at + 1);
  }
  return { ...env, ANDROID_SERIAL: SERIAL };
}

/** process.env plus JAVA_HOME, ANDROID_HOME and PATH from scripts/android/env.sh; adb talks to the harness emulator. */
export const ENV = toolchainEnv();

/** Runs a tool from the repo root and returns its stdout. Throws with its stderr when it fails. */
export function run(file: string, args: readonly string[], options: ExecFileSyncOptions = {}): string {
  try {
    return execFileSync(file, args, { cwd: ROOT, env: ENV, encoding: 'utf8', stdio: 'pipe', maxBuffer: 64 << 20, ...options }).toString();
  } catch (err) {
    const stderr = err instanceof Error && 'stderr' in err ? String(err.stderr).trim() : '';
    throw new Error(`${file} ${args.join(' ')} failed${stderr ? `: ${stderr}` : ''}`, { cause: err });
  }
}

/** adb on the harness emulator. Some adb commands (logcat) wait for a missing device, so every call has a deadline. */
export const adb = (...args: string[]): string => run('adb', ['-s', SERIAL, ...args], { timeout: ADB_TIMEOUT_MS });

/** adb with binary stdout, for exec-out. */
export const adbBytes = (...args: string[]): Buffer =>
  execFileSync('adb', ['-s', SERIAL, ...args], { cwd: ROOT, env: ENV, stdio: 'pipe', maxBuffer: 64 << 20, timeout: ADB_TIMEOUT_MS });

/** Runs a tool with its output on this terminal; throws when it exits non-zero. */
export function runVisible(file: string, args: readonly string[]): void {
  const res = spawnSync(file, args, { cwd: ROOT, env: ENV, stdio: 'inherit' });
  if (res.status !== 0) throw new Error(`${file} ${args.join(' ')} exited with ${res.status ?? res.signal}`);
}

export function sleep(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}

const groupAlive = (pid: number): boolean => {
  try {
    process.kill(-pid, 0);
    return true;
  } catch {
    return false;
  }
};

/** Stops the process group that `pid` leads (a detached child with its own children): SIGTERM, then SIGKILL. */
export async function stopGroup(pid: number): Promise<void> {
  for (const signal of ['SIGTERM', 'SIGKILL'] as const) {
    if (!groupAlive(pid)) return;
    process.kill(-pid, signal);
    for (let waited = 0; waited < 5000 && groupAlive(pid); waited += 100) await sleep(100);
  }
}

/** Polls `probe` until it returns a value other than undefined. */
export async function waitFor<T>(label: string, timeoutMs: number, probe: () => T | undefined | Promise<T | undefined>, everyMs = 500): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await probe();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error(`Timed out after ${timeoutMs / 1000} s waiting for ${label}.`);
    await sleep(everyMs);
  }
}

type Step = () => void | Promise<void>;

/**
 * Runs `body`, then its cleanup steps in reverse order, also after an error or Ctrl-C, and exits with the code `body`
 * returns (2 after an error, 130 after a signal).
 */
export function main(body: (cleanup: (step: Step) => void) => Promise<number>): void {
  const steps: Step[] = [];
  const unwind = async (): Promise<void> => {
    for (let step = steps.pop(); step; step = steps.pop()) {
      try {
        await step();
      } catch (err) {
        console.warn(`Cleanup step failed: ${String(err)}`);
      }
    }
  };
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      console.error(`\n${signal}: cleaning up.`);
      void unwind().finally(() => process.exit(130));
    });
  }
  body((step) => steps.push(step)).then(
    async (code) => {
      await unwind();
      process.exit(code);
    },
    async (err: unknown) => {
      console.error(err);
      await unwind();
      process.exit(2);
    },
  );
}

export const median = (values: readonly number[]): number => quantile(values, 0.5);

export function quantile(values: readonly number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length === 0 ? NaN : sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}
