// One folder with `<id>.jpg|.webp` and its `<id>.json` PhotoMeta sidecar per photo. The image is written first and
// the sidecar last, so a photo exists exactly when its sidecar does.

import { LANDMARK_COUNT, type Landmark, type PoseLandmarks } from '../pose/landmarks';
import { isMetricId, isMetricSide } from '../pose/metrics';
import { POSE_LABELS } from '../progress/format';
import type { PhotoFault, PhotoId, PhotoImageType, PhotoMeta, SavePhotoRequest } from '../progress/types';
import type { PoseId } from '../pose/types';
import type { PhotoStore } from './types';

export interface PhotoFolder {
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
const STORE_FILE = new RegExp(`^${UUID}\\.(json|jpg|webp)$`);
const DATA_URL_HEAD = /^data:image\/(jpeg|webp);base64,/;

export function sidecarIds(names: readonly string[]): PhotoId[] {
  return names.flatMap((name) => {
    const id = SIDECAR.exec(name)?.[1];
    return id ? [id as PhotoId] : [];
  });
}

type JsonObject = { readonly [key: string]: unknown };

const isObject = (value: unknown): value is JsonObject => typeof value === 'object' && value !== null && !Array.isArray(value);
const isPoseId = (value: unknown): value is PoseId => typeof value === 'string' && Object.hasOwn(POSE_LABELS, value);
const isImageType = (value: unknown): value is PhotoImageType => typeof value === 'string' && Object.hasOwn(EXTENSION, value);

const isFault = (value: unknown): value is PhotoFault =>
  isObject(value) &&
  typeof value.metric === 'string' &&
  isMetricId(value.metric) &&
  (value.side === undefined || (typeof value.side === 'string' && isMetricSide(value.side))) &&
  typeof value.cue === 'string';

const isLandmark = (value: unknown): value is Landmark =>
  isObject(value) && typeof value.x === 'number' && typeof value.y === 'number' && typeof value.visibility === 'number';

const isLandmarks = (value: unknown): value is PoseLandmarks =>
  isObject(value) &&
  typeof value.aspect === 'number' &&
  Array.isArray(value.points) &&
  value.points.length === LANDMARK_COUNT &&
  value.points.every(isLandmark);

export function parseSidecar(id: PhotoId, text: string): PhotoMeta | undefined {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!isObject(json) || json.id !== id) return undefined;
  const { pose, takenAt, score, faults, landmarks, mode, image } = json;
  if (!isPoseId(pose) || typeof takenAt !== 'string' || Number.isNaN(Date.parse(takenAt)) || typeof score !== 'number') return undefined;
  if (!Array.isArray(faults) || !faults.every(isFault) || !isImageType(image)) return undefined;
  if ((landmarks !== undefined && !isLandmarks(landmarks)) || (mode !== undefined && typeof mode !== 'string')) return undefined;
  return { id, pose, takenAt, score, faults, landmarks, mode, image };
}

function newestFirst(photos: readonly PhotoMeta[]): PhotoMeta[] {
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
      const image = head?.[1];
      if (!head || !isImageType(image)) throw new Error('the photo must be a base64 jpeg or webp data URL');
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
