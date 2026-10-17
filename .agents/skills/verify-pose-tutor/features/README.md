# Pose Tutor verification map

This folder is the maintained list of user-facing features and how to prove each one. Read this index first, then use the matching feature file as the recipe.

## Baseline preconditions

- A drive session runs: `node scripts/android/drive.ts launch` printed `Ready:`.
- `node scripts/android/drive.ts doctor` prints only `ok` lines.
- The app shows Home. `node scripts/android/drive.ts eval "!!document.querySelector('.tutor-home')"` prints `true`.
- The front camera plays the default clip (relaxedFront 8 s, frontDoubleBiceps 10 s), unless the recipe swaps it.
- Settings are the app defaults: voice commands on, coach debrief on, hold goal 10 s.
- Never drive an emulator that this session did not start.

## Driving conventions

- Write `D="node scripts/android/drive.ts"` and use `$D click`, `$D wait`, `$D eval` and `$D shot`.
- Use the stable handles in the skill's Drive section. Do not use screen coordinates.
- Start each recipe from Home. To return from a run, click `Back to the tutor` on the summary, or `.tutor-run-bar .pill` (`Exit`) during a run.
- Use `$D wait '<expression>'` for every state change. Do not use a fixed `sleep`, except the 6 s camera-closed wait before a clip swap.

## Proof and skip reporting

- Save the evidence and a proof file in `docs/shots/verify/<feature-id>/`. The proof file, `docs/shots/verify/<feature-id>/proof.md`, gives one line per artifact.
- Capture the action and the resulting state: a screenshot and the hook value at each step that matters.
- For a change that writes data, read it back a second way: the photo files on the phone, `localStorage`, or the Settings state after an app restart.
- Report a path that the emulator cannot run (the Gemini Nano model, a real microphone) with the command you tried and the missing precondition.
- Do not report a skipped entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph about the behavior the user sees. Then it has these four H2 sections, in this order: `Sub-features`, `How to get to it (user POV)`, `Driving it with scripts/android/drive.ts`, and `Gotchas`. The driving section starts with `Preconditions:` and then pairs each user action with a command and the result to observe.

## Features

- [The run loop: scoring and cues](./run-loop.md) covers calibration, the build-up steps, the live score, the spoken corrections, the hold and the hit.
- [Practice modes](./practice-modes.md) covers Hold drill, Judge's calls and Mirror.
- [Progress photos](./progress-photos.md) covers the photo at a hit, the timeline, compare and delete.
- [On-device coach](./coach.md) covers the coach status, the self-test and the debrief note after a hit.
- [Voice commands and the TypeSafe key](./voice-and-key.md) covers keyword commands, jev for free phrases, and saving and clearing the key.
