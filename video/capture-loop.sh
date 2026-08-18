#!/usr/bin/env bash
while true; do
  COUNT=$(ls /home/z/my-project/video/frames-png/frame_*.png 2>/dev/null | wc -l)
  if (( COUNT >= 4500 )); then
    echo "All 4500 frames captured!"
    break
  fi
  echo "=== Relaunching capture ($COUNT frames so far) ==="
  bash /home/z/my-project/video/capture-simple.sh
  sleep 2
done
