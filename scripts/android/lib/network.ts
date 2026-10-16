// Where the app connects to, seen from the device: the remote addresses of the sockets that the app's Linux user owns,
// read from /proc/net while a run drives the app.
import { execFile } from 'node:child_process';
import { lookup, reverse } from 'node:dns/promises';
import { promisify } from 'node:util';
import { adb, APP_ID, ENV, SERIAL, sleep } from './tools.ts';

const run = promisify(execFile);
const TABLES = ['/proc/net/tcp', '/proc/net/tcp6', '/proc/net/udp', '/proc/net/udp6'];

/** The app's Linux user id. */
export function appUid(): number {
  const uid = /\buid:(\d+)/.exec(adb('shell', 'pm', 'list', 'packages', '-U', APP_ID))?.[1];
  if (uid === undefined) throw new Error(`${APP_ID} is not installed.`);
  return Number(uid);
}

/** An address in the form URL parsing gives it, so the same address always compares equal. */
const canonical = (ip: string): string => (ip.includes(':') ? new URL(`http://[${ip}]`).hostname.slice(1, -1) : ip);

/** A /proc/net address: 8 hex digits (IPv4) or 32 (IPv6), each 32-bit word in little-endian byte order. */
function address(hex: string): string {
  const bytes = (hex.match(/.{8}/g) ?? []).flatMap((word) => (word.match(/../g) ?? []).reverse().map((b) => parseInt(b, 16)));
  const mapped = bytes.length === 16 && bytes.slice(0, 10).every((b) => b === 0) && bytes[10] === 0xff && bytes[11] === 0xff;
  if (bytes.length === 4 || mapped) return bytes.slice(-4).join('.');
  const groups = Array.from({ length: 8 }, (_, i) => ((bytes[2 * i] << 8) | bytes[2 * i + 1]).toString(16));
  return canonical(groups.join(':'));
}

/** The remote addresses of `uid`'s sockets in /proc/net tables, without unconnected and loopback sockets. */
function remoteAddresses(tables: string, uid: number): string[] {
  return tables.split('\n').flatMap((line) => {
    const fields = line.trim().split(/\s+/);
    if (!/^\d+:$/.test(fields[0] ?? '') || Number(fields[7]) !== uid) return [];
    const ip = address(fields[2]?.split(':')[0] ?? '');
    return /^(0\.0\.0\.0$|127\.|::1?$)/.test(ip) ? [] : [ip];
  });
}

/**
 * Samples the remote addresses of the app's sockets every `everyMs` until the returned stop is called, which resolves
 * with every address seen.
 */
export function watchSockets(uid: number, everyMs = 500): () => Promise<ReadonlySet<string>> {
  const seen = new Set<string>();
  let running = true;
  const loop = (async () => {
    while (running) {
      const { stdout } = await run('adb', ['-s', SERIAL, 'shell', 'cat', ...TABLES], { env: ENV }).catch(() => ({ stdout: '' }));
      for (const ip of remoteAddresses(stdout, uid)) seen.add(ip);
      await sleep(everyMs);
    }
  })();
  return async () => {
    running = false;
    await loop;
    return seen;
  };
}

/** The addresses `host` resolves to on this computer (the emulator uses the same resolver). */
export async function hostAddresses(host: string): Promise<ReadonlySet<string>> {
  return new Set((await lookup(host, { all: true })).map((a) => canonical(a.address)));
}

/** True when the address's reverse DNS name is in Google's network (1e100.net), where Google's SDK endpoints live. */
export async function isGoogleAddress(ip: string): Promise<boolean> {
  const names = await reverse(ip).catch((): string[] => []);
  return names.some((name) => name.endsWith('.1e100.net'));
}
