// Renders gate frames of the figure on this computer, for the emulator's camera video: gate.html served by Vite, in a
// separate headless google-chrome on SwiftShader (no camera, audio muted).
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import type { FrameSpec } from '../../../src/gate/page.ts';
import { connect, targets, type Cdp } from './cdp.ts';
import { ROOT, stopGroup, waitFor } from './tools.ts';

/** PNGs (1280x720) of the app's figure model, one per spec. */
export async function renderFrames(specs: readonly FrameSpec[]): Promise<Buffer[]> {
  const server = await createServer({
    configFile: false,
    root: ROOT,
    logLevel: 'warn',
    cacheDir: 'node_modules/.vite-frames',
    server: { port: 5367, host: '127.0.0.1' },
    optimizeDeps: { entries: ['gate.html'] },
  });
  await server.listen();
  const profile = mkdtempSync(join(tmpdir(), 'pose-tutor-frames-chrome-'));
  let pid: number | undefined;
  let cdp: Cdp | undefined;
  try {
    const url = `${server.resolvedUrls?.local[0] ?? 'http://127.0.0.1:5367/'}gate.html`;
    const chrome = spawn(
      'google-chrome',
      [
        '--headless=new',
        `--user-data-dir=${profile}`,
        '--remote-debugging-port=0',
        '--mute-audio',
        '--no-first-run',
        '--no-default-browser-check',
        '--window-size=1280,720',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        url,
      ],
      { stdio: ['ignore', 'ignore', 'pipe'], detached: true },
    );
    pid = chrome.pid;
    const listening = Promise.withResolvers<number>();
    let log = '';
    chrome.stderr.on('data', (chunk: Buffer) => {
      log += chunk.toString();
      const match = /DevTools listening on ws:\/\/[^:]+:(\d+)\//.exec(log);
      if (match) listening.resolve(Number(match[1]));
    });
    chrome.once('exit', (code) => listening.reject(new Error(`google-chrome exited with ${code}:\n${log}`)));
    const port = await listening.promise;
    const target = await waitFor('the render page', 60_000, async () => (await targets(port)).find((t) => t.type === 'page' && t.url.startsWith(url)), 250);
    const live = await connect(target.webSocketDebuggerUrl);
    cdp = live;
    // Vite may reload the page once after it optimizes the dependencies.
    for (let attempt = 1; ; attempt++) {
      await waitFor('window.gate', 90_000, async () => ((await live.evaluate('typeof window.gate', 5000).catch(() => '')) === 'object' ? true : undefined), 250);
      try {
        const urls = (await live.evaluate(`window.gate.render(${JSON.stringify(specs)})`, 5 * 60_000)) as string[];
        return urls.map((u) => Buffer.from(u.slice(u.indexOf(',') + 1), 'base64'));
      } catch (err) {
        if (attempt >= 3 || !/context was destroyed|navigated|closed/i.test(String(err))) throw err;
      }
    }
  } finally {
    cdp?.close();
    if (pid !== undefined) await stopGroup(pid);
    rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    await server.close();
  }
}
