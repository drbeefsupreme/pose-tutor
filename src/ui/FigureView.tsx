import { useEffect, useRef, useState } from 'react';
import { FIGURE_POSES } from '../figure/figurePoses';
import { FigureRenderer } from '../figure/FigureRenderer';
import type { FigureTarget } from '../modes/mode';

/** The 3D figure from the judges' view, in a library pose (animated) or a live pose (instant, for Mirror). */
export function FigureView({ figure }: { figure: FigureTarget }) {
  const host = useRef<HTMLDivElement>(null);
  const [renderer, setRenderer] = useState<FigureRenderer | undefined>();
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let cancelled = false;
    let loaded: FigureRenderer | undefined;
    FigureRenderer.load(el, 'stage').then(
      (r) => {
        if (cancelled) return r.dispose();
        loaded = r;
        setRenderer(r);
        setStatus('ready');
      },
      () => !cancelled && setStatus('error'),
    );
    return () => {
      cancelled = true;
      setRenderer(undefined);
      loaded?.dispose();
    };
  }, []);

  const pose = figure.kind === 'pose' ? figure.pose : undefined;
  const live = figure.kind === 'live' ? figure.figure : undefined;
  useEffect(() => {
    if (!renderer) return;
    if (pose) renderer.setPose(FIGURE_POSES[pose]);
    else if (live) renderer.setPose(live, { instant: true });
  }, [renderer, pose, live]);

  return (
    <div className="tutor-figure-host" ref={host}>
      {status !== 'ready' && <p className="tutor-figure-status">{status === 'loading' ? 'Loading the figure…' : 'The figure needs WebGL 2.'}</p>}
    </div>
  );
}
