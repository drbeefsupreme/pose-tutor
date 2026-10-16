import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePlatform } from '../platform/context';
import type { PoseId } from '../pose/types';
import { IconFrame, IconX } from '../ui/Icons';
import { formatDate, POSE_LABELS, scoreTone } from './format';
import { ProgressCompare, type Slot } from './ProgressCompare';
import { TrendChart } from './TrendChart';
import type { PhotoId, PhotoMeta } from './types';
import './progress.css';

const POSES = Object.keys(POSE_LABELS) as PoseId[];

interface Confirm {
  title: string;
  body: string;
  action: string;
  run: () => Promise<unknown>;
}

type Load = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; photos: PhotoMeta[] };

function ConfirmDialog({ confirm, onClose }: { confirm: Confirm | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const dialog = ref.current;
    if (confirm && dialog && !dialog.open) dialog.showModal();
    if (!confirm && dialog?.open) dialog.close();
  }, [confirm]);
  return (
    <dialog ref={ref} className="progress-dialog" onClose={onClose} aria-labelledby="progress-dialog-title">
      {confirm && (
        <form
          method="dialog"
          onSubmit={(e) => {
            e.preventDefault();
            setBusy(true);
            confirm.run().finally(() => {
              setBusy(false);
              onClose();
            });
          }}
        >
          <h3 id="progress-dialog-title" className="display small">{confirm.title}</h3>
          <p>{confirm.body}</p>
          <div className="progress-dialog-actions">
            <button type="button" className="pill" onClick={onClose} disabled={busy} autoFocus>Cancel</button>
            <button type="submit" className="btn progress-danger" disabled={busy}>{confirm.action}</button>
          </div>
        </form>
      )}
    </dialog>
  );
}

function Empty() {
  return (
    <div className="progress-empty">
      <div className="tutor-card">
        <span className="tutor-badge"><IconFrame size={16} /> Progress</span>
        <h2 className="display big">No progress photos yet</h2>
        <p>
          Every time you hit a pose in the tutor, a photo is saved here automatically, with the date, your score and the
          corrections you got. Come back after a few sessions to compare your first photo with your latest one.
        </p>
        <p className="hint">Photos stay on this phone. You can delete one photo or all of them at any time.</p>
      </div>
    </div>
  );
}

/** Timeline, compare and score trend of the saved progress photos, per pose. */
export function ProgressView() {
  const { photos: store } = usePlatform();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [pose, setPose] = useState<PoseId | null>(null);
  const [picked, setPicked] = useState<{ before?: PhotoId; after?: PhotoId }>({});
  const [activeSlot, setActiveSlot] = useState<Slot>('after');
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const timeline = useRef<HTMLOListElement>(null);

  const reload = useCallback(
    () =>
      store.list().then(
        (photos) => setLoad({ kind: 'ready', photos }),
        (err: unknown) => setLoad({ kind: 'error', message: err instanceof Error ? err.message : String(err) }),
      ),
    [store],
  );
  useEffect(() => {
    void reload();
  }, [reload]);

  const all = load.kind === 'ready' ? load.photos : [];
  const counts: Partial<Record<PoseId, number>> = {};
  for (const p of all) counts[p.pose] = (counts[p.pose] ?? 0) + 1;
  const current = pose ?? all[0]?.pose ?? POSES[0];
  const photos = all.filter((p) => p.pose === current).reverse();
  const before = photos.find((p) => p.id === picked.before) ?? photos[0];
  const after = photos.find((p) => p.id === picked.after) ?? photos[photos.length - 1];

  useLayoutEffect(() => {
    const el = timeline.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [current, photos.length]);

  const choosePose = (p: PoseId) => {
    setPose(p);
    setPicked({});
    setActiveSlot('after');
  };
  const pick = (photo: PhotoMeta) => {
    setPicked((s) => ({ ...s, [activeSlot]: photo.id }));
    setActiveSlot(activeSlot === 'before' ? 'after' : 'before');
  };
  const ask = (c: Confirm) => setConfirm({ ...c, run: () => c.run().finally(reload) });

  if (load.kind === 'loading') return <section className="progress"><p className="hint">Loading photos…</p></section>;
  if (load.kind === 'error') {
    return (
      <section className="progress">
        <p className="progress-error" role="alert">Could not load the photos: {load.message}</p>
      </section>
    );
  }

  return (
    <section className="progress" aria-labelledby="progress-title">
      <header className="progress-head">
        <div>
          <h2 id="progress-title" className="display big">Progress</h2>
          {all.length > 0 && (
            <p className="hint">
              {all.length} {all.length === 1 ? 'photo' : 'photos'}, saved on this phone only
            </p>
          )}
        </div>
        {all.length > 0 && (
          <button
            type="button"
            className="pill progress-danger-pill"
            onClick={() =>
              ask({
                title: 'Delete every photo?',
                body: `This deletes all ${all.length} progress photos of every pose from this phone. You cannot undo it.`,
                action: 'Delete everything',
                run: () => store.removeAll('all'),
              })
            }
          >
            Delete everything
          </button>
        )}
      </header>

      {all.length === 0 ? (
        <Empty />
      ) : (
        <>
          <nav className="progress-poses" aria-label="Pose">
            {POSES.map((p) => (
              <button key={p} type="button" className="progress-pose" aria-pressed={p === current} onClick={() => choosePose(p)}>
                {POSE_LABELS[p]}
                <span className="progress-count">{counts[p] ?? 0}</span>
              </button>
            ))}
          </nav>

          {photos.length === 0 ? (
            <p className="progress-none">
              No photos of {POSE_LABELS[current]} yet. Hit this pose in the tutor to save the first one.
            </p>
          ) : (
            <>
              <div className="progress-timeline-head">
                <h3 className="display small">{POSE_LABELS[current]} timeline</h3>
                <button
                  type="button"
                  className="pill progress-danger-pill small"
                  onClick={() =>
                    ask({
                      title: `Delete all ${POSE_LABELS[current]} photos?`,
                      body: `This deletes ${photos.length} ${photos.length === 1 ? 'photo' : 'photos'} of ${POSE_LABELS[current]} from this phone. Other poses keep their photos.`,
                      action: `Delete ${photos.length}`,
                      run: () => store.removeAll({ pose: current }),
                    })
                  }
                >
                  Delete all of this pose
                </button>
              </div>
              <ol className="progress-timeline" ref={timeline}>
                {photos.map((photo) => {
                  const slot = photo.id === before.id ? 'before' : photo.id === after.id ? 'after' : null;
                  const label = `${formatDate(photo.takenAt)}, score ${Math.round(photo.score)}`;
                  return (
                    <li key={photo.id} className={`progress-thumb${slot ? ` ${slot}` : ''}`}>
                      <button type="button" className="progress-thumb-pick" onClick={() => pick(photo)} aria-label={`Pick ${label}`}>
                        <img src={store.imageSrc(photo)} alt="" loading="lazy" />
                        <span className="progress-thumb-meta">
                          <span>{formatDate(photo.takenAt)}</span>
                          <span className={`progress-score ${scoreTone(photo.score)}`}>{Math.round(photo.score)}</span>
                        </span>
                        {slot && <b className={`progress-slot-mark ${slot}`}>{slot === 'before' ? 'A' : 'B'}</b>}
                      </button>
                      <button
                        type="button"
                        className="icon-btn progress-thumb-delete"
                        aria-label={`Delete the photo of ${label}`}
                        onClick={() =>
                          ask({
                            title: 'Delete this photo?',
                            body: `This deletes the ${POSE_LABELS[current]} photo of ${formatDate(photo.takenAt)} (score ${Math.round(photo.score)}) from this phone. You cannot undo it.`,
                            action: 'Delete photo',
                            run: () => store.remove(photo.id),
                          })
                        }
                      >
                        <IconX size={14} />
                      </button>
                    </li>
                  );
                })}
              </ol>

              {photos.length > 1 ? (
                <ProgressCompare before={before} after={after} activeSlot={activeSlot} onActiveSlot={setActiveSlot} />
              ) : (
                <p className="progress-none">Save one more photo of this pose to compare two dates.</p>
              )}
              <TrendChart photos={photos} before={before.id} after={after.id} onPick={pick} />
            </>
          )}
        </>
      )}
      <ConfirmDialog confirm={confirm} onClose={() => setConfirm(null)} />
    </section>
  );
}
