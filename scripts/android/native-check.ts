// Checks the TutorCoach and TutorSecrets plugins on the harness emulator: npm run android:native-check
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { attachApp, bootEmulator, ensureApk, installApp, lockHarness, startApp, type AppPage } from './lib/device.ts';
import { adb, APP_ID, AVD, main, ROOT, SERIAL, sleep } from './lib/tools.ts';

const OUT = join(ROOT, 'docs/shots/native');
const REPORT = join(ROOT, 'docs/native-report.md');
mkdirSync(OUT, { recursive: true });
const DUMMY = `dummy-not-a-key-${Date.now().toString(36)}`;
const PREFS = 'shared_prefs/tutor_secrets.xml';

interface Outcome<T> {
  readonly ok: boolean;
  readonly value?: T;
  readonly code?: string;
  readonly message?: string;
}

interface StatusValue {
  readonly status: string;
  readonly reason?: string;
}

interface SecretValue {
  readonly value: string | null;
}

interface Check {
  readonly name: string;
  readonly pass: boolean;
  readonly detail: string;
}

const imageJs = (width: number, height: number, type: 'image/jpeg' | 'image/png'): string => `(() => {
  const c = document.createElement('canvas');
  c.width = ${width}; c.height = ${height};
  const g = c.getContext('2d');
  g.fillStyle = '#c84'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#248'; g.fillRect(c.width / 4, c.height / 4, c.width / 2, c.height / 2);
  return c.toDataURL('${type}', 0.9);
})()`;

const show = (o: Outcome<unknown>): string => (o.ok ? `resolved ${JSON.stringify(o.value)}` : `rejected code=${o.code} message=${JSON.stringify(o.message)}`);

main(async (cleanup) => {
  cleanup(lockHarness());
  const checks: Check[] = [];
  const check = (name: string, pass: boolean, detail: string): void => {
    checks.push({ name, pass, detail });
    console.log(`${pass ? 'PASS' : 'FAIL'} ${name}: ${detail}`);
  };

  const apk = ensureApk('never', []);
  const emulator = await bootEmulator({ camera: 'none', gpu: 'host', reuse: true });
  cleanup(() => emulator.stop());
  installApp(apk);
  cleanup(() => void adb('shell', 'am', 'force-stop', APP_ID));
  const aicore = adb('shell', 'pm', 'list', 'packages', 'com.google.android.aicore').trim() || '(not installed)';
  adb('logcat', '-c');

  let app: AppPage = await startApp();
  const pids = [adb('shell', 'pidof', APP_ID).trim()];
  const run = async <T = unknown>(plugin: string, method: string, argsJs = '{}'): Promise<Outcome<T>> =>
    (await app.cdp.evaluate(`(async () => {
      try { return { ok: true, value: (await window.Capacitor.Plugins.${plugin}.${method}(${argsJs})) ?? null }; }
      catch (e) { return { ok: false, code: e.code, message: e.message }; }
    })()`, 60_000)) as Outcome<T>;

  const status = await run<StatusValue>('TutorCoach', 'status');
  check('coach status is unavailable with a reason', status.ok && status.value?.status === 'unavailable' && (status.value.reason ?? '').length > 0, show(status));

  const progress = await app.cdp.evaluate(`(async () => {
    window.__progress = [];
    await window.Capacitor.Plugins.TutorCoach.addListener('downloadProgress', (p) => window.__progress.push(p));
    return true;
  })()`);
  const download = await run('TutorCoach', 'download');
  const events = await app.cdp.evaluate('window.__progress.length');
  check('coach download rejects with unavailable', !download.ok && download.code === 'unavailable', `${show(download)}; listener added: ${String(progress)}; progress events: ${String(events)}`);

  const big = await run('TutorCoach', 'generate', `{ prompt: 'Describe the pose.', imageDataUrl: ${imageJs(4032, 3024, 'image/jpeg')}, temperature: 0.2, maxOutputTokens: 128 }`);
  check('coach generate (4032x3024 JPEG) rejects with unavailable', !big.ok && big.code === 'unavailable', show(big));
  const small = await run('TutorCoach', 'generate', `{ prompt: 'Describe the pose.', imageDataUrl: ${imageJs(600, 800, 'image/png')} }`);
  check('coach generate (600x800 PNG) rejects with unavailable', !small.ok && small.code === 'unavailable', show(small));
  const textOnly = await run('TutorCoach', 'generate', `{ prompt: 'Say hello.' }`);
  check('coach generate (text only) rejects with unavailable', !textOnly.ok && textOnly.code === 'unavailable', show(textOnly));
  const bad = await run('TutorCoach', 'generate', `{ prompt: 'Describe the pose.', imageDataUrl: 'data:image/jpeg;base64,bm90IGFuIGltYWdl' }`);
  check('coach generate (not an image) rejects with badImage', !bad.ok && bad.code === 'badImage', show(bad));
  const notDataUrl = await run('TutorCoach', 'generate', `{ prompt: 'Describe the pose.', imageDataUrl: 'https://example.com/a.jpg' }`);
  check('coach generate (not a data URL) rejects with badImage', !notDataUrl.ok && notDataUrl.code === 'badImage', show(notDataUrl));
  const burst = await app.cdp.evaluate(`(async () => {
    const coach = window.Capacitor.Plugins.TutorCoach;
    const big = ${imageJs(4032, 3024, 'image/jpeg')};
    const code = (p) => p.then(() => 'resolved', (e) => e.code);
    return Promise.all([code(coach.generate({ prompt: 'x', imageDataUrl: big })), code(coach.generate({ prompt: 'y' })), code(coach.generate({ prompt: 'z' }))]);
  })()`, 60_000);
  const codes = Array.isArray(burst) ? burst.map(String) : [];
  check(
    'coach generate x3 at once (a big image first): the first runs, a later one gets busy',
    codes[0] === 'unavailable' && codes.includes('busy') && codes.every((c) => c === 'busy' || c === 'unavailable'),
    `codes in call order ${JSON.stringify(codes)}`,
  );

  const logcatCoach = adb('logcat', '-d', '-v', 'threadtime', '-s', 'TutorCoach:*');
  const sizes = [...logcatCoach.matchAll(/image decoded to (\d+x\d+)/g)].map((m) => m[1]);
  check('images are downsized to a 768 px short side (larger ones only)', sizes[0] === '1024x768' && sizes[1] === '600x800', `decoded sizes in call order: ${JSON.stringify(sizes)}`);

  const key = "{ key: 'typesafe-api-key' }";
  const empty = await run<SecretValue>('TutorSecrets', 'get', key);
  check('secrets get before set is null', empty.ok && empty.value?.value === null, show(empty));
  const set = await run('TutorSecrets', 'set', `{ key: 'typesafe-api-key', value: ${JSON.stringify(DUMMY)} }`);
  check('secrets set resolves', set.ok, show(set));
  const got = await run<SecretValue>('TutorSecrets', 'get', key);
  check('secrets get returns the value', got.ok && got.value?.value === DUMMY, got.ok ? 'resolved the dummy value' : show(got));

  const prefs = adb('shell', 'run-as', APP_ID, 'cat', PREFS);
  writeFileSync(join(OUT, 'prefs-after-set.xml'), prefs);
  check('the prefs file holds no plaintext', prefs.includes('typesafe-api-key') && !prefs.includes(DUMMY) && !prefs.includes(Buffer.from(DUMMY).toString('base64')), `${PREFS}: ${prefs.length} bytes, dummy absent (see prefs-after-set.xml)`);

  app.close();
  adb('shell', 'am', 'force-stop', APP_ID);
  await sleep(1000);
  const pidAfterStop = adb('shell', 'pidof', APP_ID, '||', 'true').trim();
  adb('shell', 'am', 'start', '-W', '-n', `${APP_ID}/.MainActivity`);
  app = await attachApp();
  pids.push(adb('shell', 'pidof', APP_ID).trim());
  const afterRestart = await run<SecretValue>('TutorSecrets', 'get', key);
  check('secrets survive force-stop and relaunch', pidAfterStop === '' && afterRestart.ok && afterRestart.value?.value === DUMMY, `process gone after force-stop: ${pidAfterStop === ''}; ${afterRestart.ok ? 'get resolved the dummy value' : show(afterRestart)}`);

  const unknown = await run('TutorSecrets', 'get', "{ key: 'other-key' }");
  check('secrets get with an unknown key rejects with badKey', !unknown.ok && unknown.code === 'badKey', show(unknown));
  const unknownSet = await run('TutorSecrets', 'set', "{ key: 'other-key', value: 'x' }");
  check('secrets set with an unknown key rejects with badKey', !unknownSet.ok && unknownSet.code === 'badKey', show(unknownSet));
  const noKey = await run('TutorSecrets', 'remove', '{}');
  check('secrets remove without a key rejects with badKey', !noKey.ok && noKey.code === 'badKey', show(noKey));

  const removed = await run('TutorSecrets', 'remove', key);
  const afterRemove = await run<SecretValue>('TutorSecrets', 'get', key);
  const prefsAfterRemove = adb('shell', 'run-as', APP_ID, 'cat', PREFS);
  writeFileSync(join(OUT, 'prefs-after-remove.xml'), prefsAfterRemove);
  check('secrets remove clears the value', removed.ok && afterRemove.ok && afterRemove.value?.value === null && !prefsAfterRemove.includes('typesafe-api-key'), `${show(removed)}; then get ${show(afterRemove)}`);

  const logcat = adb('logcat', '-d', '-v', 'threadtime');
  const crash = adb('logcat', '-d', '-b', 'crash');
  const appLines = logcat.split('\n').filter((l) => pids.includes(l.split(/\s+/)[2] ?? '') || l.includes('AndroidRuntime'));
  writeFileSync(join(OUT, 'logcat-app.txt'), `${appLines.join('\n').replaceAll(DUMMY, '<DUMMY>')}\n`);
  writeFileSync(join(OUT, 'logcat-crash.txt'), crash.replaceAll(DUMMY, '<DUMMY>'));
  const exceptionLines = appLines.filter((l) => /Exception|FATAL/.test(l));
  const ours = appLines.filter((l) => /FATAL EXCEPTION|\bat io\.github\.drbeefsupreme\.posetutor\./.test(l));
  const tags = [...new Set(exceptionLines.map((l) => l.split(/\s+/)[5] ?? '?'))].join(', ') || 'none';
  check(
    'no crash, no exception from the app code',
    crash.trim() === '' && ours.length === 0,
    `app pids ${pids.join(', ')}; crash buffer ${crash.trim() === '' ? 'empty' : 'NOT empty'}; stack lines in app code: ${ours.length}; other exception lines in the app processes: ${exceptionLines.length} (tags: ${tags}; see logcat-app.txt)`,
  );
  const leaks = logcat.split('\n').filter((l) => l.includes(DUMMY));
  check('logcat does not contain the secret value', leaks.length === 0, `${leaks.length} lines with the dummy value${leaks.length > 0 ? `; tags: ${[...new Set(leaks.map((l) => l.split(/\s+/)[5] ?? '?'))].join(', ')}` : ''}`);
  const databases = adb('shell', 'run-as', APP_ID, 'ls', 'databases', '2>/dev/null', '||', 'true').trim().split(/\s+/).filter(Boolean);
  const jobs = adb('shell', 'dumpsys', 'jobscheduler').split('\n').filter((l) => l.includes(APP_ID) && /JOB #|datatransport/.test(l));
  const telemetry = `app databases: ${databases.join(', ') || 'none'}; scheduled jobs of the app: ${jobs.length}${jobs.length > 0 ? ` (${jobs.map((j) => j.trim()).join('; ')})` : ''}`;
  console.log(`INFO usage-metrics queue (datatransport, MediaPipe and ML Kit; disclosed in README.md, What leaves the phone): ${telemetry}`);

  const passed = checks.filter((c) => c.pass).length;
  const report = [
    '# TutorCoach and TutorSecrets on the emulator',
    '',
    `- When: ${new Date().toISOString()}`,
    `- Device: ${SERIAL} (AVD ${AVD}, Android ${adb('shell', 'getprop', 'ro.build.version.release').trim()}, ${adb('shell', 'getprop', 'ro.product.cpu.abi').trim()}), AICore: ${aicore}`,
    `- APK: ${relative(ROOT, apk)}`,
    `- Usage-metrics queue (com.google.android.datatransport, used by MediaPipe and ML Kit; disclosed in README.md, What leaves the phone): ${telemetry}`,
    `- Result: ${passed}/${checks.length} checks pass`,
    '',
    '| Check | Result | Detail |',
    '|---|---|---|',
    ...checks.map((c) => `| ${c.name} | ${c.pass ? 'PASS' : 'FAIL'} | ${c.detail.replaceAll('|', '\\|').replaceAll(DUMMY, '<DUMMY>')} |`),
    '',
  ].join('\n');
  writeFileSync(REPORT, report);
  console.log(`\n${passed}/${checks.length} checks pass. Report: ${relative(ROOT, REPORT)}`);
  app.close();
  return passed === checks.length ? 0 : 1;
});
