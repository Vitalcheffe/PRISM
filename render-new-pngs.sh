#!/usr/bin/env bash
# render-new-pngs.sh — render the 10 new PRISM viz HTMLs to PNG.
set -u
AB=/home/z/.bun/install/global/node_modules/agent-browser/bin/agent-browser-linux-x64
DOCS=/home/z/my-project/docs

declare -a FILES=(
  "nonlinear-stack-dark:1920x960"
  "nonlinear-stack-light:1920x960"
  "hysteresis-scar-dark:1920x760"
  "hysteresis-scar-light:1920x760"
  "thermodynamic-balance-dark:1920x760"
  "thermodynamic-balance-light:1920x760"
  "data-provenance-dark:1920x760"
  "data-provenance-light:1920x760"
  "manifesto-dark:1920x800"
  "manifesto-light:1920x800"
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
  sleep 0.8
  $AB screenshot "$png" >/dev/null 2>&1
  if [ -f "$png" ]; then
    sz=$(stat -c%s "$png")
    echo "  -> $png ($sz bytes)"
  else
    echo "  !! FAILED: $png"
  fi
done
echo "=== DONE ==="
