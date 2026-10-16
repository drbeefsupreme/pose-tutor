import { formatDate, scoreTone } from './format';
import type { PhotoId, PhotoMeta } from './types';

interface Props {
  /** Oldest first. */
  photos: readonly PhotoMeta[];
  before: PhotoId;
  after: PhotoId;
  onPick: (photo: PhotoMeta) => void;
}

const W = 640;
const H = 220;
const LEFT = 40;
const RIGHT = 20;
const TOP = 16;
const BOTTOM = 34;
const GRID = [0, 25, 50, 75, 100];
const DAY_MS = 86_400_000;

/** Score over time for one pose; a click on a point picks that photo. */
export function TrendChart({ photos, before, after, onPick }: Props) {
  const times = photos.map((p) => Date.parse(p.takenAt));
  const t0 = times[0];
  const span = times[times.length - 1] - t0;
  const x = (t: number) => (span > 0 ? LEFT + ((t - t0) / span) * (W - LEFT - RIGHT) : W / 2);
  const y = (score: number) => TOP + (1 - score / 100) * (H - TOP - BOTTOM);
  const points = photos.map((p, i) => ({ photo: p, cx: x(times[i]), cy: y(p.score) }));
  const line = points.map(({ cx, cy }, i) => `${i ? 'L' : 'M'}${cx.toFixed(1)},${cy.toFixed(1)}`).join(' ');
  const area = `${line} L${points[points.length - 1].cx.toFixed(1)},${y(0)} L${points[0].cx.toFixed(1)},${y(0)} Z`;
  const first = photos[0];
  const last = photos[photos.length - 1];
  const weeks = Math.round(span / (7 * DAY_MS));
  const change = Math.round(last.score - first.score);

  return (
    <figure className="progress-trend">
      <figcaption>
        <h3 className="display small">Score trend</h3>
        <span className="hint">
          {photos.length === 1
            ? 'One photo so far.'
            : `${Math.round(first.score)} → ${Math.round(last.score)} (${change >= 0 ? '+' : ''}${change}) over ${weeks} ${weeks === 1 ? 'week' : 'weeks'}, ${photos.length} photos`}
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Score over time for ${photos.length} photos`}>
        <defs>
          <linearGradient id="progress-trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0.35" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {GRID.map((s) => (
          <g key={s} className="progress-trend-grid">
            <line x1={LEFT} x2={W - RIGHT} y1={y(s)} y2={y(s)} />
            <text x={LEFT - 8} y={y(s)} dy="0.35em" textAnchor="end">{s}</text>
          </g>
        ))}
        <line className="progress-trend-hit" x1={LEFT} x2={W - RIGHT} y1={y(85)} y2={y(85)} />
        <text className="progress-trend-hit-label" x={LEFT + 6} y={y(85) - 5}>pose hit 85</text>
        {photos.length > 1 && <path d={area} fill="url(#progress-trend-fill)" />}
        {photos.length > 1 && <path className="progress-trend-line" d={line} />}
        {points.map(({ photo, cx, cy }) => {
          const slot = photo.id === before ? 'A' : photo.id === after ? 'B' : null;
          const label = `${formatDate(photo.takenAt)}, score ${Math.round(photo.score)}`;
          return (
            <g
              key={photo.id}
              className={`progress-trend-point ${scoreTone(photo.score)}${slot ? ` slot-${slot}` : ''}`}
              role="button"
              tabIndex={0}
              aria-label={`Pick ${label}`}
              onClick={() => onPick(photo)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onPick(photo);
                }
              }}
            >
              <title>{label}</title>
              <circle cx={cx} cy={cy} r={slot ? 8 : 5.5} />
              {slot && <text x={cx} y={cy - 14} textAnchor="middle">{slot}</text>}
            </g>
          );
        })}
        <text className="progress-trend-axis" x={points[0].cx} y={H - 10} textAnchor={photos.length > 1 ? 'start' : 'middle'}>
          {formatDate(first.takenAt)}
        </text>
        {photos.length > 1 && (
          <text className="progress-trend-axis" x={points[points.length - 1].cx} y={H - 10} textAnchor="end">
            {formatDate(last.takenAt)}
          </text>
        )}
      </svg>
    </figure>
  );
}
