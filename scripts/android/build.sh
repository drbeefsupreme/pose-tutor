#!/usr/bin/env bash
# Builds the Android app: the web part (vite.config.ts, with public/figure), Capacitor sync, then one debug APK per ABI
# in android/app/build/outputs/apk/debug/.
set -euo pipefail
cd "$(dirname "$0")/../.."
source scripts/android/env.sh

if [ ! -f android/app/src/main/assets/pose_landmarker_full.task ]; then
  echo "The pose model is missing. Run npm run fetch-model." >&2
  exit 1
fi
npx vite build --logLevel warn
npx cap sync android
(cd android && ./gradlew --quiet assembleDebug)
du -h android/app/build/outputs/apk/debug/*.apk
