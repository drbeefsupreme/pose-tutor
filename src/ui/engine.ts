import { decide, type Command } from '../modes/commands';
import { captureStep, NEW_CAPTURE, type Capture } from '../modes/calibration';
import { EMPTY_QUEUE, enqueue, settle, type DebriefQueue } from '../modes/debrief';
import { coachSummary, photoRequest, type Hit } from '../modes/hit';
import { holdMode, type HoldGoal } from '../modes/hold';
import { judgeMode } from '../modes/judge';
import { learnMode } from '../modes/learn';
import { mirrorMode } from '../modes/mirror';
import type { Effect, ModeId, Stage } from '../modes/mode';
import { BEST_KEY, mergeBest, parseBest, type NewBests } from '../modes/records';
import { startDrill, type Drill, type DrillView, type StartedDrill } from '../modes/runner';
import type { TutorSettings } from '../modes/settings';
import type { CameraFailure, Delegate, ListenState, Platform, PoseFrame, PoseSource, PoseSourceStart, VoiceInput } from '../platform/types';
import { filterFacing, NO_FACING, type FacingFilter } from '../pose/facing';
import { POSE_CONNECTIONS, type PoseLandmarks } from '../pose/landmarks';
import { classifyFacing, measure, MIN_VISIBILITY, type Calibration } from '../pose/metrics';
import { faultCue, scoreCall } from '../pose/score';
import { inView, SCHEDULER, type Sighting } from '../pose/session';
import { LandmarkSmoother } from '../pose/smoothing';
import { POSE_SPECS } from '../pose/spec';
import type { Facing, PoseId, PoseScore } from '../pose/types';
import type { PhotoMeta } from '../progress/types';

// The tutor's live loop: pose source → smoother → score → drill, and the drill's effects → speech, photos and the
// coach. Everything that decides what happens lives in src/modes; this shell wires it to the device (src/platform).

export interface RunSpec {
  readonly mode: ModeId;
  /** The pose for Learn and Hold; Judge and Mirror ignore it. */
  readonly pose: PoseId;
  readonly holdGoal: HoldGoal;
}

/** The relaxed-front baseline for this tutor session: measured, skipped, or not taken yet. */
export type SessionCalibration = Calibration | 'skipped' | undefined;

type CameraState =
  | { readonly kind: 'starting' }
  | { readonly kind: 'live'; readonly delegate: Delegate }
  | { readonly kind: 'failed'; readonly failure: CameraFailure | 'tracker'; readonly message: string };

export type DebriefState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'looking'; readonly pose: PoseId; readonly waiting: boolean }
  | { readonly kind: 'note'; readonly pose: PoseId; readonly note: string; readonly cues: readonly string[]; readonly ms: number; readonly model: string };

export interface Heard {
  readonly text: string;
  readonly command: Command | undefined;
  readonly via: 'jev' | 'keywords';
  readonly confidence: number | undefined;
  readonly at: number;
}

export interface Snapshot {
  readonly camera: CameraState;
  /** Capturing the relaxed-front baseline (0..1), or ready. */
  readonly calibration: { readonly kind: 'capturing'; readonly progress: number } | { readonly kind: 'ready'; readonly calibrated: boolean };
  readonly view: DrillView | undefined;
  readonly score: number | undefined;
  /** Which way the camera sees the athlete facing. */
  readonly facing: Facing | undefined;
  readonly faults: readonly string[];
  readonly debrief: DebriefState;
  readonly photo: PhotoMeta | undefined;
  readonly notice: string | undefined;
  readonly heard: Heard | undefined;
  readonly listening: ListenState;
  readonly listenError: string | undefined;
  readonly bests: NewBests | undefined;
}

interface DebriefJob {
  readonly hit: Hit;
  readonly image: string;
}

/** How often the screen updates; Mirror drives the figure from it, so it updates at video rate. */
const PUBLISH_MS: Record<ModeId, number> = { learn: 100, hold: 100, judge: 100, mirror: 33 };
const PHOTO_WIDTH = 1280;
const CALIBRATE_SAY = 'Stand relaxed, facing the camera, so I can measure you.';
const STAGE_COLORS: Record<Stage['kind'] | 'calibrating', string> = {
  calibrating: 'rgba(255, 210, 63, 0.9)',
  step: 'rgba(56, 189, 248, 0.9)',
  framing: 'rgba(255, 210, 63, 0.9)',
  correcting: 'rgba(56, 189, 248, 0.9)',
  holding: 'rgba(255, 122, 69, 0.95)',
  rest: 'rgba(163, 172, 192, 0.8)',
  mirror: 'rgba(56, 189, 248, 0.9)',
  done: 'rgba(74, 222, 128, 0.95)',
};

function startRun(spec: RunSpec, now: number): StartedDrill {
  switch (spec.mode) {
    case 'learn':
      return startDrill(learnMode(spec.pose), now);
    case 'hold':
      return startDrill(holdMode(spec.pose, spec.holdGoal), now);
    case 'judge':
      return startDrill(judgeMode(), now);
    case 'mirror':
      return startDrill(mirrorMode, now);
  }
}

interface EngineOptions {
  readonly spec: RunSpec;
  readonly settings: TutorSettings;
  readonly calibration: SessionCalibration;
  readonly onCalibration: (calibration: Calibration | 'skipped') => void;
  readonly platform: Platform;
}

export class TutorEngine {
  private readonly listeners = new Set<() => void>();
  private readonly listener: VoiceInput;
  private readonly source: PoseSource;
  private readonly unsubscribeSpeech: () => void;
  private snap: Snapshot;
  private settings: TutorSettings;
  private calibration: SessionCalibration;
  private capture: Capture = NEW_CAPTURE;
  private facing: FacingFilter = NO_FACING;
  private smoother = new LandmarkSmoother();
  /** The facing of the last pose the drill scored; a call with another facing starts a fresh detection. */
  private expected: Facing | undefined;
  private drill: Drill | undefined;
  private overlay: HTMLCanvasElement | undefined;
  /** Page clock minus platform clock: the smallest delivery delay seen so far. */
  private clockOffset = Infinity;
  private awake = false;
  private disposed = false;
  private lastScore: PoseScore | undefined;
  private lastLm: PoseLandmarks | undefined;
  private lastPublish = 0;
  private finished = false;
  private queue: DebriefQueue<DebriefJob> = EMPTY_QUEUE;
  private heardSeq = 0;

  constructor(private readonly options: EngineOptions) {
    this.settings = options.settings;
    this.calibration = options.spec.mode === 'mirror' ? (options.calibration ?? 'skipped') : options.calibration;
    this.listener = options.platform.voiceInput(
      (text) => void this.heard(text),
      (listening) => this.update({ listening, listenError: this.listener.error }),
    );
    this.source = options.platform.poseSource();
    this.snap = {
      camera: { kind: 'starting' },
      calibration: this.calibration === undefined ? { kind: 'capturing', progress: 0 } : { kind: 'ready', calibrated: this.calibration !== 'skipped' },
      view: undefined,
      score: undefined,
      facing: undefined,
      faults: [],
      debrief: { kind: 'idle' },
      photo: undefined,
      notice: undefined,
      heard: undefined,
      listening: 'off',
      listenError: undefined,
      bests: undefined,
    };
    const { speech } = options.platform;
    this.unsubscribeSpeech = speech.subscribe(() => this.listener.setSuppressed(speech.speaking));
    this.listener.setEnabled(this.settings.voiceCommands);
  }

  // ------------------------------------------------------------------ store for React (useSyncExternalStore)

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly snapshot = (): Snapshot => this.snap;

  private update(patch: Partial<Snapshot>): void {
    this.snap = { ...this.snap, ...patch };
    for (const listener of this.listeners) listener();
  }

  // ------------------------------------------------------------------ lifecycle

  /** Starts the pose source with its camera view in `pane` and the skeleton drawn on `overlay`. Later calls do nothing. */
  async start(pane: HTMLElement, overlay: HTMLCanvasElement): Promise<void> {
    if (this.overlay) return;
    this.overlay = overlay;
    this.update({ camera: { kind: 'starting' } });
    let started: PoseSourceStart;
    try {
      started = await this.source.start(pane, (frame) => this.onFrame(frame));
    } catch (err) {
      if (!this.disposed) this.update({ camera: { kind: 'failed', failure: 'tracker', message: err instanceof Error ? err.message : String(err) } });
      return;
    }
    if (this.disposed) return;
    if (!started.ok) {
      this.update({ camera: { kind: 'failed', failure: started.failure, message: started.message } });
      return;
    }
    this.update({ camera: { kind: 'live', delegate: started.delegate } });
    this.awake = true;
    this.options.platform.keepAwake.acquire().catch((err: unknown) => console.warn('Could not keep the screen on.', err));
    if (this.calibration === undefined) this.say(CALIBRATE_SAY, true);
    else this.begin(performance.now());
  }

  dispose(): void {
    this.disposed = true;
    this.source.stop();
    if (this.awake) this.options.platform.keepAwake.release().catch((err: unknown) => console.warn('Could not release the screen.', err));
    this.listener.dispose();
    this.unsubscribeSpeech();
    this.options.platform.speech.cancel();
    this.listeners.clear();
  }

  setSettings(settings: TutorSettings): void {
    this.settings = settings;
    this.listener.setEnabled(settings.voiceCommands);
  }

  skipCalibration(): void {
    if (this.calibration !== undefined) return;
    this.calibration = 'skipped';
    this.options.onCalibration('skipped');
    this.update({ calibration: { kind: 'ready', calibrated: false } });
    this.begin(performance.now());
  }

  // ------------------------------------------------------------------ commands

  command(command: Command): void {
    if (!this.drill) return;
    this.apply(this.drill.command(performance.now(), command));
    this.publish(true);
  }

  /** A phrase from speech recognition: jev picks the command; keywords decide when it cannot. */
  private async heard(text: string): Promise<void> {
    const seq = ++this.heardSeq;
    const decision = decide(text, await this.options.platform.coach.askIntent(text));
    if (this.disposed || seq !== this.heardSeq) return;
    this.update({ heard: { text, ...decision, at: performance.now() } });
    if (decision.command !== undefined) this.command(decision.command);
  }

  // ------------------------------------------------------------------ the loop

  private begin(now: number): void {
    const { drill, effects } = startRun(this.options.spec, now);
    this.drill = drill;
    this.apply(effects);
    this.publish(true);
  }

  /**
   * The frame's time on the page clock. The platform clock (uptime on Android) has another origin; adding the smallest
   * delivery delay seen keeps the camera's frame spacing and never puts a frame after the moment it arrived.
   */
  private frameTime(timestampMs: number): number {
    this.clockOffset = Math.min(this.clockOffset, performance.now() - timestampMs);
    return timestampMs + this.clockOffset;
  }

  private onFrame(frame: PoseFrame): void {
    if (this.disposed || this.snap.camera.kind !== 'live') return;
    const now = this.frameTime(frame.timestampMs);
    const lm = this.smoother.next(frame.landmarks, now);
    this.lastLm = lm;
    this.facing = lm ? filterFacing(this.facing, classifyFacing(lm), now) : NO_FACING;
    if (this.calibration === undefined) {
      this.calibrating(lm, now);
      this.draw(frame, lm, 'calibrating');
      return;
    }
    const drill = this.drill;
    if (!drill) return;
    const pose = drill.view(now).scoring;
    const sighting = pose === undefined ? undefined : this.sight(pose, lm);
    this.apply(drill.frame(now, sighting, lm));
    const view = drill.view(now);
    this.draw(frame, lm, view.stage.kind);
    if (view.stage.kind === 'done' && !this.finished) this.finish(view);
    this.publish(false, view);
    const expected = view.scoring && POSE_SPECS[view.scoring][0].facing;
    const called = expected !== undefined && this.expected !== undefined && expected !== this.expected;
    if (expected !== undefined) this.expected = expected;
    // After a turn, VIDEO mode keeps tracking from the old body region and can hold a stale left/right reading for
    // seconds; a blank frame makes the next frame a fresh detection, and a new smoother does not blend the two.
    if (called) {
      this.source.reset();
      this.smoother = new LandmarkSmoother();
    }
  }

  private sight(pose: PoseId, lm: PoseLandmarks | undefined): Sighting {
    if (!lm) {
      this.lastScore = undefined;
      return { kind: 'nobody' };
    }
    if (!inView(lm)) {
      this.lastScore = undefined;
      return { kind: 'cropped' };
    }
    const calibration = this.calibration === 'skipped' ? undefined : this.calibration;
    const score = scoreCall(pose, measure(lm, { calibration }), this.facing.facing).result;
    this.lastScore = score;
    return { kind: 'body', score };
  }

  private calibrating(lm: PoseLandmarks | undefined, now: number): void {
    const step = captureStep(this.capture, lm, now);
    if (step.kind === 'waiting') {
      this.capture = step.capture;
      if (now - this.lastPublish >= PUBLISH_MS.learn) {
        this.lastPublish = now;
        this.update({ calibration: { kind: 'capturing', progress: step.progress } });
      }
      return;
    }
    this.calibration = step.calibration;
    this.options.onCalibration(step.calibration);
    this.update({ calibration: { kind: 'ready', calibrated: true } });
    this.say('Got it.', true);
    this.begin(now);
  }

  private publish(force: boolean, view?: DrillView): void {
    const now = performance.now();
    if (!force && now - this.lastPublish < PUBLISH_MS[this.options.spec.mode]) return;
    this.lastPublish = now;
    const score = this.lastScore;
    this.update({
      view: view ?? this.drill?.view(now),
      score: score?.score,
      facing: score?.facing,
      // The corrections the cue scheduler would say: faults too small to correct stay off the list.
      faults: [...new Set(score?.faults.flatMap((f) => ((f.score ?? 0) < SCHEDULER.minorScore ? (faultCue(f)?.text ?? []) : [])))],
    });
  }

  private apply(effects: readonly Effect[]): void {
    for (const effect of effects) {
      if (effect.kind === 'say') this.say(effect.text, effect.interrupt);
      else this.hit(effect.pose, effect.result);
    }
  }

  private say(text: string, interrupt: boolean): void {
    this.options.platform.speech.say(text, interrupt);
  }

  // ------------------------------------------------------------------ hits: photo and coach

  private hit(pose: PoseId, result: Hit['result']): void {
    const hit: Hit = { mode: this.options.spec.mode, pose, result, score: this.lastScore, landmarks: this.lastLm };
    this.source.capturePhoto(PHOTO_WIDTH).then(
      (image) => this.keep(hit, image),
      (err: unknown) => {
        console.warn('The photo capture failed.', err);
        this.keep(hit, undefined);
      },
    );
  }

  /** Saves the photo of a hit and queues it for the coach. */
  private keep(hit: Hit, image: string | undefined): void {
    if (!image) {
      this.update({ notice: 'Could not capture the camera frame for the photo.' });
      return;
    }
    this.options.platform.photos
      .save(photoRequest(hit, image))
      .then((photo) => this.update({ photo }))
      .catch((err: unknown) => this.update({ notice: `Photo not saved: ${err instanceof Error ? err.message : String(err)}` }));
    if (!this.settings.debrief) return;
    const step = enqueue(this.queue, { hit, image });
    this.queue = step.queue;
    if (step.start) this.debrief(step.start);
    else this.update({ debrief: { kind: 'looking', pose: this.queue.running?.hit.pose ?? hit.pose, waiting: true } });
  }

  private debrief(job: DebriefJob): void {
    const { pose } = job.hit;
    this.update({ debrief: { kind: 'looking', pose, waiting: this.queue.waiting !== undefined } });
    this.options.platform.coach
      .askCoach({ pose: POSE_SPECS[pose][0].name, summary: coachSummary(job.hit), imageDataUrl: job.image })
      .then((note) => {
        if (this.disposed) return;
        this.update({ debrief: { kind: 'note', pose, ...note } });
        if (note.cues.length > 0) this.say(`Coach: ${note.cues.join(' ')}`, false);
      })
      .catch((err: unknown) => {
        if (this.disposed) return;
        this.update({ debrief: { kind: 'idle' }, notice: `Coach debrief failed: ${err instanceof Error ? err.message : String(err)}` });
      })
      .finally(() => {
        if (this.disposed) return;
        const step = settle(this.queue);
        this.queue = step.queue;
        if (step.start) this.debrief(step.start);
      });
  }

  /** At the end of a Judge's calls round: updates the personal bests in the platform store. */
  private finish(view: DrillView): void {
    this.finished = true;
    if (view.stage.kind !== 'done' || view.stage.summary.mode !== 'judge') return;
    const { store } = this.options.platform;
    const { best, news } = mergeBest(parseBest(store.getItem(BEST_KEY)), view.stage.summary, new Date().toISOString());
    store.setItem(BEST_KEY, JSON.stringify(best));
    this.update({ bests: news });
  }

  // ------------------------------------------------------------------ overlay

  /** Draws on the overlay at the camera frame's size, so it lines up with any platform's camera view. */
  private draw(frame: PoseFrame, lm: PoseLandmarks | undefined, stage: keyof typeof STAGE_COLORS): void {
    const canvas = this.overlay;
    if (!canvas) return;
    if (canvas.width !== frame.width || canvas.height !== frame.height) {
      canvas.width = frame.width;
      canvas.height = frame.height;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!lm) return;
    const { width, height } = canvas;
    const color = STAGE_COLORS[stage];
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = Math.max(2, height / 180);
    ctx.beginPath();
    for (const [start, end] of POSE_CONNECTIONS) {
      const a = lm.points[start];
      const b = lm.points[end];
      if (a.visibility < MIN_VISIBILITY || b.visibility < MIN_VISIBILITY) continue;
      ctx.moveTo(a.x * width, a.y * height);
      ctx.lineTo(b.x * width, b.y * height);
    }
    ctx.stroke();
    const radius = Math.max(3, height / 140);
    for (const p of lm.points) {
      if (p.visibility < MIN_VISIBILITY) continue;
      ctx.beginPath();
      ctx.arc(p.x * width, p.y * height, radius, 0, 2 * Math.PI);
      ctx.fill();
    }
  }
}
