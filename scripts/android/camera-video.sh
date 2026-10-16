#!/usr/bin/env bash
# Makes an emulator front-camera video from 1280x720 figure renders: every PNG in <frames dir>, in name order, shown
# for <seconds> (default 2) at 30 fps.
# The emulator fits the video to its 4:3 sensor. In portrait the app sees only the LEFT 3:4 part of that (measured with
# a labelled test pattern); in landscape (`adb emu rotate`) it sees the whole video, upright. So each render is
# centre-cropped to 540x720 and put at the left of a 960x720 frame.
# Usage: camera-video.sh <frames dir> <out.mp4> [seconds]
set -euo pipefail
frames="${1:?frames dir}"
out="${2:?output mp4}"
seconds="${3:-2}"
ffmpeg -y -loglevel error -framerate "1/$seconds" -pattern_type glob -i "$frames/*.png" \
  -vf "crop=540:720,pad=960:720:0:0:color=0x9A9EA6,fps=30,format=yuv420p" -c:v libx264 "$out"
ffprobe -v error -show_entries stream=width,height,nb_frames -of compact "$out"
