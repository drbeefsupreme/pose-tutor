# Pose Tutor

Pose Tutor is an Android app that coaches men's bodybuilding poses (the 12 NPC / IFBB Pro prejudging poses). The
phone stands upright 2 to 3 m away. The front camera tracks the body, the app scores the pose and speaks corrections,
and a 3D figure shows the target pose. The modes are Learn a pose, Hold drill, Judge's calls, Mirror and Progress
(a photo at every hit, kept on the phone).

The app is a Capacitor WebView that runs the TypeScript tutor (`src/`), with native Kotlin plugins
(`android/app/src/main/java/io/github/drbeefsupreme/posetutor/`): camera and MediaPipe pose tracking, speech
recognition, the Gemini Nano coach debrief and a Keystore secret store. Voice commands can use jev
(`api.typesafe.ai`) with a TypeSafe API key that you paste in Settings.

## Build

You need Node 22 or later, and JDK 21 and the Android SDK. `scripts/android/setup-toolchain.sh` installs both in
user space (`~/.local/jdk-21`, `~/Android/Sdk`).

```sh
npm ci
npm run fetch-model      # the MediaPipe pose model, checked by SHA-256, into the Android assets
npm run android:build    # debug APKs in android/app/build/outputs/apk/debug/
```

`npm run figure` rebuilds the figure model in `public/figure/` (needs Bun).

## Install

```sh
npm run android:install  # the APK for the device's ABI; ANDROID_SERIAL picks the device
```

For a phone, you can also copy `app-arm64-v8a-debug.apk` to it and open it. The APK is debug-signed.
`npm run android:emulator` starts a local emulator (`emulator.sh stop` stops it).

## Check

| Command | What it checks |
|---|---|
| `npm run typecheck` | TypeScript, app and scripts |
| `npm test` | Unit tests (Vitest) |
| `npm run android:gate` | Renders every pose in the app's WebView and tracks it with the native plugin. Pass: 0 criterion failures and own-pose scores within 5 points of `src/gate/baseline.json` (`-- --save-baseline` replaces it). Report: `docs/gate-report.md` |
| `npm run android:e2e` | Every mode on the emulator with videos of the figure as the front camera, speech, voice commands, the coach and the network rules. It reads the key from `TYPESAFE_API_KEY` or `.env.local`. Report: `docs/e2e-report.md` |
| `npm run android:native-check` | The coach and secrets plugins. Report: `docs/native-report.md` |
| `npm run android:phone-shots` | The phone layout in portrait and landscape, settings and keep-awake. Report: `docs/phone-report.md` |

The emulator checks start their own emulator (AVD `pose-tutor-harness`, `-gpu host` through the X display) and stop
it at the end. `docs/pose-spec.md` holds the research behind the scoring.

## License

MIT
