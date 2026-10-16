#!/usr/bin/env bash
# Installs a JDK, the Android SDK and the emulator's system image in user space (no sudo). emulator.sh and the check
# scripts create their own AVDs on first use.
# Safe to rerun: each step skips work that is already done.
set -euo pipefail

JDK_DIR="${JDK_DIR:-$HOME/.local/jdk-21}"
SDK_DIR="${ANDROID_HOME:-$HOME/Android/Sdk}"
API=35

if [ ! -x "$JDK_DIR/bin/javac" ]; then
  mkdir -p "$JDK_DIR"
  curl -fsSL "https://api.adoptium.net/v3/binary/latest/21/ga/linux/x64/jdk/hotspot/normal/eclipse" \
    | tar -xz -C "$JDK_DIR" --strip-components=1
fi
export JAVA_HOME="$JDK_DIR" PATH="$JDK_DIR/bin:$PATH"

if [ ! -x "$SDK_DIR/cmdline-tools/latest/bin/sdkmanager" ]; then
  mkdir -p "$SDK_DIR/cmdline-tools"
  tmp=$(mktemp -d)
  curl -fsSL -o "$tmp/tools.zip" https://dl.google.com/android/repository/commandlinetools-linux-13114758_latest.zip
  unzip -q "$tmp/tools.zip" -d "$tmp"
  mv "$tmp/cmdline-tools" "$SDK_DIR/cmdline-tools/latest"
  rm -rf "$tmp"
fi
sdkmanager="$SDK_DIR/cmdline-tools/latest/bin/sdkmanager"

{ yes || true; } | "$sdkmanager" --sdk_root="$SDK_DIR" --licenses >/dev/null
"$sdkmanager" --sdk_root="$SDK_DIR" --install \
  "platform-tools" "platforms;android-$API" "build-tools;$API.0.0" "emulator" \
  "system-images;android-$API;google_apis;x86_64" >/dev/null

echo "JAVA_HOME=$JDK_DIR"
echo "ANDROID_HOME=$SDK_DIR"
"$JDK_DIR/bin/javac" -version
"$SDK_DIR/platform-tools/adb" version | head -1
