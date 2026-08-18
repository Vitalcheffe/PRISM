// Optimized renderer — fewer connections, cached gradients, 60s @ 60fps
import { createCanvas } from "canvas";
import * as fs from "fs";
import { execSync } from "child_process";

const W = 1920, H = 1080, FPS = 60, DUR = 60, TOTAL = FPS * DUR;
const DIR = "/home/z/my-project/video/frames";
const AUDIO = "/home/z/my-project/video/audio/prism.wav";
const OUT = "/home/z/my-project/video/PRISM_launch_film.mp4";

const BG = "#0d1117", INK = "#f0f6fc", SOFT = "#8b949e", FAINT = "#3d444d", AMBER = "#f59e0b";
const CRIMSON = "#f43f5e", EMERALD = "#10b981", VIOLET = "#a855f7", CYAN = "#06b6d4";
const CAT = [AMBER, CRIMSON, EMERALD, "#f97316", VIOLET, "#84cc16", "#eab308", CYAN];

let seed = 1337;
function rnd() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
function clamp(v,lo,hi){return Math.max(lo,Math.min(hi,v))}
function lerp(a,b,t){return a+(b-a)*t}
function eoc(t){return 1-Math.pow(1-t,3)}
function eob(t){const c1=1.70158,c3=c1+1;return 1+c3*Math.pow(t-1,3)+c1*Math.pow(t-1,2)}

// Pre-render the dot grid background once
const bgCanvas = createCanvas(W, H);
const bgCtx = bgCanvas.getContext("2d");
bgCtx.fillStyle = BG;
bgCtx.fillRect(0, 0, W, H);
bgCtx.fillStyle = "rgba(245,158,11,0.035)";
for (let x = 0; x < W; x += 40) {
  for (let y = 0; y < H; y += 40) { bgCtx.fillRect(x, y, 1, 1); }
}

function drawGlow(ctx, cx, cy, r, color, alpha) {
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  grad.addColorStop(0, color);
  grad.addColorStop(1, "transparent");
  ctx.globalAlpha = alpha;
  ctx.fillStyle = grad;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.globalAlpha = 1;
}

function mono(ctx, text, x, y, size, color, alpha) {
  ctx.globalAlpha = alpha ?? 1;
  ctx.fillStyle = color ?? SOFT;
  ctx.font = `400 ${size}px monospace`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(text, x, y);
  ctx.globalAlpha = 1;
}

function bigText(ctx, text, x, y, size, color, weight, alpha) {
  ctx.globalAlpha = alpha ?? 1;
  ctx.fillStyle = color ?? INK;
  ctx.font = `${weight ?? 400} ${size}px sans-serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(text, x, y);
  ctx.globalAlpha = 1;
}

// ── Neural network nodes (pre-computed) ──
const nnLayers = [47, 32, 32, 15];
const nnLayerX = [W * 0.2, W * 0.4, W * 0.6, W * 0.8];
const nnNodes = [];
for (let l = 0; l < 4; l++) {
  const count = nnLayers[l];
  const sp = (H * 0.7) / (count + 1);
  for (let i = 0; i < count; i++) {
    nnNodes.push({ x: nnLayerX[l], y: H * 0.15 + sp * (i + 1), layer: l, idx: i, color: l === 0 ? CAT[i % 8] : l === 3 ? CAT[i % 8] : AMBER });
  }
}
// Pre-compute a SUBSET of connections (not all 3008)
const nnConns = [];
for (let i = 0; i < 47; i++) for (let j = 0; j < 32; j++) if (rnd() < 0.15) nnConns.push([i, 47 + j]);
for (let i = 0; i < 32; i++) for (let j = 0; j < 32; j++) if (rnd() < 0.15) nnConns.push([47 + i, 79 + j]);
for (let i = 0; i < 32; i++) for (let j = 0; j < 15; j++) if (rnd() < 0.2) nnConns.push([79 + i, 111 + j]);

// ── Prisms (pre-computed) ──
const prisms = [];
for (let i = 0; i < 47; i++) {
  prisms.push({ x: W * 0.1 + (i + 1) * (W * 0.8 / 48), h: 30 + rnd() * 180, color: CAT[i % 8] });
}

// ── Swarm dots (reduced to 400) ──
const swarm = [];
const sBlock = 180, sGap = 50, sCols = 4, sRows = 2;
const sStartX = (W - (sCols * sBlock + (sCols - 1) * sGap)) / 2;
const sStartY = H * 0.22;
for (let r = 0; r < sRows; r++) for (let c = 0; c < sCols; c++) {
  const bx = sStartX + c * (sBlock + sGap), by = sStartY + r * (sBlock + sGap);
  const cat = r * sCols + c, hot = cat === 4 || cat === 5;
  for (let i = 0; i < 50; i++) {
    const px = bx + rnd() * sBlock, py = by + rnd() * sBlock;
    let stress = hot && rnd() < 0.5 ? 0.7 + rnd() * 0.3 : rnd() * 0.3;
    swarm.push({ x: px, y: py, color: CAT[cat], stress });
  }
}

// ── Wave field (reduced) ──
const waves = [];
const wCols = 50, wRows = 20, wSp = 32;
const wStartX = (W - wCols * wSp) / 2, wStartY = (H - wRows * wSp) / 2;
for (let r = 0; r < wRows; r++) for (let c = 0; c < wCols; c++) {
  waves.push({ x: wStartX + c * wSp, y: wStartY + r * wSp });
}

// Grain (pre-generated)
const grainCanvas = createCanvas(W, H);
const grainCtx = grainCanvas.getContext("2d");
const grainImg = grainCtx.createImageData(W, H);
for (let i = 0; i < grainImg.data.length; i += 4) {
  const v = Math.floor(rnd() * 255);
  grainImg.data[i] = v; grainImg.data[i+1] = v; grainImg.data[i+2] = v; grainImg.data[i+3] = 6;
}
grainCtx.putImageData(grainImg, 0, 0);

// ── FRAME RENDERER ──
function render(frame) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  const ts = frame / FPS; // time in seconds

  // Background
  ctx.drawImage(bgCanvas, 0, 0);

  if (ts < 8) {
    // SEGMENT 1: Hook (0-8s)
    const t = ts / 8;
    if (t < 0.2) {
      const fade = t / 0.2;
      drawGlow(ctx, W/2, H/2, 200, AMBER, 0.02 * fade);
    } else if (t < 0.5) {
      const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 8);
      drawGlow(ctx, W/2, H/2, 300, AMBER, 0.06 + pulse * 0.03);
      ctx.fillStyle = AMBER;
      ctx.beginPath(); ctx.arc(W/2, H/2, 6 + pulse * 4, 0, Math.PI * 2); ctx.fill();
    } else {
      const exp = eoc((t - 0.5) / 0.5);
      drawGlow(ctx, W/2, H/2, 400, AMBER, 0.05);
      ctx.strokeStyle = AMBER; ctx.lineWidth = 1; ctx.globalAlpha = 0.4 * (1 - exp);
      ctx.beginPath(); ctx.arc(W/2, H/2, 8 + exp * 100, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = AMBER;
      ctx.beginPath(); ctx.arc(W/2, H/2, 5, 0, Math.PI * 2); ctx.fill();
      if (t > 0.6) {
        const a = clamp((t - 0.6) / 0.15, 0, 1);
        bigText(ctx, "PRISM", W/2, H/2 - 70, 88, INK, "700", a);
      }
      if (t > 0.75) {
        const a = clamp((t - 0.75) / 0.15, 0, 1);
        mono(ctx, "NON-LINEAR MACROECONOMIC SIMULATOR", W/2, H/2 + 40, 12, SOFT, a);
      }
    }
  } else if (ts < 20) {
    // SEGMENT 2: Neural Network (8-20s)
    const t = (ts - 8) / 12;
    drawGlow(ctx, W/2, H/2, 500, AMBER, 0.025);
    mono(ctx, "THE NEURAL NETWORK", W/2, 55, 13, FAINT, 1);
    mono(ctx, "47 → 32 → 32 → 15 · 3,008 WEIGHTS", W/2, 82, 11, FAINT, 1);

    // Draw subset of connections
    ctx.strokeStyle = AMBER; ctx.lineWidth = 0.5;
    for (const [a, b] of nnConns) {
      const n1 = nnNodes[a], n2 = nnNodes[b];
      ctx.globalAlpha = 0.02;
      ctx.beginPath(); ctx.moveTo(n1.x, n1.y); ctx.lineTo(n2.x, n2.y); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Active signal paths
    for (let s = 0; s < 4; s++) {
      const si = Math.floor((t * 47 + s * 11) % 47);
      const mi = Math.floor((t * 32 + s * 7) % 32);
      const oi = Math.floor((t * 15 + s * 3) % 15);
      const n1 = nnNodes[si], n2 = nnNodes[47 + mi], n3 = nnNodes[79 + mi], n4 = nnNodes[111 + oi];
      ctx.strokeStyle = AMBER; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.moveTo(n1.x, n1.y); ctx.lineTo(n2.x, n2.y); ctx.lineTo(n3.x, n3.y); ctx.lineTo(n4.x, n4.y); ctx.stroke();
      ctx.globalAlpha = 1;
      drawGlow(ctx, n4.x, n4.y, 15, n4.color, 0.2);
    }

    // Nodes
    for (const n of nnNodes) {
      const r = n.layer === 0 ? 3 : n.layer === 3 ? 5 : 4;
      const p = 0.5 + 0.5 * Math.sin(ts * 3 + n.idx * 0.1);
      ctx.fillStyle = n.color; ctx.globalAlpha = 0.4 + p * 0.4;
      ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    const labels = ["INPUT (47)", "HIDDEN-1 (32)", "HIDDEN-2 (32)", "OUTPUT (15)"];
    for (let i = 0; i < 4; i++) mono(ctx, labels[i], nnLayerX[i], H - 45, 9, FAINT, 1);
  } else if (ts < 35) {
    // SEGMENT 3: The Reactor (20-35s)
    const t = (ts - 20) / 15;
    drawGlow(ctx, W/2, H/2, 500, AMBER, 0.025);
    mono(ctx, "THE REACTOR", W/2, 55, 13, FAINT, 1);
    mono(ctx, "47 POLICY LEVERS · LIVE PERTURBATION", W/2, 82, 11, FAINT, 1);

    const blY = H * 0.8;
    ctx.strokeStyle = "rgba(255,255,255,0.05)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(W * 0.08, blY); ctx.lineTo(W * 0.92, blY); ctx.stroke();

    for (let i = 0; i < prisms.length; i++) {
      const p = prisms[i];
      const ap = clamp(t * 3 - i * 0.02, 0, 1);
      const h = lerp(0, p.h, eob(ap)) + Math.sin(ts * 4 + i * 0.5) * 12;
      const w = 14;
      ctx.fillStyle = p.color; ctx.globalAlpha = 0.5;
      ctx.fillRect(p.x - w/2, blY - h, w, h);
      ctx.globalAlpha = 1; ctx.fillRect(p.x - w/2, blY - h, w, 2);
      if (i % 7 === Math.floor(ts * 8) % 7) drawGlow(ctx, p.x, blY - h, 20, p.color, 0.12);
    }
    ctx.globalAlpha = 1;
  } else if (ts < 46) {
    // SEGMENT 4: Agent Swarm (35-46s)
    const t = (ts - 35) / 11;
    mono(ctx, "THE AGENT SWARM", W/2, 55, 13, FAINT, 1);
    mono(ctx, "10,000 AGENTS · 8 FACTIONS · REAL REACTIONS", W/2, 82, 11, FAINT, 1);

    for (const d of swarm) {
      const ps = d.stress + 0.1 * Math.sin(ts * 5 + d.x * 0.01);
      const a = clamp(0.2 + ps * 0.6, 0, 1);
      const s = 2 + ps * 1.5;
      ctx.fillStyle = d.color; ctx.globalAlpha = a;
      ctx.fillRect(d.x, d.y, s, s);
      if (d.stress > 0.7) drawGlow(ctx, d.x, d.y, 6, d.color, 0.15);
    }
    ctx.globalAlpha = 1;

    const labels = ["LABOR", "EMPLOYERS", "MILITARY", "CLERGY", "YOUTH", "RURAL", "URBAN", "INFORMAL"];
    for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) {
      const bx = sStartX + c * (sBlock + sGap) + sBlock/2;
      const by = sStartY + r * (sBlock + sGap) - 12;
      mono(ctx, labels[r * 4 + c], bx, by, 9, CAT[r * 4 + c], 1);
    }
  } else if (ts < 54) {
    // SEGMENT 5: Hysteresis (46-54s)
    const t = (ts - 46) / 8;
    drawGlow(ctx, W/2, H/2, 400, CRIMSON, 0.015);
    mono(ctx, "HYSTERESIS — THE SCAR", W/2, 55, 13, FAINT, 1);
    mono(ctx, "RECOVERY DOESN'T ERASE THE SCAR", W/2, 82, 11, FAINT, 1);

    const cx = W/2, cy = H/2 + 30, pw = 800, ph = 250;
    ctx.strokeStyle = "rgba(255,255,255,0.06)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx - pw/2, cy + ph/2); ctx.lineTo(cx + pw/2, cy + ph/2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - pw/2, cy - ph/2); ctx.lineTo(cx - pw/2, cy + ph/2); ctx.stroke();

    const crisisX = cx - pw/2 + pw * 0.15, recX = cx - pw/2 + pw * 0.4;
    ctx.strokeStyle = "rgba(244,63,94,0.2)"; ctx.setLineDash([2, 6]);
    ctx.beginPath(); ctx.moveTo(crisisX, cy - ph/2); ctx.lineTo(crisisX, cy + ph/2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(recX, cy - ph/2); ctx.lineTo(recX, cy + ph/2); ctx.stroke();
    ctx.setLineDash([]);
    mono(ctx, "CRISIS", crisisX, cy - ph/2 - 15, 9, CRIMSON, 1);
    mono(ctx, "RECOVERY", recX, cy - ph/2 - 15, 9, SOFT, 1);

    const pts = [];
    for (let i = 0; i <= 100; i++) {
      const px = cx - pw/2 + (i/100) * pw, pr = i/100;
      let py;
      if (pr < 0.15) py = cy + ph/2 - ph * 0.2;
      else if (pr < 0.4) py = cy + ph/2 - ph * 0.2 - (pr - 0.15) / 0.25 * ph * 0.6;
      else py = cy + ph/2 - ph * 0.8 + (pr - 0.4) / 0.6 * ph * 0.6;
      pts.push({ x: px, y: py });
    }

    // Dashed reference
    ctx.strokeStyle = "rgba(139,144,154,0.25)"; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) { i === 0 ? ctx.moveTo(pts[i].x, pts[i].y) : ctx.lineTo(pts[i].x, pts[i].y); }
    ctx.stroke(); ctx.setLineDash([]);

    // Actual with scar
    const drawN = Math.floor(pts.length * clamp(t * 1.3, 0, 1));
    if (drawN > 40) {
      ctx.fillStyle = "rgba(245,158,11,0.06)";
      ctx.beginPath();
      for (let i = 40; i < drawN; i++) { i === 40 ? ctx.moveTo(pts[i].x, pts[i].y) : ctx.lineTo(pts[i].x, pts[i].y); }
      for (let i = drawN - 1; i >= 40; i--) ctx.lineTo(pts[i].x, pts[i].y + 50);
      ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = AMBER; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < drawN; i++) {
      const y = i > 40 ? pts[i].y + 50 : pts[i].y;
      i === 0 ? ctx.moveTo(pts[i].x, y) : ctx.lineTo(pts[i].x, y);
    }
    ctx.stroke();

    if (drawN > 60) mono(ctx, "THE SCAR · +5.0pp", cx + pw * 0.15, cy - ph * 0.05, 11, AMBER, 1);
    if (t > 0.5) mono(ctx, "the system remembers", cx, cy + ph/2 + 35, 11, SOFT, clamp((t - 0.5) * 2, 0, 1));
  } else {
    // SEGMENT 6: Emergence (54-60s)
    const t = (ts - 54) / 6;
    drawGlow(ctx, W/2, H/2, 600, AMBER, 0.035);
    mono(ctx, "EMERGENCE", W/2, 55, 13, FAINT, 1);

    for (const d of waves) {
      const off = Math.sin(d.x * 0.005 + ts * 4) * 20 + Math.sin(d.x * 0.01 + ts * 5.3) * 15 + Math.cos(d.y * 0.008 + ts * 3) * 10;
      const y = d.y + off;
      const amp = Math.abs(off) / 45;
      ctx.fillStyle = AMBER; ctx.globalAlpha = 0.2 + amp * 0.6;
      ctx.fillRect(d.x - 1, y - 1, 2 + amp * 1.5, 2 + amp * 1.5);
    }
    ctx.globalAlpha = 1;

    if (t > 0.3) {
      const a = clamp((t - 0.3) / 0.2, 0, 1);
      bigText(ctx, "La vie n'est pas simulée.", W/2, H/2 - 80, 26, INK, "300", a);
      bigText(ctx, "Elle émerge.", W/2, H/2 - 40, 26, AMBER, "400", a);
    }
    if (t > 0.6) {
      const a = clamp((t - 0.6) / 0.2, 0, 1);
      bigText(ctx, "PRISM", W/2, H/2 + 50, 44, INK, "700", a);
      mono(ctx, "github.com/Vitalcheffe/PRISM", W/2, H/2 + 95, 12, SOFT, a);
    }
  }

  // Grain overlay
  ctx.globalAlpha = 0.5;
  ctx.drawImage(grainCanvas, 0, 0);
  ctx.globalAlpha = 1;

  // Progress bar
  ctx.fillStyle = "rgba(245,158,11,0.12)";
  ctx.fillRect(0, H - 2, W * (frame / TOTAL), 2);

  const buf = canvas.toBuffer("image/png");
  fs.writeFileSync(`${DIR}/frame_${String(frame).padStart(5, "0")}.png`, buf);
}

// ── AUDIO ──
function genAudio() {
  const sr = 44100, ns = sr * DUR;
  const buf = new Float32Array(ns * 2);
  for (let i = 0; i < ns; i++) {
    const t = i / sr;
    let l = 0, r = 0;
    const env = clamp(t / 2, 0, 1) * clamp((DUR - t) / 3, 0, 1);
    l += Math.sin(2 * Math.PI * 55 * t) * 0.06 * env;
    r += Math.sin(2 * Math.PI * 55.3 * t) * 0.06 * env;
    l += Math.sin(2 * Math.PI * 110 * t) * 0.03 * env;
    r += Math.sin(2 * Math.PI * 110.5 * t) * 0.03 * env;

    if (t > 7.5 && t < 9) { const it = (t - 7.5) / 1.5, ie = Math.exp(-it * 3); l += Math.sin(2*Math.PI*80*t) * 0.12 * ie; r += Math.sin(2*Math.PI*80*t) * 0.12 * ie; l += (rnd()-0.5) * 0.08 * ie; r += (rnd()-0.5) * 0.08 * ie; }
    if (t > 8 && t < 20) { const se = Math.sin((t-8)/12*Math.PI); l += Math.sin(2*Math.PI*880*t+Math.sin(t*3)*2) * 0.01 * se; r += Math.sin(2*Math.PI*1320*t+Math.sin(t*4)*2) * 0.01 * se; }
    if (t > 19.5 && t < 21) { const it = (t-19.5)/1.5, ie = Math.exp(-it*3); l += Math.sin(2*Math.PI*60*t) * 0.1 * ie; r += Math.sin(2*Math.PI*60*t) * 0.1 * ie; }
    if (t > 35 && t < 46) { const se = Math.sin((t-35)/11*Math.PI); l += (rnd()-0.5) * 0.015 * se; r += (rnd()-0.5) * 0.015 * se; l += Math.sin(2*Math.PI*40*t) * 0.025 * se; r += Math.sin(2*Math.PI*40.5*t) * 0.025 * se; }
    if (t > 46 && t < 54) { const se = Math.sin((t-46)/8*Math.PI); l += Math.sin(2*Math.PI*220*t) * 0.035 * se; r += Math.sin(2*Math.PI*220.5*t) * 0.035 * se; l += Math.sin(2*Math.PI*330*t) * 0.015 * se; r += Math.sin(2*Math.PI*330.3*t) * 0.015 * se; }
    if (t > 54 && t < 60) { const re = clamp((t-54)/2,0,1) * clamp((60-t)/1.5,0,1); l += Math.sin(2*Math.PI*440*t) * 0.025 * re; r += Math.sin(2*Math.PI*440.5*t) * 0.025 * re; l += Math.sin(2*Math.PI*660*t) * 0.012 * re; r += Math.sin(2*Math.PI*660.3*t) * 0.012 * re; }

    l = clamp(l, -0.8, 0.8); r = clamp(r, -0.8, 0.8);
    buf[i*2] = l; buf[i*2+1] = r;
  }
  const wb = new ArrayBuffer(44 + ns * 4);
  const v = new DataView(wb);
  const ws = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o+i, s.charCodeAt(i)); };
  ws(0, "RIFF"); v.setUint32(4, 36+ns*4, true); ws(8, "WAVE"); ws(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true); v.setUint32(24, sr, true); v.setUint32(28, sr*4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true); ws(36, "data"); v.setUint32(40, ns*4, true);
  for (let i = 0; i < ns*2; i++) v.setInt16(44+i*2, clamp(buf[i],-1,1) * 0x7fff, true);
  fs.writeFileSync(AUDIO, new Uint8Array(wb));
  console.log("Audio generated");
}

// ── MAIN ──
genAudio();
const t0 = Date.now();
for (let f = 0; f < TOTAL; f++) {
  render(f);
  if (f % 600 === 0) console.log(`frame ${f}/${TOTAL} · ${((Date.now()-t0)/1000).toFixed(0)}s`);
}
console.log(`Rendered ${TOTAL} frames in ${((Date.now()-t0)/1000).toFixed(0)}s`);
console.log("Stitching with ffmpeg...");
execSync(`ffmpeg -y -framerate ${FPS} -i ${DIR}/frame_%05d.png -i ${AUDIO} -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -c:a aac -b:a 192k -shortest ${OUT}`, { stdio: "inherit" });
execSync(`rm -f ${DIR}/frame_*.png`);
const st = fs.statSync(OUT);
console.log(`\n✓ ${OUT} · ${(st.size/1024/1024).toFixed(1)} MB`);
