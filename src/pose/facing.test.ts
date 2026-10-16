import { describe, expect, it } from 'vitest';
import { FACING_HOLD_MS, filterFacing, NO_FACING, type FacingFilter } from './facing';
import type { Facing } from './types';

function replay(frames: readonly (readonly [number, Facing | undefined])[], start: FacingFilter = NO_FACING): (Facing | undefined)[] {
  let filter = start;
  return frames.map(([now, seen]) => {
    filter = filterFacing(filter, seen, now);
    return filter.facing;
  });
}

describe('facing hysteresis', () => {
  it('holds a back view through the single-frame side flicker seen on the fake camera', () => {
    const flicker: [number, Facing][] = [
      [0, 'back'],
      [100, 'rightSide'],
      [200, 'back'],
      [300, 'leftSide'],
      [400, 'leftSide'],
      [500, 'back'],
      [600, 'back'],
    ];
    expect(replay(flicker)).toEqual(['back', 'back', 'back', 'back', 'back', 'back', 'back']);
  });

  it('turns once the new facing holds for 300 ms', () => {
    const turn: [number, Facing][] = [
      [0, 'leftSide'],
      [100, 'back'],
      [200, 'back'],
      [300, 'back'],
      [100 + FACING_HOLD_MS, 'back'],
    ];
    expect(replay(turn)).toEqual(['leftSide', 'leftSide', 'leftSide', 'leftSide', 'back']);
  });

  it('adopts the first facing at once and ignores frames without one', () => {
    expect(replay([[0, undefined], [50, 'front'], [100, undefined], [150, 'front']])).toEqual([undefined, 'front', 'front', 'front']);
  });

  it('restarts the wait when the pending facing changes', () => {
    const frames: [number, Facing][] = [
      [0, 'back'],
      [100, 'leftSide'],
      [300, 'rightSide'],
      [500, 'rightSide'],
      [600, 'rightSide'],
    ];
    expect(replay(frames)).toEqual(['back', 'back', 'back', 'back', 'rightSide']);
  });
});
