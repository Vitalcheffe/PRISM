// render-video.ts — PRISM Launch Film
// Autonomous frame-by-frame renderer using node-canvas + ffmpeg.
// 90 seconds · 60fps · 1920×1080 · with synced audio.
//
// PIPELINE:
//   1. Render 5400 frames as PNGs using node-canvas (deterministic time)
//   2. Generate synced audio WAV (bass swells + ambient + impact)
//   3. Stitch with ffmpeg into MP4 (H.264, high bitrate)

import { createCanvas } from "canvas";
import * as fs from "fs";
import { execSync } from "child_process";

const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 60;
const DURATION_SEC = 90;
const TOTAL_FRAMES = FPS * DURATION_SEC; // 5400

const FRAMES_DIR = "/home/z/my-project/video/frames";
const AUDIO_PATH = "/home/z/my-project/video/audio/prism.wav";
const OUTPUT_PATH = "/home/z/my-project/video/PRISM_launch_film.mp4";

// ── COLORS (PRISM identity) ──
const BG = "#0d1117";
const INK = "#f0f6fc";
const SOFT = "#8b949e";
const FAINT = "#3d444d";
const AMBER = "#f59e0b";
const CRIMSON = "#f43f5e";
const EMERALD = "#10b981";
const VIOLET = "#a855f7";
const CYAN = "#06b6d4";
const YELLOW = "#eab308";
const ORANGE = "#f97316";
const LIME = "#84cc16";

const CAT_COLORS = [AMBER, CRIMSON, EMERALD, ORANGE, VIOLET, LIME, YELLOW, CYAN];

// ── UTILITIES ──
function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }
function clamp(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v)); }
function easeOutCubic(t: number): number { return 1 - Math.pow(1 - t, 3); }
function easeInOutCubic(t: number): number { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
function easeOutQuint(t: number): number { return 1 - Math.pow(1 - t, 5); }
function easeOutBack(t: number): number { const c1 = 1.70158; const c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }

// Seeded RNG
let seed = 1337;
function rnd(): number { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }

// ── FILM GRAIN (procedural noise overlay) ──
let grainPattern: ImageData | null = null;
function generateGrain(ctx: any, w: number, h: number): ImageData {
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.floor(rnd() * 255);
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 8; // ~3% opacity
  }
  return img;
}

// ── DOT GRID BACKGROUND ──
function drawDotGrid(ctx: any, t: number) {
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  
  const spacing = 40;
  const alpha = 0.04;
  ctx.fillStyle = `rgba(245, 158, 11, ${alpha})`;
  for (let x = 0; x < WIDTH; x += spacing) {
    for (let y = 0; y < HEIGHT; y += spacing) {
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

// ── RADIAL GLOW ──
function drawGlow(ctx: any, cx: number, cy: number, r: number, color: string, alpha: number) {
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  grad.addColorStop(0, color);
  grad.addColorStop(1, "transparent");
  ctx.globalAlpha = alpha;
  ctx.fillStyle = grad;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.globalAlpha = 1;
}

// ── TEXT RENDERING ──
function drawText(ctx: any, text: string, x: number, y: number, opts: {
  size?: number; color?: string; weight?: string; font?: string;
  align?: string; alpha?: number; letterSpacing?: number;
} = {}) {
  const size = opts.size ?? 16;
  const color = opts.color ?? INK;
  const weight = opts.weight ?? "400";
  const font = opts.font ?? "SF Pro Display, -apple-system, sans-serif";
  const align = opts.align ?? "center";
  const alpha = opts.alpha ?? 1;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.textAlign = align as CanvasTextAlign;
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y);
  ctx.globalAlpha = 1;
}

function drawMono(ctx: any, text: string, x: number, y: number, opts: {
  size?: number; color?: string; weight?: string; alpha?: number; spacing?: number;
} = {}) {
  const size = opts.size ?? 11;
  const color = opts.color ?? SOFT;
  const weight = opts.weight ?? "400";
  const alpha = opts.alpha ?? 1;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px "SF Mono", monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y);
  ctx.globalAlpha = 1;
}

// ═══════════════════════════════════════════════════════════════
// SEGMENT RENDERERS
// ═══════════════════════════════════════════════════════════════

// SEGMENT 1 (0-12s): The Hook — darkness, single pulse, title
function renderSegment1(ctx: any, t: number) {
  // t: 0 → 1
  drawDotGrid(ctx, t);
  
  if (t < 0.15) {
    // Pure darkness fading in
    const fade = t / 0.15;
    drawGlow(ctx, WIDTH / 2, HEIGHT / 2, 200, AMBER, 0.02 * fade);
  } else if (t < 0.5) {
    // Single pulsing dot
    const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 6);
    const r = 8 + pulse * 6;
    drawGlow(ctx, WIDTH / 2, HEIGHT / 2, 300, AMBER, 0.08 + pulse * 0.04);
    ctx.fillStyle = AMBER;
    ctx.beginPath();
    ctx.arc(WIDTH / 2, HEIGHT / 2, r, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Dot expands into ring, text appears
    const expand = easeOutCubic((t - 0.5) / 0.5);
    const ringR = 8 + expand * 120;
    
    drawGlow(ctx, WIDTH / 2, HEIGHT / 2, 400, AMBER, 0.06);
    
    // Ring
    ctx.strokeStyle = AMBER;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.5 * (1 - expand);
    ctx.beginPath();
    ctx.arc(WIDTH / 2, HEIGHT / 2, ringR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    
    // Center dot
    ctx.fillStyle = AMBER;
    ctx.beginPath();
    ctx.arc(WIDTH / 2, HEIGHT / 2, 6, 0, Math.PI * 2);
    ctx.fill();
    
    // Title text
    if (t > 0.6) {
      const titleAlpha = clamp((t - 0.6) / 0.2, 0, 1);
      drawText(ctx, "PRISM", WIDTH / 2, HEIGHT / 2 - 80, {
        size: 96, color: INK, weight: "700", alpha: titleAlpha,
      });
    }
    if (t > 0.75) {
      const subAlpha = clamp((t - 0.75) / 0.15, 0, 1);
      drawMono(ctx, "NON-LINEAR MACROECONOMIC SIMULATOR", WIDTH / 2, HEIGHT / 2 + 50, {
        size: 12, color: SOFT, alpha: subAlpha,
      });
    }
  }
}

// SEGMENT 2 (12-28s): The Neural Network — 47→32→32→15
const nnNodes: { x: number; y: number; layer: number; idx: number; color: string; }[] = [];
function initNN() {
  nnNodes.length = 0;
  const layers = [47, 32, 32, 15];
  const layerX = [WIDTH * 0.2, WIDTH * 0.4, WIDTH * 0.6, WIDTH * 0.8];
  
  for (let l = 0; l < layers.length; l++) {
    const count = layers[l];
    const spacing = (HEIGHT * 0.7) / (count + 1);
    const startY = HEIGHT * 0.15 + spacing;
    for (let i = 0; i < count; i++) {
      const color = l === 0 ? CAT_COLORS[i % 8] : l === 3 ? CAT_COLORS[i % 8] : AMBER;
      nnNodes.push({
        x: layerX[l],
        y: startY + i * spacing,
        layer: l,
        idx: i,
        color,
      });
    }
  }
}

function renderSegment2(ctx: any, t: number) {
  drawDotGrid(ctx, t);
  drawGlow(ctx, WIDTH / 2, HEIGHT / 2, 500, AMBER, 0.03);
  
  // Title
  drawMono(ctx, "THE NEURAL NETWORK", WIDTH / 2, 60, { size: 13, color: FAINT });
  drawMono(ctx, "47 → 32 → 32 → 15 · 3,008 WEIGHTS", WIDTH / 2, 90, { size: 11, color: FAINT });
  
  // Draw connections (faded)
  const connAlpha = 0.015;
  ctx.strokeStyle = AMBER;
  ctx.lineWidth = 0.5;
  
  // Layer 0 → 1
  for (let i = 0; i < 47; i++) {
    for (let j = 0; j < 32; j++) {
      const n1 = nnNodes[i];
      const n2 = nnNodes[47 + j];
      ctx.globalAlpha = connAlpha;
      ctx.beginPath();
      ctx.moveTo(n1.x, n1.y);
      ctx.lineTo(n2.x, n2.y);
      ctx.stroke();
    }
  }
  // Layer 1 → 2
  for (let i = 0; i < 32; i++) {
    for (let j = 0; j < 32; j++) {
      const n1 = nnNodes[47 + i];
      const n2 = nnNodes[79 + j];
      ctx.globalAlpha = connAlpha;
      ctx.beginPath();
      ctx.moveTo(n1.x, n1.y);
      ctx.lineTo(n2.x, n2.y);
      ctx.stroke();
    }
  }
  // Layer 2 → 3
  for (let i = 0; i < 32; i++) {
    for (let j = 0; j < 15; j++) {
      const n1 = nnNodes[79 + i];
      const n2 = nnNodes[111 + j];
      ctx.globalAlpha = connAlpha;
      ctx.beginPath();
      ctx.moveTo(n1.x, n1.y);
      ctx.lineTo(n2.x, n2.y);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  
  // Active signal paths (bright)
  const signalT = (t * 3) % 1;
  const numActive = 5;
  for (let a = 0; a < numActive; a++) {
    const startIdx = Math.floor((signalT * 47 + a * 9) % 47);
    const midIdx = Math.floor((signalT * 32 + a * 7) % 32);
    const outIdx = Math.floor((signalT * 15 + a * 3) % 15);
    
    const n1 = nnNodes[startIdx];
    const n2 = nnNodes[47 + midIdx];
    const n3 = nnNodes[79 + midIdx];
    const n4 = nnNodes[111 + outIdx];
    
    ctx.strokeStyle = AMBER;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(n1.x, n1.y);
    ctx.lineTo(n2.x, n2.y);
    ctx.lineTo(n3.x, n3.y);
    ctx.lineTo(n4.x, n4.y);
    ctx.stroke();
    
    // Glow on output node
    drawGlow(ctx, n4.x, n4.y, 20, n4.color, 0.3);
  }
  ctx.globalAlpha = 1;
  
  // Draw nodes
  for (const n of nnNodes) {
    const r = n.layer === 0 ? 3 : n.layer === 3 ? 5 : 4;
    const pulseT = (t * 2 + n.idx * 0.1) % 1;
    const pulse = 0.5 + 0.5 * Math.sin(pulseT * Math.PI * 2);
    
    ctx.fillStyle = n.color;
    ctx.globalAlpha = 0.4 + pulse * 0.4;
    ctx.beginPath();
    ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  
  // Layer labels
  const labels = ["INPUT (47)", "HIDDEN-1 (32)", "HIDDEN-2 (32)", "OUTPUT (15)"];
  const xPos = [WIDTH * 0.2, WIDTH * 0.4, WIDTH * 0.6, WIDTH * 0.8];
  for (let i = 0; i < 4; i++) {
    drawMono(ctx, labels[i], xPos[i], HEIGHT - 50, { size: 9, color: FAINT });
  }
}

// SEGMENT 3 (28-48s): The Reactor — 47 prisms rising
const prismData: { x: number; h: number; targetH: number; color: string; cat: number; }[] = [];
function initPrisms() {
  prismData.length = 0;
  const cats = 8;
  const perCat = [6, 5, 6, 5, 6, 4, 6, 5]; // sums to 43, adjust
  // Actually let's just do 47 evenly distributed
  const total = 47;
  const spacing = (WIDTH * 0.8) / (total + 1);
  const startX = WIDTH * 0.1;
  for (let i = 0; i < total; i++) {
    const cat = i % 8;
    prismData.push({
      x: startX + (i + 1) * spacing,
      h: 0,
      targetH: 30 + rnd() * 180,
      color: CAT_COLORS[cat],
      cat,
    });
  }
}

function renderSegment3(ctx: any, t: number) {
  drawDotGrid(ctx, t);
  drawGlow(ctx, WIDTH / 2, HEIGHT / 2, 500, AMBER, 0.03);
  
  drawMono(ctx, "THE REACTOR", WIDTH / 2, 60, { size: 13, color: FAINT });
  drawMono(ctx, "47 POLICY LEVERS · LIVE PERTURBATION", WIDTH / 2, 90, { size: 11, color: FAINT });
  
  const baselineY = HEIGHT * 0.8;
  
  // Baseline
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(WIDTH * 0.08, baselineY);
  ctx.lineTo(WIDTH * 0.92, baselineY);
  ctx.stroke();
  
  // Grid lines
  for (const yOff of [50, 100, 150, 200]) {
    ctx.strokeStyle = "rgba(255,255,255,0.02)";
    ctx.setLineDash([2, 6]);
    ctx.beginPath();
    ctx.moveTo(WIDTH * 0.08, baselineY - yOff);
    ctx.lineTo(WIDTH * 0.92, baselineY - yOff);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  
  // Draw prisms
  for (let i = 0; i < prismData.length; i++) {
    const p = prismData[i];
    // Animate height
    const appearT = clamp(t * 3 - i * 0.02, 0, 1);
    p.h = lerp(0, p.targetH, easeOutBack(appearT));
    
    // Perturbation wave
    const wave = Math.sin(t * Math.PI * 4 + i * 0.5) * 15;
    const h = p.h + wave;
    
    // Prism (rect)
    const w = 14;
    ctx.fillStyle = p.color;
    ctx.globalAlpha = 0.5;
    ctx.fillRect(p.x - w / 2, baselineY - h, w, h);
    
    // Top edge (bright)
    ctx.globalAlpha = 1;
    ctx.fillRect(p.x - w / 2, baselineY - h, w, 2);
    
    // Glow on active prisms
    if (i % 7 === Math.floor(t * 8) % 7) {
      drawGlow(ctx, p.x, baselineY - h, 25, p.color, 0.15);
    }
  }
  ctx.globalAlpha = 1;
  
  // Causal edges (subtle curves)
  const numEdges = 6;
  for (let e = 0; e < numEdges; e++) {
    const i1 = Math.floor(rnd() * 47) % prismData.length;
    const i2 = (i1 + 5 + Math.floor(rnd() * 10)) % prismData.length;
    const p1 = prismData[i1];
    const p2 = prismData[i2];
    
    ctx.strokeStyle = AMBER;
    ctx.lineWidth = 0.5;
    ctx.globalAlpha = 0.06;
    ctx.beginPath();
    ctx.moveTo(p1.x, baselineY - p1.h);
    ctx.quadraticCurveTo(
      (p1.x + p2.x) / 2,
      baselineY - Math.max(p1.h, p2.h) - 60,
      p2.x, baselineY - p2.h
    );
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// SEGMENT 4 (48-65s): The Agent Swarm — 10,000 agents
const swarmDots: { x: number; y: number; vx: number; vy: number; color: string; stress: number; }[] = [];
function initSwarm() {
  swarmDots.length = 0;
  const numDots = 800; // visual representation of 10,000
  const blockSize = 200;
  const gap = 40;
  const cols = 4;
  const rows = 2;
  const startX = (WIDTH - (cols * blockSize + (cols - 1) * gap)) / 2;
  const startY = HEIGHT * 0.2;
  
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const bx = startX + c * (blockSize + gap);
      const by = startY + r * (blockSize + gap);
      const cat = r * cols + c;
      const hot = cat === 4 || cat === 5; // youth + rural stressed
      
      for (let i = 0; i < numDots / (cols * rows); i++) {
        const px = bx + rnd() * blockSize;
        const py = by + rnd() * blockSize;
        let stress = 0;
        if (hot) {
          const dx = (px - bx) / blockSize;
          const dy = (py - by) / blockSize;
          if (dx > 0.5 && dx < 0.85 && dy > 0.2 && dy < 0.5) {
            stress = rnd() < 0.7 ? 0.8 + rnd() * 0.2 : 0.3;
          } else {
            stress = rnd() < 0.05 ? 0.7 : rnd() * 0.3;
          }
        } else {
          stress = rnd() * 0.3;
        }
        swarmDots.push({
          x: px, y: py,
          vx: (rnd() - 0.5) * 0.5,
          vy: (rnd() - 0.5) * 0.5,
          color: CAT_COLORS[cat],
          stress,
        });
      }
    }
  }
}

function renderSegment4(ctx: any, t: number) {
  drawDotGrid(ctx, t);
  
  drawMono(ctx, "THE AGENT SWARM", WIDTH / 2, 60, { size: 13, color: FAINT });
  drawMono(ctx, "10,000 AGENTS · 8 FACTIONS · REAL REACTIONS", WIDTH / 2, 90, { size: 11, color: FAINT });
  
  // Draw dots
  for (const d of swarmDots) {
    // Update position
    d.x += d.vx;
    d.y += d.vy;
    // Keep in bounds (simple)
    const bx = Math.floor(d.x / 240) * 240;
    const by = Math.floor(d.y / 240) * 240;
    
    // Pulsing stress
    const pulseStress = d.stress + 0.1 * Math.sin(t * 6 + d.x * 0.01);
    const alpha = clamp(0.2 + pulseStress * 0.6, 0, 1);
    const size = 2 + pulseStress * 1.5;
    
    ctx.fillStyle = d.color;
    ctx.globalAlpha = alpha;
    ctx.fillRect(d.x, d.y, size, size);
    
    if (d.stress > 0.7) {
      drawGlow(ctx, d.x, d.y, 8, d.color, 0.2);
    }
  }
  ctx.globalAlpha = 1;
  
  // Faction labels
  const labels = ["LABOR", "EMPLOYERS", "MILITARY", "CLERGY", "YOUTH", "RURAL", "URBAN", "INFORMAL"];
  const blockSize = 200;
  const gap = 40;
  const cols = 4;
  const startX = (WIDTH - (cols * blockSize + (cols - 1) * gap)) / 2;
  const startY = HEIGHT * 0.2;
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < cols; c++) {
      const bx = startX + c * (blockSize + gap) + blockSize / 2;
      const by = startY + r * (blockSize + gap) - 15;
      drawMono(ctx, labels[r * cols + c], bx, by, {
        size: 9, color: CAT_COLORS[r * cols + c],
      });
    }
  }
}

// SEGMENT 5 (65-80s): The Scar (Hysteresis)
function renderSegment5(ctx: any, t: number) {
  drawDotGrid(ctx, t);
  drawGlow(ctx, WIDTH / 2, HEIGHT / 2, 400, CRIMSON, 0.02);
  
  drawMono(ctx, "HYSTERESIS — THE SCAR", WIDTH / 2, 60, { size: 13, color: FAINT });
  drawMono(ctx, "RECOVERY DOESN'T ERASE THE SCAR", WIDTH / 2, 90, { size: 11, color: FAINT });
  
  const cx = WIDTH / 2;
  const cy = HEIGHT / 2 + 40;
  const w = 800;
  const h = 250;
  
  // Axes
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - w / 2, cy + h / 2);
  ctx.lineTo(cx + w / 2, cy + h / 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - w / 2, cy - h / 2);
  ctx.lineTo(cx - w / 2, cy + h / 2);
  ctx.stroke();
  
  // Crisis markers
  const crisisX = cx - w / 2 + w * 0.15;
  const recoveryX = cx - w / 2 + w * 0.4;
  ctx.strokeStyle = "rgba(244,63,94,0.3)";
  ctx.setLineDash([2, 6]);
  ctx.beginPath();
  ctx.moveTo(crisisX, cy - h / 2);
  ctx.lineTo(crisisX, cy + h / 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(recoveryX, cy - h / 2);
  ctx.lineTo(recoveryX, cy + h / 2);
  ctx.stroke();
  ctx.setLineDash([]);
  
  drawMono(ctx, "CRISIS", crisisX, cy - h / 2 - 15, { size: 9, color: CRIMSON });
  drawMono(ctx, "RECOVERY", recoveryX, cy - h / 2 - 15, { size: 9, color: SOFT });
  
  // Dashed reference (no hysteresis — full recovery)
  const refPoints: { x: number; y: number }[] = [];
  for (let i = 0; i <= 100; i++) {
    const px = cx - w / 2 + (i / 100) * w;
    const progress = i / 100;
    let py: number;
    if (progress < 0.15) py = cy + h / 2 - h * 0.2;
    else if (progress < 0.4) py = cy + h / 2 - h * 0.2 - (progress - 0.15) / 0.25 * h * 0.6;
    else py = cy + h / 2 - h * 0.8 + (progress - 0.4) / 0.6 * h * 0.6;
    refPoints.push({ x: px, y: py });
  }
  ctx.strokeStyle = "rgba(139,144,154,0.3)";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  for (let i = 0; i < refPoints.length; i++) {
    if (i === 0) ctx.moveTo(refPoints[i].x, refPoints[i].y);
    else ctx.lineTo(refPoints[i].x, refPoints[i].y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  
  // Solid amber (actual with scar)
  const animT = clamp(t * 1.5, 0, 1);
  const drawPoints = Math.floor(refPoints.length * animT);
  
  // Scar fill region
  if (drawPoints > 40) {
    ctx.fillStyle = "rgba(245,158,11,0.08)";
    ctx.beginPath();
    for (let i = 40; i < drawPoints; i++) {
      const ref = refPoints[i];
      const actual = { x: ref.x, y: ref.y + 50 }; // scar offset
      if (i === 40) ctx.moveTo(ref.x, ref.y);
      ctx.lineTo(ref.x, ref.y);
    }
    for (let i = drawPoints - 1; i >= 40; i--) {
      const ref = refPoints[i];
      ctx.lineTo(ref.x, ref.y + 50);
    }
    ctx.closePath();
    ctx.fill();
  }
  
  // Actual trajectory (with scar)
  ctx.strokeStyle = AMBER;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < drawPoints; i++) {
    const ref = refPoints[i];
    const actual = i > 40 ? ref.y + 50 : ref.y; // scar after recovery
    if (i === 0) ctx.moveTo(ref.x, actual);
    else ctx.lineTo(ref.x, actual);
  }
  ctx.stroke();
  
  // Scar label
  if (drawPoints > 60) {
    drawMono(ctx, "THE SCAR · +5.0pp", cx + w * 0.2, cy - h * 0.1, {
      size: 11, color: AMBER,
    });
  }
  
  // Annotation
  if (t > 0.5) {
    drawMono(ctx, "the system remembers", cx, cy + h / 2 + 40, {
      size: 11, color: SOFT, alpha: clamp((t - 0.5) * 2, 0, 1),
    });
  }
}

// SEGMENT 6 (80-90s): The Emergence — wave field + closing
const waveDots: { x: number; y: number; baseY: number; }[] = [];
function initWave() {
  waveDots.length = 0;
  const cols = 60;
  const rows = 25;
  const spacing = 28;
  const startX = (WIDTH - cols * spacing) / 2;
  const startY = (HEIGHT - rows * spacing) / 2;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = startX + c * spacing;
      const y = startY + r * spacing;
      waveDots.push({ x, y, baseY: y });
    }
  }
}

function renderSegment6(ctx: any, t: number) {
  drawDotGrid(ctx, t);
  drawGlow(ctx, WIDTH / 2, HEIGHT / 2, 600, AMBER, 0.04);
  
  drawMono(ctx, "EMERGENCE", WIDTH / 2, 60, { size: 13, color: FAINT });
  drawMono(ctx, "SIMPLE RULES → COMPLEX BEHAVIOR", WIDTH / 2, 90, { size: 11, color: FAINT });
  
  // Wave field
  for (const d of waveDots) {
    const wave1 = Math.sin(d.x * 0.005 + t * 4) * 20;
    const wave2 = Math.sin(d.x * 0.01 + t * 5.3) * 15;
    const wave3 = Math.cos(d.y * 0.008 + t * 3) * 10;
    const offset = wave1 + wave2 + wave3;
    const y = d.baseY + offset;
    
    const amplitude = Math.abs(offset) / 45;
    const alpha = 0.2 + amplitude * 0.6;
    const size = 2 + amplitude * 1.5;
    
    const isCrisis = (d.x + d.y + t * 1000) % 137 < 1;
    const color = isCrisis ? CRIMSON : AMBER;
    
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha;
    ctx.fillRect(d.x - size / 2, y - size / 2, size, size);
  }
  ctx.globalAlpha = 1;
  
  // Emergent labels
  if (t > 0.2) {
    drawMono(ctx, "business cycle", WIDTH * 0.3, HEIGHT * 0.3, {
      size: 11, color: SOFT, alpha: 0.5, italic: true,
    });
  }
  if (t > 0.4) {
    drawMono(ctx, "political wave", WIDTH * 0.7, HEIGHT * 0.6, {
      size: 11, color: SOFT, alpha: 0.5, italic: true,
    });
  }
  if (t > 0.6) {
    drawMono(ctx, "cultural shift", WIDTH * 0.5, HEIGHT * 0.4, {
      size: 11, color: SOFT, alpha: 0.5, italic: true,
    });
  }
  
  // Closing text
  if (t > 0.7) {
    const fadeAlpha = clamp((t - 0.7) / 0.15, 0, 1);
    drawText(ctx, "La vie n'est pas simulée.", WIDTH / 2, HEIGHT / 2 - 100, {
      size: 28, color: INK, weight: "300", alpha: fadeAlpha,
    });
    drawText(ctx, "Elle émerge.", WIDTH / 2, HEIGHT / 2 - 60, {
      size: 28, color: AMBER, weight: "400", alpha: fadeAlpha,
    });
  }
  
  // Final frame
  if (t > 0.85) {
    const finalAlpha = clamp((t - 0.85) / 0.1, 0, 1);
    drawText(ctx, "PRISM", WIDTH / 2, HEIGHT / 2 + 60, {
      size: 48, color: INK, weight: "700", alpha: finalAlpha,
    });
    drawMono(ctx, "github.com/Vitalcheffe/PRISM", WIDTH / 2, HEIGHT / 2 + 110, {
      size: 12, color: SOFT, alpha: finalAlpha,
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// MAIN RENDER LOOP
// ═══════════════════════════════════════════════════════════════

function renderFrame(frame: number): void {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");
  const timeSec = frame / FPS;
  const t = timeSec / DURATION_SEC; // 0 → 1 over the whole video
  
  // Determine which segment
  // Segments: 1 (0-12s), 2 (12-28s), 3 (28-48s), 4 (48-65s), 5 (65-80s), 6 (80-90s)
  
  if (timeSec < 12) {
    renderSegment1(ctx, timeSec / 12);
  } else if (timeSec < 28) {
    renderSegment2(ctx, (timeSec - 12) / 16);
  } else if (timeSec < 48) {
    renderSegment3(ctx, (timeSec - 28) / 20);
  } else if (timeSec < 65) {
    renderSegment4(ctx, (timeSec - 48) / 17);
  } else if (timeSec < 80) {
    renderSegment5(ctx, (timeSec - 65) / 15);
  } else {
    renderSegment6(ctx, (timeSec - 80) / 10);
  }
  
  // Film grain overlay
  if (frame % 3 === 0) {
    grainPattern = generateGrain(ctx, WIDTH, HEIGHT);
  }
  if (grainPattern) {
    ctx.putImageData(grainPattern, 0, 0);
  }
  
  // Progress bar (bottom, subtle)
  const progress = frame / TOTAL_FRAMES;
  ctx.fillStyle = "rgba(245,158,11,0.15)";
  ctx.fillRect(0, HEIGHT - 2, WIDTH * progress, 2);
  
  // Save frame
  const buf = canvas.toBuffer("image/png");
  const frameNum = String(frame).padStart(5, "0");
  fs.writeFileSync(`${FRAMES_DIR}/frame_${frameNum}.png`, buf);
}

// ── AUDIO GENERATION ──
function generateAudio(): void {
  // Generate a WAV file with synced audio:
  // - Low bass drone (entire video)
  // - Impact sounds at segment transitions
  // - High-frequency shimmer during neural network segment
  
  const sampleRate = 44100;
  const numSamples = sampleRate * DURATION_SEC;
  const audioBuffer = new Float32Array(numSamples * 2); // stereo
  
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let left = 0;
    let right = 0;
    
    // Bass drone (entire video, 55Hz + 110Hz)
    const bassEnv = clamp(t / 2, 0, 1) * clamp((DURATION_SEC - t) / 3, 0, 1);
    left += Math.sin(2 * Math.PI * 55 * t) * 0.08 * bassEnv;
    right += Math.sin(2 * Math.PI * 55.3 * t) * 0.08 * bassEnv;
    left += Math.sin(2 * Math.PI * 110 * t) * 0.04 * bassEnv;
    right += Math.sin(2 * Math.PI * 110.5 * t) * 0.04 * bassEnv;
    
    // Impact at 12s (segment 2 start — neural network)
    if (t > 11.5 && t < 13) {
      const impactT = (t - 11.5) / 1.5;
      const impactEnv = Math.exp(-impactT * 3);
      left += Math.sin(2 * Math.PI * 80 * t) * 0.15 * impactEnv;
      right += Math.sin(2 * Math.PI * 80 * t) * 0.15 * impactEnv;
      // Noise burst
      left += (rnd() - 0.5) * 0.1 * impactEnv;
      right += (rnd() - 0.5) * 0.1 * impactEnv;
    }
    
    // Shimmer during neural network (12-28s)
    if (t > 12 && t < 28) {
      const shimmerEnv = Math.sin((t - 12) / 16 * Math.PI);
      left += Math.sin(2 * Math.PI * 880 * t + Math.sin(t * 3) * 2) * 0.015 * shimmerEnv;
      right += Math.sin(2 * Math.PI * 1320 * t + Math.sin(t * 4) * 2) * 0.015 * shimmerEnv;
    }
    
    // Impact at 28s (reactor)
    if (t > 27.5 && t < 29) {
      const impactT = (t - 27.5) / 1.5;
      const impactEnv = Math.exp(-impactT * 3);
      left += Math.sin(2 * Math.PI * 60 * t) * 0.12 * impactEnv;
      right += Math.sin(2 * Math.PI * 60 * t) * 0.12 * impactEnv;
    }
    
    // Swarm texture (48-65s) — filtered noise
    if (t > 48 && t < 65) {
      const swarmEnv = Math.sin((t - 48) / 17 * Math.PI);
      const noise = (rnd() - 0.5) * 0.02 * swarmEnv;
      left += noise;
      right += noise;
      // Low rumble
      left += Math.sin(2 * Math.PI * 40 * t) * 0.03 * swarmEnv;
      right += Math.sin(2 * Math.PI * 40.5 * t) * 0.03 * swarmEnv;
    }
    
    // Emotional swell at hysteresis (65-80s)
    if (t > 65 && t < 80) {
      const swellEnv = Math.sin((t - 65) / 15 * Math.PI);
      left += Math.sin(2 * Math.PI * 220 * t) * 0.04 * swellEnv;
      right += Math.sin(2 * Math.PI * 220.5 * t) * 0.04 * swellEnv;
      left += Math.sin(2 * Math.PI * 330 * t) * 0.02 * swellEnv;
      right += Math.sin(2 * Math.PI * 330.3 * t) * 0.02 * swellEnv;
    }
    
    // Final resolution (80-90s)
    if (t > 80 && t < 90) {
      const resolveEnv = clamp((t - 80) / 3, 0, 1) * clamp((90 - t) / 2, 0, 1);
      left += Math.sin(2 * Math.PI * 440 * t) * 0.03 * resolveEnv;
      right += Math.sin(2 * Math.PI * 440.5 * t) * 0.03 * resolveEnv;
      left += Math.sin(2 * Math.PI * 660 * t) * 0.015 * resolveEnv;
      right += Math.sin(2 * Math.PI * 660.3 * t) * 0.015 * resolveEnv;
    }
    
    // Soft limiter
    left = clamp(left, -0.8, 0.8);
    right = clamp(right, -0.8, 0.8);
    
    audioBuffer[i * 2] = left;
    audioBuffer[i * 2 + 1] = right;
  }
  
  // Write WAV file
  const wavBuffer = new ArrayBuffer(44 + numSamples * 2 * 2);
  const view = new DataView(wavBuffer);
  
  // WAV header
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  
  writeString(0, "RIFF");
  view.setUint32(4, 36 + numSamples * 2 * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 2, true); // stereo
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2 * 2, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, numSamples * 2 * 2, true);
  
  // Write samples
  for (let i = 0; i < numSamples * 2; i++) {
    const s = Math.max(-1, Math.min(1, audioBuffer[i]));
    view.setInt16(44 + i * 2, s * 0x7fff, true);
  }
  
  fs.writeFileSync(AUDIO_PATH, new Uint8Array(wavBuffer));
  console.log(`Audio written: ${AUDIO_PATH}`);
}

// ── MAIN ──
async function main() {
  console.log("=== PRISM Launch Film Renderer ===");
  console.log(`Duration: ${DURATION_SEC}s · FPS: ${FPS} · Resolution: ${WIDTH}×${HEIGHT}`);
  console.log(`Total frames: ${TOTAL_FRAMES}`);
  
  // Initialize
  initNN();
  initPrisms();
  initSwarm();
  initWave();
  
  // Generate audio
  console.log("Generating audio...");
  generateAudio();
  
  // Render frames
  console.log("Rendering frames...");
  const startTime = Date.now();
  
  for (let frame = 0; frame < TOTAL_FRAMES; frame++) {
    renderFrame(frame);
    
    if (frame % 300 === 0) {
      const elapsed = (Date.now() - startTime) / 1000;
      const eta = (elapsed / (frame + 1)) * (TOTAL_FRAMES - frame - 1);
      console.log(`  frame ${frame}/${TOTAL_FRAMES} · ${elapsed.toFixed(0)}s elapsed · ETA ${eta.toFixed(0)}s`);
    }
  }
  
  const renderTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`Frames rendered in ${renderTime}s`);
  
  // Stitch with ffmpeg
  console.log("Stitching with ffmpeg...");
  const ffmpegCmd = `ffmpeg -y -framerate ${FPS} -i ${FRAMES_DIR}/frame_%05d.png -i ${AUDIO_PATH} -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -c:a aac -b:a 192k -shortest ${OUTPUT_PATH}`;
  execSync(ffmpegCmd, { stdio: "inherit" });
  
  console.log(`\n✓ Video complete: ${OUTPUT_PATH}`);
  
  // Cleanup frames
  console.log("Cleaning up frame files...");
  execSync(`rm -rf ${FRAMES_DIR}/frame_*.png`);
  
  // Verify
  const stat = fs.statSync(OUTPUT_PATH);
  console.log(`File size: ${(stat.size / 1024 / 1024).toFixed(1)} MB`);
}

main().catch(console.error);
