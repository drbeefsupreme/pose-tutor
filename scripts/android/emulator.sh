#!/usr/bin/env bash
# Starts the pose-tutor emulator (API 35, google_apis x86_64) headless on port 5560 and waits until it has booted.
# The AVD is created on first use. The front camera is the emulated scene, or CAMERA=<video file> (for example from
# camera-video.sh). The host webcam is never used. `emulator.sh stop` shuts it down.
# The GPU is the host's (`-gpu host`, through the X display): with SwiftShader the emulator exits when the app opens the
# camera while the WebView renders the figure. MediaPipe still runs on the CPU here.
set -euo pipefail
cd "$(dirname "$0")/../.."
source scripts/android/env.sh

AVD=pose-tutor
PORT=5560
export ANDROID_SERIAL="emulator-$PORT"
LOG="${TMPDIR:-/tmp}/$AVD-emulator.log"

if [ "${1:-}" = stop ]; then
  adb emu kill
  exit 0
fi
if adb get-state >/dev/null 2>&1; then
  echo "$ANDROID_SERIAL is already running."
  exit 0
fi

if ! avdmanager list avd -c | grep -qx "$AVD"; then
  echo no | avdmanager create avd -n "$AVD" -k "system-images;android-35;google_apis;x86_64" -d pixel_7 >/dev/null
  printf 'hw.cpu.ncore=4\nhw.ramSize=4096\n' >>"$HOME/.android/avd/$AVD.avd/config.ini"
fi

camera=emulated
if [ -n "${CAMERA:-}" ]; then
  camera="videofile:$(realpath "$CAMERA")"
fi
DISPLAY="${DISPLAY:-:0}" nohup emulator -avd "$AVD" -port "$PORT" -no-window -no-audio -no-boot-anim -gpu host \
  -no-snapshot -no-metrics -camera-front "$camera" >"$LOG" 2>&1 &
echo "Starting $AVD (front camera: $camera, log: $LOG)"
adb wait-for-device
until [ "$(adb shell getprop sys.boot_completed | tr -d '\r')" = 1 ]; do sleep 2; done
echo "$ANDROID_SERIAL booted."
