#!/usr/bin/env bash
# Installs the debug APK that matches the device's ABI and opens the app. ANDROID_SERIAL picks the device.
set -euo pipefail
cd "$(dirname "$0")/../.."
source scripts/android/env.sh

abi=$(adb shell getprop ro.product.cpu.abi | tr -d '\r')
apk="android/app/build/outputs/apk/debug/app-$abi-debug.apk"
if [ ! -f "$apk" ]; then
  echo "No APK for $abi ($apk). Run npm run android:build." >&2
  exit 1
fi
adb install -r "$apk"
adb shell am start -n "$APP_ID/.MainActivity"
