// The harness emulator (AVD pose-tutor-harness, emulator-5564), the debug APK on it, and a CDP connection to the app's
// WebView. Every step converges: a run after a crashed run adopts or replaces what that run left behind.
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, openSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { connect, targets, type Cdp, type Target } from './cdp.ts';
import { adb, adbBytes, APP_ID, AVD, ENV, PORT, ROOT, run, runVisible, SERIAL, waitFor } from './tools.ts';

const LOCK = join(tmpdir(), `pose-tutor-harness-${PORT}.lock`);
const BUILD_LOCK = join(tmpdir(), 'pose-tutor-android-build.lock');
const APK_DIR = join(ROOT, 'android/app/build/outputs/apk/debug');
const SYSTEM_IMAGE = 'system-images;android-35;google_apis;x86_64';
const BOOT_TIMEOUT_MS = 240_000;
/** How long the app's page target must stay the same before the harness connects. */
const SETTLE_MS = 4000;
/** The Capacitor app serves its web part from this origin. */
export const APP_ORIGIN = 'https://localhost';
export const EMULATOR_LOG = join(tmpdir(), `${AVD}-emulator.log`);

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/** One harness run at a time owns emulator-5564. A lock left by a dead run is taken over. */
export function lockHarness(): () => void {
  if (existsSync(LOCK)) {
    const owner = Number(readFileSync(LOCK, 'utf8'));
    if (owner !== process.pid && alive(owner)) throw new Error(`Another harness run (pid ${owner}) is using ${SERIAL}.`);
  }
  writeFileSync(LOCK, String(process.pid));
  return () => rmSync(LOCK, { force: true });
}

export const emulatorRunning = (): boolean => {
  try {
    return adb('get-state').trim() === 'device';
  } catch {
    return false;
  }
};

function ensureAvd(): void {
  if (run('avdmanager', ['list', 'avd', '-c']).split('\n').includes(AVD)) return;
  run('avdmanager', ['create', 'avd', '-n', AVD, '-k', SYSTEM_IMAGE, '-d', 'pixel_7'], { input: 'no\n' });
  appendFileSync(join(homedir(), '.android/avd', `${AVD}.avd`, 'config.ini'), 'hw.cpu.ncore=4\nhw.ramSize=4096\n');
}

async function killEmulator(pid?: number): Promise<void> {
  try {
    adb('emu', 'kill');
  } catch {
    // Already gone.
  }
  await waitFor(`${SERIAL} to stop`, 30_000, () => (emulatorRunning() || (pid !== undefined && alive(pid)) ? undefined : true));
}

export interface Emulator {
  /** Whether this run started it (and so stops it). */
  readonly started: boolean;
  stop(): Promise<void>;
}

/**
 * Emulator GPU modes. SwiftShader is software GL with no display needed, but the emulator exits when the app opens the
 * camera while the WebView renders WebGL (6 of 6 tries). `host` renders through this computer's X display (on this
 * machine its GLX is llvmpipe, also software); figure and camera then run together.
 */
const GPU_MODES = {
  swiftshader: { flag: 'swiftshader_indirect', env: {} },
  host: { flag: 'host', env: { DISPLAY: process.env.DISPLAY ?? ':0' } },
} as const;
export type GpuMode = keyof typeof GPU_MODES;

export interface EmulatorOptions {
  /** The front camera: 'none', 'emulated' or 'videofile:<path>'. */
  readonly camera: string;
  readonly gpu: GpuMode;
  /** Keep an emulator that is already running (its camera and GPU mode may differ); otherwise restart it. */
  readonly reuse: boolean;
}

/** Boots emulator-5564 headless. */
export async function bootEmulator({ camera, gpu, reuse }: EmulatorOptions): Promise<Emulator> {
  if (emulatorRunning()) {
    if (reuse) {
      console.log(`Using the running ${SERIAL}.`);
      return { started: false, stop: async () => {} };
    }
    console.log(`Stopping the running ${SERIAL} to set its camera and GPU mode.`);
    await killEmulator();
  }
  ensureAvd();
  const log = EMULATOR_LOG;
  const args = ['-avd', AVD, '-port', String(PORT), '-no-window', '-no-audio', '-no-boot-anim', '-gpu', GPU_MODES[gpu].flag];
  const child = spawn('emulator', [...args, '-no-snapshot', '-no-metrics', '-camera-front', camera], {
    cwd: ROOT,
    env: { ...ENV, ...GPU_MODES[gpu].env },
    detached: true,
    stdio: ['ignore', openSync(log, 'w'), openSync(log, 'a')],
  });
  child.unref();
  const pid = child.pid;
  if (pid === undefined) throw new Error('The emulator did not start.');
  console.log(`Booting ${AVD} on ${SERIAL} (front camera ${camera}; log ${log}).`);
  const t0 = Date.now();
  const stop = async () => {
    await killEmulator(pid);
    console.log(`Stopped ${SERIAL}.`);
  };
  try {
    await waitFor(`${SERIAL} to boot (see ${log})`, BOOT_TIMEOUT_MS, () => {
      if (!alive(pid)) throw new Error(`The emulator exited during boot. Log: ${log}`);
      try {
        return adb('shell', 'getprop', 'sys.boot_completed').trim() === '1' ? true : undefined;
      } catch {
        return undefined;
      }
    }, 2000);
  } catch (err) {
    await stop();
    throw err;
  }
  console.log(`${SERIAL} booted in ${((Date.now() - t0) / 1000).toFixed(0)} s.`);
  return { started: true, stop };
}

/** Newest modification time under `path`, skipping `skip` directories. */
function newest(path: string, skip: readonly string[]): number {
  if (!existsSync(path)) return 0;
  const stat = statSync(path);
  if (!stat.isDirectory()) return stat.mtimeMs;
  let latest = 0;
  for (const name of readdirSync(path)) {
    const child = join(path, name);
    if (!skip.includes(child)) latest = Math.max(latest, newest(child, skip));
  }
  return latest;
}

/** What build.sh turns into the APK, without the folders it writes itself. */
const APK_INPUTS = ['src', 'public', 'vite.config.ts', 'scripts/android/build.sh', 'capacitor.config.ts', 'package.json', 'android/app/src/main', 'android/app/build.gradle'];

export type BuildMode = 'auto' | 'always' | 'never';

/**
 * The debug APK for the emulator (x86_64), built by build.sh when `mode` is 'always', or 'auto' and the APK is
 * missing or older than its sources. Builds hold the shared build lock, since other work builds the same project.
 * Throws when the APK lacks one of `entries` (pages under assets/public).
 */
export function ensureApk(mode: BuildMode, entries: readonly string[]): string {
  const apk = join(APK_DIR, 'app-x86_64-debug.apk');
  const skip = [join(ROOT, 'android/app/src/main/assets')];
  const sources = Math.max(...APK_INPUTS.map((p) => newest(join(ROOT, p), skip)), ...readdirSync(ROOT).filter((f) => f.endsWith('.html')).map((f) => statSync(join(ROOT, f)).mtimeMs));
  const stale = !existsSync(apk) || statSync(apk).mtimeMs < sources;
  if (mode === 'always' || (mode === 'auto' && stale)) {
    console.log(stale ? 'Building the APK (sources changed).' : 'Building the APK.');
    runVisible('flock', [BUILD_LOCK, 'scripts/android/build.sh']);
  } else if (stale) {
    console.warn('The APK is older than its sources; using it anyway (--no-build).');
  }
  if (!existsSync(apk)) throw new Error(`No APK at ${apk}.`);
  const files = run('unzip', ['-Z1', apk]).split('\n');
  const missing = entries.filter((e) => !files.includes(`assets/public/${e}`));
  if (missing.length > 0) throw new Error(`The APK has no ${missing.join(', ')}. Build it with that entry first.`);
  return apk;
}

/** Installs the APK with its runtime permissions granted and the app's data cleared. */
export function installApp(apk: string): void {
  adb('install', '-r', '-g', apk);
  adb('shell', 'pm', 'clear', APP_ID);
  for (const permission of ['CAMERA', 'RECORD_AUDIO']) adb('shell', 'pm', 'grant', APP_ID, `android.permission.${permission}`);
}

export interface AppPage {
  readonly cdp: Cdp;
  /** Loads another page of the app (a path under APP_ORIGIN) and waits until it has loaded. */
  open(path: string): Promise<void>;
  close(): void;
}

/** Starts the app and connects to its WebView over the DevTools socket that debug builds open. */
export async function startApp(onConsole?: (type: string, text: string) => void): Promise<AppPage> {
  adb('shell', 'am', 'force-stop', APP_ID);
  adb('shell', 'am', 'start', '-W', '-n', `${APP_ID}/.MainActivity`);
  return attachApp(onConsole);
}

/**
 * Connects to the running app's WebView. While a DevTools client is attached, the WebView sets KEEP_SCREEN_ON on the
 * app's window, so a check of the screen timeout closes the page first and attaches again afterwards.
 */
export async function attachApp(onConsole?: (type: string, text: string) => void): Promise<AppPage> {
  const pid = await waitFor('the app process', 30_000, () => adb('shell', 'pidof', APP_ID).trim() || undefined);
  const socket = `webview_devtools_remote_${pid}`;
  await waitFor('the WebView DevTools socket', 30_000, () => (adb('shell', 'cat', '/proc/net/unix').includes(`@${socket}`) ? true : undefined));
  const port = Number(adb('forward', 'tcp:0', `localabstract:${socket}`).trim());
  // Right after boot the system still changes its configuration, and the activity (with a new WebView) is created again.
  let seen: Target | undefined;
  let since = Date.now();
  const page = await waitFor('a settled app page', 60_000, async () => {
    const t = (await targets(port).catch(() => [])).find((x) => x.type === 'page' && x.url.startsWith(APP_ORIGIN));
    if (t?.webSocketDebuggerUrl !== seen?.webSocketDebuggerUrl) [seen, since] = [t, Date.now()];
    return t && Date.now() - since >= SETTLE_MS ? t : undefined;
  });
  const cdp = await connect(page.webSocketDebuggerUrl, onConsole);
  return {
    cdp,
    async open(path) {
      const url = `${APP_ORIGIN}/${path}`;
      await cdp.send('Page.navigate', { url });
      await waitFor(url, 30_000, async () => {
        const state = await cdp.evaluate('location.href + " " + document.readyState').catch(() => undefined);
        return state === `${url} complete` ? true : undefined;
      }, 250);
    },
    close() {
      cdp.close();
      adb('forward', '--remove', `tcp:${port}`);
    },
  };
}

/** A PNG screenshot of the device screen (the native camera preview included). */
export function screenshot(path: string): void {
  writeFileSync(path, adbBytes('exec-out', 'screencap', '-p'));
}
