import { FIGURE_POSES } from '../figure/figurePoses';
import { FigureRenderer } from '../figure/FigureRenderer';
import type { PoseId } from '../pose/types';

const SIZE = { width: 180, height: 270 } as const;

export type Thumbnails = Readonly<Record<PoseId, string>>;

function mapValues<K extends string, A, B>(record: Readonly<Record<K, A>>, f: (value: A) => B): Record<K, B> {
  return Object.fromEntries(Object.entries<A>(record).map(([key, value]) => [key, f(value)])) as Record<K, B>;
}

let rendering: Promise<Thumbnails> | undefined;

async function render(): Promise<Thumbnails> {
  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${SIZE.width}px;height:${SIZE.height}px;pointer-events:none`;
  document.body.append(host);
  let figure: FigureRenderer | undefined;
  try {
    const loaded = await FigureRenderer.load(host, 'stage');
    figure = loaded;
    return mapValues(FIGURE_POSES, (figurePose) => {
      loaded.setPose(figurePose, { instant: true });
      return loaded.snapshot().toDataURL('image/webp', 0.85);
    });
  } finally {
    figure?.dispose();
    host.remove();
  }
}

/** The thumbnails, rendered on the first call. A failed render is retried on the next call. */
export function poseThumbnails(): Promise<Thumbnails> {
  rendering ??= render().catch((err: unknown) => {
    rendering = undefined;
    throw err;
  });
  return rendering;
}
