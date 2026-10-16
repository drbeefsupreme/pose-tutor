// The progress photo records that the photo store keeps and the tutor saves.
import type { PoseLandmarks } from '../pose/landmarks';
import type { MetricId, MetricSide, PoseId } from '../pose/types';

/** Photo id (a random UUID). Never a path. */
export type PhotoId = string & { readonly __brand: 'PhotoId' };

export type PhotoImageType = 'jpeg' | 'webp';

/** A correction that the tutor gave when the photo was taken. */
export interface PhotoFault {
  metric: MetricId;
  side?: MetricSide;
  cue: string;
}

export interface PhotoMeta {
  id: PhotoId;
  pose: PoseId;
  /** ISO 8601 time of the capture, set by the photo store. */
  takenAt: string;
  /** 0..100 */
  score: number;
  faults: PhotoFault[];
  landmarks?: PoseLandmarks;
  /** Practice mode that took the photo. */
  mode?: string;
  note?: string;
  image: PhotoImageType;
}

/** What the tutor hands to `PhotoStore.save`. */
export interface SavePhotoRequest {
  pose: PoseId;
  /** `data:image/jpeg;base64,...` or `data:image/webp;base64,...` */
  imageDataUrl: string;
  score: number;
  faults: PhotoFault[];
  landmarks?: PoseLandmarks;
  mode?: string;
  note?: string;
}
