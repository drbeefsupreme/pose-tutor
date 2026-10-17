# Voice commands and the TypeSafe key

During a run, the user can say a command instead of touching the phone: next, repeat, what's wrong, pause, resume, stop or skip. Android speech recognition turns speech into text. Without a key, keywords pick the command. With a TypeSafe key saved in Settings, jev (`api.typesafe.ai`) picks the command from free phrases, and keywords are the fallback. The key lives in the Android Keystore and the app never shows it again.

## Sub-features

- `voice-toggle` turns voice commands on or off with **Voice commands** in Settings. The run bar shows `mic: <state>`.
- `voice-keywords` maps phrases such as "next one please" or "stop" to a command without the network.
- `voice-jev` sends the transcript to jev when a key is saved, for phrases such as "could you go to the next one".
- `key-save` saves a pasted key. The key section then shows `saved`, and the field is empty.
- `key-persist` keeps the key across an app restart.
- `key-clear` removes the key. The section shows `not-saved` again.

## How to get to it (user POV)

- On Home, in Settings, tick **Voice commands**. Then start any mode and speak.
- On Home, in Settings, paste the key into **TypeSafe API key** and choose `Save the key`. Choose `Clear the key` to remove it.

## Driving it with scripts/android/drive.ts

Preconditions:

- The baseline preconditions in [README.md](./README.md) hold.
- For `voice-jev`, a real key is in `TYPESAFE_API_KEY` or `.env.local`, and the emulator has network access.

Steps:

- **Keyword command.** Start Learn and wait for the first build-up step, as in [run-loop.md](./run-loop.md). Run `$D eval "window.__tutorVoice('next one please')"`. It prints `true`. Then `$D wait "JSON.stringify(window.__tutorState().heard)"` shows `command: "next"`, `via: "keywords"`, and the step index goes up by 1.
- **No key yet.** Return to Home. Run `$D wait "document.querySelector('[data-testid=device-key] .tutor-device-state')?.dataset.state"`. It prints `"not-saved"`.
- **Save the key.** Run `$D paste-key`, then `$D click '[data-testid="device-key"] .btn' 'Save the key'`. Then the same `wait` prints `"saved"`. The command prints only the key length.
- **Persist.** Restart the app with `adb -s emulator-5564 shell am force-stop io.github.drbeefsupreme.posetutor` and `adb -s emulator-5564 shell am start -n io.github.drbeefsupreme.posetutor/.MainActivity`. Wait for Home with `$D wait "!!document.querySelector('.tutor-home')" 60`. The state is still `"saved"`, and `$D eval "document.querySelector('[data-testid=device-key] input').value === ''"` prints `true`.
- **Jev phrase.** Start Learn, wait for a step, and run `$D eval "window.__tutorVoice('could you go to the next one')"`. Then `$D wait "window.__tutorState().heard?.via === 'jev' && JSON.stringify(window.__tutorState().heard)" 20` shows `command: "next"` with a confidence of 0.7 or more.
- **Clear the key.** On Home, run `$D click '[data-testid="device-key"] .pill' 'Clear the key'`. The state goes back to `"not-saved"`.
- **Proof.** Save the `heard` values, the key states and screenshots of the key section in `docs/shots/verify/voice-and-key/`.

## Gotchas

- `__tutorVoice` returns `false` when no voice input listens: voice commands are off, or no run is open. A `false` is not proof that a command failed.
- The emulator has no microphone input that this recipe can use. The real recognizer path (`TutorVoice` plugin) is proven only on a phone. Say so in the proof file.
- "could you go to the next one" has no keyword. Without a key, or offline, the app ignores it. That is the expected fallback.
- Never pass the key on a command line or in an `eval` expression. Use `paste-key`, which reads it from the environment and prints only its length.
- `npm run android:e2e` stores the key and clears the app data at its end. After it, the key is gone.
