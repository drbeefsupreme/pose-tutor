import type { Facing } from './types';

// Facing hysteresis for the live loop. A back view's hip width sits near the side-view cut (SIDE_VIEW_HIP_WIDTH), so
// on video the per-frame facing flickers between back and a side for single frames. The stable facing changes only
// when a new facing holds for `holdMs`; the first facing after the athlete was lost is adopted at once.

/** How long a new facing must hold before it replaces the current one. */
export const FACING_HOLD_MS = 300;

export interface FacingFilter {
  /** The stable facing; undefined until the first sighting. */
  readonly facing: Facing | undefined;
  /** A different facing seen since `since`, waiting to hold for `holdMs`. */
  readonly pending: { readonly facing: Facing; readonly since: number } | undefined;
}

/** No athlete yet, or the athlete was lost: the next facing is adopted at once. */
export const NO_FACING: FacingFilter = { facing: undefined, pending: undefined };

/** The filter after a frame classified as `seen`. A frame without a facing changes nothing. */
export function filterFacing(filter: FacingFilter, seen: Facing | undefined, now: number, holdMs = FACING_HOLD_MS): FacingFilter {
  if (seen === undefined) return filter;
  if (filter.facing === undefined || seen === filter.facing) return { facing: seen, pending: undefined };
  if (filter.pending?.facing !== seen) return { facing: filter.facing, pending: { facing: seen, since: now } };
  return now - filter.pending.since >= holdMs ? { facing: seen, pending: undefined } : filter;
}
