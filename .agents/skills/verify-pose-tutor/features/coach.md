# On-device coach

After a hit, the coach can look at the photo and write a short note with one or two corrections. It runs Gemini Nano on the phone through ML Kit and AICore, so the photo does not leave the phone. Settings shows whether the model is ready, can download it, and runs a self-test on a bundled figure image.

## Sub-features

- `coach-status` shows `available`, `downloadable`, `downloading` or `unavailable` with a reason in `[data-testid="device-coach"] .tutor-device-state`.
- `coach-download` starts or shows the model download with progress in `[data-testid="coach-download"]`.
- `coach-self-test` runs the bundled side chest image through the coach and shows the result in `[data-testid="coach-self-test"]`.
- `coach-debrief` shows the note in `[data-testid="debrief"]` after a hit when **Coach debrief after every hit pose** is on. The user can close it.

## How to get to it (user POV)

- On Home, scroll to Settings. The coach section shows the status, `Download the model` when the phone supports it, and `Self-test`.
- Turn on **Coach debrief after every hit pose**, then hit a pose in any scored mode.

## Driving it with scripts/android/drive.ts

Preconditions:

- The baseline preconditions in [README.md](./README.md) hold.
- The emulator has no AICore. On it, the only reachable result is `unavailable`. The `available` path needs a Pixel with Gemini Nano.

Steps:

- **Status.** Run `$D wait "(() => { const s = document.querySelector('[data-testid=device-coach] .tutor-device-state'); return s && s.dataset.state !== 'checking' && s.dataset.state + ': ' + s.textContent; })()"`. On the emulator it prints `unavailable` with "This is an emulator. It has no AICore, so Gemini Nano cannot run here."
- **Self-test.** Choose `Self-test`. Run `$D click '[data-testid="device-coach"] .pill' 'Self-test'`, then `$D wait "(() => { const el = document.querySelector('[data-testid=coach-self-test]'); return el && el.dataset.state !== 'running' && el.dataset.state + ': ' + el.textContent; })()" 30`. On the emulator the state is `done` and the text starts with `On-device coach is not available on this phone:`.
- **Debrief after a hit.** Leave the coach debrief on (the default). Run Learn to a hit as in [run-loop.md](./run-loop.md). Then run `$D wait "window.__tutorState().debrief.kind === 'note' && JSON.stringify(window.__tutorState().debrief)" 30`. On the emulator the note is the "not available on this phone" text with no cues, and the run shows it as a note, not as an error.
- **Close the note.** Run `$D click '.tutor-debrief-close'`. `[data-testid="debrief"]` disappears.
- **Proof.** Save the Settings screenshot, the self-test text, the debrief JSON and a screenshot of the note in `docs/shots/verify/coach/`.

## Gotchas

- `npm run android:native-check` tests the coach plugin calls directly (image sizes, busy, bad input). Use it for plugin changes. This recipe proves what the user sees.
- On a phone, the first model download can take minutes and needs Wi-Fi. Do not wait for it in a timed run.
- The debrief sends a downsized copy of the hit photo to the on-device model only. If a network request to a new host appears during a debrief, that is a fault. `npm run android:e2e` watches the app's sockets.
