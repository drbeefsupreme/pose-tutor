import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const MODEL = {
  url: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
  sha256: '5134a3aad27a58b93da0088d431f366da362b44e3ccfbe3462b3827a839011b1',
  path: join(ROOT, 'android/app/src/main/assets/pose_landmarker_full.task'),
};

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

if (existsSync(MODEL.path) && sha256(await readFile(MODEL.path)) === MODEL.sha256) {
  console.log(`kept    ${relative(ROOT, MODEL.path)}`);
} else {
  const res = await fetch(MODEL.url);
  if (!res.ok) throw new Error(`${MODEL.url}: HTTP ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const hash = sha256(bytes);
  if (hash !== MODEL.sha256) throw new Error(`${MODEL.url}: sha256 ${hash}, expected ${MODEL.sha256}`);
  await mkdir(dirname(MODEL.path), { recursive: true });
  await writeFile(`${MODEL.path}.part`, bytes);
  await rename(`${MODEL.path}.part`, MODEL.path);
  console.log(`fetched ${relative(ROOT, MODEL.path)} (${(bytes.length / 1e6).toFixed(1)} MB)`);
}
