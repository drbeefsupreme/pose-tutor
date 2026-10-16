import { FIGURE_POSES } from '../figure/figurePoses';
import { FigureRenderer } from '../figure/FigureRenderer';
import type { PoseId } from '../pose/types';

// Pose picker thumbnails: one hidden FigureRenderer renders the figure in every pose from the judges' view, once per page.

const SIZE = { width: 180, height: 270 } as const;

export type Thumbnails = Readonly<Record<PoseId, string>>;

let rendering: Promise<Thumbnails> | undefined;

async function render(): Promise<Thumbnails> {
  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${SIZE.width}px;height:${SIZE.height}px;pointer-events:none`;
  document.body.append(host);
  let figure: FigureRenderer | undefined;
  try {
    figure = await FigureRenderer.load(host, 'stage');
    const out: Partial<Record<PoseId, string>> = {};
    for (const [pose, figurePose] of Object.entries(FIGURE_POSES) as [PoseId, (typeof FIGURE_POSES)[PoseId]][]) {
      figure.setPose(figurePose, { instant: true });
      out[pose] = figure.snapshot().toDataURL('image/webp', 0.85);
    }
    // Every PoseId has a figure pose, so every key is set.
    return out as Thumbnails;
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
