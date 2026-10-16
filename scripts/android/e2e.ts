// Camera loops on Android: npm run android:e2e [-- --build | --no-build] [-- --only=learn,hold,judge,mirror,device]
// (--only drives some phases, for work on one mode; the report marks such a run as partial.)
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import type { FrameSpec } from '../../src/gate/page.ts';
import { JEV_ENDPOINT } from '../../src/intent/jev.ts';
import type { ModeId, Stage } from '../../src/modes/mode.ts';
import type { TutorSettings } from '../../src/modes/settings.ts';
import type { PoseId } from '../../src/pose/types.ts';
import type { PhotoMeta } from '../../src/progress/types.ts';
import type { Snapshot } from '../../src/ui/engine.ts';
import { APP_ORIGIN, bootEmulator, EMULATOR_LOG, emulatorRunning, ensureApk, installApp, lockHarness, screenshot, startApp, type BuildMode } from './lib/device.ts';
import { renderFrames } from './lib/frames.ts';
import { appUid, hostAddresses, isGoogleAddress, watchSockets } from './lib/network.ts';
import { adb, adbBytes, APP_ID, AVD, main, median, ROOT, runVisible, SERIAL, sleep, waitFor } from './lib/tools.ts';

const REPORT = join(ROOT, 'docs/e2e-report.md');
const SHOTS = join(ROOT, 'docs/shots/e2e');
const HISTORY = join(SHOTS, 'history.jsonl');
const WORK = join(tmpdir(), 'pose-tutor-e2e');
const CAMERA = join(WORK, 'camera.mp4');
const CAMERA_IDLE_MS = 5000;
const POSE: PoseId = 'frontDoubleBiceps';
const SECONDS_PER_FRAME = 0.25;
const TRANSITION_FRAMES = 6;
const SETTINGS: TutorSettings = { voiceCommands: true, debrief: false, holdGoal: 10 };
const VOICE_PHRASE = 'next one please';
const FREE_PHRASE = 'could you go to the next one';
const MIRROR_MIN_CHANGE_DEG = 30;
const COACH_UNAVAILABLE = 'On-device coach is not available on this phone:';
const JEV_HOST = new URL(JEV_ENDPOINT).host;
/** Hosts that Google's SDKs in the app (ML Kit GenAI) send usage metrics to, with no image and no prompt. */
const TELEMETRY_HOSTS = ['firebaselogging.googleapis.com'];
const PAGE_ORIGINS = [APP_ORIGIN, 'data:'];

function typesafeKey(): string | null {
  const fromEnv = process.env.TYPESAFE_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  const file = join(ROOT, '.env.local');
  if (!existsSync(file)) return null;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const value = /^\s*(?:export\s+)?TYPESAFE_API_KEY\s*=\s*(.*?)\s*$/.exec(line)?.[1]?.replace(/^(['"])(.*)\1$/, '$2');
    if (value) return value;
  }
  return null;
}

/** Every plugin call goes through Capacitor.toNative. Report only the URL's host: the options hold the key. */
const PAGE_WATCH = `(() => {
  console.debug('[watch] page');
  document.addEventListener('securitypolicyviolation', (e) => console.warn('[csp] ' + e.effectiveDirective + ' ' + e.blockedURI));
  const wrap = () => {
    const cap = window.Capacitor;
    if (!cap || typeof cap.toNative !== 'function') return false;
    if (cap.__e2eWatched) return true;
    const toNative = cap.toNative;
    cap.toNative = (plugin, method, options, callback) => {
      let host = '';
      if (plugin === 'CapacitorHttp') {
        try { host = new URL(options.url).host; } catch { host = 'unparsable URL'; }
      }
      console.debug('[native] ' + JSON.stringify({ plugin, method, host }));
      return toNative(plugin, method, options, callback);
    };
    cap.__e2eWatched = true;
    console.debug('[watch] capacitor');
    return true;
  };
  if (!wrap()) {
    const timer = setInterval(() => { if (wrap()) clearInterval(timer); }, 1);
  }
})()`;

interface NativeCall {
  readonly plugin: string;
  readonly method: string;
  readonly host: string;
}
type ClipId = 'learn' | 'hold' | 'judge' | 'mirror';

interface Hold {
  readonly pose: PoseId;
  readonly seconds: number;
}

/**
 * The emulator loops each clip, so the in-between frames also lead from the last pose back to the first. The quarter
 * turn gets 20 s: on the emulator, single frames of the side view score under the hold line (76-79), so a 3 s hold can
 * take several tries.
 */
const CLIPS: Readonly<Record<ClipId, readonly Hold[]>> = {
  learn: [
    { pose: 'relaxedFront', seconds: 8 },
    { pose: POSE, seconds: 10 },
  ],
  hold: [
    { pose: 'relaxedFront', seconds: 4 },
    { pose: POSE, seconds: 30 },
  ],
  judge: [
    { pose: 'relaxedFront', seconds: 10 },
    { pose: 'quarterTurnLeftSide', seconds: 20 },
    { pose: 'relaxedBack', seconds: 25 },
  ],
  mirror: [
    { pose: 'relaxedFront', seconds: 6 },
    { pose: POSE, seconds: 6 },
  ],
};
const CLIP_IDS = Object.keys(CLIPS) as ClipId[];
const MOVE_SECONDS = TRANSITION_FRAMES * SECONDS_PER_FRAME;

function clipFrames(clip: readonly Hold[]): { readonly spec: FrameSpec; readonly seconds: number }[] {
  return clip.flatMap(({ pose, seconds }, i) => {
    const to = clip[(i + 1) % clip.length].pose;
    const move = Array.from({ length: TRANSITION_FRAMES }, (_, k) => ({ spec: { from: pose, to, t: (k + 1) / (TRANSITION_FRAMES + 1) }, seconds: SECONDS_PER_FRAME }));
    return [{ spec: { pose }, seconds }, ...move];
  });
}

const clipVideo = (id: ClipId): string => join(SHOTS, `camera-${id}.mp4`);
const describeClip = (id: ClipId): string =>
  `${CLIPS[id].map((h) => `${h.pose} ${h.seconds} s`).join(', ')}; ${CLIPS[id].reduce((sum, h) => sum + h.seconds + MOVE_SECONDS, 0)} s loop`;

async function makeClips(): Promise<void> {
  const index = new Map<string, number>();
  const loops = CLIP_IDS.map((id) => ({
    id,
    frames: clipFrames(CLIPS[id]).map(({ spec, seconds }) => {
      const key = JSON.stringify(spec);
      const n = index.get(key) ?? index.size;
      index.set(key, n);
      return { n, seconds };
    }),
  }));
  console.log(`Rendering ${index.size} figure frames for ${loops.length} camera clips.`);
  const pngs = await renderFrames([...index.keys()].map((key) => JSON.parse(key) as FrameSpec));
  rmSync(WORK, { recursive: true, force: true });
  const renders = join(WORK, 'renders');
  mkdirSync(renders, { recursive: true });
  const render = (n: number) => join(renders, `${String(n).padStart(3, '0')}.png`);
  pngs.forEach((png, n) => writeFileSync(render(n), png));
  for (const { id, frames } of loops) {
    const dir = join(WORK, `frames-${id}`);
    mkdirSync(dir);
    let n = 0;
    for (const { n: rendered, seconds } of frames) {
      const file = render(rendered);
      for (let k = 0; k < Math.round(seconds / SECONDS_PER_FRAME); k++) symlinkSync(file, join(dir, `${String(n++).padStart(4, '0')}.png`));
    }
    runVisible('scripts/android/camera-video.sh', [dir, clipVideo(id), String(SECONDS_PER_FRAME)]);
    console.log(`Camera clip ${id}: ${relative(ROOT, clipVideo(id))}, ${describeClip(id)}.`);
  }
}

/**
 * Makes `id` the front camera from the next camera start on. The emulator keeps playing its current clip, from where it
 * is, when the camera opens again within about 1 s of closing; after 3 s closed it read the file again and played it
 * from the start (measured with a grey-ramp clip). So the camera must stay closed for CAMERA_IDLE_MS first.
 */
async function useClip(id: ClipId): Promise<void> {
  copyFileSync(clipVideo(id), `${CAMERA}.next`);
  renameSync(`${CAMERA}.next`, CAMERA);
  await sleep(CAMERA_IDLE_MS);
}

interface Seen {
  readonly camera: Snapshot['camera'];
  readonly calibration: Snapshot['calibration'];
  readonly stage?: Stage;
  readonly scoring?: PoseId;
  readonly detail?: string;
  readonly score?: number;
  readonly photo?: Pick<PhotoMeta, 'id' | 'pose' | 'score'>;
  readonly heard?: NonNullable<Snapshot['heard']>;
  readonly listening: Snapshot['listening'];
  readonly listenError?: string;
  readonly notice?: string;
  readonly debrief: Snapshot['debrief'];
}

const SEEN = `(() => {
  const s = window.__tutorState?.();
  if (!s) return null;
  return {
    camera: s.camera, calibration: s.calibration, stage: s.view?.stage, scoring: s.view?.scoring, detail: s.view?.detail, score: s.score,
    photo: s.photo && { id: s.photo.id, pose: s.photo.pose, score: s.photo.score },
    heard: s.heard, listening: s.listening, listenError: s.listenError, notice: s.notice, debrief: s.debrief,
  };
})()`;

interface Sample {
  readonly t: number;
  readonly frames: number;
  readonly landmarks: number;
  readonly camera?: string;
  readonly stage?: Stage['kind'];
  readonly clock?: string;
  readonly reason?: string;
  readonly facing?: string;
  readonly heldMs?: number;
  readonly score?: number;
  readonly upperarmL?: number;
  readonly upperarmR?: number;
}

const RECORD = `(() => {
  if (!window.__e2eFrames) {
    const counts = { n: 0, landmarks: 0 };
    window.__e2eFrames = counts;
    window.Capacitor.Plugins.TutorPose.addListener('frame', (f) => { counts.n++; if (f.landmarks) counts.landmarks++; });
  }
  clearInterval(window.__e2eTimer);
  const samples = [];
  window.__e2eSamples = samples;
  window.__e2eTimer = setInterval(() => {
    const s = window.__tutorState?.();
    const stage = s?.view?.stage;
    const figure = s?.view?.figure.kind === 'live' ? s.view.figure.figure : undefined;
    samples.push({ t: performance.now(), frames: window.__e2eFrames.n, landmarks: window.__e2eFrames.landmarks, camera: s?.camera.kind,
      stage: stage?.kind, reason: stage?.reason, facing: s?.facing, clock: s?.view?.clock?.label, heldMs: stage?.heldMs, score: s?.score,
      upperarmL: figure?.bones.upperarmL?.[0]?.[3], upperarmR: figure?.bones.upperarmR?.[0]?.[3] });
  }, 100);
})()`;
const SAMPLES = 'window.__e2eSamples ?? []';
const STOP_RECORD = `(() => { clearInterval(window.__e2eTimer); return window.__e2eSamples ?? []; })()`;

const ARMS = ['upperarmL', 'upperarmR'] as const;
type Arm = (typeof ARMS)[number];

interface TimedValue {
  readonly t: number;
  readonly v: number;
}

interface ArmFollow {
  readonly arm: Arm;
  readonly start: number;
  readonly up: TimedValue | undefined;
  readonly top: TimedValue | undefined;
  readonly down: TimedValue | undefined;
}

function armFollow(all: readonly Sample[], arm: Arm): ArmFollow {
  const live = all.find((s) => s.camera === 'live')?.t ?? NaN;
  const raw = all.filter((s) => s.landmarks > all[0].landmarks).flatMap((s) => (s[arm] === undefined ? [] : [{ t: (s.t - live) / 1000, v: s[arm] }]));
  const series = raw.map((p, i) => ({ t: p.t, v: median(raw.slice(Math.max(0, i - 2), i + 3).map((q) => q.v)) }));
  const start = median(series.slice(0, 10).map((p) => p.v));
  const up = series.find((p) => p.v > start + MIRROR_MIN_CHANGE_DEG);
  let top = up;
  let down: TimedValue | undefined;
  for (const p of up ? series.filter((q) => q.t > up.t) : []) {
    if (top && p.v > top.v) top = p;
    if (top && p.v < top.v - MIRROR_MIN_CHANGE_DEG) {
      down = p;
      break;
    }
  }
  return { arm, start, up, top, down };
}

interface Utterance {
  readonly text: string;
  readonly voice: string | undefined;
  readonly startedAt: number;
  readonly endedAt?: number;
  readonly end?: 'done' | 'error' | 'cancelled';
  readonly error?: string;
  readonly failedVoice?: string;
}

interface Check {
  readonly phase: string;
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
  readonly seconds: number;
}

type PhaseId = 'learn' | 'hold' | 'judge' | 'mirror' | 'device';
const PHASE_IDS: readonly PhaseId[] = ['learn', 'hold', 'judge', 'mirror', 'device'];

interface PhaseRecord {
  readonly name: string;
  readonly clip: ClipId;
  readonly seconds: number;
  readonly framesPerSecond: number;
  readonly landmarksPerSecond: number;
}

interface Event {
  readonly phase: string;
  readonly t: number;
  readonly text: string;
}

interface HistoryEntry {
  readonly when: string;
  readonly passed: boolean;
  readonly seconds: number;
  readonly only: string | undefined;
  readonly checks: readonly Pick<Check, 'name' | 'ok' | 'seconds'>[];
}

interface ReportInput {
  readonly passed: boolean;
  readonly checks: readonly Check[];
  readonly phases: readonly PhaseRecord[];
  readonly events: readonly Event[];
  readonly speech: readonly Utterance[];
  readonly history: readonly HistoryEntry[];
  readonly logcatLines: number;
  readonly device: string;
  readonly only: readonly PhaseId[];
  readonly seconds: number;
}

const cell = (text: string): string => text.replaceAll('|', '\\|');

function report(o: ReportInput): string {
  const say = (u: Utterance) =>
    `- "${u.text}": ${u.end ?? 'not ended'}${u.endedAt === undefined ? '' : ` after ${((u.endedAt - u.startedAt) / 1000).toFixed(1)} s`}${u.voice ? `, voice ${u.voice}` : ''}${u.failedVoice ? ` (${u.failedVoice} failed)` : ''}${u.error ? `, error ${u.error}` : ''}`;
  const lines = [
    '# Camera loops on Android',
    '',
    'Generated by `npm run android:e2e` (`scripts/android/e2e.ts`). Do not edit by hand.',
    '',
    `**Result: ${o.passed ? 'PASS' : 'FAIL'}.** ${o.checks.filter((c) => c.ok).length} of ${o.checks.length} checks passed in ${o.seconds.toFixed(0)} s (from the app start to the last check).${o.only.length < PHASE_IDS.length ? ` Partial run: \`--only=${o.only.join(',')}\`.` : ''}`,
    '',
    `- When: ${new Date().toISOString()}.`,
    `- Device: ${o.device}.`,
    `- Front camera: one clip per mode (camera-video.sh, ${SECONDS_PER_FRAME} s per frame, ${TRANSITION_FRAMES} in-between frames (${MOVE_SECONDS} s) from each pose to the next and from the last back to the first). The emulator loops a clip. After the camera is closed for ${CAMERA_IDLE_MS / 1000} s, it reads the file again and plays it from the start when the app starts the camera; so the driver puts a mode's clip in place and waits ${CAMERA_IDLE_MS / 1000} s before it starts the mode.`,
    ...CLIP_IDS.map((id) => `  - \`${relative(ROOT, clipVideo(id))}\`: ${describeClip(id)}.`),
    '- Driver: CDP into the app WebView through `adb forward`. Each mode starts with its `button[data-mode]` on the home screen and ends with the Exit button. Learn ends its build-up with the Space key, Judge\'s calls stop with Escape after call 3.',
    '',
    '## Checks',
    '',
    `Time: seconds from the previous check, or from the start of the phase, to the moment the run saw the result (for Judge's calls: the rest after the call). The phase start includes the ${CAMERA_IDLE_MS / 1000} s camera wait.`,
    '',
    '| phase | check | result | time (s) | detail |',
    '|---|---|---|---|---|',
    ...o.checks.map((c) => `| ${c.phase} | ${cell(c.name)} | ${c.ok ? 'pass' : '**FAIL**'} | ${c.seconds.toFixed(1)} | ${cell(c.detail)} |`),
    '',
    '## Phases',
    '',
    'Camera frames: the native pose frames per second during the phase (all frames / frames with landmarks).',
    '',
    '| phase | clip | time (s) | camera frames/s |',
    '|---|---|---|---|',
    ...o.phases.map((p) => `| ${p.name} | ${p.clip} | ${p.seconds.toFixed(1)} | ${p.framesPerSecond.toFixed(1)} / ${p.landmarksPerSecond.toFixed(1)} |`),
    '',
    '## Recent runs',
    '',
    `From \`${relative(ROOT, HISTORY)}\` (git-ignored), newest last.`,
    '',
    '| when | phases | result | checks | time (s) | failed |',
    '|---|---|---|---|---|---|',
    ...o.history.slice(-5).map((h) => {
      const failed = h.checks.filter((c) => !c.ok);
      return `| ${h.when} | ${h.only ?? 'all'} | ${h.passed ? 'PASS' : 'FAIL'} | ${h.checks.length - failed.length} of ${h.checks.length} | ${h.seconds.toFixed(0)} | ${cell(failed.map((c) => c.name).join('; ') || '-')} |`;
    }),
    '',
    '## Timeline (seconds after the start of each phase)',
    '',
  ];
  for (const { name } of o.phases) lines.push(`### ${name}`, '', ...o.events.filter((e) => e.phase === name).map((e) => `- ${e.t.toFixed(1)}: ${e.text}`), '');
  const ends = Object.entries(Object.groupBy(o.speech, (u) => u.end ?? 'not ended')).map(([end, us]) => `${us?.length ?? 0} ${end}`);
  lines.push(
    '## Spoken lines (window.__tutorSpeech)',
    '',
    `${o.speech.length} lines: ${ends.join(', ') || 'none'}.`,
    '',
    ...o.speech.map(say),
    '',
    `TTS lines in logcat during the run: ${o.logcatLines} (\`${relative(ROOT, SHOTS)}/logcat-tts.txt\`).`,
    '',
    '## Files (git-ignored)',
    '',
    `\`${relative(ROOT, SHOTS)}/\`: the clips camera-<clip>.mp4, the screenshots (01-learn-live.png to 11-coach-unavailable.png, zz-*`,
    'on a failure), the saved photo and its sidecar, logcat-tts.txt, logcat-pose.txt, history.jsonl and run.json (all states the',
    'checks read, the page samples of each phase, and the network records).',
    '',
  );
  return lines.join('\n');
}

function readHistory(): HistoryEntry[] {
  if (!existsSync(HISTORY)) return [];
  return readFileSync(HISTORY, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as HistoryEntry);
}

main(async (cleanup) => {
  const args = process.argv.slice(2);
  const build: BuildMode = args.includes('--build') ? 'always' : args.includes('--no-build') ? 'never' : 'auto';
  const onlyArg = args.find((a) => a.startsWith('--only='))?.slice('--only='.length);
  const only = onlyArg === undefined ? PHASE_IDS : PHASE_IDS.filter((id) => onlyArg.split(',').includes(id));
  if (only.length === 0) throw new Error(`--only takes phases from ${PHASE_IDS.join(', ')}, not ${onlyArg}`);
  mkdirSync(SHOTS, { recursive: true });
  for (const file of readdirSync(SHOTS)) if (join(SHOTS, file) !== HISTORY) rmSync(join(SHOTS, file), { recursive: true, force: true });
  await makeClips();
  await useClip('learn');
  const apk = ensureApk(build, ['index.html']);
  cleanup(lockHarness());
  const emulator = await bootEmulator({ camera: `videofile:${CAMERA}`, gpu: 'host', reuse: false });
  cleanup(() => emulator.stop());
  installApp(apk);
  const device = `${SERIAL} (AVD ${AVD}, Android ${adb('shell', 'getprop', 'ro.build.version.release').trim()}, -gpu host)`;
  adb('logcat', '-c');
  cleanup(() => void adb('shell', 'am', 'force-stop', APP_ID));
  const nativeCalls: NativeCall[] = [];
  const cspViolations: string[] = [];
  const pageRequests: string[] = [];
  const watched = { page: 0, capacitor: 0 };
  const app = await startApp((type, text) => {
    if (text === '[watch] page') watched.page++;
    else if (text === '[watch] capacitor') watched.capacitor++;
    else if (text.startsWith('[native] ')) nativeCalls.push(JSON.parse(text.slice('[native] '.length)) as NativeCall);
    else if (text.startsWith('[csp] ')) cspViolations.push(text.slice('[csp] '.length));
    if (type === 'error' || type === 'warning') console.log(`[app ${type}] ${text}`);
  });
  cleanup(() => app.close());
  const stopSockets = watchSockets(appUid());
  cleanup(async () => void (await stopSockets()));
  app.cdp.on('Network.requestWillBeSent', (params) => pageRequests.push((params as { request: { url: string } }).request.url));
  await app.cdp.send('Network.enable');
  await app.cdp.send('Page.enable');
  await app.cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: PAGE_WATCH });
  await app.cdp.evaluate(`localStorage.setItem('pose-tutor-settings', ${JSON.stringify(JSON.stringify(SETTINGS))})`);
  await app.open('index.html');

  const ev = async <T>(expression: string, timeoutMs?: number): Promise<T> => (await app.cdp.evaluate(expression, timeoutMs)) as T;
  const seen = async (): Promise<Seen | undefined> => (await ev<Seen | null>(SEEN).catch(() => null)) ?? undefined;
  const until = (label: string, timeoutMs: number, accept: (s: Seen) => boolean) =>
    waitFor(label, timeoutMs, async () => {
      const s = await seen();
      return s && accept(s) ? s : undefined;
    }, 250);
  const click = async (selector: string, text = ''): Promise<void> => {
    const ok = await ev<boolean>(`(() => {
      const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => e.textContent.includes(${JSON.stringify(text)}));
      if (!el) return false;
      el.scrollIntoView({ block: 'center' });
      el.click();
      return true;
    })()`);
    if (!ok) throw new Error(`Nothing to click: ${selector} ${text}`);
  };
  const atHome = async () => ((await ev<boolean>(`!!document.querySelector('button[data-mode="learn"]')`).catch(() => false)) ? true : undefined);
  const startMode = async (mode: ModeId) => {
    await waitFor('the home screen', 90_000, atHome);
    await click(`button[data-mode="${mode}"]`);
  };
  const cameraLive = async (): Promise<Seen> => {
    const live = await until('the camera', 90_000, (s) => s.camera.kind !== 'starting');
    event(`camera ${JSON.stringify(live.camera)}`, live);
    if (live.camera.kind !== 'live') throw new Error(`the camera is not live (${JSON.stringify(live.camera)}), so the drive stops here`);
    return live;
  };
  const endBuildUp = async () => {
    for (let i = 0; i < 20 && (await seen())?.stage?.kind === 'step'; i++) {
      await ev(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }))`);
      await sleep(400);
    }
    const practice = await seen();
    event(`build-up done, stage ${JSON.stringify(practice?.stage)}`, practice);
  };

  const checks: Check[] = [];
  const phases: PhaseRecord[] = [];
  const events: Event[] = [];
  const states: { phase: string; t: number; label: string; state: Seen | undefined }[] = [];
  const runStart = Date.now();
  let phaseName = '';
  let phaseStart = runStart;
  let mark = runStart;
  const check = (name: string, ok: boolean, detail: string, at = Date.now()) => {
    const now = Math.max(at, mark);
    checks.push({ phase: phaseName, name, ok, detail, seconds: (now - mark) / 1000 });
    mark = now;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${detail}`);
  };
  const event = (text: string, state?: Seen) => {
    const t = (Date.now() - phaseStart) / 1000;
    events.push({ phase: phaseName, t, text });
    states.push({ phase: phaseName, t, label: text, state });
  };
  const samples: Partial<Record<string, Sample[]>> = {};
  const phase = async (id: PhaseId, name: string, clip: ClipId, body: () => Promise<void>) => {
    if (!only.includes(id)) return;
    phaseName = name;
    phaseStart = mark = Date.now();
    console.log(`\n${name} (clip ${clip})`);
    await useClip(clip);
    await ev(RECORD);
    try {
      await body();
    } catch (err) {
      check(`${name}: the drive finished`, false, err instanceof Error ? err.message : String(err));
      try {
        screenshot(join(SHOTS, `zz-${clip}-failure.png`));
      } catch (shotErr) {
        console.warn(`No failure screenshot: ${String(shotErr)}`);
      }
    }
    const recorded = await ev<Sample[]>(STOP_RECORD).catch((): Sample[] => []);
    samples[name] = recorded;
    const first = recorded.at(0);
    const last = recorded.at(-1);
    const span = first && last ? (last.t - first.t) / 1000 : NaN;
    phases.push({
      name,
      clip,
      seconds: (Date.now() - phaseStart) / 1000,
      framesPerSecond: first && last ? (last.frames - first.frames) / span : NaN,
      landmarksPerSecond: first && last ? (last.landmarks - first.landmarks) / span : NaN,
    });
    await ev(`document.querySelector('.tutor-run-bar .pill')?.click()`).catch(() => undefined);
    await waitFor('the home screen', 30_000, atHome).catch(async () => {
      console.warn('No home screen after the phase; loading index.html again.');
      await app.open('index.html');
    });
  };

  await phase('learn', 'Learn', 'learn', async () => {
    await startMode('learn');
    const live = await cameraLive();
    check('Camera starts', live.camera.kind === 'live', JSON.stringify(live.camera));
    await sleep(1500);
    screenshot(join(SHOTS, '01-learn-live.png'));

    const step = await until('calibration and the first build-up step', 90_000, (s) => s.calibration.kind === 'ready' && s.stage?.kind === 'step');
    event(`calibration ${JSON.stringify(step.calibration)}, step ${JSON.stringify(step.stage)}, scoring ${step.scoring}`, step);
    check('Learn scores the chosen pose', step.scoring === POSE, `scoring ${step.scoring}`);
    screenshot(join(SHOTS, '02-build-up.png'));

    const before = step.stage?.kind === 'step' ? step.stage.index : -1;
    const accepted = (await ev(`window.__tutorVoice(${JSON.stringify(VOICE_PHRASE)})`)) === true;
    const after = await until('the voice command', 20_000, (s) => s.heard?.text === VOICE_PHRASE).catch(() => undefined);
    const moved = after !== undefined && (after.stage?.kind !== 'step' || after.stage.index > before);
    event(`voice "${VOICE_PHRASE}": accepted ${accepted}, heard ${JSON.stringify(after?.heard)}, stage ${JSON.stringify(after?.stage)}`, after);
    check(
      'Injected voice command acts',
      accepted && after?.heard?.command === 'next' && moved,
      `__tutorVoice returned ${accepted}; heard command ${after?.heard?.command ?? 'none'} via ${after?.heard?.via ?? '-'}; step ${before} -> ${after?.stage?.kind === 'step' ? after.stage.index : (after?.stage?.kind ?? '-')}`,
    );

    await endBuildUp();
    const holding = await until('holding', 120_000, (s) => s.stage?.kind === 'holding' || s.stage?.kind === 'done');
    event(`stage ${holding.stage?.kind}, score ${holding.score?.toFixed(1)}`, holding);
    screenshot(join(SHOTS, '03-holding.png'));
    const done = await until('the hit', 60_000, (s) => s.stage?.kind === 'done');
    const summary = done.stage?.kind === 'done' ? done.stage.summary : undefined;
    const hit = summary?.mode === 'learn' ? summary.result : undefined;
    event(`done, result ${JSON.stringify(hit && { score: hit.score })}`, done);
    check('Learn reaches a hit', hit !== undefined, hit ? `hit score ${hit.score.toFixed(1)}` : `summary ${JSON.stringify(summary)}`);

    const withPhoto = await until('the photo', 30_000, (s) => s.photo !== undefined || s.notice !== undefined).catch(() => done);
    await sleep(1000);
    screenshot(join(SHOTS, '04-hit.png'));
    const photo = withPhoto.photo;
    event(`photo ${JSON.stringify(photo)}, notice ${withPhoto.notice ?? '-'}`, withPhoto);
    if (!photo) {
      check('Photo saved in app storage', false, `no photo in the tutor state; notice ${withPhoto.notice ?? '-'}`);
      return;
    }
    const files = adb('shell', 'run-as', APP_ID, 'ls', 'files/photos').split(/\s+/).filter(Boolean);
    const image = files.find((f) => f.startsWith(`${photo.id}.`) && !f.endsWith('.json'));
    const sidecar = files.includes(`${photo.id}.json`) ? adb('shell', 'run-as', APP_ID, 'cat', `files/photos/${photo.id}.json`) : undefined;
    const data = image ? adbBytes('exec-out', 'run-as', APP_ID, 'cat', `files/photos/${image}`) : Buffer.alloc(0);
    const jpeg = data[0] === 0xff && data[1] === 0xd8;
    const webp = data.subarray(8, 12).toString() === 'WEBP';
    if (image) writeFileSync(join(SHOTS, `photo-${image}`), data);
    if (sidecar) writeFileSync(join(SHOTS, `photo-${photo.id}.json`), sidecar);
    const meta = sidecar ? (JSON.parse(sidecar) as Partial<PhotoMeta>) : undefined;
    check(
      'Photo saved in app storage',
      image !== undefined && (jpeg || webp) && meta?.pose === POSE,
      `files/photos: ${image ?? 'no image'} (${data.length} bytes, ${jpeg ? 'JPEG' : webp ? 'WebP' : 'not an image'}), sidecar pose ${meta?.pose ?? 'missing'}, ${files.length} files`,
    );
  });

  await phase('hold', 'Hold drill', 'hold', async () => {
    await startMode('hold');
    await cameraLive();
    const holding = await until('the hold', 90_000, (s) => s.stage?.kind === 'holding' || s.stage?.kind === 'done');
    event(`stage ${holding.stage?.kind}, score ${holding.score?.toFixed(1)}, ${holding.detail ?? ''}`, holding);
    const done = await until('the end of the hold', 90_000, (s) => s.stage?.kind === 'done');
    screenshot(join(SHOTS, '05-hold-done.png'));
    const summary = done.stage?.kind === 'done' ? done.stage.summary : undefined;
    const result = summary?.mode === 'hold' ? summary.result : undefined;
    event(`done, summary ${JSON.stringify(summary)}`, done);
    const goalMs = SETTINGS.holdGoal * 1000;
    check(
      'Hold drill 10 s completes with a mean score and steadiness',
      result !== undefined && result.goalMs === goalMs && Number.isFinite(result.meanScore) && Number.isFinite(result.scoreSd),
      result
        ? `${summary?.mode === 'hold' ? summary.pose : '-'}: mean ${result.meanScore.toFixed(1)}, steadiness ±${result.scoreSd.toFixed(1)} points, goal ${result.goalMs / 1000} s, hold started ${(result.timeToHitMs / 1000).toFixed(1)} s after the start`
        : `no result; summary ${JSON.stringify(summary)}`,
    );
    const recorded = await ev<Sample[]>(SAMPLES);
    const holdFrom = recorded.findIndex((s) => s.clock === 'Hold');
    const afterHold = holdFrom < 0 ? [] : recorded.slice(holdFrom);
    const left = afterHold.find((s) => s.stage !== 'holding' && s.stage !== 'done');
    const posed = CLIPS.hold.find((h) => h.pose === POSE)?.seconds ?? 0;
    check(
      'Hold drill does not reset while the clip holds the pose',
      result?.resets === 0 && holdFrom >= 0 && left === undefined,
      `resets ${result?.resets ?? '-'}; ${holdFrom < 0 ? 'the page never showed the Hold clock' : left ? `back to ${left.stage} ${((left.t - recorded[holdFrom].t) / 1000).toFixed(1)} s after the hold started` : `the Hold clock ran without a break over ${afterHold.length} samples`}; the clip holds ${POSE} for ${posed} s`,
    );
  });

  await phase('judge', "Judge's calls", 'judge', async () => {
    const calls = CLIPS.judge.length;
    await startMode('judge');
    await cameraLive();
    let last = '';
    const ended: number[] = [];
    const end = await waitFor(`the end of call ${calls}`, (calls * 25 + 30) * 1000, async () => {
      const s = await seen();
      if (!s) return undefined;
      const now = `${s.stage?.kind} · ${s.detail ?? ''}`;
      const next = Number(/^Next: call (\d+) of/.exec(s.detail ?? '')?.[1] ?? 0);
      if (now !== last) {
        last = now;
        event(`${now}, score ${s.score?.toFixed(1) ?? '-'}, scoring ${s.scoring ?? '-'}`, s);
        if (s.stage?.kind === 'rest') {
          ended[next - 2] = Date.now();
          screenshot(join(SHOTS, `06-judge-after-call-${next - 1}.png`));
        }
      }
      return s.stage?.kind === 'done' || next > calls ? s : undefined;
    }, 250);
    if (end.stage?.kind !== 'done') await ev(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
    const done = await until('the round summary', 10_000, (s) => s.stage?.kind === 'done');
    const summary = done.stage?.kind === 'done' ? done.stage.summary : undefined;
    const results = summary?.mode === 'judge' ? summary.calls : [];
    event(`stopped after call ${calls}, calls ${JSON.stringify(results)}`, done);
    for (const [i, { pose }] of CLIPS.judge.entries()) {
      const call = results.at(i);
      check(
        `Judge's call ${i + 1} (${pose}) reaches a hit`,
        call?.pose === pose && call.outcome === 'hit',
        call ? `${call.pose}: ${call.outcome}, score ${call.score?.toFixed(1) ?? '-'}, ${(call.timeMs / 1000).toFixed(1)} s from the call` : 'no result for this call',
        ended.at(i),
      );
    }
  });

  await phase('mirror', 'Mirror', 'mirror', async () => {
    await startMode('mirror');
    await cameraLive();
    await sleep(2000);
    screenshot(join(SHOTS, '07-mirror-relaxed.png'));
    const deadline = Date.now() + 90_000;
    let raised = false;
    let followed: ArmFollow[];
    for (;;) {
      const all = await ev<Sample[]>(SAMPLES);
      followed = all.length === 0 ? [] : ARMS.map((arm) => armFollow(all, arm));
      const up = followed.length > 0 && followed.every((a) => a.up);
      if (!raised && up) {
        raised = true;
        await sleep(1000);
        screenshot(join(SHOTS, '07-mirror-raised.png'));
      }
      if ((up && followed.every((a) => a.down)) || Date.now() > deadline) break;
      await sleep(1000);
    }
    const deg = (p: { t: number; v: number } | undefined) => (p ? `${p.v.toFixed(0)}° at ${p.t.toFixed(1)} s` : 'never');
    event(`arms ${JSON.stringify(followed)}`);
    check(
      `Mirror: the figure's upper arms follow the clip (up, then down again, by more than ${MIRROR_MIN_CHANGE_DEG}°)`,
      followed.length > 0 && followed.every((a) => a.down),
      `${followed.map((a) => `${a.arm} ${a.start.toFixed(0)}° (relaxed front), up past ${(a.start + MIRROR_MIN_CHANGE_DEG).toFixed(0)}°: ${deg(a.up)}, top ${deg(a.top)}, down again: ${deg(a.down)}`).join('; ') || 'no samples'} (seconds after the camera started)`,
    );
  });

  let keyStored = false;
  await phase('device', 'Phone only: on-device coach and jev', 'learn', async () => {
    const stateOf = (section: string) =>
      waitFor(`the ${section} state`, 15_000, async () => {
        const state = await ev<string>(`document.querySelector('[data-testid="${section}"] .tutor-device-state')?.dataset.state ?? ''`);
        return state !== '' && state !== 'checking' ? state : undefined;
      });
    const coachState = await stateOf('device-coach');
    const coachText = await ev<string>(`document.querySelector('[data-testid="device-coach"] .tutor-device-state').textContent`);
    check('Settings shows the on-device coach as unavailable on the emulator', coachState === 'unavailable', `data-state ${coachState}: ${coachText}`);

    await click('[data-testid="device-coach"] .pill', 'Self-test');
    const selfTest = await waitFor('the self-test', 30_000, async () =>
      (await ev<{ state: string; text: string } | null>(
        `(() => { const el = document.querySelector('[data-testid="coach-self-test"]'); return el && el.dataset.state !== 'running' ? { state: el.dataset.state, text: el.querySelector('p').textContent } : null; })()`,
      )) ?? undefined,
    );
    await ev(`document.querySelector('[data-testid="device-coach"]').scrollIntoView({ block: 'start' })`);
    await sleep(1500);
    screenshot(join(SHOTS, '08-coach-self-test.png'));
    check('The self-test reports the coach unavailable', selfTest.state === 'done' && selfTest.text.startsWith(COACH_UNAVAILABLE), `${selfTest.state}: ${selfTest.text}`);

    const key = typesafeKey();
    if (key === null) throw new Error('No TypeSafe key: set TYPESAFE_API_KEY in the environment or in .env.local.');
    const keyBefore = await stateOf('device-key');
    const stored = (await app.cdp.send('Runtime.evaluate', {
      expression: `window.__tutorSetup.saveKey(${JSON.stringify(key)}).then(() => true, () => false)`,
      awaitPromise: true,
      returnByValue: true,
    })) as { result?: { value?: unknown } };
    if (stored.result?.value !== true) throw new Error('Storing the TypeSafe key through window.__tutorSetup.saveKey failed.');
    keyStored = true;
    cleanup(() => void adb('shell', 'pm', 'clear', APP_ID));
    event('the TypeSafe key went into TutorSecrets through window.__tutorSetup.saveKey');
    await app.open('index.html');
    await waitFor('the home screen', 30_000, atHome);
    const keyAfter = await stateOf('device-key');
    const page = await ev<string>(`document.documentElement.outerHTML + [...document.querySelectorAll('input')].map((i) => i.value).join(' ')`);
    await ev(`document.querySelector('[data-testid="device-key"]').scrollIntoView({ block: 'start' })`);
    await sleep(1500);
    screenshot(join(SHOTS, '09-key-saved.png'));
    check(
      'Settings shows the key as saved, and never the key',
      keyBefore === 'not-saved' && keyAfter === 'saved' && !page.includes(key),
      `before ${keyBefore}, after ${keyAfter}; key text on the page: ${page.includes(key) ? 'yes' : 'no'}`,
    );

    const debriefBox = `[...document.querySelectorAll('label.tutor-check')].find((l) => l.textContent.includes('Coach debrief'))?.querySelector('input')`;
    if (!(await ev<boolean>(`${debriefBox}.checked`))) await ev(`${debriefBox}.click()`);
    if (!(await ev<boolean>(`${debriefBox}.checked`))) throw new Error('the coach debrief setting did not turn on');

    await startMode('learn');
    await cameraLive();
    const step0 = await until('the first build-up step', 90_000, (s) => s.calibration.kind === 'ready' && s.stage?.kind === 'step');
    const before = step0.stage?.kind === 'step' ? step0.stage.index : -1;
    const accepted = (await ev(`window.__tutorVoice(${JSON.stringify(FREE_PHRASE)})`)) === true;
    const after = await until('the free phrase', 20_000, (s) => s.heard?.text === FREE_PHRASE).catch(() => undefined);
    const heard = after?.heard;
    const moved = after !== undefined && (after.stage?.kind !== 'step' || after.stage.index > before);
    event(`voice "${FREE_PHRASE}": accepted ${accepted}, heard ${JSON.stringify(heard)}, stage ${JSON.stringify(after?.stage)}`, after);
    check(
      'A free phrase is decided by jev from the phone and acts',
      accepted && heard?.via === 'jev' && heard.command === 'next' && moved,
      `"${FREE_PHRASE}": command ${heard?.command ?? 'none'} via ${heard?.via ?? '-'}${heard?.confidence === undefined ? '' : `, confidence ${heard.confidence.toFixed(2)}`}; step ${before} -> ${after?.stage?.kind === 'step' ? after.stage.index : (after?.stage?.kind ?? '-')}`,
    );

    await endBuildUp();
    const hit = await until('the hit', 180_000, (s) => s.stage?.kind === 'done');
    event(`done, debrief ${hit.debrief.kind}`, hit);
    const noted = await until('the coach note', 30_000, (s) => s.debrief.kind === 'note' || (s.debrief.kind === 'idle' && (s.notice?.includes('Coach debrief failed') ?? false))).catch(() => undefined);
    await sleep(1500);
    screenshot(join(SHOTS, '10-coach-unavailable.png'));
    const note = noted?.debrief.kind === 'note' ? noted.debrief : undefined;
    event(`debrief ${JSON.stringify(noted?.debrief)}, notice ${noted?.notice ?? '-'}`, noted);
    check(
      'A hit shows the "not available on this phone" coach note, not an error',
      note !== undefined && note.note.startsWith(COACH_UNAVAILABLE) && note.cues.length === 0 && !(noted?.notice?.includes('Coach debrief failed') ?? false),
      note ? `"${note.note}" (${note.model}, ${note.ms} ms); notice ${noted?.notice ?? 'none'}` : `debrief ${noted?.debrief.kind ?? 'timeout'}, notice ${noted?.notice ?? '-'}`,
    );
    await sleep(2000);
    screenshot(join(SHOTS, '11-coach-unavailable-note.png'));
  });

  phaseName = 'Run';
  phaseStart = mark = Date.now();
  const up = emulatorRunning();
  check('Emulator stays up', up, up ? `${SERIAL} ran to the end` : `${SERIAL} exited during the run (log ${EMULATOR_LOG})`);
  await sleep(3000);
  const speech = (await ev<Utterance[] | null>('window.__tutorSpeech ?? null').catch(() => null)) ?? [];
  const spoken = speech.filter((u) => u.end === 'done');
  check(
    'Native TTS spoke',
    spoken.length > 0,
    `${spoken.length} of ${speech.length} lines ended with done${speech.some((u) => u.error) ? `; errors: ${[...new Set(speech.flatMap((u) => (u.error ? [u.error] : [])))].join(', ')}` : ''}`,
  );
  const logcat = up
    ? adb('logcat', '-d', '-v', 'time')
        .split('\n')
        .filter((l) => /tts|texttospeech/i.test(l))
    : [];
  writeFileSync(join(SHOTS, 'logcat-tts.txt'), logcat.join('\n'));
  if (up) writeFileSync(join(SHOTS, 'logcat-pose.txt'), adb('logcat', '-d', '-v', 'time', '-s', 'TutorPose:*'));

  const foreign = [...new Set(pageRequests.filter((url) => !PAGE_ORIGINS.some((origin) => url.startsWith(origin))))];
  check(
    'The WebView requests only its own origin',
    pageRequests.length > 0 && foreign.length === 0,
    `${pageRequests.length} requests (CDP Network log)${foreign.length > 0 ? `; other hosts: ${foreign.slice(0, 5).join(', ')}` : `, all from ${APP_ORIGIN} or data:`}`,
  );
  const httpHosts = [...new Set(nativeCalls.filter((c) => c.plugin === 'CapacitorHttp').map((c) => c.host))];
  const plugins = [...new Set(nativeCalls.map((c) => c.plugin))].sort();
  check(
    `Every CapacitorHttp call goes to ${JEV_HOST}`,
    watched.capacitor > 0 && (only.includes('device') ? httpHosts.length === 1 && httpHosts[0] === JEV_HOST : httpHosts.length === 0),
    `Capacitor.toNative watched in ${watched.capacitor} page loads; ${nativeCalls.filter((c) => c.plugin === 'CapacitorHttp').length} CapacitorHttp calls to ${httpHosts.join(', ') || 'no host'}; plugins called: ${plugins.join(', ')}`,
  );
  const remotes = [...(await stopSockets())];
  const jevAddresses = await hostAddresses(JEV_HOST);
  const telemetryAddresses = new Set((await Promise.all(TELEMETRY_HOSTS.map(hostAddresses))).flatMap((set) => [...set]));
  const sorted: Record<'jev' | 'telemetry' | 'other', string[]> = { jev: [], telemetry: [], other: [] };
  for (const ip of remotes) {
    const kind = jevAddresses.has(ip) ? 'jev' : telemetryAddresses.has(ip) || (await isGoogleAddress(ip)) ? 'telemetry' : 'other';
    sorted[kind].push(ip);
  }
  check(
    `The app's sockets reach only ${JEV_HOST}, plus Google SDK telemetry`,
    sorted.other.length === 0 && (only.includes('device') ? sorted.jev.length > 0 : true),
    `uid ${appUid()}, /proc/net every 0.5 s. ${JEV_HOST}: ${sorted.jev.join(', ') || 'none'}. Google SDK telemetry (${TELEMETRY_HOSTS.join(', ')} or a Google 1e100.net address): ${sorted.telemetry.join(', ') || 'none'}. Other: ${sorted.other.join(', ') || 'none'}`,
  );
  const appViolations = [...cspViolations];
  await ev(`(() => { const s = document.createElement('script'); s.textContent = '0'; document.head.append(s); s.remove(); })()`).catch(() => undefined);
  await sleep(500);
  const control = cspViolations.slice(appViolations.length);
  check(
    'No CSP violation in the page',
    watched.page > 0 && control.some((v) => v.endsWith(' inline')) && appViolations.length === 0,
    `listener in ${watched.page} page loads; control inline script reported as: ${control.join('; ') || 'nothing'}; app violations: ${[...new Set(appViolations)].join('; ') || 'none'}`,
  );
  if (keyStored) {
    const leaked = up && adb('logcat', '-d').includes(typesafeKey() ?? '\0');
    check('The TypeSafe key is not in logcat', up && !leaked, up ? `key text in logcat -d: ${leaked ? 'yes' : 'no'}` : 'no logcat: the emulator is gone');
  }
  writeFileSync(join(SHOTS, 'run.json'), JSON.stringify({ checks, phases, states, speech, samples, network: { pageRequests, nativeCalls, sockets: sorted, cspViolations } }, null, 1));

  const passed = checks.every((c) => c.ok);
  const seconds = (Date.now() - runStart) / 1000;
  const entry: HistoryEntry = {
    when: new Date().toISOString(),
    passed,
    seconds,
    only: only.length < PHASE_IDS.length ? only.join(',') : undefined,
    checks: checks.map(({ name, ok, seconds: s }) => ({ name, ok, seconds: s })),
  };
  appendFileSync(HISTORY, `${JSON.stringify(entry)}\n`);
  writeFileSync(REPORT, report({ passed, checks, phases, events, speech, history: readHistory(), logcatLines: logcat.length, device, only, seconds }));
  console.log(`Wrote ${relative(ROOT, REPORT)}.`);
  console.log(passed ? `Android e2e: PASS (${checks.length} checks)` : `Android e2e: FAIL (${checks.filter((c) => !c.ok).length} of ${checks.length} checks)`);
  return passed ? 0 : 1;
});
