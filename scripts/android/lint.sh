#!/usr/bin/env bash
# Android lint on the Kotlin and Java sources. Needs a prior npm run android:build (cap sync): npm run android:lint
set -euo pipefail
cd "$(dirname "$0")/../.."
source scripts/android/env.sh
(cd android && ./gradlew --quiet :app:lintDebug)
