# The run loop: scoring and cues

Learn a pose takes the user from a relaxed stance through the build-up steps of one pose. The app scores each camera frame against the pose spec, speaks the top correction, and counts a hit when the score stays over the hold line for 3 s. Hold drill and Judge's calls use the same loop.

## Sub-features

- `calibrate` measures the relaxed front stance once per session and says "Got it."
- `build-up` speaks and shows the build-up steps of the pose one at a time. `Next` moves on.
- `score` shows a live 0 to 100 score for the pose in `[data-testid="score"]`.
- `cue` shows and speaks the correction for the largest fault, for example "Raise your elbows to shoulder height."
- `hold` shows the hold bar while the score stays over the line.
- `hit` ends the run with a summary (score and time to hit) and saves a photo.

## How to get to it (user POV)

- On Home, pick a pose under **Pose**, then choose `Start: <pose>` on the **Learn a pose** card.
- On the summary, choose `Again` to run the same pose again.

## Driving it with scripts/android/drive.ts

Preconditions:

- The baseline preconditions in [README.md](./README.md) hold.
- For a clear correcting phase, the camera plays a clip with a long relaxed part. Render it with `$D clip docs/shots/verify/run-loop/camera-slow.mp4 relaxedFront=20 frontDoubleBiceps=10`, then `$D camera docs/shots/verify/run-loop/camera-slow.mp4` while the app is on Home, and wait 6 s.

Steps:

- **Start Learn.** Choose the Learn card. Run `$D click 'button[data-mode="learn"]'` and `$D wait "window.__tutorState?.().camera.kind === 'live'" 90`. The camera view shows the figure from the clip.
- **Calibrate.** Run `$D wait "window.__tutorState().calibration.kind === 'ready' && window.__tutorState().view.stage.text"`. It prints the first build-up step. `__tutorSpeech` holds "Stand relaxed, facing the camera, so I can measure you." and "Got it."
- **Step through the build-up.** Choose `Next` once per step. Run `$D click '.tutor-controls button' Next` while `$D eval "window.__tutorState().view.stage.kind"` prints `"step"`. There are 8 steps for the front double biceps.
- **See a correction.** Run `$D wait "window.__tutorState().view.stage.kind === 'correcting' && document.querySelector('[data-testid=cue]').textContent"` and `$D shot docs/shots/verify/run-loop/03-correcting.png`. During the relaxed part of the clip, the score is low (about 22) and the cue is a fault cue such as "Raise your elbows to shoulder height."
- **Hold and hit.** Run `$D wait "window.__tutorState().view.stage.kind === 'holding'" 60`, take a shot, then `$D wait "window.__tutorState().view.stage.kind === 'done' && window.__tutorState().view.stage.summary" 60`. The summary says `Front double biceps hit in <t> s with a score of <n>`, with `n` near 99 for the figure clip.
- **Spoken lines.** Run `$D eval "window.__tutorSpeech.map((e) => e.text + ' (' + (e.end ?? 'speaking') + ')')"`. The list holds the calibration lines, the 8 steps, "Now hit the pose.", the fault cues, "Hold it." and "Pose hit. Relax."
- **Proof.** Save the shots of the step, the correction, the hold and the summary, the summary JSON and the speech list in `docs/shots/verify/run-loop/`.

## Gotchas

- The build-up never moves on by itself. Without `Next` (or the voice command "next"), the run stays on step 1.
- With the default clip, the relaxed part is 8 s. If you step through slowly, the figure is already in the pose and the run goes straight to holding. Use the slow clip to see a correction.
- `Again` after a hit skips calibration. The calibration lines appear only once per session.
- The score comes from the emulator's CPU MediaPipe on a rendered figure. Do not compare its value with a phone score. Compare it with `src/gate/baseline.json` through `npm run android:gate`.
- If `[data-testid="cue"]` is missing, the run is in a phase without a cue. Read `view.stage.kind` before you assert a cue.
