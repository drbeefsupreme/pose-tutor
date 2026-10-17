# Agent guide to Pose Tutor

Pose Tutor is an Android app that coaches the 12 men's bodybuilding prejudging poses. The front camera tracks the body with MediaPipe, the app scores the pose against a research spec and speaks corrections, and a 3D figure shows the target. It is a Capacitor WebView that runs the TypeScript in `src/`, with native Kotlin plugins for the camera, speech, the on-device coach and a Keystore secret store.

[README.md](README.md) covers install, build and privacy for people. This file covers what an agent needs to change the code safely.

## Map

Top level:

- `src/` is the app. See the next list.
- `android/` is the Capacitor Android project. The plugins are in `android/app/src/main/java/io/github/drbeefsupreme/posetutor/`, one folder each for pose tracking, voice, the coach and secrets. `npm run android:lint` fails on any finding. `android/app/lint.xml` ignores only findings in Capacitor template files and in resources that library code uses. Fix a finding in our code.
- `scripts/` holds the Node scripts. They may import `src/` types and `src/gate/`. `scripts/android/` builds, installs and drives the emulator. `scripts/android/lib/` is the shared emulator, CDP and render code. `scripts/figure/` builds the figure model with Bun. `scripts/lint/` is the oxlint plugin with the repo rules.
- `public/figure/` is the built figure model. Rebuild it with `npm run figure`, never by hand.
- `docs/` holds `docs/pose-spec.md` (the research) and four generated reports. `docs/shots/` is the git-ignored evidence of the device checks.
- `index.html` is the app page. `gate.html` is the tracking-gate page, which `src/gate/` runs.
- `.agents/skills/` holds the repo skills. `.claude/skills` and `CLAUDE.md` are symlinks to `.agents/skills` and this file.

`src/`, with what each folder may import (`.oxlintrc.json` enforces it):

- `src/pose/` is pure logic: landmarks, metrics, facing, the pose spec, scoring and the hold session. It imports nothing from the app.
- `src/modes/` is pure logic for Learn, Hold drill, Judge's calls, Mirror, voice commands, settings and records. It may import `src/pose/` and `src/progress/` types.
- `src/coach/` is the coach prompt and `src/intent/` is the jev client. Both are pure logic.
- `src/platform/` is the only code that touches the device: Capacitor plugins, storage, speech, the network. It may import everything except `src/gate/` and `src/ui/`.
- `src/figure/` is the three.js figure and its pose rig. It may import `src/pose/`.
- `src/ui/` is the React app. `src/progress/` is the photo timeline and compare. Both reach the device only through `src/platform/`.
- `src/gate/` is the tracking gate and its baseline. App code must not import it.

The rules for the pure folders: no Capacitor, three.js, React or `src/platform/` imports. Take what you need as a parameter.

## Commands

| Command | Run it when |
|---|---|
| `npm run check` | Before every commit. Lint, typecheck, unit tests and the docs check, about 2 s, no device. CI runs it. |
| `npm run check:android` | Before you commit a change to native code, the figure, scoring or the run loop. It runs the build, Android lint, gate, e2e, native check and phone shots on the harness emulator, about 8 minutes plus the build. It stops at the first failure. |
| `npm run android:gate` | After a change to scoring, metrics, the spec or the figure. It is the fastest device answer, about 1 minute after the build. |
| `npm run android:e2e -- --only=learn` | After a change to one mode. The phases are `learn`, `hold`, `judge`, `mirror` and `device`. |
| `npm run android:build` then `npm run android:lint` | After a change in `android/`. CI runs both. |
| `node scripts/check-docs.ts` | After you rename a file, a script or a command. It checks every path and npm script named in the docs. `npm run check` runs it too. |

To check a behavior by hand on the emulator, use the [verify-pose-tutor skill](.agents/skills/verify-pose-tutor/SKILL.md).

## Definition of done

1. `npm run check` passes.
2. If the change touches `android/`, `src/figure/`, `public/figure/`, `scripts/figure/`, `src/pose/`, `src/modes/` or `src/ui/engine.ts`, `npm run check:android` passes too.
3. A user-visible change has proof from the verify-pose-tutor skill, in `docs/shots/verify/`.
4. The generated reports in `docs/` come from the scripts that write them. Never edit a report by hand.
5. The docs name only paths and commands that exist (`node scripts/check-docs.ts`).

## Invariants that lint does not check

- **Re-baseline the gate only with a reason.** `npm run android:gate -- --save-baseline` replaces `src/gate/baseline.json`. Then write why in its `note` field. The gate report shows the note. Without it, a scoring regression becomes the new normal and nobody can see why.
- **Never use the host webcam, and keep the host muted.** The emulator scripts pass `-camera-front videofile:<clip>` and `-no-audio`, and the figure renders use headless Chrome with `--mute-audio`. Never use `-camera-front webcam0`. Never grant camera or microphone permission in the host's browser. A mistake films the person at the desk or plays the tutor's voice into the room.
- **Run one emulator at a time.** The harness scripts take `/tmp/pose-tutor-harness-5564.lock` and fail fast when another run holds it. `npm run android:emulator` starts a second AVD on `emulator-5560` without the lock, so do not use it while a check runs. Two emulators with `-gpu host` starve the host, and a harness run stops any emulator on its port.
- **Keep the TypeSafe key secret.** It lives only in `.env.local` (git-ignored, for the e2e run) or in the Android Keystore through the `TutorSecrets` plugin. Never put it in a log, a report, a screenshot, a command line or a commit. The e2e run fails if the key appears in logcat.
- **Landmarks are upright and unmirrored.** The pose plugin returns coordinates in the upright camera image (x right, y down) with MediaPipe's own left and right labels. Only the on-screen preview is mirrored (`src/platform/posePlugin.ts`). If you mirror the data, every sided check and cue swaps sides.
- **Disclose the Google SDK telemetry, do not block it.** MediaPipe and ML Kit send usage statistics to `firebaselogging.googleapis.com`. The in-app privacy panel (`src/ui/Settings.tsx`) and the README say so. Do not strip the SDK's datatransport services, and do not claim that nothing leaves the phone. The e2e socket check allows only this traffic and `api.typesafe.ai`.

## The research spec and the scoring bands

`docs/pose-spec.md` is the research: the federation rule text, measured landmark ranges, faults, cues and build-up steps for each pose, with numbered sources. `src/pose/spec.ts` turns it into code. Each check has a band (`target`, `min`, `max`) from the spec's pass band, a weight, and the cue for a low or a high miss. The source tag of a cue (`S1`, `ESTIMATE`) points at the spec. A band that departs from the spec has a comment that says why.

`src/pose/score.ts` scores a check 1 inside its band and falls to 0 at half a band width outside it. The pose score is the weighted mean over the measurable checks, as 0 to 100. A hit is 85 or more for 3 s (`src/pose/session.ts`). The gate (`src/gate/criteria.ts`) requires three things. Every pose render scores a hit for its own pose. A clearly different pose scores below 60. Each fault render in `src/gate/cases.ts` gives its expected cue first and scores under the hit line. Each own-pose score also stays within 5 points of `src/gate/baseline.json`.

## Add a pose or a fault cue

To add a pose:

1. Write its section in `docs/pose-spec.md`, with sources and measured ranges.
2. Add the id to `PoseId` in `src/pose/types.ts`. Then `npm run typecheck` lists every record that needs it: `POSE_SPECS`, `FIGURE_POSES`, `POSE_LABELS`, `JUDGE_CALLS`, the gate tables and the pose list in `scripts/android/drive.ts`.
3. Add it to `JUDGE_ORDER` in `src/modes/judge.ts` if a judge calls it. The type does not force this.
4. Run `npm run check`, then `npm run check:android`. Save a new gate baseline with a `note`.

To add a fault cue:

1. Add the fault to the pose's fault table in `docs/pose-spec.md`, with its source.
2. Add or change the check in `src/pose/spec.ts`: the metric, the band, and the cue for `low` or `high`.
3. Add a broken figure for it to `FAULTS` in `src/gate/cases.ts`, with the cue as `expectedCue`.
4. Add a unit test in `src/pose/score.test.ts` if the fault has a landmark fixture in `src/pose/fixtures/`.
5. Run `npm run check` and `npm run check:android`. Save a new gate baseline with a `note` if scores moved.

## Working rules

- Commit small, ordered changes with plain messages. Run `npm run check` before each commit.
- Write docs and comments in plain English with short sentences and active verbs. Do not use em dashes.
