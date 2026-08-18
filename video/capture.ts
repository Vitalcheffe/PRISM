// capture.ts — Frame capture via agent-browser (Chromium WebGL)
// Renders 4500 lossless PNG frames, then stitches with ffmpeg.

import { execSync } from "child_process";
import * as fs from "fs";

const AB = "/home/z/.bun/install/global/node_modules/agent-browser/bin/agent-browser-linux-x64";
const HTML = "file:///home/z/my-project/video/prism-webgl.html";
const FDIR = "/home/z/my-project/video/frames-png";
const AUDIO = "/home/z/my-project/video/audio/prism.wav";
const OUT = "/home/z/my-project/video/PRISM_launch_film.mp4";
const TOTAL = 4500;
const FPS = 60;

fs.mkdirSync(FDIR, { recursive: true });
// Clear old frames
for (const f of fs.readdirSync(FDIR)) if (f.endsWith(".png")) fs.unlinkSync(`${FDIR}/${f}`);

console.log(`=== Opening WebGL renderer ===`);
execSync(`${AB} set viewport 1920 1080`, { stdio: "pipe" });
execSync(`${AB} open "${HTML}"`, { stdio: "pipe" });
await Bun.sleep(3000);

console.log(`=== Rendering ${TOTAL} frames ===`);
const t0 = Date.now();

for (let f = 0; f < TOTAL; f++) {
  try {
    // Get base64 PNG from browser
    const result = execSync(
      `${AB} eval "(()=>{try{return window.__renderFrame(${f})}catch(e){return 'ERR:'+e.message}})()"`,
      { encoding: "utf-8", timeout: 30000, stdio: ["pipe", "pipe", "pipe"] }
    ).trim().replace(/^"|"$/g, "");

    if (result.startsWith("ERR:")) {
      console.error(`Frame ${f}: ${result}`);
      continue;
    }

    // Strip data URI prefix
    const b64 = result.replace(/^data:image\/png;base64,/, "");
    
    // Decode and write
    const buf = Buffer.from(b64, "base64");
    const frameNum = String(f).padStart(5, "0");
    fs.writeFileSync(`${FDIR}/frame_${frameNum}.png`, buf);

    if (f % 50 === 0) {
      const elapsed = Math.floor((Date.now() - t0) / 1000);
      const rate = (f + 1) / (elapsed + 1);
      const eta = Math.floor((TOTAL - f - 1) / (rate + 0.1));
      console.log(`  ${f}/${TOTAL} · ${elapsed}s · ${rate.toFixed(1)}fps · ETA ${eta}s`);
    }
  } catch (e: any) {
    console.error(`Frame ${f} exception: ${e.message?.slice(0, 100)}`);
  }
}

const elapsed = Math.floor((Date.now() - t0) / 1000);
console.log(`=== ${TOTAL} frames in ${elapsed}s ===`);

console.log(`=== Stitching with ffmpeg ===`);
execSync(
  `ffmpeg -y -framerate ${FPS} -i ${FDIR}/frame_%05d.png -i ${AUDIO} ` +
  `-c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p -c:a aac -b:a 192k -shortest ${OUT}`,
  { stdio: "inherit" }
);

// Cleanup
console.log(`=== Cleaning up ===`);
for (const f of fs.readdirSync(FDIR)) if (f.endsWith(".png")) fs.unlinkSync(`${FDIR}/${f}`);

const size = fs.statSync(OUT).size;
console.log(`\n✓ ${OUT} · ${Math.floor(size / 1024 / 1024)} MB`);
