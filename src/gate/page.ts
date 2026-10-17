// The tracking gate inside the app (gate.html), driven by scripts/android/gate.ts. The gate harness renders the app's
// figure in the WebView; every frame goes through the native plugin's detectImage (the live tracker's model and
// delegate choice) and then through the TypeScript scoring. In 'video' mode the frames carry the gate's clock, so the
// plugin tracks from frame to frame as live tracking does; 'image' mode detects every frame afresh.
// scripts/android/lib/frames.ts opens this page in desktop Chrome and uses `render` for the emulator's camera videos.
import { registerPlugin } from '@capacitor/core';
import { FIGURE_POSES } from '../figure/figurePoses';
import type { NativePoseFrame, TutorPosePlugin } from '../platform/posePlugin';
import type { Delegate } from '../platform/types';
import { poseLandmarks } from '../pose/landmarks';
import type { AxisAngle, BoneKey, FigurePose, PoseId } from '../pose/types';
import type { GateOutput } from './criteria';
import { openStage, runGate, type GateTracker } from './gate';

/** How detectImage runs: VIDEO mode with the gate's timestamps, or IMAGE mode. */
export type DetectMode = 'video' | 'image';

/** Milliseconds spent by the native detector during one gate run. */
export interface NativeTimings {
  /** The first detectImage call, which builds the landmarker. */
  readonly warmupMs: number;
  /** canvas.toDataURL('image/png') of each frame. */
  readonly encodeMs: readonly number[];
  /** detectImage round trips from the page to the native plugin and back. */
  readonly detectMs: readonly number[];
  /** Every delegate that detectImage reported. */
  readonly delegates: readonly Delegate[];
}

export interface GateResult {
  readonly output: GateOutput;
  readonly timings: NativeTimings;
  readonly userAgent: string;
}

/** A camera-video frame: one pose, or step `t` (0..1) of the move from one pose to another. */
export type FrameSpec = { readonly pose: PoseId } | { readonly from: PoseId; readonly to: PoseId; readonly t: number };

declare global {
  interface Window {
    gate?: {
      readonly run: (mode: DetectMode) => Promise<GateResult>;
      /** PNG data URLs of 1280x720 gate renders, one per spec. */
      readonly render: (frames: readonly FrameSpec[]) => Promise<string[]>;
    };
  }
}

const pose = registerPlugin<TutorPosePlugin>('TutorPose');

interface Detection {
  readonly frame: NativePoseFrame;
  readonly delegate: Delegate;
  readonly encodeMs: number;
  readonly detectMs: number;
}

async function detect(canvas: HTMLCanvasElement, timestampMs: number | undefined): Promise<Detection> {
  const t0 = performance.now();
  const dataUrl = canvas.toDataURL('image/png');
  const t1 = performance.now();
  const { frame, delegate } = await pose.detectImage({ dataUrl, timestampMs });
  return { frame, delegate, encodeMs: t1 - t0, detectMs: performance.now() - t1 };
}

async function run(mode: DetectMode): Promise<GateResult> {
  const stamp = (timestampMs: number) => (mode === 'video' ? timestampMs : undefined);
  // The gate's clock starts at 0 and grows from there, so a new track starts here; the blank frame takes timestamp 0.
  await pose.reset();
  const blank = Object.assign(document.createElement('canvas'), { width: 1280, height: 720 });
  const warm = await detect(blank, stamp(0));
  const encodeMs: number[] = [];
  const detectMs: number[] = [];
  const delegates = new Set([warm.delegate]);
  let delegate = warm.delegate;
  const tracker: GateTracker = {
    get delegate() {
      return delegate;
    },
    async detect(canvas, timestampMs) {
      const d = await detect(canvas, stamp(timestampMs));
      encodeMs.push(d.encodeMs);
      detectMs.push(d.detectMs);
      delegate = d.delegate;
      delegates.add(d.delegate);
      const { landmarks, width, height } = d.frame;
      return landmarks ? poseLandmarks(landmarks, width, height) : undefined;
    },
  };
  const output = await runGate(tracker);
  const timings = { warmupMs: warm.encodeMs + warm.detectMs, encodeMs, detectMs, delegates: [...delegates] };
  return { output, timings, userAgent: navigator.userAgent };
}

/** Part way from `a` to `b`: each bone undoes a fraction of `a`'s rotations and applies the same fraction of `b`'s. */
function between(a: FigurePose, b: FigurePose, t: number): FigurePose {
  const keys = new Set([...Object.keys(a.bones), ...Object.keys(b.bones)] as BoneKey[]);
  const bones: FigurePose['bones'] = {};
  for (const key of keys) {
    bones[key] = ([[a, 1 - t], [b, t]] as const).flatMap(([p, k]) =>
      (p.bones[key] ?? []).map(([x, y, z, deg]): AxisAngle => [x, y, z, deg * k]),
    );
  }
  return { yaw: a.yaw + (b.yaw - a.yaw) * t, bones };
}

async function render(frames: readonly FrameSpec[]): Promise<string[]> {
  const stage = await openStage();
  try {
    return frames.map((f) => {
      stage.show('pose' in f ? FIGURE_POSES[f.pose] : between(FIGURE_POSES[f.from], FIGURE_POSES[f.to], f.t));
      return stage.frame.toDataURL('image/png');
    });
  } finally {
    stage.dispose();
  }
}

window.gate = { run, render };
