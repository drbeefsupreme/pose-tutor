import { useEffect, useState } from 'react';
import { JUDGE_ORDER } from '../modes/judge';
import type { PoseId } from '../pose/types';
import { POSE_LABELS } from '../progress/format';
import { poseThumbnails, type Thumbnails } from './thumbnails';

export function PosePicker({ pose, onPose }: { pose: PoseId; onPose: (pose: PoseId) => void }) {
  const [thumbs, setThumbs] = useState<Thumbnails | undefined>();

  useEffect(() => {
    let live = true;
    poseThumbnails()
      .then((t) => live && setThumbs(t))
      .catch((err: unknown) => console.warn('Pose thumbnails failed to render.', err));
    return () => {
      live = false;
    };
  }, []);

  return (
    <ul className="tutor-poses" aria-label="Pose">
      {JUDGE_ORDER.map((id) => (
        <li key={id}>
          <button type="button" className="tutor-pose" aria-pressed={id === pose} onClick={() => onPose(id)}>
            {thumbs ? <img src={thumbs[id]} alt="" /> : <span className="tutor-pose-blank" aria-hidden="true" />}
            <span className="tutor-pose-name">{POSE_LABELS[id]}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
