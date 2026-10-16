// The JavaScript face of the native Android pose plugin (Capacitor plugin name "TutorPose"). The Kotlin side
// lives in android/app/src/main/java/.../pose/ and must match this file exactly.
//
// Landmarks are normalized to the upright, UNMIRRORED camera image (x right, y down, 0..1), with MediaPipe's own
// left/right labels. Only the on-screen preview is mirrored.

import type { PluginListenerHandle } from '@capacitor/core';
import type { CameraFailure, Delegate } from './types';

export interface NativeLandmark {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly visibility: number;
}

export interface NativePoseFrame {
  /** 33 BlazePose landmarks, or null when nobody is in view. */
  readonly landmarks: readonly NativeLandmark[] | null;
  /** SystemClock.uptimeMillis() of the camera frame. */
  readonly timestampMs: number;
  /** Upright frame size in pixels. */
  readonly width: number;
  readonly height: number;
}

/** A box in CSS pixels relative to the WebView's top-left corner. */
export interface PreviewRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PoseStartOptions {
  readonly rect: PreviewRect;
  /** window.devicePixelRatio, so native can convert CSS pixels to device pixels. */
  readonly devicePixelRatio: number;
}

/**
 * Rejections from `start` carry `code` set to a CameraFailure ('denied' | 'noDevice' | 'busy' | 'unsupported')
 * and a human-readable `message`.
 */
export interface PoseStartFailure {
  readonly code: CameraFailure;
  readonly message: string;
}

export interface TutorPosePlugin {
  /** Asks for the camera permission if needed, opens the front camera, shows the mirrored preview at `rect` behind
   * the WebView and starts LIVE_STREAM detection (full model, GPU delegate with CPU fallback). */
  start(options: PoseStartOptions): Promise<{ delegate: Delegate }>;
  setPreviewRect(options: { rect: PreviewRect }): Promise<void>;
  /** The next frames come from a fresh detection (drops the landmarker's tracking state), and the next timed
   * `detectImage` starts a new track. */
  reset(): Promise<void>;
  /** The latest camera frame, upright and unmirrored, as a JPEG data URL at most `maxWidth` pixels wide. */
  capturePhoto(options: { maxWidth: number }): Promise<{ dataUrl: string | null }>;
  /** Test and gate path: runs a still image (PNG or JPEG data URL) through a landmarker with the live tracker's model
   * and delegate choice. Works without the camera. Without `timestampMs` each call is a fresh detection (IMAGE mode).
   * With it, a VIDEO-mode landmarker tracks from call to call as live tracking does; `timestampMs` (rounded to whole
   * milliseconds) must grow from call to call until `reset()`, and the frame carries it as its `timestampMs`. */
  detectImage(options: { dataUrl: string; timestampMs?: number }): Promise<{ frame: NativePoseFrame; delegate: Delegate }>;
  stop(): Promise<void>;
  addListener(eventName: 'frame', listener: (frame: NativePoseFrame) => void): Promise<PluginListenerHandle>;
}
