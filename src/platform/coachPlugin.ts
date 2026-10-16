// The JavaScript face of the native on-device coach (Capacitor plugin name "TutorCoach"): Gemini Nano through the
// ML Kit GenAI Prompt API, image plus text in, text out. The Kotlin side lives in
// android/app/src/main/java/io/github/drbeefsupreme/posetutor/coach/ and must match this file exactly.

import type { PluginListenerHandle } from '@capacitor/core';

/**
 * `available`: ready to generate. `downloadable`: supported, the model must be downloaded first (`download`).
 * `downloading`: a download is running. `unavailable`: this device or build cannot run Gemini Nano (emulators,
 * phones before Pixel 9, AICore missing or disabled); `reason` says why.
 */
export type NanoStatus = 'available' | 'downloadable' | 'downloading' | 'unavailable';

export interface NanoStatusResult {
  readonly status: NanoStatus;
  readonly reason?: string;
}

export interface NanoDownloadProgress {
  readonly downloadedBytes: number;
  /** Undefined when AICore does not report the size. */
  readonly totalBytes?: number;
}

export interface NanoGenerateOptions {
  readonly prompt: string;
  /** A JPEG or PNG data URL. The plugin decodes and downsizes it to what the model accepts. */
  readonly imageDataUrl?: string;
  readonly temperature?: number;
  readonly maxOutputTokens?: number;
}

export interface NanoGenerateResult {
  readonly text: string;
  /** Wall time of the generate call in milliseconds, measured natively. */
  readonly ms: number;
  /** Model name or version as AICore reports it, else "gemini-nano". */
  readonly model: string;
}

/**
 * Rejections carry `code`: `unavailable` (status is not available), `busy` (another generate is running; calls are
 * not queued), `badImage`, or `failed` (the model raised an error; `message` has its text).
 */
export interface TutorCoachPlugin {
  status(): Promise<NanoStatusResult>;
  /** Starts or joins the model download and resolves when the model is available. Emits `downloadProgress`. */
  download(): Promise<void>;
  generate(options: NanoGenerateOptions): Promise<NanoGenerateResult>;
  addListener(eventName: 'downloadProgress', listener: (progress: NanoDownloadProgress) => void): Promise<PluginListenerHandle>;
}
