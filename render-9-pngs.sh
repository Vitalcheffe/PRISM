#!/usr/bin/env bash
set -u
AB=/home/z/.bun/install/global/node_modules/agent-browser/bin/agent-browser-linux-x64
DOCS=/home/z/my-project/docs
declare -a FILES=(
  "kernel-architecture-dark:1920x900"
  "kernel-architecture-light:1920x900"
  "life-cycle-dark:1920x800"
  "life-cycle-light:1920x800"
  "governance-matrix-dark:1920x760"
  "governance-matrix-light:1920x760"
  "emergence-dark:1920x900"
  "emergence-light:1920x900"
)
for entry in "${FILES[@]}"; do
  name="${entry%%:*}"; dims="${entry##*:}"
  W="${dims%x*}"; H="${dims#*x}"
  html="$DOCS/$name.html"; png="$DOCS/$name.png"
  $AB set viewport "$W" "$H" >/dev/null 2>&1
  $AB open "file://$html" >/dev/null 2>&1
  sleep 0.8
  $AB screenshot "$png" >/dev/null 2>&1
  [ -f "$png" ] && echo "✓ $name ($(stat -c%s $png) bytes)" || echo "✗ $name FAILED"
done
