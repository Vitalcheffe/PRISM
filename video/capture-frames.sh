#!/usr/bin/env bash
# capture-frames.sh — Capture PRISM film frames via agent-browser (Chromium WebGL)
# Renders 4500 frames at 1920x1080, lossless PNG, then stitches with ffmpeg.

set -u
AB=/home/z/.bun/install/global/node_modules/agent-browser/bin/agent-browser-linux-x64
HTML="file:///home/z/my-project/video/prism-webgl.html"
FDIR="/home/z/my-project/video/frames-png"
AUDIO="/home/z/my-project/video/audio/prism.wav"
OUT="/home/z/my-project/video/PRISM_launch_film.mp4"
TOTAL=4500
FPS=60

mkdir -p "$FDIR"

echo "=== Opening WebGL renderer ==="
$AB set viewport 1920 1080 >/dev/null 2>&1
$AB open "$HTML" >/dev/null 2>&1
sleep 3

echo "=== Rendering $TOTAL frames ==="
START=$(date +%s)

for ((f=0; f<TOTAL; f++)); do
  # Render frame in browser, get base64 PNG
  B64=$($AB eval "(()=>{try{return window.__renderFrame($f)}catch(e){return 'ERROR:'+e.message}})()" 2>/dev/null | tr -d '"')
  
  if [[ "$B64" == ERROR* ]]; then
    echo "Frame $f error: $B64"
    continue
  fi
  
  # Strip data:image/png;base64, prefix and decode
  echo "$B64" | sed 's/^data:image\/png;base64,//' | base64 -d > "$FDIR/frame_$(printf '%05d' $f).png"
  
  if (( f % 100 == 0 )); then
    ELAPSED=$(($(date +%s) - START))
    RATE=$(echo "scale=1; ($f+1)/($ELAPSED+1)" | bc)
    ETA=$(echo "scale=0; ($TOTAL-$f-1)/($RATE+0.1)" | bc)
    echo "  frame $f/$TOTAL · ${ELAPSED}s · ${RATE}fps · ETA ${ETA}s"
  fi
done

ELAPSED=$(($(date +%s) - START))
echo "=== Rendered $TOTAL frames in ${ELAPSED}s ==="

echo "=== Stitching with ffmpeg ==="
ffmpeg -y -framerate $FPS -i "$FDIR/frame_%05d.png" -i "$AUDIO" \
  -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p \
  -c:a aac -b:a 192k -shortest "$OUT" 2>&1 | tail -5

echo "=== Cleaning up ==="
rm -f "$FDIR/frame_"*.png

SIZE=$(stat -c%s "$OUT")
echo "=== DONE ==="
echo "File: $OUT"
echo "Size: $((SIZE/1024/1024)) MB"
