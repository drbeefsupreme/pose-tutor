// Drives the app on the harness emulator one command at a time. The recipes are in
// .agents/skills/verify-pose-tutor/SKILL.md.
//   node scripts/android/drive.ts launch [--camera <mp4>] [--build | --no-build]   (keeps running; stop ends it)
//   node scripts/android/drive.ts clip <out.mp4> <pose>=<seconds>...
//   node scripts/android/drive.ts camera <mp4>
//   node scripts/android/drive.ts doctor
//   node scripts/android/drive.ts eval '<expression>'
//   node scripts/android/drive.ts wait '<expression>' [seconds, default 60]
//   node scripts/android/drive.ts click '<selector>' [text]
//   node scripts/android/drive.ts paste-key        (types TYPESAFE_API_KEY or the .env.local value into Settings; never prints it)
//   node scripts/android/drive.ts shot <png>
//   node scripts/android/drive.ts stop
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { FrameSpec } from '../../src/gate/page.ts';
import type { PoseId } from '../../src/pose/types.ts';
import { connect, targets, type Cdp } from './lib/cdp.ts';
import { APP_ORIGIN, bootEmulator, emulatorRunning, ensureApk, installApp, lockHarness, screenshot, startApp, type BuildMode } from './lib/device.ts';
import { renderFrames } from './lib/frames.ts';
import { adb, APP_ID, AVD, main, PORT, ROOT, run, runVisible, SERIAL, sleep, waitFor } from './lib/tools.ts';

const WORK = join(tmpdir(), 'pose-tutor-drive');
const SESSION = join(WORK, 'session.json');
const CAMERA = join(WORK, 'camera.mp4');
const LOCK = join(tmpdir(), `pose-tutor-harness-${PORT}.lock`);
const SECONDS_PER_FRAME = 0.25;
const TRANSITION_FRAMES = 6;
const DEFAULT_CLIP = ['relaxedFront=8', 'frontDoubleBiceps=10'];

const POSES: { readonly [P in PoseId]: true } = {
  relaxedFront: true,
  quarterTurnLeftSide: true,
  relaxedBack: true,
  quarterTurnRightSide: true,
  frontDoubleBiceps: true,
  frontLatSpread: true,
  sideChest: true,
  backDoubleBiceps: true,
  backLatSpread: true,
  sideTriceps: true,
  absAndThighs: true,
  mostMuscular: true,
};
const isPose = (id: string): id is PoseId => Object.hasOwn(POSES, id);

interface Session {
  readonly pid: number;
  readonly apk: string;
  readonly startedAt: string;
}

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

function readSession(): Session | undefined {
  if (!existsSync(SESSION)) return undefined;
  const data: unknown = JSON.parse(readFileSync(SESSION, 'utf8'));
  if (
    !data || typeof data !== 'object' ||
    !('pid' in data) || typeof data.pid !== 'number' ||
    !('apk' in data) || typeof data.apk !== 'string' ||
    !('startedAt' in data) || typeof data.startedAt !== 'string'
  ) {
    throw new Error(`${SESSION} does not hold a drive session.`);
  }
  return alive(data.pid) ? { pid: data.pid, apk: data.apk, startedAt: data.startedAt } : undefined;
}

function needSession(): Session {
  const session = readSession();
  if (!session) throw new Error('No drive session runs. Start one with: node scripts/android/drive.ts launch');
  return session;
}

const otherEmulators = (): string[] =>
  run('adb', ['devices'])
    .split('\n')
    .map((line) => line.split('\t')[0].trim())
    .filter((serial) => serial.startsWith('emulator-') && serial !== SERIAL);

async function renderClip(out: string, holds: readonly string[]): Promise<void> {
  const parsed = holds.map((hold) => {
    const [pose, seconds] = hold.split('=');
    if (!isPose(pose) || !(Number(seconds) > 0)) throw new Error(`Write each hold as <pose>=<seconds>, not "${hold}". Poses: ${Object.keys(POSES).join(', ')}.`);
    return { pose, seconds: Number(seconds) };
  });
  const timeline: { readonly spec: FrameSpec; readonly seconds: number }[] = parsed.flatMap(({ pose, seconds }, i) => {
    const next = parsed[(i + 1) % parsed.length].pose;
    const moves = next === pose ? [] : Array.from({ length: TRANSITION_FRAMES }, (_, k) => ({ spec: { from: pose, to: next, t: (k + 1) / (TRANSITION_FRAMES + 1) }, seconds: SECONDS_PER_FRAME }));
    return [{ spec: { pose }, seconds }, ...moves];
  });
  const unique = new Map(timeline.map(({ spec }) => [JSON.stringify(spec), spec]));
  const keys = [...unique.keys()];
  console.log(`Rendering ${keys.length} figure frames.`);
  const pngs = await renderFrames([...unique.values()]);
  const dir = mkdtempSync(join(tmpdir(), 'pose-tutor-drive-clip-'));
  try {
    keys.forEach((_, n) => writeFileSync(join(dir, `render-${n}.png`), pngs[n]));
    mkdirSync(join(dir, 'frames'));
    let n = 0;
    for (const { spec, seconds } of timeline) {
      const render = join(dir, `render-${keys.indexOf(JSON.stringify(spec))}.png`);
      for (let k = 0; k < Math.round(seconds / SECONDS_PER_FRAME); k++) symlinkSync(render, join(dir, 'frames', `${String(n++).padStart(4, '0')}.png`));
    }
    mkdirSync(dirname(resolve(out)), { recursive: true });
    runVisible('scripts/android/camera-video.sh', [join(dir, 'frames'), resolve(out), String(SECONDS_PER_FRAME)]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log(`Clip ${out}: ${holds.join(', ')}, looped.`);
}

function useCamera(clip: string): void {
  if (!existsSync(clip)) throw new Error(`No clip at ${clip}.`);
  mkdirSync(WORK, { recursive: true });
  copyFileSync(clip, `${CAMERA}.next`);
  renameSync(`${CAMERA}.next`, CAMERA);
}

function typesafeKey(): string | undefined {
  const fromEnv = process.env.TYPESAFE_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  const file = join(ROOT, '.env.local');
  if (!existsSync(file)) return undefined;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const value = /^\s*(?:export\s+)?TYPESAFE_API_KEY\s*=\s*(.*?)\s*$/.exec(line)?.[1]?.replace(/^(['"])(.*)\1$/, '$2');
    if (value) return value;
  }
  return undefined;
}

interface Page {
  readonly cdp: Cdp;
  close(): void;
}

async function attach(): Promise<Page> {
  const pid = adb('shell', 'pidof', APP_ID).trim();
  if (pid === '') throw new Error(`${APP_ID} is not running on ${SERIAL}.`);
  const port = adb('forward', 'tcp:0', `localabstract:webview_devtools_remote_${pid}`).trim();
  const unforward = () => void adb('forward', '--remove', `tcp:${port}`);
  try {
    const page = (await targets(Number(port))).find((t) => t.type === 'page' && t.url.startsWith(APP_ORIGIN));
    if (!page) throw new Error(`No ${APP_ORIGIN} page in the app WebView.`);
    const cdp = await connect(page.webSocketDebuggerUrl);
    return {
      cdp,
      close() {
        cdp.close();
        unforward();
      },
    };
  } catch (err) {
    unforward();
    throw err;
  }
}

async function withPage<T>(use: (cdp: Cdp) => Promise<T>): Promise<T> {
  needSession();
  const page = await attach();
  try {
    return await use(page.cdp);
  } finally {
    page.close();
  }
}

async function launch(args: string[], cleanup: (step: () => void | Promise<void>) => void): Promise<number> {
  const { values } = parseArgs({ args, options: { camera: { type: 'string' }, build: { type: 'boolean' }, 'no-build': { type: 'boolean' } } });
  const build: BuildMode = values.build ? 'always' : values['no-build'] ? 'never' : 'auto';
  const others = otherEmulators();
  if (others.length > 0) throw new Error(`Another emulator runs (${others.join(', ')}). Only one emulator may run at a time. Stop it first.`);
  cleanup(lockHarness());
  cleanup(() => rmSync(WORK, { recursive: true, force: true }));
  const apk = ensureApk(build, ['index.html']);
  if (values.camera) useCamera(values.camera);
  else await renderClip(CAMERA, DEFAULT_CLIP);
  const emulator = await bootEmulator({ camera: `videofile:${CAMERA}`, gpu: 'host', reuse: false });
  cleanup(() => emulator.stop());
  installApp(apk);
  const app = await startApp((type, text) => {
    if (type === 'error' || type === 'warning') console.log(`[app ${type}] ${text}`);
  });
  cleanup(() => app.close());
  const session: Session = { pid: process.pid, apk, startedAt: new Date().toISOString() };
  writeFileSync(SESSION, JSON.stringify(session, null, 1));
  console.log(`Ready: ${SERIAL} runs ${APP_ID}, front camera ${CAMERA}, session pid ${process.pid}.`);
  while (emulatorRunning()) await sleep(5000);
  throw new Error(`${SERIAL} stopped while the drive session ran.`);
}

async function doctor(): Promise<number> {
  let failed = 0;
  const check = (name: string, ok: boolean, detail: string) => {
    if (!ok) failed++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${detail}`);
  };
  const session = readSession();
  check('drive session', session !== undefined, session ? `pid ${session.pid}, started ${session.startedAt}` : `no live session in ${SESSION}`);
  const owner = existsSync(LOCK) ? Number(readFileSync(LOCK, 'utf8')) : undefined;
  check('harness lock', session !== undefined && owner === session.pid, `${LOCK} names pid ${owner ?? 'none'}`);
  const others = otherEmulators();
  check('one emulator', others.length === 0, others.length === 0 ? `no emulator other than ${SERIAL}` : `also ${others.join(', ')}`);
  const booted = emulatorRunning() && adb('shell', 'getprop', 'sys.boot_completed').trim() === '1';
  check('emulator booted', booted, SERIAL);
  const args = run('ps', ['-eo', 'args']).split('\n').find((line) => line.includes(`-avd ${AVD}`) && line.includes(`-port ${PORT}`)) ?? '';
  const camera = /-camera-front (\S+)/.exec(args)?.[1] ?? 'none';
  check('front camera is a video file', camera.startsWith('videofile:') && existsSync(camera.slice('videofile:'.length)), camera);
  check('emulator audio off', args.includes('-no-audio'), args === '' ? `no ${AVD} emulator process` : args.includes('-no-audio') ? '-no-audio' : 'the emulator plays sound');
  if (!booted) return 1;
  const pid = adb('shell', 'pidof', APP_ID).trim();
  check('app process', pid !== '', pid === '' ? `${APP_ID} is not running` : `pid ${pid}`);
  const installed = /lastUpdateTime=(.+)/.exec(adb('shell', 'dumpsys', 'package', APP_ID))?.[1]?.trim() ?? 'not installed';
  const apkTime = session && existsSync(session.apk) ? statSync(session.apk).mtime.toISOString() : 'no APK';
  console.log(`info installed ${installed}; APK built ${apkTime}`);
  if (pid === '') return 1;
  try {
    const page = await attach();
    try {
      const read = async (expression: string) => String(await page.cdp.evaluate(expression));
      const href = await read('location.href');
      const ready = await read('document.readyState');
      const screen = await read(`['.tutor-run', '.tutor-progress', '.tutor-home'].find((s) => document.querySelector(s)) ?? 'none'`);
      const hooks = await read(`[typeof window.__tutorVoice, Array.isArray(window.__tutorSpeech), typeof window.__tutorSetup].join(' ')`);
      check('app page', href.startsWith(APP_ORIGIN) && ready === 'complete', `${href} ${ready}, screen ${screen}`);
      check('test hooks', hooks === 'function true object', `__tutorVoice, __tutorSpeech, __tutorSetup: ${hooks}`);
    } finally {
      page.close();
    }
  } catch (err) {
    check('app page', false, String(err));
  }
  return failed === 0 ? 0 : 1;
}

async function stop(): Promise<number> {
  const session = readSession();
  if (!session) {
    console.log('No drive session runs.');
    return 0;
  }
  process.kill(session.pid, 'SIGTERM');
  await waitFor(`drive session ${session.pid} to exit`, 60_000, () => (alive(session.pid) ? undefined : true));
  console.log(`Stopped drive session ${session.pid}; ${SERIAL} ${emulatorRunning() ? 'still runs' : 'is off'}.`);
  return emulatorRunning() ? 1 : 0;
}

const CLICK = (selector: string, text: string) => `(() => {
  const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => e.textContent.includes(${JSON.stringify(text)}));
  if (!el) return null;
  el.scrollIntoView({ block: 'center' });
  el.click();
  return el.outerHTML.slice(0, 160);
})()`;

main(async (cleanup) => {
  const [command, ...args] = process.argv.slice(2);
  switch (command) {
    case 'launch':
      return launch(args, cleanup);
    case 'clip': {
      const [out, ...holds] = args;
      if (!out || holds.length === 0) throw new Error('Usage: drive.ts clip <out.mp4> <pose>=<seconds>...');
      await renderClip(out, holds);
      return 0;
    }
    case 'camera':
      needSession();
      useCamera(args[0]);
      console.log(`The front camera plays ${args[0]} from the next camera start. Keep the camera closed for 5 s first.`);
      return 0;
    case 'doctor':
      return doctor();
    case 'eval': {
      const result = await withPage((cdp) => cdp.evaluate(args[0]));
      console.log(JSON.stringify(result, null, 1) ?? 'undefined');
      return 0;
    }
    case 'wait': {
      const seconds = Number(args[1] ?? 60);
      const value = await withPage((cdp) =>
        waitFor(args[0], seconds * 1000, async () => (await cdp.evaluate(args[0]).catch(() => undefined)) || undefined, 250),
      );
      console.log(JSON.stringify(value, null, 1));
      return 0;
    }
    case 'click': {
      const clicked = await withPage((cdp) => cdp.evaluate(CLICK(args[0], args[1] ?? '')));
      if (clicked === null) throw new Error(`Nothing to click: ${args[0]} ${args[1] ?? ''}`);
      console.log(`Clicked ${String(clicked)}`);
      return 0;
    }
    case 'paste-key': {
      const key = typesafeKey();
      if (key === undefined) throw new Error('No TypeSafe key: set TYPESAFE_API_KEY in the environment or in .env.local.');
      await withPage(async (cdp) => {
        const focused = await cdp.evaluate(`(() => { const el = document.querySelector('[data-testid="device-key"] input'); el?.scrollIntoView({ block: 'center' }); el?.focus(); return !!el; })()`);
        if (focused !== true) throw new Error('No key field: open Home, where Settings shows [data-testid="device-key"].');
        await cdp.send('Input.insertText', { text: key });
      });
      console.log(`Typed the TypeSafe key (${key.length} characters) into the key field.`);
      return 0;
    }
    case 'shot':
      needSession();
      mkdirSync(dirname(resolve(args[0])), { recursive: true });
      screenshot(resolve(args[0]));
      console.log(`${args[0]}: ${statSync(args[0]).size} bytes`);
      return 0;
    case 'stop':
      return stop();
    default:
      throw new Error('Commands: launch, clip, camera, doctor, eval, wait, click, shot, stop. See the usage at the top of scripts/android/drive.ts.');
  }
});
