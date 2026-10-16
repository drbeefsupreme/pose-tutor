# Sourced by the scripts in scripts/android: the user-space toolchain from setup-toolchain.sh and the target device.
export JAVA_HOME="${JAVA_HOME:-$HOME/.local/jdk-21}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
# adb's device. The default is the emulator of emulator.sh; set ANDROID_SERIAL to use a phone.
export ANDROID_SERIAL="${ANDROID_SERIAL:-emulator-5560}"
APP_ID=io.github.drbeefsupreme.posetutor
