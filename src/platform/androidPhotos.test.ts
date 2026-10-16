import { describe, expect, it } from 'vitest';
import type { PhotoId, SavePhotoRequest } from '../progress/types';
import { folderPhotoStore, parseSidecar, sidecarIds, type PhotoFolder } from './androidPhotos';

const JPEG = 'data:image/jpeg;base64,/9j/4AAQ';
const ID_A = '00000000-0000-4000-8000-00000000000a';
const ID_B = '00000000-0000-4000-8000-00000000000b';
const ID_C = '00000000-0000-4000-8000-00000000000c';
const ID_D = '00000000-0000-4000-8000-00000000000d';

/** An in-memory folder: file name -> [data, base64]. */
function memoryFolder(files = new Map<string, [string, boolean]>()): PhotoFolder & { files: Map<string, [string, boolean]> } {
  return {
    files,
    names: async () => [...files.keys()],
    readText: async (name) => {
      const file = files.get(name);
      if (!file) throw new Error(`${name} does not exist`);
      return file[0];
    },
    write: async (name, data, base64) => void files.set(name, [data, base64]),
    remove: async (name) => {
      if (!files.delete(name)) throw new Error(`${name} does not exist`);
    },
    src: (name) => `https://localhost/_capacitor_file_/photos/${name}`,
  };
}

function request(pose: SavePhotoRequest['pose'], score: number): SavePhotoRequest {
  return { pose, imageDataUrl: JPEG, score, faults: [{ metric: 'elbowFlex', side: 'left', cue: 'Bend the left arm more.' }], mode: 'learn' };
}

/** Saves photos with the given ids at one-minute steps from 2026-10-10T10:00Z; later saves get `laterIds`. */
async function storeWith(saves: readonly [string, SavePhotoRequest][], laterIds: readonly string[] = []) {
  const folder = memoryFolder();
  const ids = [...saves.map(([id]) => id), ...laterIds];
  let minute = 0;
  const store = folderPhotoStore(
    folder,
    () => ids.shift() ?? 'no id left',
    () => new Date(Date.UTC(2026, 9, 10, 10, minute++)),
  );
  for (const [, req] of saves) await store.save(req);
  return { folder, store };
}

const THREE: readonly [string, SavePhotoRequest][] = [
  [ID_A, request('sideChest', 70)],
  [ID_B, request('frontDoubleBiceps', 80)],
  [ID_C, request('sideChest', 90)],
];

describe('the photo folder index', () => {
  it('takes photo ids from the sidecar names only', () => {
    expect(sidecarIds([`${ID_A}.json`, `${ID_A}.jpg`, `${ID_B}.webp`, 'notes.json', `${ID_C}.json.tmp`, `${ID_C}.JSON`])).toEqual([ID_A]);
  });

  it('reads a sidecar of the desktop format and refuses broken or foreign ones', () => {
    const meta = { id: ID_A, pose: 'sideChest', takenAt: '2026-10-10T10:00:00.000Z', score: 87.5, faults: [], image: 'jpeg', mode: 'hold' };
    expect(parseSidecar(ID_A as PhotoId, JSON.stringify(meta))).toEqual(meta);
    expect(parseSidecar(ID_B as PhotoId, JSON.stringify(meta))).toBeUndefined();
    expect(parseSidecar(ID_A as PhotoId, JSON.stringify(meta).slice(0, 40))).toBeUndefined();
    expect(parseSidecar(ID_A as PhotoId, JSON.stringify({ ...meta, pose: 'moonwalk' }))).toBeUndefined();
    expect(parseSidecar(ID_A as PhotoId, JSON.stringify({ ...meta, image: 'png' }))).toBeUndefined();
  });
});

describe('folderPhotoStore', () => {
  it('saves the image bytes and a PhotoMeta sidecar, and shows the image through the folder URL', async () => {
    const { folder, store } = await storeWith([[ID_A, request('sideChest', 91)]]);
    expect(folder.files.get(`${ID_A}.jpg`)).toEqual(['/9j/4AAQ', true]);
    const [saved] = await store.list();
    expect(saved).toEqual({
      id: ID_A,
      pose: 'sideChest',
      takenAt: '2026-10-10T10:00:00.000Z',
      score: 91,
      faults: [{ metric: 'elbowFlex', side: 'left', cue: 'Bend the left arm more.' }],
      mode: 'learn',
      image: 'jpeg',
    });
    expect(JSON.parse(folder.files.get(`${ID_A}.json`)?.[0] ?? '')).toEqual(saved);
    expect(store.imageSrc(saved)).toBe(`https://localhost/_capacitor_file_/photos/${ID_A}.jpg`);
  });

  it('refuses an image that is not a jpeg or webp data URL', async () => {
    const { store } = await storeWith([]);
    await expect(store.save({ ...request('sideChest', 50), imageDataUrl: 'data:image/png;base64,iVBO' })).rejects.toThrow('jpeg or webp');
  });

  it('lists newest first, filters by pose, and skips images without a sidecar', async () => {
    const { folder, store } = await storeWith(THREE);
    folder.files.set('11111111-0000-4000-8000-000000000000.jpg', ['/9j/', true]);
    expect((await store.list()).map((p) => p.score)).toEqual([90, 80, 70]);
    expect((await store.list('sideChest')).map((p) => p.id)).toEqual([ID_C, ID_A]);
  });

  it('deletes one photo, the photos of one pose, or all photos with leftovers', async () => {
    const { folder, store } = await storeWith(THREE, [ID_D]);
    await store.remove(ID_B as PhotoId);
    expect([...folder.files.keys()].sort()).toEqual([`${ID_A}.jpg`, `${ID_A}.json`, `${ID_C}.jpg`, `${ID_C}.json`]);

    await store.save(request('frontDoubleBiceps', 60));
    expect(await store.removeAll({ pose: 'sideChest' })).toBe(2);
    expect((await store.list()).map((p) => p.id)).toEqual([ID_D]);

    folder.files.set('22222222-0000-4000-8000-000000000000.webp', ['UklG', true]);
    folder.files.set('keep-me.txt', ['not a photo', false]);
    expect(await store.removeAll('all')).toBe(1);
    expect([...folder.files.keys()]).toEqual(['keep-me.txt']);
  });
});
