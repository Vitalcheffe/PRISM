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
rm -f "$FDIR"/*.png

$AB set viewport 1920 1080 >/dev/null 2>&1
$AB open "$HTML" >/dev/null 2>&1
sleep 3
echo "=== Rendering $TOTAL frames ==="
START=$(date +%s)

for ((f=0; f<TOTAL; f++)); do
  B64=$($AB eval "(()=>{try{return window.__renderFrame($f)}catch(e){return 'ERR:'+e.message}})()" 2>/dev/null | tr -d '"' | sed 's/^data:image\/png;base64,//')
  
  if [[ "$B64" == ERR* ]]; then
    echo "Frame $f ERROR: $B64"
    continue
  fi
  
  echo "$B64" | base64 -d > "$FDIR/frame_$(printf '%05d' $f).png"
  
  if (( f % 50 == 0 )); then
    NOW=$(date +%s)
    ELAPSED=$((NOW - START))
    RATE=$(( (f + 1) / (ELAPSED + 1) ))
    REMAIN=$(( (TOTAL - f - 1) / (RATE + 1) ))
    echo "  $f/$TOTAL · ${ELAPSED}s · ${RATE}fps · ETA ${REMAIN}s"
  fi
done

ELAPSED=$(( $(date +%s) - START ))
echo "=== $TOTAL frames in ${ELAPSED}s ==="
echo "=== Stitching ==="
ffmpeg -y -framerate $FPS -i "$FDIR/frame_%05d.png" -i "$AUDIO" \
  -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p \
  -c:a aac -b:a 192k -shortest "$OUT" 2>&1 | tail -5
rm -f "$FDIR/frame_"*.png
echo "=== DONE: $OUT ($(stat -c%s "$OUT" | awk '{print int($1/1024/1024)}') MB) ==="
