// The device gate on the harness emulator. Runs each step in order and stops at the first failure: npm run check:android
import { spawnSync } from 'node:child_process';

const STEPS = ['android:build', 'android:lint', 'android:gate', 'android:e2e', 'android:native-check', 'android:phone-shots'] as const;

const passed: string[] = [];
for (const [index, step] of STEPS.entries()) {
  const label = `step ${index + 1}/${STEPS.length}, npm run ${step}`;
  console.log(`\ncheck:android: ${label}`);
  const started = performance.now();
  const { status, signal } = spawnSync('npm', ['run', step], { stdio: 'inherit' });
  const took = `${Math.round((performance.now() - started) / 1000)}s`;
  if (status !== 0) {
    console.error(`\ncheck:android failed at ${label} (${signal ?? `exit code ${status}`}, after ${took}).`);
    if (passed.length > 0) console.error(`Passed before it: ${passed.join(', ')}.`);
    process.exit(status ?? 1);
  }
  passed.push(`${step} (${took})`);
}
console.log(`\ncheck:android passed: ${passed.join(', ')}.`);
