// capture2.ts — Write base64 to temp file to avoid buffer limits
import { execSync } from "child_process";
import * as fs from "fs";

const AB = "/home/z/.bun/install/global/node_modules/agent-browser/bin/agent-browser-linux-x64";
const HTML = "file:///home/z/my-project/video/prism-webgl.html";
const FDIR = "/home/z/my-project/video/frames-png";
const TMP = "/home/z/my-project/video/tmp_b64.txt";
const AUDIO = "/home/z/my-project/video/audio/prism.wav";
const OUT = "/home/z/my-project/video/PRISM_launch_film.mp4";
const TOTAL = 4500;
const FPS = 60;

fs.mkdirSync(FDIR, { recursive: true });
for (const f of fs.readdirSync(FDIR)) if (f.endsWith(".png")) fs.unlinkSync(`${FDIR}/${f}`);

console.log(`=== Opening WebGL renderer ===`);
execSync(`${AB} set viewport 1920 1080`, { stdio: "pipe" });
execSync(`${AB} open "${HTML}"`, { stdio: "pipe" });
await Bun.sleep(3000);

console.log(`=== Rendering ${TOTAL} frames ===`);
const t0 = Date.now();

for (let f = 0; f < TOTAL; f++) {
  try {
    // Use eval with --json to write result to file via redirect
    // The trick: agent-browser eval outputs to stdout, we redirect to a temp file
    execSync(
      `${AB} eval "window.__renderFrame(${f})" > ${TMP} 2>/dev/null`,
      { timeout: 30000, stdio: "pipe", maxBuffer: 10 * 1024 * 1024 }
    );
    
    // Read the temp file
    let b64 = fs.readFileSync(TMP, "utf-8").trim().replace(/^"|"$/g, "");
    b64 = b64.replace(/^data:image\/png;base64,/, "");
    
    if (!b64 || b64.length < 100) {
      console.error(`Frame ${f}: empty result`);
      continue;
    }
    
    const buf = Buffer.from(b64, "base64");
    const frameNum = String(f).padStart(5, "0");
    fs.writeFileSync(`${FDIR}/frame_${frameNum}.png`, buf);
    fs.unlinkSync(TMP);

    if (f % 50 === 0) {
      const elapsed = Math.floor((Date.now() - t0) / 1000);
      const rate = (f + 1) / (elapsed + 1);
      const eta = Math.floor((TOTAL - f - 1) / (rate + 0.1));
      console.log(`  ${f}/${TOTAL} · ${elapsed}s · ${rate.toFixed(1)}fps · ETA ${eta}s`);
    }
  } catch (e: any) {
    console.error(`Frame ${f}: ${e.message?.slice(0, 80)}`);
  }
}

const elapsed = Math.floor((Date.now() - t0) / 1000);
console.log(`=== ${TOTAL} frames in ${elapsed}s ===`);

console.log(`=== Stitching ===`);
execSync(
  `ffmpeg -y -framerate ${FPS} -i ${FDIR}/frame_%05d.png -i ${AUDIO} ` +
  `-c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p -c:a aac -b:a 192k -shortest ${OUT}`,
  { stdio: "inherit" }
);

console.log(`=== Cleanup ===`);
for (const f of fs.readdirSync(FDIR)) if (f.endsWith(".png")) fs.unlinkSync(`${FDIR}/${f}`);

const size = fs.statSync(OUT).size;
console.log(`\n✓ ${OUT} · ${Math.floor(size / 1024 / 1024)} MB`);
