#!/usr/bin/env bash
# render-pngs.sh — render all PRISM docs HTML files to PNG via agent-browser.
# Each HTML file declares its own body width/height; we set the viewport to match
# so screenshots are pixel-exact with no extra background.
set -u
AB=/home/z/.bun/install/global/node_modules/agent-browser/bin/agent-browser-linux-x64
DOCS=/home/z/my-project/docs

# name : WxH
declare -a FILES=(
  "banner-v2-dark:1920x640"
  "banner-v2-light:1920x640"
  "reactor-prisms-dark:1920x800"
  "reactor-prisms-light:1920x800"
  "neural-active-dark:1920x800"
  "neural-active-light:1920x800"
  "agent-swarm-dark:1920x800"
  "agent-swarm-light:1920x800"
  "black-swan-cascade-dark:1920x760"
  "black-swan-cascade-light:1920x760"
  "causal-graph-dark:1920x800"
  "causal-graph-light:1920x800"
  "decree-projection-dark:1920x760"
  "decree-projection-light:1920x760"
  "paradigm-shift-dark:1920x760"
  "paradigm-shift-light:1920x760"
)

for entry in "${FILES[@]}"; do
  name="${entry%%:*}"
  dims="${entry##*:}"
  W="${dims%x*}"
  H="${dims#*x}"
  html="$DOCS/$name.html"
  png="$DOCS/$name.png"
  echo "=== $name (${W}x${H}) ==="
  $AB set viewport "$W" "$H" >/dev/null 2>&1
  $AB open "file://$html" >/dev/null 2>&1
  # wait for any inline <script> rendering (agent-swarm, neural-active, paradigm-shift)
  sleep 0.6
  $AB screenshot "$png" >/dev/null 2>&1
  if [ -f "$png" ]; then
    sz=$(stat -c%s "$png")
    echo "  -> $png ($sz bytes)"
  else
    echo "  !! FAILED: $png"
  fi
done
echo "=== DONE ==="
