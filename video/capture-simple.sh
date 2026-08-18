#!/usr/bin/env bash
set -u
AB=/home/z/.bun/install/global/node_modules/agent-browser/bin/agent-browser-linux-x64
HTML="file:///home/z/my-project/video/prism-webgl.html"
FDIR="/home/z/my-project/video/frames-png"
AUDIO="/home/z/my-project/video/audio/prism.wav"
OUT="/home/z/my-project/video/PRISM_launch_film.mp4"
TOTAL=4500
FPS=60

mkdir -p "$FDIR"

# Find next frame to render
NEXT=0
if ls "$FDIR"/frame_*.png >/dev/null 2>&1; then
  LAST=$(ls "$FDIR"/frame_*.png | tail -1 | sed 's/.*frame_0*//;s/\.png//')
  NEXT=$((10#$LAST + 1))
fi

echo "=== Starting from frame $NEXT ==="
$AB set viewport 1920 1080 >/dev/null 2>&1
$AB open "$HTML" >/dev/null 2>&1
sleep 3

START=$(date +%s)

for ((f=NEXT; f<TOTAL; f++)); do
  NUM=$(printf '%05d' $f)
  $AB eval "window.__renderFrame($f)" >/dev/null 2>&1
  $AB screenshot "$FDIR/frame_$NUM.png" >/dev/null 2>&1
  
  if (( f % 50 == 0 )); then
    NOW=$(date +%s)
    ELAPSED=$((NOW - START))
    echo "  $f/$TOTAL · ${ELAPSED}s"
  fi
done

ELAPSED=$(( $(date +%s) - START ))
echo "=== Done in ${ELAPSED}s ==="
COUNT=$(ls "$FDIR"/frame_*.png 2>/dev/null | wc -l)
echo "=== $COUNT frames captured ==="

if (( COUNT > 100 )); then
  echo "=== Stitching ==="
  ffmpeg -y -framerate $FPS -i "$FDIR/frame_%05d.png" -i "$AUDIO" \
    -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p \
    -c:a aac -b:a 192k -shortest "$OUT" 2>&1 | tail -5
  rm -f "$FDIR/frame_"*.png
  echo "=== DONE: $OUT ($(stat -c%s "$OUT" | awk '{print int($1/1024/1024)}') MB) ==="
fi
