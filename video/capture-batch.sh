#!/usr/bin/env bash
set -u
AB=/home/z/.bun/install/global/node_modules/agent-browser/bin/agent-browser-linux-x64
HTML="file:///home/z/my-project/video/prism-webgl.html"
FDIR="/home/z/my-project/video/frames-png"
AUDIO="/home/z/my-project/video/audio/prism.wav"
OUT="/home/z/my-project/video/PRISM_launch_film.mp4"
TOTAL=4500
FPS=60
BATCH=50

mkdir -p "$FDIR"
rm -f "$FDIR"/*.png

echo "=== Rendering $TOTAL frames (batches of $BATCH) ==="
START=$(date +%s)

for ((batch_start=0; batch_start<TOTAL; batch_start+=BATCH)); do
  batch_end=$((batch_start + BATCH - 1))
  if (( batch_end >= TOTAL )); then batch_end=$((TOTAL - 1)); fi
  
  # Restart browser for each batch to avoid memory leaks
  $AB close --all >/dev/null 2>&1
  sleep 1
  $AB set viewport 1920 1080 >/dev/null 2>&1
  $AB open "$HTML" >/dev/null 2>&1
  sleep 2
  
  for ((f=batch_start; f<=batch_end; f++)); do
    NUM=$(printf '%05d' $f)
    $AB eval "window.__renderFrame($f)" >/dev/null 2>&1
    $AB screenshot "$FDIR/frame_$NUM.png" >/dev/null 2>&1
  done
  
  NOW=$(date +%s)
  ELAPSED=$((NOW - START))
  RATE=$(( (batch_end + 1) / (ELAPSED + 1) ))
  REMAIN=$(( (TOTAL - batch_end - 1) / (RATE + 1) ))
  echo "  batch $batch_start-$batch_end done · ${ELAPSED}s · ${RATE}fps · ETA ${REMAIN}s"
done

ELAPSED=$(( $(date +%s) - START ))
echo "=== $TOTAL frames in ${ELAPSED}s ==="
echo "=== Stitching ==="
ffmpeg -y -framerate $FPS -i "$FDIR/frame_%05d.png" -i "$AUDIO" \
  -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p \
  -c:a aac -b:a 192k -shortest "$OUT" 2>&1 | tail -5
echo "=== Cleanup ==="
rm -f "$FDIR/frame_"*.png
echo "=== DONE: $OUT ($(stat -c%s "$OUT" | awk '{print int($1/1024/1024)}') MB) ==="
