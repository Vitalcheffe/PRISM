// PRISM Launch Film — 75s @ 60fps = 4500 frames, 1920x1080, with audio
import { createCanvas } from "canvas";
import * as fs from "fs";
import { execSync } from "child_process";

const W = 1920, H = 1080, FPS = 60, DUR = 75, TOTAL = FPS * DUR;
const FDIR = "/home/z/my-project/video/frames";
const AUDIO = "/home/z/my-project/video/audio/prism.wav";
const OUT = "/home/z/my-project/video/PRISM_launch_film.mp4";

const BG = "#09090b", INK = "#f0f6fc", SOFT = "#8b949e", FAINT = "#3d444d", AMBER = "#f59e0b";
const CRIMSON = "#f43f5e", EMERALD = "#10b981", VIOLET = "#a855f7", CYAN = "#06b6d4";
const CAT = [AMBER, CRIMSON, EMERALD, "#f97316", VIOLET, "#84cc16", "#eab308", CYAN];

let seed = 1337;
function rnd() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
function clamp(v,lo,hi){return Math.max(lo,Math.min(hi,v))}
function lerp(a,b,t){return a+(b-a)*t}
function eoc(t){return 1-Math.pow(1-t,3)}
function eob(t){const c1=1.70158,c3=c1+1;return 1+c3*Math.pow(t-1,3)+c1*Math.pow(t-1,2)}
function eiq(t){return t<0.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2}

// Pre-render background with dot grid
const bgCanvas = createCanvas(W, H);
const bgCtx = bgCanvas.getContext("2d");
bgCtx.fillStyle = BG; bgCtx.fillRect(0,0,W,H);
bgCtx.fillStyle = "rgba(245,158,11,0.03)";
for (let x=0;x<W;x+=40) for (let y=0;y<H;y+=40) bgCtx.fillRect(x,y,1,1);

// Film grain (pre-generated, applied as overlay)
const grainCanvas = createCanvas(W, H);
const gCtx = grainCanvas.getContext("2d");
const gImg = gCtx.createImageData(W, H);
for (let i=0;i<gImg.data.length;i+=4) { const v=Math.floor(rnd()*255); gImg.data[i]=v; gImg.data[i+1]=v; gImg.data[i+2]=v; gImg.data[i+3]=7; }
gCtx.putImageData(gImg, 0, 0);

// ── NN nodes ──
const nnLayers = [47,32,32,15];
const nnLX = [W*0.2, W*0.4, W*0.6, W*0.8];
const nnNodes = [];
for (let l=0;l<4;l++) { const c=nnLayers[l], sp=(H*0.7)/(c+1);
  for (let i=0;i<c;i++) nnNodes.push({x:nnLX[l],y:H*0.15+sp*(i+1),layer:l,idx:i,color:l===0?CAT[i%8]:l===3?CAT[i%8]:AMBER}); }
const nnConns = [];
for (let i=0;i<47;i++) for (let j=0;j<32;j++) if (rnd()<0.12) nnConns.push([i,47+j]);
for (let i=0;i<32;i++) for (let j=0;j<32;j++) if (rnd()<0.12) nnConns.push([47+i,79+j]);
for (let i=0;i<32;i++) for (let j=0;j<15;j++) if (rnd()<0.18) nnConns.push([79+i,111+j]);

// ── Prisms ──
const prisms = [];
for (let i=0;i<47;i++) prisms.push({x:W*0.1+(i+1)*(W*0.8/48), h:30+rnd()*180, color:CAT[i%8]});

// ── Swarm ──
const swarm = [];
const sBlk=180, sGap=50, sC=4, sR=2;
const sX=(W-(sC*sBlk+(sC-1)*sGap))/2, sY=H*0.22;
for (let r=0;r<sR;r++) for (let c=0;c<sC;c++) {
  const bx=sX+c*(sBlk+sGap), by=sY+r*(sBlk+sGap), cat=r*sC+c, hot=cat===4||cat===5;
  for (let i=0;i<50;i++) { const px=bx+rnd()*sBlk, py=by+rnd()*sBlk;
    let st=hot&&rnd()<0.5?0.7+rnd()*0.3:rnd()*0.3;
    swarm.push({x:px,y:py,color:CAT[cat],stress:st}); }
}

// ── Wave field ──
const waves = [];
const wC=50,wR=20,wS=32, wX=(W-wC*wS)/2, wY=(H-wR*wS)/2;
for (let r=0;r<wR;r++) for (let c=0;c<wC;c++) waves.push({x:wX+c*wS,y:wY+r*wS});

// ── Hysteresis chart points ──
const hystPts = [];
for (let i=0;i<=100;i++) { const px=W/2-400+(i/100)*800, pr=i/100; let py;
  if (pr<0.15) py=H/2+30+125-125*0.2;
  else if (pr<0.4) py=H/2+30+125-125*0.2-(pr-0.15)/0.25*125*0.6;
  else py=H/2+30+125-125*0.8+(pr-0.4)/0.6*125*0.6;
  hystPts.push({x:px,y:py});
}

// ── Drawing helpers ──
function glow(ctx,cx,cy,r,color,a) { const g=ctx.createRadialGradient(cx,cy,0,cx,cy,r);
  g.addColorStop(0,color); g.addColorStop(1,"transparent");
  ctx.globalAlpha=a; ctx.fillStyle=g; ctx.fillRect(cx-r,cy-r,r*2,r*2); ctx.globalAlpha=1; }
function mono(ctx,t,x,y,s,c,a) { ctx.globalAlpha=a??1; ctx.fillStyle=c??SOFT;
  ctx.font=`400 ${s}px monospace`; ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillText(t,x,y); ctx.globalAlpha=1; }
function big(ctx,t,x,y,s,c,w,a) { ctx.globalAlpha=a??1; ctx.fillStyle=c??INK;
  ctx.font=`${w??400} ${s}px sans-serif`; ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillText(t,x,y); ctx.globalAlpha=1; }

// ── Segment boundaries (in seconds) ──
// S1: 0-8 (hook), S2: 8-22 (neural), S3: 22-38 (reactor), S4: 38-50 (swarm), S5: 50-62 (hysteresis), S6: 62-75 (emergence)

function render(frame) {
  const cv = createCanvas(W, H);
  const ctx = cv.getContext("2d");
  const ts = frame / FPS;

  ctx.drawImage(bgCanvas, 0, 0);

  if (ts < 8) {
    // S1: HOOK
    const t = ts / 8;
    if (t < 0.2) { const f=t/0.2; glow(ctx,W/2,H/2,200,AMBER,0.02*f); }
    else if (t < 0.5) { const p=0.5+0.5*Math.sin(t*Math.PI*8);
      glow(ctx,W/2,H/2,300,AMBER,0.06+p*0.03);
      ctx.fillStyle=AMBER; ctx.beginPath(); ctx.arc(W/2,H/2,6+p*4,0,Math.PI*2); ctx.fill(); }
    else { const e=eoc((t-0.5)/0.5);
      glow(ctx,W/2,H/2,400,AMBER,0.05);
      ctx.strokeStyle=AMBER; ctx.lineWidth=1; ctx.globalAlpha=0.4*(1-e);
      ctx.beginPath(); ctx.arc(W/2,H/2,8+e*100,0,Math.PI*2); ctx.stroke(); ctx.globalAlpha=1;
      ctx.fillStyle=AMBER; ctx.beginPath(); ctx.arc(W/2,H/2,5,0,Math.PI*2); ctx.fill();
      if (t>0.6) { const a=clamp((t-0.6)/0.15,0,1); big(ctx,"PRISM",W/2,H/2-70,88,INK,"700",a); }
      if (t>0.75) { const a=clamp((t-0.75)/0.15,0,1); mono(ctx,"NON-LINEAR MACROECONOMIC SIMULATOR",W/2,H/2+40,12,SOFT,a); }
    }
  } else if (ts < 22) {
    // S2: NEURAL NETWORK
    const t=(ts-8)/14;
    glow(ctx,W/2,H/2,500,AMBER,0.025);
    mono(ctx,"THE NEURAL NETWORK",W/2,55,13,FAINT,1);
    mono(ctx,"47 → 32 → 32 → 15 · 3,008 WEIGHTS",W/2,82,11,FAINT,1);
    ctx.strokeStyle=AMBER; ctx.lineWidth=0.5;
    for (const [a,b] of nnConns) { const n1=nnNodes[a],n2=nnNodes[b];
      ctx.globalAlpha=0.02; ctx.beginPath(); ctx.moveTo(n1.x,n1.y); ctx.lineTo(n2.x,n2.y); ctx.stroke(); }
    ctx.globalAlpha=1;
    for (let s=0;s<4;s++) { const si=Math.floor((t*47+s*11)%47), mi=Math.floor((t*32+s*7)%32), oi=Math.floor((t*15+s*3)%15);
      const n1=nnNodes[si],n2=nnNodes[47+mi],n3=nnNodes[79+mi],n4=nnNodes[111+oi];
      ctx.strokeStyle=AMBER; ctx.lineWidth=1.5; ctx.globalAlpha=0.5;
      ctx.beginPath(); ctx.moveTo(n1.x,n1.y); ctx.lineTo(n2.x,n2.y); ctx.lineTo(n3.x,n3.y); ctx.lineTo(n4.x,n4.y); ctx.stroke();
      ctx.globalAlpha=1; glow(ctx,n4.x,n4.y,15,n4.color,0.2); }
    for (const n of nnNodes) { const r=n.layer===0?3:n.layer===3?5:4;
      const p=0.5+0.5*Math.sin(ts*3+n.idx*0.1);
      ctx.fillStyle=n.color; ctx.globalAlpha=0.4+p*0.4;
      ctx.beginPath(); ctx.arc(n.x,n.y,r,0,Math.PI*2); ctx.fill(); }
    ctx.globalAlpha=1;
    const lbs=["INPUT (47)","HIDDEN-1 (32)","HIDDEN-2 (32)","OUTPUT (15)"];
    for (let i=0;i<4;i++) mono(ctx,lbs[i],nnLX[i],H-45,9,FAINT,1);
  } else if (ts < 38) {
    // S3: REACTOR
    const t=(ts-22)/16;
    glow(ctx,W/2,H/2,500,AMBER,0.025);
    mono(ctx,"THE REACTOR",W/2,55,13,FAINT,1);
    mono(ctx,"47 POLICY LEVERS · LIVE PERTURBATION",W/2,82,11,FAINT,1);
    const blY=H*0.8;
    ctx.strokeStyle="rgba(255,255,255,0.05)"; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(W*0.08,blY); ctx.lineTo(W*0.92,blY); ctx.stroke();
    for (let i=0;i<prisms.length;i++) { const p=prisms[i];
      const ap=clamp(t*3-i*0.02,0,1);
      const h=lerp(0,p.h,eob(ap))+Math.sin(ts*4+i*0.5)*12;
      const w=14; ctx.fillStyle=p.color; ctx.globalAlpha=0.5;
      ctx.fillRect(p.x-w/2,blY-h,w,h);
      ctx.globalAlpha=1; ctx.fillRect(p.x-w/2,blY-h,w,2);
      if (i%7===Math.floor(ts*8)%7) glow(ctx,p.x,blY-h,20,p.color,0.12); }
    ctx.globalAlpha=1;
    // Causal edges
    for (let e=0;e<5;e++) { const i1=Math.floor(rnd()*47)%prisms.length;
      const i2=(i1+5+Math.floor(rnd()*10))%prisms.length;
      const p1=prisms[i1],p2=prisms[i2];
      ctx.strokeStyle=AMBER; ctx.lineWidth=0.5; ctx.globalAlpha=0.05;
      ctx.beginPath(); ctx.moveTo(p1.x,blY-p1.h);
      ctx.quadraticCurveTo((p1.x+p2.x)/2,blY-Math.max(p1.h,p2.h)-60,p2.x,blY-p2.h); ctx.stroke(); }
    ctx.globalAlpha=1;
  } else if (ts < 50) {
    // S4: AGENT SWARM
    const t=(ts-38)/12;
    mono(ctx,"THE AGENT SWARM",W/2,55,13,FAINT,1);
    mono(ctx,"10,000 AGENTS · 8 FACTIONS · REAL REACTIONS",W/2,82,11,FAINT,1);
    for (const d of swarm) { const ps=d.stress+0.1*Math.sin(ts*5+d.x*0.01);
      const a=clamp(0.2+ps*0.6,0,1), sz=2+ps*1.5;
      ctx.fillStyle=d.color; ctx.globalAlpha=a; ctx.fillRect(d.x,d.y,sz,sz);
      if (d.stress>0.7) glow(ctx,d.x,d.y,6,d.color,0.15); }
    ctx.globalAlpha=1;
    const lbs=["LABOR","EMPLOYERS","MILITARY","CLERGY","YOUTH","RURAL","URBAN","INFORMAL"];
    for (let r=0;r<2;r++) for (let c=0;c<4;c++) {
      mono(ctx,lbs[r*4+c],sX+c*(sBlk+sGap)+sBlk/2,sY+r*(sBlk+sGap)-12,9,CAT[r*4+c],1); }
  } else if (ts < 62) {
    // S5: HYSTERESIS
    const t=(ts-50)/12;
    glow(ctx,W/2,H/2,400,CRIMSON,0.015);
    mono(ctx,"HYSTERESIS — THE SCAR",W/2,55,13,FAINT,1);
    mono(ctx,"RECOVERY DOESN'T ERASE THE SCAR",W/2,82,11,FAINT,1);
    const cx=W/2, cy=H/2+30, pw=800, ph=250;
    ctx.strokeStyle="rgba(255,255,255,0.06)"; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(cx-pw/2,cy+ph/2); ctx.lineTo(cx+pw/2,cy+ph/2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx-pw/2,cy-ph/2); ctx.lineTo(cx-pw/2,cy+ph/2); ctx.stroke();
    const crisisX=cx-pw/2+pw*0.15, recX=cx-pw/2+pw*0.4;
    ctx.strokeStyle="rgba(244,63,94,0.2)"; ctx.setLineDash([2,6]);
    ctx.beginPath(); ctx.moveTo(crisisX,cy-ph/2); ctx.lineTo(crisisX,cy+ph/2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(recX,cy-ph/2); ctx.lineTo(recX,cy+ph/2); ctx.stroke();
    ctx.setLineDash([]);
    mono(ctx,"CRISIS",crisisX,cy-ph/2-15,9,CRIMSON,1);
    mono(ctx,"RECOVERY",recX,cy-ph/2-15,9,SOFT,1);
    // Dashed reference
    ctx.strokeStyle="rgba(139,144,154,0.25)"; ctx.lineWidth=1; ctx.setLineDash([4,4]);
    ctx.beginPath();
    for (let i=0;i<hystPts.length;i++) { i===0?ctx.moveTo(hystPts[i].x,hystPts[i].y):ctx.lineTo(hystPts[i].x,hystPts[i].y); }
    ctx.stroke(); ctx.setLineDash([]);
    // Actual with scar
    const dn=Math.floor(hystPts.length*clamp(t*1.3,0,1));
    if (dn>40) { ctx.fillStyle="rgba(245,158,11,0.06)"; ctx.beginPath();
      for (let i=40;i<dn;i++) { i===40?ctx.moveTo(hystPts[i].x,hystPts[i].y):ctx.lineTo(hystPts[i].x,hystPts[i].y); }
      for (let i=dn-1;i>=40;i--) ctx.lineTo(hystPts[i].x,hystPts[i].y+50);
      ctx.closePath(); ctx.fill(); }
    ctx.strokeStyle=AMBER; ctx.lineWidth=2; ctx.beginPath();
    for (let i=0;i<dn;i++) { const y=i>40?hystPts[i].y+50:hystPts[i].y;
      i===0?ctx.moveTo(hystPts[i].x,y):ctx.lineTo(hystPts[i].x,y); }
    ctx.stroke();
    if (dn>60) mono(ctx,"THE SCAR · +5.0pp",cx+pw*0.15,cy-ph*0.05,11,AMBER,1);
    if (t>0.5) mono(ctx,"the system remembers",cx,cy+ph/2+35,11,SOFT,clamp((t-0.5)*2,0,1));
  } else {
    // S6: EMERGENCE
    const t=(ts-62)/13;
    glow(ctx,W/2,H/2,600,AMBER,0.035);
    mono(ctx,"EMERGENCE",W/2,55,13,FAINT,1);
    for (const d of waves) { const off=Math.sin(d.x*0.005+ts*4)*20+Math.sin(d.x*0.01+ts*5.3)*15+Math.cos(d.y*0.008+ts*3)*10;
      const y=d.y+off, amp=Math.abs(off)/45;
      ctx.fillStyle=AMBER; ctx.globalAlpha=0.2+amp*0.6;
      ctx.fillRect(d.x-1,y-1,2+amp*1.5,2+amp*1.5); }
    ctx.globalAlpha=1;
    if (t>0.3) { const a=clamp((t-0.3)/0.2,0,1);
      big(ctx,"Life is not simulated.",W/2,H/2-80,26,INK,"300",a);
      big(ctx,"It emerges.",W/2,H/2-40,26,AMBER,"400",a); }
    if (t>0.6) { const a=clamp((t-0.6)/0.2,0,1);
      big(ctx,"PRISM",W/2,H/2+50,44,INK,"700",a);
      mono(ctx,"github.com/Vitalcheffe/PRISM",W/2,H/2+95,12,SOFT,a); }
  }

  // Film grain
  ctx.globalAlpha=0.5; ctx.drawImage(grainCanvas,0,0); ctx.globalAlpha=1;
  // Progress bar
  ctx.fillStyle="rgba(245,158,11,0.12)"; ctx.fillRect(0,H-2,W*(frame/TOTAL),2);

  const buf = cv.toBuffer("image/png");
  fs.writeFileSync(`${FDIR}/frame_${String(frame).padStart(5,"0")}.png`, buf);
}

// ── AUDIO ──
function genAudio() {
  const sr=44100, ns=sr*DUR; const buf=new Float32Array(ns*2);
  for (let i=0;i<ns;i++) { const t=i/sr; let l=0,r=0;
    const env=clamp(t/2,0,1)*clamp((DUR-t)/3,0,1);
    l+=Math.sin(2*Math.PI*55*t)*0.06*env; r+=Math.sin(2*Math.PI*55.3*t)*0.06*env;
    l+=Math.sin(2*Math.PI*110*t)*0.03*env; r+=Math.sin(2*Math.PI*110.5*t)*0.03*env;
    if (t>7.5&&t<9){const it=(t-7.5)/1.5,ie=Math.exp(-it*3);l+=Math.sin(2*Math.PI*80*t)*0.12*ie;r+=Math.sin(2*Math.PI*80*t)*0.12*ie;l+=(rnd()-0.5)*0.08*ie;r+=(rnd()-0.5)*0.08*ie;}
    if (t>8&&t<22){const se=Math.sin((t-8)/14*Math.PI);l+=Math.sin(2*Math.PI*880*t+Math.sin(t*3)*2)*0.01*se;r+=Math.sin(2*Math.PI*1320*t+Math.sin(t*4)*2)*0.01*se;}
    if (t>21.5&&t<23){const it=(t-21.5)/1.5,ie=Math.exp(-it*3);l+=Math.sin(2*Math.PI*60*t)*0.1*ie;r+=Math.sin(2*Math.PI*60*t)*0.1*ie;}
    if (t>38&&t<50){const se=Math.sin((t-38)/12*Math.PI);l+=(rnd()-0.5)*0.015*se;r+=(rnd()-0.5)*0.015*se;l+=Math.sin(2*Math.PI*40*t)*0.025*se;r+=Math.sin(2*Math.PI*40.5*t)*0.025*se;}
    if (t>50&&t<62){const se=Math.sin((t-50)/12*Math.PI);l+=Math.sin(2*Math.PI*220*t)*0.035*se;r+=Math.sin(2*Math.PI*220.5*t)*0.035*se;l+=Math.sin(2*Math.PI*330*t)*0.015*se;r+=Math.sin(2*Math.PI*330.3*t)*0.015*se;}
    if (t>62&&t<75){const re=clamp((t-62)/3,0,1)*clamp((75-t)/2,0,1);l+=Math.sin(2*Math.PI*440*t)*0.025*re;r+=Math.sin(2*Math.PI*440.5*t)*0.025*re;l+=Math.sin(2*Math.PI*660*t)*0.012*re;r+=Math.sin(2*Math.PI*660.3*t)*0.012*re;}
    l=clamp(l,-0.8,0.8); r=clamp(r,-0.8,0.8); buf[i*2]=l; buf[i*2+1]=r;
  }
  const wb=new ArrayBuffer(44+ns*4); const v=new DataView(wb);
  const ws=(o,s)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i));};
  ws(0,"RIFF"); v.setUint32(4,36+ns*4,true); ws(8,"WAVE"); ws(12,"fmt ");
  v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,2,true);
  v.setUint32(24,sr,true); v.setUint32(28,sr*4,true); v.setUint16(32,4,true);
  v.setUint16(34,16,true); ws(36,"data"); v.setUint32(40,ns*4,true);
  for (let i=0;i<ns*2;i++) v.setInt16(44+i*2,clamp(buf[i],-1,1)*0x7fff,true);
  fs.writeFileSync(AUDIO,new Uint8Array(wb)); console.log("Audio generated");
}

// ── MAIN ──
console.log(`PRISM Launch Film: ${DUR}s @ ${FPS}fps = ${TOTAL} frames`);
genAudio();
const t0=Date.now();
for (let f=0;f<TOTAL;f++) {
  render(f);
  if (f%300===0) console.log(`frame ${f}/${TOTAL} · ${((Date.now()-t0)/1000).toFixed(0)}s`);
}
console.log(`Rendered ${TOTAL} frames in ${((Date.now()-t0)/1000).toFixed(0)}s`);
console.log("Stitching with ffmpeg...");
execSync(`ffmpeg -y -framerate ${FPS} -i ${FDIR}/frame_%05d.png -i ${AUDIO} -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -c:a aac -b:a 192k -shortest ${OUT}`, {stdio:"inherit"});
execSync(`rm -f ${FDIR}/frame_*.png`);
const st=fs.statSync(OUT);
console.log(`\n✓ ${OUT} · ${(st.size/1024/1024).toFixed(1)} MB`);
