// PRISM Launch Film — 75s @ 60fps, 1920x1080, with bloom + grain + audio
import { createCanvas } from "canvas";
import * as fs from "fs";
const W=1920,H=1080,FPS=60,DUR=75;
const FDIR="/home/z/my-project/video/frames";
const BG="#09090b",INK="#f0f6fc",SOFT="#8b949e",FAINT="#3d444d",AMBER="#f59e0b";
const CRIMSON="#f43f5e",CAT=[AMBER,CRIMSON,"#10b981","#f97316","#a855f7","#84cc16","#eab308","#06b6d4"];
let seed=1337;function rnd(){seed=(seed*9301+49297)%233280;return seed/233280;}
function clamp(v,lo,hi){return Math.max(lo,Math.min(hi,v));}function lerp(a,b,t){return a+(b-a)*t;}
function eoc(t){return 1-Math.pow(1-t,3);}function eob(t){const c1=1.70158,c3=c1+1;return 1+c3*Math.pow(t-1,3)+c1*Math.pow(t-1,2);}
const cv=createCanvas(W,H);const ctx=cv.getContext("2d");
const bgCv=createCanvas(W,H);const bgCtx=bgCv.getContext("2d");
bgCtx.fillStyle=BG;bgCtx.fillRect(0,0,W,H);bgCtx.fillStyle="rgba(245,158,11,0.025)";
for(let x=0;x<W;x+=40)for(let y=0;y<H;y+=40)bgCtx.fillRect(x,y,1,1);
const vig=bgCtx.createRadialGradient(W/2,H/2,0,W/2,H/2,W*0.7);vig.addColorStop(0,"transparent");vig.addColorStop(1,"rgba(0,0,0,0.4)");
bgCtx.fillStyle=vig;bgCtx.fillRect(0,0,W,H);
const grainCv=createCanvas(W,H);const grainCtx=grainCv.getContext("2d");const gImg=grainCtx.createImageData(W,H);
for(let i=0;i<gImg.data.length;i+=4){const v=Math.floor(rnd()*255);gImg.data[i]=v;gImg.data[i+1]=v;gImg.data[i+2]=v;gImg.data[i+3]=5;}
grainCtx.putImageData(gImg,0,0);
const nnLayers=[47,32,32,15],nnLX=[W*0.2,W*0.4,W*0.6,W*0.8],nnNodes=[];
for(let l=0;l<4;l++){const c=nnLayers[l],sp=(H*0.7)/(c+1);for(let i=0;i<c;i++)nnNodes.push({x:nnLX[l],y:H*0.15+sp*(i+1),layer:l,idx:i,color:l===0?CAT[i%8]:l===3?CAT[i%8]:AMBER});}
const nnConns=[];for(let i=0;i<47;i++)for(let j=0;j<32;j++)if(rnd()<0.1)nnConns.push([i,47+j]);
for(let i=0;i<32;i++)for(let j=0;j<32;j++)if(rnd()<0.1)nnConns.push([47+i,79+j]);
for(let i=0;i<32;i++)for(let j=0;j<15;j++)if(rnd()<0.15)nnConns.push([79+i,111+j]);
const prisms=[];for(let i=0;i<47;i++)prisms.push({x:W*0.1+(i+1)*(W*0.8/48),h:30+rnd()*180,color:CAT[i%8]});
const swarm=[];const sBlk=180,sGap=50,sC=4,sR=2,sX=(W-(sC*sBlk+(sC-1)*sGap))/2,sY=H*0.22;
for(let r=0;r<sR;r++)for(let c=0;c<sC;c++){const bx=sX+c*(sBlk+sGap),by=sY+r*(sBlk+sGap),cat=r*sC+c,hot=cat===4||cat===5;
for(let i=0;i<50;i++){const px=bx+rnd()*sBlk,py=by+rnd()*sBlk;const st=hot&&rnd()<0.5?0.7+rnd()*0.3:rnd()*0.3;swarm.push({x:px,y:py,color:CAT[cat],stress:st});}}
const waves=[];const wC=60,wR=25,wS=28,wX=(W-wC*wS)/2,wY=(H-wR*wS)/2;
for(let r=0;r<wR;r++)for(let c=0;c<wC;c++)waves.push({x:wX+c*wS,y:wY+r*wS});
const hystPts=[];for(let i=0;i<=100;i++){const px=W/2-400+(i/100)*800,pr=i/100;let py;if(pr<0.15)py=H/2+130;else if(pr<0.4)py=H/2+130-(pr-0.15)/0.25*75;else py=H/2+55+(pr-0.4)/0.6*75;hystPts.push({x:px,y:py});}
function glow(cx,cy,r,color,a){const g=ctx.createRadialGradient(cx,cy,0,cx,cy,r);g.addColorStop(0,color);g.addColorStop(1,"transparent");ctx.globalAlpha=a;ctx.fillStyle=g;ctx.fillRect(cx-r,cy-r,r*2,r*2);ctx.globalAlpha=1;}
function mono(t,x,y,s,c,a){ctx.globalAlpha=a??1;ctx.fillStyle=c??SOFT;ctx.font=`400 ${s}px monospace`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(t,x,y);ctx.globalAlpha=1;}
function big(t,x,y,s,c,w,a){ctx.globalAlpha=a??1;ctx.fillStyle=c??INK;ctx.font=`${w??400} ${s}px sans-serif`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(t,x,y);ctx.globalAlpha=1;}
const start=parseInt(process.argv[2]||"0");const end=Math.min(start+1000,FPS*DUR);
for(let f=start;f<end;f++){const ts=f/FPS;ctx.drawImage(bgCv,0,0);
if(ts<8){const t=ts/8;if(t<0.5){const p=0.5+0.5*Math.sin(t*Math.PI*8);glow(W/2,H/2,300,AMBER,0.06+p*0.03);ctx.fillStyle=AMBER;ctx.beginPath();ctx.arc(W/2,H/2,6+p*4,0,Math.PI*2);ctx.fill();}
else{const e=eoc((t-0.5)/0.5);glow(W/2,H/2,400,AMBER,0.05);ctx.strokeStyle=AMBER;ctx.lineWidth=1;ctx.globalAlpha=0.4*(1-e);ctx.beginPath();ctx.arc(W/2,H/2,8+e*100,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;ctx.fillStyle=AMBER;ctx.beginPath();ctx.arc(W/2,H/2,5,0,Math.PI*2);ctx.fill();
if(t>0.6){const a=clamp((t-0.6)/0.15,0,1);big("PRISM",W/2,H/2-70,88,INK,"700",a);}
if(t>0.75){const a=clamp((t-0.75)/0.15,0,1);mono("NON-LINEAR MACROECONOMIC SIMULATOR",W/2,H/2+40,12,SOFT,a);}}}
else if(ts<22){const t=(ts-8)/14;glow(W/2,H/2,500,AMBER,0.025);mono("THE NEURAL NETWORK",W/2,55,13,FAINT,1);mono("47 → 32 → 32 → 15 · 3,008 WEIGHTS",W/2,82,11,FAINT,1);
ctx.strokeStyle=AMBER;ctx.lineWidth=0.5;for(const[a,b]of nnConns){const n1=nnNodes[a],n2=nnNodes[b];ctx.globalAlpha=0.02;ctx.beginPath();ctx.moveTo(n1.x,n1.y);ctx.lineTo(n2.x,n2.y);ctx.stroke();}
ctx.globalAlpha=1;for(let s=0;s<4;s++){const si=Math.floor((t*47+s*11)%47),mi=Math.floor((t*32+s*7)%32),oi=Math.floor((t*15+s*3)%15);
const n1=nnNodes[si],n2=nnNodes[47+mi],n3=nnNodes[79+mi],n4=nnNodes[111+oi];ctx.strokeStyle=AMBER;ctx.lineWidth=1.5;ctx.globalAlpha=0.5;
ctx.beginPath();ctx.moveTo(n1.x,n1.y);ctx.lineTo(n2.x,n2.y);ctx.lineTo(n3.x,n3.y);ctx.lineTo(n4.x,n4.y);ctx.stroke();ctx.globalAlpha=1;glow(n4.x,n4.y,15,n4.color,0.2);}
for(const n of nnNodes){const r=n.layer===0?3:n.layer===3?5:4;const p=0.5+0.5*Math.sin(ts*3+n.idx*0.1);ctx.fillStyle=n.color;ctx.globalAlpha=0.4+p*0.4;ctx.beginPath();ctx.arc(n.x,n.y,r,0,Math.PI*2);ctx.fill();}
ctx.globalAlpha=1;const lbs=["INPUT (47)","HIDDEN-1 (32)","HIDDEN-2 (32)","OUTPUT (15)"];for(let i=0;i<4;i++)mono(lbs[i],nnLX[i],H-45,9,FAINT,1);}
else if(ts<38){const t=(ts-22)/16;glow(W/2,H/2,500,AMBER,0.025);mono("THE REACTOR",W/2,55,13,FAINT,1);mono("47 POLICY LEVERS · LIVE PERTURBATION",W/2,82,11,FAINT,1);
const blY=H*0.8;ctx.strokeStyle="rgba(255,255,255,0.05)";ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(W*0.08,blY);ctx.lineTo(W*0.92,blY);ctx.stroke();
for(let i=0;i<prisms.length;i++){const p=prisms[i];const ap=clamp(t*3-i*0.02,0,1);const h=lerp(0,p.h,eob(ap))+Math.sin(ts*4+i*0.5)*12;const w=14;ctx.fillStyle=p.color;ctx.globalAlpha=0.5;ctx.fillRect(p.x-w/2,blY-h,w,h);ctx.globalAlpha=1;ctx.fillRect(p.x-w/2,blY-h,w,2);if(i%7===Math.floor(ts*8)%7)glow(p.x,blY-h,20,p.color,0.12);}ctx.globalAlpha=1;}
else if(ts<50){mono("THE AGENT SWARM",W/2,55,13,FAINT,1);mono("10,000 AGENTS · 8 FACTIONS · REAL REACTIONS",W/2,82,11,FAINT,1);
for(const d of swarm){const ps=d.stress+0.1*Math.sin(ts*5+d.x*0.01);const a=clamp(0.2+ps*0.6,0,1),sz=2+ps*1.5;ctx.fillStyle=d.color;ctx.globalAlpha=a;ctx.fillRect(d.x,d.y,sz,sz);if(d.stress>0.7)glow(d.x,d.y,6,d.color,0.15);}ctx.globalAlpha=1;
const lbs=["LABOR","EMPLOYERS","MILITARY","CLERGY","YOUTH","RURAL","URBAN","INFORMAL"];for(let r=0;r<2;r++)for(let c=0;c<4;c++)mono(lbs[r*4+c],sX+c*(sBlk+sGap)+sBlk/2,sY+r*(sBlk+sGap)-12,9,CAT[r*4+c],1);}
else if(ts<62){const t=(ts-50)/12;glow(W/2,H/2,400,CRIMSON,0.015);mono("HYSTERESIS — THE SCAR",W/2,55,13,FAINT,1);mono("RECOVERY DOESN'T ERASE THE SCAR",W/2,82,11,FAINT,1);
const cx=W/2,cy=H/2+30,pw=800,ph=250;ctx.strokeStyle="rgba(255,255,255,0.06)";ctx.lineWidth=1;
ctx.beginPath();ctx.moveTo(cx-pw/2,cy+ph/2);ctx.lineTo(cx+pw/2,cy+ph/2);ctx.stroke();ctx.beginPath();ctx.moveTo(cx-pw/2,cy-ph/2);ctx.lineTo(cx-pw/2,cy+ph/2);ctx.stroke();
const crisisX=cx-pw/2+pw*0.15,recX=cx-pw/2+pw*0.4;ctx.strokeStyle="rgba(244,63,94,0.2)";ctx.setLineDash([2,6]);
ctx.beginPath();ctx.moveTo(crisisX,cy-ph/2);ctx.lineTo(crisisX,cy+ph/2);ctx.stroke();ctx.beginPath();ctx.moveTo(recX,cy-ph/2);ctx.lineTo(recX,cy+ph/2);ctx.stroke();ctx.setLineDash([]);
mono("CRISIS",crisisX,cy-ph/2-15,9,CRIMSON,1);mono("RECOVERY",recX,cy-ph/2-15,9,SOFT,1);
ctx.strokeStyle="rgba(139,144,154,0.25)";ctx.lineWidth=1;ctx.setLineDash([4,4]);ctx.beginPath();
for(let i=0;i<hystPts.length;i++){if(i===0){ctx.moveTo(hystPts[i].x,hystPts[i].y)}else{ctx.lineTo(hystPts[i].x,hystPts[i].y)}}ctx.stroke();ctx.setLineDash([]);
const dn=Math.floor(hystPts.length*clamp(t*1.3,0,1));if(dn>40){ctx.fillStyle="rgba(245,158,11,0.06)";ctx.beginPath();
for(let i=40;i<dn;i++){if(i===40){ctx.moveTo(hystPts[i].x,hystPts[i].y)}else{ctx.lineTo(hystPts[i].x,hystPts[i].y)}}
for(let i=dn-1;i>=40;i--)ctx.lineTo(hystPts[i].x,hystPts[i].y+50);ctx.closePath();ctx.fill();}
ctx.strokeStyle=AMBER;ctx.lineWidth=2;ctx.beginPath();for(let i=0;i<dn;i++){const y=i>40?hystPts[i].y+50:hystPts[i].y;if(i===0){ctx.moveTo(hystPts[i].x,y)}else{ctx.lineTo(hystPts[i].x,y)}}ctx.stroke();
if(dn>60)mono("THE SCAR · +5.0pp",cx+pw*0.15,cy-ph*0.05,11,AMBER,1);if(t>0.5)mono("the system remembers",cx,cy+ph/2+35,11,SOFT,clamp((t-0.5)*2,0,1));}
else{const t=(ts-62)/13;glow(W/2,H/2,600,AMBER,0.035);mono("EMERGENCE",W/2,55,13,FAINT,1);
for(const d of waves){const off=Math.sin(d.x*0.005+ts*4)*20+Math.sin(d.x*0.01+ts*5.3)*15+Math.cos(d.y*0.008+ts*3)*10;
const y=d.y+off,amp=Math.abs(off)/45;ctx.fillStyle=AMBER;ctx.globalAlpha=0.2+amp*0.6;ctx.fillRect(d.x-1,y-1,2+amp*1.5,2+amp*1.5);}ctx.globalAlpha=1;
if(t>0.3){const a=clamp((t-0.3)/0.2,0,1);big("Life is not simulated.",W/2,H/2-80,26,INK,"300",a);big("It emerges.",W/2,H/2-40,26,AMBER,"400",a);}
if(t>0.6){const a=clamp((t-0.6)/0.2,0,1);big("PRISM",W/2,H/2+50,44,INK,"700",a);mono("github.com/Vitalcheffe/PRISM",W/2,H/2+95,12,SOFT,a);}}
ctx.globalAlpha=0.4;ctx.drawImage(grainCv,0,0);ctx.globalAlpha=1;ctx.fillStyle="rgba(245,158,11,0.1)";ctx.fillRect(0,H-2,W*(f/(FPS*DUR)),2);
fs.writeFileSync(`${FDIR}/f${String(f).padStart(5,"0")}.jpg`,cv.toBuffer("image/jpeg",{quality:0.97}));}
console.log(`Batch ${start}-${end-1} done`);
