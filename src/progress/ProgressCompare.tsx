import { useState } from 'react';
import { platform } from '../platform/android';
import { JOINTS, type PoseLandmarks, type SidedJoint } from '../pose/landmarks';
import { IconEye, IconLayers, IconSwap } from '../ui/Icons';
import { formatDate, scoreTone } from './format';
import type { PhotoMeta } from './types';

export type Slot = 'before' | 'after';

interface Props {
  before: PhotoMeta;
  after: PhotoMeta;
  /** The slot that a click in the timeline fills. */
  activeSlot: Slot;
  onActiveSlot: (slot: Slot) => void;
}

const LIMB_BONES: readonly (readonly [SidedJoint, SidedJoint])[] = [
  ['shoulder', 'elbow'], ['elbow', 'wrist'], ['shoulder', 'hip'], ['hip', 'knee'], ['knee', 'ankle'],
  ['ankle', 'heel'], ['heel', 'footIndex'], ['ankle', 'footIndex'], ['ear', 'shoulder'],
];
const BONES: readonly (readonly [number, number])[] = [
  [JOINTS.shoulder.left, JOINTS.shoulder.right],
  [JOINTS.hip.left, JOINTS.hip.right],
  ...LIMB_BONES.flatMap(([a, b]) => [[JOINTS[a].left, JOINTS[b].left], [JOINTS[a].right, JOINTS[b].right]] as const),
];
const BONE_JOINTS = [...new Set(BONES.flat())];
const MIN_VISIBILITY = 0.5;
const DAY_MS = 86_400_000;

function Skeleton({ landmarks, slot }: { landmarks: PoseLandmarks; slot: Slot }) {
  const { aspect, points } = landmarks;
  const seen = (i: number) => points[i].visibility >= MIN_VISIBILITY;
  return (
    <svg className={`progress-skeleton ${slot}`} viewBox={`0 0 ${aspect} 1`} preserveAspectRatio="none" aria-hidden="true">
      {BONES.filter(([a, b]) => seen(a) && seen(b)).map(([a, b]) => (
        <line key={`${a}-${b}`} x1={points[a].x * aspect} y1={points[a].y} x2={points[b].x * aspect} y2={points[b].y} />
      ))}
      {BONE_JOINTS.filter(seen).map((i) => (
        <circle key={i} cx={points[i].x * aspect} cy={points[i].y} r={0.009} />
      ))}
    </svg>
  );
}

function PhotoCard({ photo, slot, overlay }: { photo: PhotoMeta; slot: Slot; overlay: boolean }) {
  return (
    <figure className={`progress-photo ${slot}`}>
      <div className="progress-frame">
        <img src={platform.photos.imageSrc(photo)} alt={`${slot === 'before' ? 'Before' : 'After'}: ${formatDate(photo.takenAt)}`} />
        {overlay && photo.landmarks && <Skeleton landmarks={photo.landmarks} slot={slot} />}
      </div>
      <figcaption>
        <span className="progress-photo-head">
          <b className={`progress-slot-mark ${slot}`}>{slot === 'before' ? 'A' : 'B'}</b>
          {formatDate(photo.takenAt)}
          <span className={`progress-score ${scoreTone(photo.score)}`}>{Math.round(photo.score)}</span>
        </span>
        {photo.faults.length ? (
          <ul className="progress-faults">{photo.faults.slice(0, 3).map((f, i) => <li key={i}>{f.cue}</li>)}</ul>
        ) : (
          <span className="hint">No corrections.</span>
        )}
        {overlay && !photo.landmarks && <span className="hint">No skeleton saved with this photo.</span>}
      </figcaption>
    </figure>
  );
}

/** Two photos of one pose: side by side or blended, with the score change. */
export function ProgressCompare({ before, after, activeSlot, onActiveSlot }: Props) {
  const [view, setView] = useState<'side' | 'onion'>('side');
  const [overlay, setOverlay] = useState(false);
  const [blend, setBlend] = useState(50);
  const diff = Math.round(after.score) - Math.round(before.score);
  const days = Math.round(Math.abs(Date.parse(after.takenAt) - Date.parse(before.takenAt)) / DAY_MS);
  const slots: readonly [Slot, PhotoMeta][] = [['before', before], ['after', after]];

  return (
    <section className="progress-compare" aria-label="Compare two photos">
      <div className="progress-compare-bar">
        <div className="progress-slots" role="group" aria-label="Photo that a timeline click replaces">
          {slots.map(([slot, photo]) => (
            <button key={slot} type="button" className={`progress-slot ${slot}`} aria-pressed={activeSlot === slot} onClick={() => onActiveSlot(slot)}>
              <b className={`progress-slot-mark ${slot}`}>{slot === 'before' ? 'A' : 'B'}</b>
              <span>
                <small>{slot === 'before' ? 'Before' : 'After'}</small>
                {formatDate(photo.takenAt)}
              </span>
            </button>
          ))}
        </div>
        <div className={`progress-diff ${diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat'}`} aria-label={`Score change ${diff}`}>
          <strong className="display">{diff > 0 ? `+${diff}` : diff}</strong>
          <span>points in {days} {days === 1 ? 'day' : 'days'}</span>
        </div>
        <div className="seg" role="group" aria-label="Compare view">
          <button type="button" aria-pressed={view === 'side'} onClick={() => setView('side')}><IconSwap size={15} /> Side by side</button>
          <button type="button" aria-pressed={view === 'onion'} onClick={() => setView('onion')}><IconLayers size={15} /> Onion skin</button>
        </div>
        <button type="button" className={`icon-toggle${overlay ? ' on' : ''}`} aria-pressed={overlay} onClick={() => setOverlay(!overlay)}>
          <IconEye size={15} /> Skeleton
        </button>
      </div>
      <p className="hint progress-slot-hint">
        Pick a photo in the timeline or the chart to replace <b>{activeSlot === 'before' ? 'A (before)' : 'B (after)'}</b>.
      </p>

      {view === 'side' ? (
        <div className="progress-side">
          {slots.map(([slot, photo]) => <PhotoCard key={slot} photo={photo} slot={slot} overlay={overlay} />)}
        </div>
      ) : (
        <div className="progress-onion">
          <div className="progress-frame">
            <img src={platform.photos.imageSrc(before)} alt={`Before: ${formatDate(before.takenAt)}`} />
            <img className="progress-onion-top" src={platform.photos.imageSrc(after)} alt={`After: ${formatDate(after.takenAt)}`} style={{ opacity: blend / 100 }} />
            {overlay && before.landmarks && <Skeleton landmarks={before.landmarks} slot="before" />}
            {overlay && after.landmarks && <Skeleton landmarks={after.landmarks} slot="after" />}
          </div>
          <label className="progress-blend">
            <span><b className="progress-slot-mark before">A</b> {formatDate(before.takenAt, true)}</span>
            <input type="range" min={0} max={100} value={blend} onChange={(e) => setBlend(Number(e.target.value))} aria-label="Blend from before to after" />
            <span>{formatDate(after.takenAt, true)} <b className="progress-slot-mark after">B</b></span>
            <output>{blend}% after</output>
          </label>
        </div>
      )}
    </section>
  );
}
