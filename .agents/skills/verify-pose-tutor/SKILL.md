---
name: verify-pose-tutor
description: Drive Pose Tutor, the Android app, on the harness emulator the way a user does, with a rendered figure video as the front camera, and capture proof. Use it to verify a change to the run loop, scoring, cues, a practice mode, progress photos, the coach, voice commands or Settings, or when a user-visible behavior needs evidence.
---

# Verify Pose Tutor

Users touch the app on an Android phone. Here it runs on the harness emulator `emulator-5564` (AVD `pose-tutor-harness`). The front camera plays a looped video of the 3D figure, so the real camera, MediaPipe and scoring code runs. `scripts/android/drive.ts` holds one session open and gives you short commands to drive it.

Read [features/README.md](features/README.md) next. It indexes the feature recipes.

## Rules

- Run one emulator at a time. `node scripts/android/drive.ts launch` refuses to start when another emulator is in `adb devices`, and the harness lock refuses a second harness run.
- If `launch` fails with `Another harness run (pid N) is using emulator-5564`, another agent or check owns the emulator. Do not kill it. Wait, or ask that agent.
- Never use the host webcam (`-camera-front webcam0`). The driver only passes a `videofile:` camera.
- Keep the host speakers muted. The emulator runs with `-no-audio`. Do not change that.
- Never grant camera or microphone permission in the host's browser. Only the emulator app gets them.
- Never print, log or screenshot the TypeSafe key. Read only the `data-state` of `[data-testid="device-key"]`.
- Before you use the emulator, tell the other agents that share this checkout.

## Launch

Run this as a background job. It keeps running until `stop`.

```sh
node scripts/android/drive.ts launch                 # default clip: relaxedFront 8 s, frontDoubleBiceps 10 s, looped
node scripts/android/drive.ts launch --camera clip.mp4 --no-build
```

The command takes the harness lock and builds the APK when the sources are newer (`--build` forces it, `--no-build` skips it). It renders the default clip, boots the emulator with no window and no audio, installs the app with camera and microphone granted, and opens it. It is ready when it prints:

```
Ready: emulator-5564 runs io.github.drbeefsupreme.posetutor, front camera /tmp/pose-tutor-drive/camera.mp4, session pid <pid>.
```

A build takes 1 to 5 minutes and a boot 10 to 60 seconds. The session prints the app's console errors and warnings as `[app error] ...`. Three `Error injecting safe area CSS` lines at start are normal Capacitor noise.

## Doctor

Run this first, and again whenever a command fails in a way you do not expect. It does not change the app or the emulator.

```sh
node scripts/android/drive.ts doctor
```

Every check line must start with `ok`, and the exit code must be 0. The lines check the session process, the harness lock, that no other emulator runs, the boot, the `videofile:` camera, `-no-audio`, the app process, the page at `https://localhost/`, and the three test hooks. An `info` line gives the install time and the APK build time. If the APK is older than your change, stop the session and launch again.

## Drive

Set `D="node scripts/android/drive.ts"` first. The recipes write `$D <command>`. Each command attaches its own DevTools connection to the app WebView and detaches after it. All commands except `clip` need a live session.

| Command | What it does |
|---|---|
| `$D eval '<expression>'` | Evaluates JavaScript in the app page, awaits a promise, prints the JSON value. |
| `$D wait '<expression>' [seconds]` | Evaluates every 250 ms until the value is truthy, then prints it. Fails after the timeout (default 60 s). |
| `$D click '<selector>' [text]` | Clicks the first match whose text contains `text`, after it scrolls it into view. |
| `$D paste-key` | Types the TypeSafe key from `TYPESAFE_API_KEY` or `.env.local` into the Settings key field. It prints only the length. |
| `$D shot <png>` | Saves an adb screenshot of the phone screen (1080 x 2400). |
| `$D clip <out.mp4> <pose>=<seconds>...` | Renders figure poses into a looped camera clip. It needs no emulator. |
| `$D camera <mp4>` | Makes the clip the front camera from the next camera start. |

### Stable handles

| Screen | Handle |
|---|---|
| Home | `button[data-mode="learn"]`, `"hold"`, `"judge"`, `"mirror"`, `"progress"`. Pose picker buttons: `.tutor-pose` with the pose name. |
| Settings (on Home) | `label.tutor-check` with `Mute the tutor's voice`, `Voice commands` or `Coach debrief`. `[data-testid="device-coach"]` and `[data-testid="device-key"]`, each with `.tutor-device-state[data-state]`. |
| Run | `.tutor-controls button` with `Next`, `Skip`, `Repeat`, `What's wrong`, `Pause`. `[data-testid="cue"]`, `[data-testid="score"]`, `[data-testid="photo"]`, `[data-testid="debrief"]`, `.tutor-swap`. |
| Run summary | `.tutor-summary .btn` with `Again`. `.tutor-summary .pill` with `Back to the tutor`. |
| Progress | `.tutor-back`, `.progress-thumb-pick`, `.progress-thumb-delete`, `.progress-dialog .btn` with `Delete photo`, `.progress-compare-bar .seg button`. |

### Test hooks

The app sets these on `window`. They read state. Only `__tutorVoice` acts, and it stands in for the Android speech recognizer.

- `window.__tutorState()` exists only during a run. It returns the run snapshot: `camera.kind` (`starting`, `live`), `calibration.kind`, `view.stage.kind` (`step`, `framing`, `correcting`, `holding`, `rest`, `mirror`, `done`), `view.stage.summary`, `view.scoring`, `score`, `photo`, `heard`, `listening`, `notice` and `debrief`. The `Snapshot` type in `src/ui/engine.ts` is the full shape.
- `window.__tutorVoice('<phrase>')` hands a phrase to the live voice input. It returns `false` when no voice input listens (voice commands off, or no run).
- `window.__tutorSpeech` lists every line the app gave the speech engine, with `end` (`done`, `cancelled`, or unset while it speaks).
- `window.__tutorSetup` drives the coach download, the coach self-test and the key, as Settings does.

### Camera video

The emulator reads the clip again only when the camera opens after it was closed for 5 s or more. If it opens sooner, the old clip continues. To change the clip, run `camera`, leave the run (`Back to the tutor` or `Exit`), wait 6 s, then start the mode.

```sh
node scripts/android/drive.ts clip docs/shots/verify/run-loop/camera.mp4 relaxedFront=20 frontDoubleBiceps=10
node scripts/android/drive.ts camera docs/shots/verify/run-loop/camera.mp4
```

The pose ids are the `PoseId` values in `src/pose/types.ts`. A clip adds six in-between frames from each pose to the next, and from the last back to the first. `scripts/android/camera-video.sh` crops each frame for the portrait app view.

### Example: Learn to a hit

```sh
D="node scripts/android/drive.ts"; E=docs/shots/verify/run-loop
$D click 'button[data-mode="learn"]'
$D wait "window.__tutorState?.().camera.kind === 'live'" 90
$D wait "window.__tutorState().view.stage.kind === 'step' && window.__tutorState().view.stage.text"
$D shot $E/02-build-up-step.png
while [ "$($D eval "window.__tutorState().view.stage.kind")" = '"step"' ]; do $D click '.tutor-controls button' Next; done
$D wait "(() => { const s = window.__tutorState(); return s.view.stage.kind === 'correcting' && s.view.stage.kind + ': ' + document.querySelector('[data-testid=cue]').textContent; })()"
$D shot $E/03-correcting.png
$D wait "window.__tutorState().view.stage.kind === 'done' && window.__tutorState().view.stage.summary" 120
```

### adb

`scripts/android/env.sh` sets `ANDROID_SERIAL=emulator-5560`, which is the `npm run android:emulator` device. Always pass `-s emulator-5564` to reach the harness emulator.

```sh
source scripts/android/env.sh
adb -s emulator-5564 shell run-as io.github.drbeefsupreme.posetutor ls files/photos
adb -s emulator-5564 emu rotate      # turns the screen between portrait and landscape
```

## Evidence

Put the proof in `docs/shots/verify/<feature>/`. Git ignores `docs/shots/`, and Cleanup does not touch it. Do not commit it.

- Drive the real user path: the Home buttons, the run controls, the camera clip. Use the hooks to read state, not to set it. `__tutorVoice` is the one exception, because the emulator has no microphone.
- Capture the action and the state after it, not only the last screen. Save a screenshot and the hook value for each step that matters.
- Check the side effects too: the photo files (`adb -s emulator-5564 shell run-as io.github.drbeefsupreme.posetutor ls files/photos`), the `__tutorSpeech` lines, and the stored settings in `localStorage['pose-tutor-settings']`.
- Write a short `docs/shots/verify/<feature>/proof.md`. Give each artifact one line: the action, the command, and what the artifact shows.
- If a path cannot run on the emulator (the coach model, a real microphone), say so in the proof. Do not report it as verified through another path.

## Cleanup

```sh
node scripts/android/drive.ts stop
```

`stop` sends SIGTERM to the session process. The session closes its DevTools connection, stops the emulator it booted, deletes `/tmp/pose-tutor-drive/` and releases the harness lock. Then `stop` prints `emulator-5564 is off`. It does not touch `docs/shots/verify/`. Run it after every failed attempt too. Then check that your evidence files still exist.

Never kill an emulator by process name. If the session process died without cleanup, check `adb devices` and the pid in `/tmp/pose-tutor-harness-5564.lock`. Only when that pid is dead and `emulator-5564` still runs, stop it with `adb -s emulator-5564 emu kill`.

## Helpers

- `scripts/android/drive.ts` is this skill's driver. The usage is at the top of the file.
- `scripts/android/camera-video.sh <frames dir> <out.mp4> [seconds per frame]` turns PNG frames into a camera clip.
- `scripts/android/lib/` holds the shared emulator, CDP and figure-render code that the driver and the checks use.
- The scripted checks drive the same app with their own emulator session. Run them for regressions, not for a single proof. Do not run them while a drive session is up. `npm run android:e2e -- --only=learn,hold` runs only some phases (`learn`, `hold`, `judge`, `mirror`, `device`).

Keep the feature map current. When the app changes, use the `maintain-verification-skill` skill to update it.
