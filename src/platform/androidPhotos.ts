// The Android PhotoStore: one folder in the app's private storage with `<id>.jpg|.webp` and its `<id>.json`
// PhotoMeta sidecar per photo. The image is written first and the
// sidecar last, so a photo exists exactly when its sidecar does. Ids are random UUIDs made here.

import { POSE_LABELS } from '../progress/format';
import type { PhotoId, PhotoImageType, PhotoMeta, SavePhotoRequest } from '../progress/types';
import type { PoseId } from '../pose/types';
import type { PhotoStore } from './types';

/** The photo folder. Names are file names inside it. */
export interface PhotoFolder {
  /** The file names in the folder (made empty on first use). */
  names(): Promise<string[]>;
  readText(name: string): Promise<string>;
  /** Writes `data` as UTF-8 text, or as the bytes it encodes when `base64` is true. */
  write(name: string, data: string, base64: boolean): Promise<void>;
  /** Deletes a file that exists. */
  remove(name: string): Promise<void>;
  /** A URL an <img> can show. Valid once `names` or `write` has resolved. */
  src(name: string): string;
}

const EXTENSION: Record<PhotoImageType, string> = { jpeg: 'jpg', webp: 'webp' };
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const SIDECAR = new RegExp(`^(${UUID})\\.json$`);
/** Every file name the store writes. */
const STORE_FILE = new RegExp(`^${UUID}\\.(json|jpg|webp)$`);
const DATA_URL_HEAD = /^data:image\/(jpeg|webp);base64,/;

/** The photo ids in a folder listing: the names of the sidecars. */
export function sidecarIds(names: readonly string[]): PhotoId[] {
  return names.flatMap((name) => {
    const id = SIDECAR.exec(name)?.[1];
    // A UUID-shaped sidecar name is how this store names a photo.
    return id ? [id as PhotoId] : [];
  });
}

/** The sidecar of photo `id`, or undefined when the text is not one (a half-written or foreign file). */
export function parseSidecar(id: PhotoId, text: string): PhotoMeta | undefined {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (typeof json !== 'object' || json === null) return undefined;
  const meta: Partial<Record<keyof PhotoMeta, unknown>> = json;
  const valid =
    meta.id === id &&
    typeof meta.pose === 'string' &&
    Object.hasOwn(POSE_LABELS, meta.pose) &&
    typeof meta.takenAt === 'string' &&
    !Number.isNaN(Date.parse(meta.takenAt)) &&
    typeof meta.score === 'number' &&
    Array.isArray(meta.faults) &&
    typeof meta.image === 'string' &&
    Object.hasOwn(EXTENSION, meta.image);
  // This store wrote the file from a PhotoMeta; the checks above catch a truncated or foreign file.
  return valid ? (json as PhotoMeta) : undefined;
}

/** Newest first. */
export function newestFirst(photos: readonly PhotoMeta[]): PhotoMeta[] {
  return photos.toSorted((a, b) => Date.parse(b.takenAt) - Date.parse(a.takenAt));
}

export function folderPhotoStore(
  folder: PhotoFolder,
  newId: () => string = () => crypto.randomUUID(),
  now: () => Date = () => new Date(),
): PhotoStore {
  const list = async (pose?: PoseId): Promise<PhotoMeta[]> => {
    const ids = sidecarIds(await folder.names());
    const metas = await Promise.all(ids.map(async (id) => parseSidecar(id, await folder.readText(`${id}.json`))));
    return newestFirst(metas.filter((m): m is PhotoMeta => m !== undefined && (pose === undefined || m.pose === pose)));
  };

  /** The sidecar goes first, so an interrupted delete leaves no half photo in the list. */
  const removeFiles = async (id: PhotoId, names: readonly string[]): Promise<void> => {
    const own = [`${id}.json`, ...Object.values(EXTENSION).map((ext) => `${id}.${ext}`)];
    for (const name of own) if (names.includes(name)) await folder.remove(name);
  };

  return {
    list,

    async save(req: SavePhotoRequest): Promise<PhotoMeta> {
      const head = DATA_URL_HEAD.exec(req.imageDataUrl);
      if (!head) throw new Error('the photo must be a base64 jpeg or webp data URL');
      // The pattern matches only the two image types.
      const image = head[1] as PhotoImageType;
      const id = newId() as PhotoId;
      const { imageDataUrl, ...fields } = req;
      const meta: PhotoMeta = { id, ...fields, takenAt: now().toISOString(), image };
      await folder.write(`${id}.${EXTENSION[image]}`, imageDataUrl.slice(head[0].length), true);
      await folder.write(`${id}.json`, JSON.stringify(meta), false);
      return meta;
    },

    imageSrc: (meta: PhotoMeta): string => folder.src(`${meta.id}.${EXTENSION[meta.image]}`),

    async remove(id: PhotoId): Promise<void> {
      await removeFiles(id, await folder.names());
    },

    /** `'all'` also deletes files left behind by an interrupted save. */
    async removeAll(scope): Promise<number> {
      const photos = await list(scope === 'all' ? undefined : scope.pose);
      const names = await folder.names();
      for (const photo of photos) await removeFiles(photo.id, names);
      if (scope === 'all') {
        for (const name of await folder.names()) if (STORE_FILE.test(name)) await folder.remove(name);
      }
      return photos.length;
    },
  };
}
