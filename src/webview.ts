import * as vscode from 'vscode'
import { WeathrConfig } from './config'

export function getWebviewContent(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  config: WeathrConfig,
  simulateCondition: string | null,
  simulateNight: boolean
): string {
  const configJson = JSON.stringify(config)
  const simulateJson = JSON.stringify({ condition: simulateCondition, night: simulateNight })

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src https:;"/>
<title>Weathr</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:100%;height:100%;overflow:hidden;background:#0a0a1a;font-family:'Courier New',monospace}
  #canvas{display:block;width:100%;height:100%}
  /* Pixel canvas: render at low res, scale up crisply */
  #canvas.pixel-mode{image-rendering:pixelated;image-rendering:crisp-edges}
  #hud{position:absolute;bottom:0;left:0;right:0;padding:5px 10px;background:rgba(0,0,0,0.58);color:#00e5ff;font-size:10px;letter-spacing:.04em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border-top:1px solid rgba(0,229,255,0.2);backdrop-filter:blur(4px)}
  #hud span{opacity:.75;margin-right:9px}
  #hud .offline{color:#ff5252;font-weight:bold;margin-right:8px}
  #load{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;background:#0a0a1a;color:#00e5ff;font-size:13px;transition:opacity .5s}
  #load.gone{opacity:0;pointer-events:none}
  .spin{width:30px;height:30px;border:3px solid rgba(0,229,255,.2);border-top-color:#00e5ff;border-radius:50%;animation:sp .8s linear infinite}
  @keyframes sp{to{transform:rotate(360deg)}}
</style>
</head>
<body>
<canvas id="canvas"></canvas>
<div id="hud"></div>
<div id="load"><div class="spin"></div><span>Fetching weather...</span></div>
<script>
// --- CONFIG ---
let CFG = ${configJson};
let SIM = ${simulateJson};

// --- PIXEL MODE CONSTANTS ---
// Logical pixel resolution for pixel mode (scaled up by CSS)
const PIXEL_W = 300;
const PIXEL_H = 100;

// --- CANVAS ---
const canvas = document.getElementById('canvas');
const ctx    = canvas.getContext('2d');
const hud    = document.getElementById('hud');
const load   = document.getElementById('load');

// BUG FIX: resize() was called once at startup before the canvas had CSS
// dimensions (common in VS Code webviews). We now guard inside the loop.
function resize(){
  if(CFG.pixelMode){
    // In pixel mode, the canvas BUFFER is tiny; CSS stretches it up.
    // Compute buffer width from the viewport aspect ratio so the image
    // is never squished/stretched when the window shape changes.
    const cssW = canvas.offsetWidth  || canvas.clientWidth  || 400;
    const cssH = canvas.offsetHeight || canvas.clientHeight || 300;
    const aspect = cssW / cssH;
    canvas.width  = Math.max(80, Math.round(PIXEL_H * aspect));
    canvas.height = PIXEL_H;
    canvas.classList.add('pixel-mode');
  } else {
    canvas.width  = canvas.offsetWidth  || canvas.clientWidth  || 400;
    canvas.height = canvas.offsetHeight || canvas.clientHeight || 300;
    canvas.classList.remove('pixel-mode');
  }
}
resize();
window.addEventListener('resize', ()=>{
  resize();
  if(weatherData){
    initScene();
    if(CFG.pixelMode) px_initParticles();
  }
});

// --- WEATHER STATE ---
let weatherData=null, isOffline=false, isDay=true, condition='clear';
let temperature=20, precipitation=0, windSpeed=10, windDirection=180, moonPhase=0.5;

// --- PARTICLE POOLS ---
let raindrops=[], snowflakes=[], clouds=[], stars=[], fireflies=[];
let birds=[], planes=[], fogParticles=[], leaves=[], smoke=[];
let lightningBolts=[], lightningFlash=0, nextLightFrame=200;
let treeLayout=[];
let frame=0;

const SPD = ()=> CFG.animationSpeed==='slow'?.5:CFG.animationSpeed==='fast'?2:1;
const HY  = ()=> canvas.height * 0.73;  // horizon y

// ---- CONDITION HELPERS ----
const RAIN_CONDS  = new Set(['drizzle','rain','rain-showers','freezing-rain','thunderstorm','thunderstorm-hail']);
const SNOW_CONDS  = new Set(['snow','snow-grains','snow-showers']);
const STORM_CONDS = new Set(['thunderstorm','thunderstorm-hail']);
const isRaining   = ()=> RAIN_CONDS.has(condition);
const isSnowing   = ()=> SNOW_CONDS.has(condition);
const isStorm     = ()=> STORM_CONDS.has(condition);

// ============================================================
//  SCENE INIT
// ============================================================
function initScene(){
  raindrops=[]; snowflakes=[]; clouds=[]; stars=[];
  fireflies=[]; birds=[]; planes=[]; fogParticles=[];
  leaves=[]; smoke=[]; lightningBolts=[];

  if(!isDay){
    for(let i=0;i<140;i++) stars.push({
      x:Math.random()*canvas.width,
      y:Math.random()*HY()*.9,
      r:Math.random()*1.4+.3,
      a:Math.random(),
      spd:Math.random()*.04+.01
    });
  }

  const nc = condition==='clear'?2:condition==='partly-cloudy'?4:condition==='overcast'?8:6;
  for(let i=0;i<nc;i++) spawnCloud(Math.random()*canvas.width, true);

  if(isRaining()){
    const n = condition==='drizzle'?55:isStorm()?220:condition==='freezing-rain'?160:110;
    for(let i=0;i<n;i++) spawnDrop(true);
  }

  if(isSnowing()){
    const n = condition==='snow-grains'?60:condition==='snow-showers'?110:140;
    for(let i=0;i<n;i++) spawnFlake(true);
  }

  if(condition==='fog') for(let i=0;i<40;i++) spawnFog(true);

  if(isDay && !isRaining() && !isSnowing() && condition!=='fog'){
    for(let i=0;i<6;i++) spawnBird(Math.random()*canvas.width);
  }

  if(isDay && (condition==='clear'||condition==='partly-cloudy')){
    spawnPlane();
  }

  if(!isDay && (condition==='clear'||condition==='partly-cloudy') && temperature>15){
    for(let i=0;i<22;i++) spawnFirefly();
  }

  if(CFG.showLeaves && !isRaining() && !isSnowing()){
    for(let i=0;i<20;i++) spawnLeaf(true);
  }

  buildTrees();
}

// ============================================================
//  TREE LAYOUT
// ============================================================
const TREE_SPECIES=['pine','round','tall','birch','spruce'];
function buildTrees(){
  treeLayout=[];
  const hy=HY();
  const W =canvas.width;

  const farCount=Math.max(6, Math.floor(W/55));
  for(let i=0;i<farCount;i++){
    treeLayout.push({
      layer:0,
      x: (i+Math.random()*.6)*W/farCount + Math.random()*20-10,
      baseY: hy - 2,
      h: Math.random()*22+14,
      w: Math.random()*14+8,
      species: TREE_SPECIES[Math.floor(Math.random()*TREE_SPECIES.length)],
      alpha: Math.random()*.25+.12
    });
  }

  const midCount=Math.max(8, Math.floor(W/45));
  for(let i=0;i<midCount;i++){
    // BUG FIX: original always picked from just 2 candidate x values then
    // chose randomly, producing clustered mid trees. Now we properly space them
    // in the left and right bands excluding the house centre (35%–65%).
    const leftBand  = W * 0.33;
    const rightStart= W * 0.67;
    const rightBand = W - rightStart;
    const useLeft   = Math.random() < 0.5;
    const x = useLeft
      ? Math.random() * leftBand
      : rightStart + Math.random() * rightBand;
    treeLayout.push({
      layer:1,
      x,
      baseY: hy - 1,
      h: Math.random()*38+22,
      w: Math.random()*20+12,
      species: TREE_SPECIES[Math.floor(Math.random()*TREE_SPECIES.length)],
      alpha: Math.random()*.25+.55
    });
  }

  const nearPositions=[
    ...Array.from({length:4},(_,i)=> W*.01 + i*W*.09 + Math.random()*16),
    ...Array.from({length:4},(_,i)=> W*.7  + i*W*.08 + Math.random()*16)
  ];
  nearPositions.forEach(x=>{
    treeLayout.push({
      layer:2,
      x,
      baseY: hy,
      h: Math.random()*55+38,
      w: Math.random()*28+16,
      species: TREE_SPECIES[Math.floor(Math.random()*TREE_SPECIES.length)],
      alpha: 1
    });
  });

  treeLayout.sort((a,b)=>a.layer-b.layer);
}

// ============================================================
//  SPAWN HELPERS
// ============================================================
function spawnCloud(x, init=false){
  clouds.push({
    x: x !== undefined ? x : -80,
    y: Math.random()*HY()*.28+15,
    w: Math.random()*110+60,
    h: Math.random()*32+18,
    spd:(Math.random()*.28+.08)*SPD(),
    alpha:condition==='overcast'?.92:condition==='fog'?.55:.78
  });
}

function spawnDrop(init){
  const drift = ((windDirection%360)<180?1:-1) * (windSpeed/50) * (Math.random()*1.5+.5);
  const vy = (Math.random()*5+5)*SPD();
  raindrops.push({
    x: Math.random()*canvas.width,
    y: init ? Math.random()*HY() : Math.random()*-80-5,
    vx: drift,
    vy,
    len: Math.random()*9+7,
    alpha: condition==='drizzle'?.45:.78,
    isHail: condition==='thunderstorm-hail'||condition==='freezing-rain'
  });
}

function spawnFlake(init){
  snowflakes.push({
    x: Math.random()*(canvas.width+40)-20,
    y: init ? Math.random()*HY() : -8,
    r: Math.random()*3.5+1,
    vy:(Math.random()*1.2+.5)*SPD(),
    vx:(Math.random()-.5)*.8,
    wobble:Math.random()*Math.PI*2,
    wobbleSpd:Math.random()*.06+.02,
    wobbleAmp:Math.random()*1.8+.6,
    angle:Math.random()*Math.PI*2,
    spin:(Math.random()-.5)*.06
  });
}

function spawnFog(init){
  fogParticles.push({
    x: init ? Math.random()*canvas.width : -120,
    y: Math.random()*canvas.height*.8,
    w: Math.random()*220+90,
    h: Math.random()*60+28,
    spd:(Math.random()*.6+.15)*SPD(),
    alpha:Math.random()*.28+.1
  });
}

function spawnBird(startX){
  birds.push({
    x: startX!==undefined ? startX : -30,
    y: Math.random()*HY()*.55+30,
    spd:(Math.random()*0.6+0.35)*SPD(),
    wing:Math.random()*Math.PI,
    wingSpd:(Math.random()*.08+.05)*SPD()*2,
    size:Math.random()*5+4
  });
}

function spawnPlane(){
  planes.push({
    x:-120,
    y: canvas.height*(Math.random()*.07+.04),
    spd:(Math.random()*0.5+0.6)*SPD(),
    trail:[]
  });
}

function spawnFirefly(){
  const hy=HY();
  fireflies.push({
    x:Math.random()*canvas.width,
    y:hy*.45+Math.random()*hy*.5,
    vx:(Math.random()-.5)*.7,
    vy:(Math.random()-.5)*.45,
    alpha:Math.random(),
    aDir:Math.random()>.5?1:-1,
    aSpd:Math.random()*.03+.01,
    r:Math.random()*2+1
  });
}

function spawnLeaf(init){
  leaves.push({
    x:Math.random()*canvas.width,
    y:init ? Math.random()*HY() : -16,
    vy:(Math.random()*1.4+.7)*SPD()*0.5,
    vx:(Math.random()-.5)*1.5,
    angle:Math.random()*Math.PI*2,
    spin:(Math.random()-.5)*.12,
    wobble:Math.random()*Math.PI*2,
    wobbleAmp:Math.random()*1.2+.4,
    size:Math.random()*9+5,
    color:['#d32f2f','#e64a19','#f57f17','#bf360c','#ff8f00','#c62828','#8d6e63'][Math.floor(Math.random()*7)]
  });
}

function spawnSmoke(x,y){
  smoke.push({x,y,vx:(Math.random()-.5)*.1,vy:-(Math.random()*.15+.08)*SPD(),r:Math.random()*5+3,alpha:.65,life:1});
}

// ============================================================
//  SKY GRADIENT
// ============================================================
function drawSky(){
  const g=ctx.createLinearGradient(0,0,0,canvas.height);
  if(!isDay){
    g.addColorStop(0,'#010210'); g.addColorStop(1,'#0b0b26');
  } else if(isStorm()){
    g.addColorStop(0,'#171728'); g.addColorStop(1,'#263238');
  } else if(condition==='fog'){
    g.addColorStop(0,'#8a9ba8'); g.addColorStop(1,'#b0bec5');
  } else if(condition==='overcast'||condition==='cloudy'){
    g.addColorStop(0,'#455a64'); g.addColorStop(1,'#78909c');
  } else if(condition==='clear'){
    g.addColorStop(0,'#0d1b6e'); g.addColorStop(1,'#40a0f0');
  } else if(condition==='partly-cloudy'){
    g.addColorStop(0,'#1a2f8a'); g.addColorStop(1,'#5db8f5');
  } else {
    g.addColorStop(0,'#1e2a45'); g.addColorStop(1,'#37474f');
  }
  ctx.fillStyle=g;
  ctx.fillRect(0,0,canvas.width,canvas.height);
}

// ============================================================
//  SUN
// ============================================================
function drawSun(){
  if(!isDay||isRaining()||isSnowing()||condition==='fog'||condition==='overcast') return;
  const px=canvas.width*.82, py=canvas.height*.1, R=28;
  const pulse=Math.sin(frame*.025)*3;
  ctx.save(); ctx.translate(px,py);
  ctx.strokeStyle='rgba(255,235,59,.55)'; ctx.lineWidth=2;
  for(let i=0;i<12;i++){
    const a=(i/12)*Math.PI*2+frame*.012;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a)*(R+7+pulse),Math.sin(a)*(R+7+pulse));
    ctx.lineTo(Math.cos(a)*(R+20+pulse),Math.sin(a)*(R+20+pulse));
    ctx.stroke();
  }
  const gw=ctx.createRadialGradient(0,0,R*.4,0,0,R*2.8);
  gw.addColorStop(0,'rgba(255,240,80,.28)'); gw.addColorStop(1,'rgba(255,240,80,0)');
  ctx.fillStyle=gw; ctx.beginPath(); ctx.arc(0,0,R*2.8,0,Math.PI*2); ctx.fill();
  const bg=ctx.createRadialGradient(0,0,0,0,0,R);
  bg.addColorStop(0,'#fffde7'); bg.addColorStop(1,'#ffeb3b');
  ctx.fillStyle=bg; ctx.beginPath(); ctx.arc(0,0,R,0,Math.PI*2); ctx.fill();
  ctx.restore();
}

// ============================================================
//  MOON
// ============================================================
function drawMoon(){
  if(isDay) return;
  const px=canvas.width*.78, py=canvas.height*.11, R=20;
  ctx.save(); ctx.translate(px,py);
  const gw=ctx.createRadialGradient(0,0,R,0,0,R*3.2);
  gw.addColorStop(0,'rgba(255,250,220,.22)'); gw.addColorStop(1,'rgba(255,250,220,0)');
  ctx.fillStyle=gw; ctx.beginPath(); ctx.arc(0,0,R*3.2,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#fff8e1'; ctx.beginPath(); ctx.arc(0,0,R,0,Math.PI*2); ctx.fill();
  const sx=R*.38*(moonPhase>.5?1:-1);
  // BUG FIX: shadow colour was '#42a5f5' (sky blue) during day – but drawMoon()
  // is guarded by isDay check, so it only ever runs at night. The sky at night
  // is very dark (#080820). Hard-code to night colour and remove dead branch.
  ctx.fillStyle='#080820';
  ctx.beginPath(); ctx.arc(sx,0,R*.82,0,Math.PI*2); ctx.fill();
  ctx.restore();
}

// ============================================================
//  STARS
// ============================================================
function updateAndDrawStars(){
  if(isDay) return;
  stars.forEach(s=>{
    s.a+=s.spd*(s.a>.9?-1:s.a<.15?1:(Math.random()>.5?1:-1));
    s.a=Math.max(.1,Math.min(1,s.a));
    ctx.globalAlpha=s.a;
    ctx.fillStyle='#fff';
    ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2); ctx.fill();
  });
  ctx.globalAlpha=1;
}

// ============================================================
//  CLOUDS
// ============================================================
function updateAndDrawClouds(){
  clouds.forEach(c=>{ c.x+=c.spd; });
  clouds=clouds.filter(c=>c.x<canvas.width+250);
  const max=condition==='clear'?2:condition==='partly-cloudy'?5:9;
  while(clouds.length<max) spawnCloud();

  clouds.forEach(c=>{
    ctx.save(); ctx.globalAlpha=c.alpha;
    ctx.fillStyle=!isDay?'#23233a':isStorm()||isRaining()?'#546e7a':'#eceff1';
    ctx.beginPath();
    ctx.arc(c.x,         c.y,         c.h*.72, 0,Math.PI*2);
    ctx.arc(c.x+c.w*.3,  c.y-c.h*.22, c.h*.92, 0,Math.PI*2);
    ctx.arc(c.x+c.w*.63, c.y,         c.h*.68, 0,Math.PI*2);
    ctx.arc(c.x+c.w*.18, c.y+c.h*.14, c.h*.48, 0,Math.PI*2);
    ctx.arc(c.x+c.w*.48, c.y+c.h*.14, c.h*.48, 0,Math.PI*2);
    ctx.fill();
    ctx.restore();
  });
}

// ============================================================
//  AIRPLANE
// ============================================================
function updateAndDrawPlanes(){
  if(!isDay||(condition!=='clear'&&condition!=='partly-cloudy')) return;
  planes.forEach(p=>{
    p.x+=p.spd;
    p.trail.push({x:p.x,y:p.y});
    if(p.trail.length>80) p.trail.shift();
  });
  planes=planes.filter(p=>p.x<canvas.width+160);
  if(planes.length<1 && Math.random()<.0008) spawnPlane();

  planes.forEach(p=>{
    ctx.save();
    for(let i=1;i<p.trail.length;i++){
      const t=i/p.trail.length;
      ctx.globalAlpha=t*.3;
      ctx.strokeStyle='rgba(220,240,255,.9)';
      ctx.lineWidth=3.5*(1-t*.5);
      ctx.beginPath();
      ctx.moveTo(p.trail[i-1].x,p.trail[i-1].y);
      ctx.lineTo(p.trail[i].x,p.trail[i].y);
      ctx.stroke();
    }
    ctx.restore();

    ctx.save(); ctx.translate(p.x,p.y);
    ctx.fillStyle='#eceff1'; ctx.strokeStyle='#b0bec5'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.ellipse(0,0,18,4.5,0,0,Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-4,0); ctx.lineTo(-10,-13); ctx.lineTo(10,1); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-15,0); ctx.lineTo(-20,-7); ctx.lineTo(-13,0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle='#90a4ae';
    ctx.beginPath(); ctx.ellipse(-2,4,5,2,0,0,Math.PI*2); ctx.fill();
    ctx.restore();
  });
}

// ============================================================
//  TREES
// ============================================================
function drawTrees(){
  const snow = isSnowing()||(condition==='snow-grains');
  treeLayout.forEach(t=>{
    ctx.save(); ctx.globalAlpha=t.alpha;
    _drawTree(t.x, t.baseY, t.h, t.w, t.species, t.layer, snow);
    ctx.restore();
  });
}

function _drawTree(x, baseY, h, w, species, layer, snow){
  const lightBoost=layer===0?.6:layer===1?.8:1;
  const trunkH=h*.28, trunkW=Math.max(3,w*.18);
  const tc=isDay?\`rgba(\${93*lightBoost|0},\${63*lightBoost|0},\${35*lightBoost|0},1)\`:'rgba(50,33,18,1)';
  ctx.fillStyle=tc;
  ctx.fillRect(x-trunkW/2, baseY-trunkH, trunkW, trunkH);

  const leafY=baseY-trunkH;

  if(species==='pine'||species==='spruce'){
    const layers=species==='spruce'?4:3;
    for(let l=0;l<layers;l++){
      const progress=l/layers;
      const lh=h*(1-progress)*.55;
      const lw=w*(1.1-progress*.4);
      const ly=leafY - progress*h*.38;
      ctx.fillStyle=snow?_treeGreen(lightBoost,.7):_treeGreen(lightBoost,1);
      ctx.beginPath();
      ctx.moveTo(x-lw,ly); ctx.lineTo(x+lw,ly); ctx.lineTo(x,ly-lh);
      ctx.closePath(); ctx.fill();
      if(snow){
        ctx.fillStyle='rgba(230,245,255,.82)';
        ctx.beginPath();
        ctx.moveTo(x-lw*.45,ly-lh*.35); ctx.lineTo(x+lw*.45,ly-lh*.35); ctx.lineTo(x,ly-lh);
        ctx.closePath(); ctx.fill();
      }
    }
  } else if(species==='round'){
    const ry=leafY-h*.46, rx=h*.42, ryw=h*.39;
    ctx.fillStyle=_treeGreen(lightBoost,1);
    ctx.beginPath(); ctx.ellipse(x,ry,rx,ryw,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=_treeGreen(lightBoost,.78);
    ctx.beginPath(); ctx.ellipse(x-w*.18,ry+h*.06,rx*.65,ryw*.65,0,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x+w*.18,ry-h*.04,rx*.58,ryw*.58,0,0,Math.PI*2); ctx.fill();
    if(snow){
      ctx.fillStyle='rgba(230,245,255,.6)';
      ctx.beginPath(); ctx.ellipse(x,ry-ryw*.3,rx*.65,ryw*.4,0,0,Math.PI*2); ctx.fill();
    }
  } else if(species==='tall'){
    const ry=leafY-h*.55;
    ctx.fillStyle=_treeGreen(lightBoost,1);
    ctx.beginPath(); ctx.ellipse(x,ry,w*.52,h*.58,0,0,Math.PI*2); ctx.fill();
    if(snow){
      ctx.fillStyle='rgba(230,245,255,.5)';
      ctx.beginPath(); ctx.ellipse(x,ry-h*.22,w*.35,h*.18,0,0,Math.PI*2); ctx.fill();
    }
  } else if(species==='birch'){
    ctx.fillStyle=isDay?'rgba(200,190,175,1)':'rgba(120,110,100,1)';
    ctx.fillRect(x-trunkW*.55/2, baseY-h*.44, trunkW*.55, h*.44);
    ctx.fillStyle=_treeGreen(lightBoost,.88);
    ctx.beginPath(); ctx.arc(x,leafY-h*.42,w*.55,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(x-w*.28,leafY-h*.32,w*.38,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(x+w*.24,leafY-h*.35,w*.35,0,Math.PI*2); ctx.fill();
  }
}

function _treeGreen(lb, sat){
  if(!isDay) return 'rgba('+(22*lb|0)+','+(62*lb|0)+','+(22*lb|0)+','+sat+')';
  const r=(28+12*(1-sat))|0, g=(100+30*lb)|0, b=(28+12*(1-sat))|0;
  return 'rgba('+r+','+g+','+b+','+sat+')';
}

// ============================================================
//  GROUND
// ============================================================
function drawGround(){
  const hy=HY();
  const g=ctx.createLinearGradient(0,hy,0,canvas.height);
  if(isSnowing()){
    g.addColorStop(0,isDay?'#e3f2fd':'#bbdefb');
    g.addColorStop(1,isDay?'#f1f8e9':'#c8e6c9');
  } else {
    g.addColorStop(0,isDay?'#33691e':'#1b5e20');
    g.addColorStop(1,isDay?'#2e7d32':'#194d1f');
  }
  ctx.fillStyle=g;
  ctx.fillRect(0,hy,canvas.width,canvas.height-hy);
  ctx.strokeStyle=isSnowing()?'rgba(180,220,180,.3)':'rgba(76,175,80,.25)';
  ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.moveTo(0,hy); ctx.lineTo(canvas.width,hy); ctx.stroke();
}

// ============================================================
//  HOUSE
// ============================================================
function drawHouse(){
  const hy=HY();
  const cx=canvas.width/2-55*0.7, by=hy;
  const houseW=110*0.7, houseH=72*0.7;
  const roofC=isDay?'#b71c1c':isStorm()?'#4a148c':'#6a0dad';
  const wallC =isDay?'rgba(215,185,145,1)':'rgba(95,65,45,1)';
  const winC  =isDay?'#80deea':isStorm()?'#ffd54f':'#fff176';
  const doorC ='#5d4037';

  ctx.fillStyle='#4e342e';
  ctx.fillRect(cx+18, by-houseH-44, 13, 30);

  ctx.fillStyle=roofC;
  ctx.shadowColor='rgba(0,0,0,.25)'; ctx.shadowBlur=6;
  ctx.beginPath();
  ctx.moveTo(cx-14,by-houseH); ctx.lineTo(cx+houseW+14,by-houseH);
  ctx.lineTo(cx+houseW*.72,by-houseH-32); ctx.lineTo(cx+houseW*.28,by-houseH-32);
  ctx.closePath(); ctx.fill();
  ctx.shadowBlur=0;

  ctx.fillStyle=wallC;
  ctx.fillRect(cx,by-houseH,houseW,houseH);

  ctx.fillStyle=winC;
  if(!isDay||isStorm()){ ctx.shadowColor=winC; ctx.shadowBlur=10; }
  ctx.fillRect(cx+12,by-houseH+16,20,18);
  ctx.fillRect(cx+houseW-32,by-houseH+16,20,18);
  ctx.shadowBlur=0;
  ctx.strokeStyle='rgba(0,0,0,.28)'; ctx.lineWidth=1;
  [[cx+22,by-houseH+16,cx+22,by-houseH+34],[cx+12,by-houseH+25,cx+32,by-houseH+25],
   [cx+houseW-22,by-houseH+16,cx+houseW-22,by-houseH+34],[cx+houseW-32,by-houseH+25,cx+houseW-12,by-houseH+25]
  ].forEach(([x1,y1,x2,y2])=>{ ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke(); });

  const dw=18,dh=28,dx=cx+houseW/2-dw/2;
  ctx.fillStyle=doorC;
  ctx.fillRect(dx,by-dh,dw,dh);
  ctx.beginPath(); ctx.arc(dx+dw/2,by-dh,dw/2,Math.PI,0); ctx.fill();
  ctx.fillStyle='#ffd54f';
  ctx.beginPath(); ctx.arc(dx+dw-4,by-dh/2,1.8,0,Math.PI*2); ctx.fill();

  ctx.fillStyle=isDay?'#9e9e9e':'#616161';
  ctx.beginPath();
  ctx.moveTo(cx+houseW/2-10,by); ctx.lineTo(cx+houseW/2+10,by);
  ctx.lineTo(cx+houseW/2+18,hy+8); ctx.lineTo(cx+houseW/2-18,hy+8);
  ctx.closePath(); ctx.fill();

  for(let i=0;i<7;i++) drawFencePost(cx-46+i*13, by-18, isDay);
  for(let i=0;i<7;i++) drawFencePost(cx+houseW+6+i*13, by-18, isDay);
  ctx.strokeStyle=isDay?'rgba(180,155,100,.7)':'rgba(90,70,50,.7)'; ctx.lineWidth=2;
  ctx.beginPath(); ctx.moveTo(cx-46,by-14); ctx.lineTo(cx-46+6*13+4,by-14); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx+houseW+6,by-14); ctx.lineTo(cx+houseW+6+6*13+4,by-14); ctx.stroke();
}

function drawFencePost(x,y,day){
  ctx.fillStyle=day?'#e6c96a':'#8d6e63';
  ctx.fillRect(x,y,4,20);
  ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+2,y-6); ctx.lineTo(x+4,y); ctx.fill();
}

// ============================================================
//  CHIMNEY SMOKE
// ============================================================
function updateAndDrawSmoke(){
  if(isRaining()||isStorm()) return;
  smoke.forEach(s=>{ s.x+=s.vx; s.y+=s.vy; s.r+=.18; s.alpha-=.009; s.life-=.012; });
  smoke=smoke.filter(s=>s.life>0&&s.alpha>0);
  if(Math.random()<.07){
    const cx=canvas.width/2-55+18+6;
    spawnSmoke(cx+6, HY()-72-44);
  }
  smoke.forEach(s=>{
    ctx.save(); ctx.globalAlpha=s.alpha;
    ctx.fillStyle=isDay?'#90a4ae':'#546e7a';
    ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2); ctx.fill();
    ctx.restore();
  });
}

// ============================================================
//  RAIN / HAIL
// ============================================================
function updateAndDrawRain(){
  if(!isRaining()) return;
  const target=condition==='drizzle'?55:isStorm()?220:condition==='freezing-rain'?160:110;
  while(raindrops.length<target) spawnDrop(false);
  raindrops.forEach(d=>{ d.x+=d.vx; d.y+=d.vy; });
  raindrops=raindrops.filter(d=>d.y<HY()+25&&d.x>-60&&d.x<canvas.width+60);

  raindrops.forEach(d=>{
    ctx.save(); ctx.globalAlpha=d.alpha;
    if(d.isHail){
      ctx.fillStyle='rgba(200,230,255,.9)';
      ctx.beginPath(); ctx.arc(d.x,d.y,3,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='rgba(255,255,255,.6)';
      ctx.beginPath(); ctx.arc(d.x-1,d.y-1,1.2,0,Math.PI*2); ctx.fill();
    } else {
      const nx=d.x+d.vx*2.5, ny=d.y-d.len;
      ctx.strokeStyle=condition==='drizzle'?'rgba(140,200,255,.55)':'rgba(100,180,255,.8)';
      ctx.lineWidth=condition==='drizzle'?.9:1.6;
      ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(nx,ny); ctx.lineTo(d.x,d.y); ctx.stroke();
    }
    ctx.restore();
  });
}

// ============================================================
//  SNOW
// ============================================================
function updateAndDrawSnow(){
  if(!isSnowing()) return;
  const target=condition==='snow-grains'?60:140;
  while(snowflakes.length<target) spawnFlake(false);
  snowflakes.forEach(s=>{
    s.wobble+=s.wobbleSpd;
    s.x+=Math.sin(s.wobble)*s.wobbleAmp*.5+s.vx;
    s.y+=s.vy; s.angle+=s.spin;
  });
  snowflakes=snowflakes.filter(s=>s.y<HY()+12);

  snowflakes.forEach(sf=>{
    ctx.save(); ctx.globalAlpha=.9;
    ctx.translate(sf.x,sf.y); ctx.rotate(sf.angle);
    if(sf.r>=2.5){
      ctx.strokeStyle='rgba(210,235,255,.9)'; ctx.lineWidth=1;
      for(let i=0;i<6;i++){
        const a=i*Math.PI/3;
        ctx.beginPath();
        ctx.moveTo(0,0); ctx.lineTo(Math.cos(a)*sf.r*2.2,Math.sin(a)*sf.r*2.2); ctx.stroke();
      }
    }
    ctx.fillStyle='rgba(235,245,255,.95)';
    ctx.beginPath(); ctx.arc(0,0,sf.r,0,Math.PI*2); ctx.fill();
    ctx.restore();
  });
}

// ============================================================
//  THUNDERSTORM
// ============================================================
function updateAndDrawThunder(){
  if(!isStorm()) return;
  lightningFlash=Math.max(0,lightningFlash-.04);
  if(frame>=nextLightFrame){
    nextLightFrame=frame+Math.floor(Math.random()*130+50);
    lightningFlash=1;
    const lx=Math.random()*canvas.width;
    lightningBolts.push({segs:buildBolt(lx,0,HY()),life:1});
  }
  lightningBolts.forEach(b=>b.life-=.07);
  lightningBolts=lightningBolts.filter(b=>b.life>0);
  if(lightningFlash>.04){
    ctx.fillStyle=\`rgba(200,225,255,\${lightningFlash*.14})\`;
    ctx.fillRect(0,0,canvas.width,canvas.height);
  }
  lightningBolts.forEach(b=>{
    ctx.save(); ctx.globalAlpha=b.life;
    ctx.strokeStyle='#c8dcff'; ctx.lineWidth=2;
    ctx.shadowColor='#7eaaff'; ctx.shadowBlur=14;
    ctx.beginPath();
    // BUG FIX: original only moved to the first segment's x1/y1 inside the
    // forEach — the moveTo was never executed for i>0 because the ternary
    // returned void 0 (a no-op expression), never actually calling moveTo
    // for the first segment and then drawing lineTo from 0,0 for the rest.
    // Fixed: separate the initial moveTo from the lineTo loop.
    b.segs.forEach((s,i)=>{
      if(i===0) ctx.moveTo(s.x1,s.y1);
      ctx.lineTo(s.x2,s.y2);
    });
    ctx.stroke();
    ctx.restore();
  });
}
function buildBolt(x,ys,ye){
  const segs=[];let cx=x,cy=ys;
  while(cy<ye){
    const nx=cx+(Math.random()-.5)*55, ny=cy+Math.random()*38+18;
    segs.push({x1:cx,y1:cy,x2:nx,y2:ny}); cx=nx; cy=ny;
  }
  return segs;
}

// ============================================================
//  FOG
// ============================================================
function updateAndDrawFog(){
  if(condition!=='fog') return;
  fogParticles.forEach(f=>f.x+=f.spd);
  fogParticles=fogParticles.filter(f=>f.x<canvas.width+260);
  if(fogParticles.length<30&&Math.random()<.04) spawnFog(false);
  fogParticles.forEach(f=>{
    ctx.save(); ctx.globalAlpha=f.alpha;
    const g=ctx.createRadialGradient(f.x+f.w/2,f.y+f.h/2,0,f.x+f.w/2,f.y+f.h/2,f.w/2);
    g.addColorStop(0,'rgba(176,190,197,1)'); g.addColorStop(1,'rgba(176,190,197,0)');
    ctx.fillStyle=g;
    ctx.beginPath(); ctx.ellipse(f.x+f.w/2,f.y+f.h/2,f.w/2,f.h/2,0,0,Math.PI*2); ctx.fill();
    ctx.restore();
  });
}

// ============================================================
//  LEAVES
// ============================================================
function updateAndDrawLeaves(){
  if(!CFG.showLeaves||isRaining()||isSnowing()) return;
  const target=20;
  while(leaves.length<target) spawnLeaf(false);
  leaves.forEach(l=>{
    l.wobble+=.025;
    l.x+=l.vx+Math.sin(l.wobble)*l.wobbleAmp*.5;
    l.y+=l.vy; l.angle+=l.spin;
  });
  leaves=leaves.filter(l=>l.y<HY()+20&&l.x>-30&&l.x<canvas.width+30);
  while(leaves.length<target) spawnLeaf(false);

  leaves.forEach(l=>{
    ctx.save();
    ctx.translate(l.x,l.y); ctx.rotate(l.angle);
    ctx.globalAlpha=.88;
    ctx.fillStyle=l.color;
    ctx.beginPath();
    ctx.ellipse(0,0,l.size,l.size*.5,0,0,Math.PI*2);
    ctx.fill();
    ctx.strokeStyle='rgba(0,0,0,.2)'; ctx.lineWidth=.8;
    ctx.beginPath(); ctx.moveTo(-l.size*.9,0); ctx.lineTo(l.size*.9,0); ctx.stroke();
    ctx.restore();
  });
}

// ============================================================
//  BIRDS
// ============================================================
function updateAndDrawBirds(){
  if(!isDay||isRaining()||isSnowing()) return;
  birds.forEach(b=>{
    b.x+=b.spd;
    b.wing=(b.wing+b.wingSpd)%(Math.PI*2);
  });
  birds=birds.filter(b=>b.x<canvas.width+60);
  if(birds.length<5&&Math.random()<.004) spawnBird();

  birds.forEach(b=>{
    ctx.save(); ctx.translate(b.x,b.y);
    ctx.strokeStyle='rgba(55,71,79,.85)'; ctx.lineWidth=1.3; ctx.lineCap='round';
    const wy=Math.sin(b.wing)*b.size*.9;
    ctx.beginPath();
    ctx.moveTo(-b.size,wy);
    ctx.quadraticCurveTo(-b.size*.5,-b.size*.3,0,0);
    ctx.quadraticCurveTo(b.size*.5,-b.size*.3,b.size,wy);
    ctx.stroke();
    ctx.restore();
  });
}

// ============================================================
//  FIREFLIES
// ============================================================
function updateAndDrawFireflies(){
  if(isDay||temperature<=15) return;
  fireflies.forEach(f=>{
    f.x+=f.vx; f.y+=f.vy;
    f.alpha+=f.aSpd*f.aDir;
    if(f.alpha>=1||f.alpha<=0) f.aDir*=-1;
    if(f.x<0||f.x>canvas.width) f.vx*=-1;
    if(f.y<HY()*.45||f.y>HY()) f.vy*=-1;
  });
  fireflies.forEach(f=>{
    ctx.save(); ctx.globalAlpha=f.alpha;
    const g=ctx.createRadialGradient(f.x,f.y,0,f.x,f.y,f.r*5);
    g.addColorStop(0,'rgba(200,255,50,1)'); g.addColorStop(1,'rgba(200,255,50,0)');
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(f.x,f.y,f.r*5,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#ccff33'; ctx.beginPath(); ctx.arc(f.x,f.y,f.r,0,Math.PI*2); ctx.fill();
    ctx.restore();
  });
}

// ============================================================
//  HUD
// ============================================================
function updateHUD(){
  if(CFG.hideHUD){ hud.style.display='none'; return; }
  hud.style.display='block';
  if(!weatherData&&!isOffline){ hud.textContent='Weather: Loading...'; return; }
  const ct=condition.replace(/-/g,' ').replace(/\\b\\w/g,c=>c.toUpperCase());
  const t=fmtT(temperature), w=fmtW(windSpeed), p=fmtP(precipitation);
  let loc='';
  if(!CFG.hideLocation){
    const la=CFG.latitude>=0?CFG.latitude.toFixed(2)+'°N':(-CFG.latitude).toFixed(2)+'°S';
    const lo=CFG.longitude>=0?CFG.longitude.toFixed(2)+'°E':(-CFG.longitude).toFixed(2)+'°W';
    loc=\`<span>📍 \${la}, \${lo}</span>\`;
  }
  const off=isOffline?'<span class="offline">OFFLINE</span>':'';
  hud.innerHTML=\`\${off}<span>🌤 \${ct}</span><span>🌡 \${t}</span><span>💨 \${w}</span><span>🌧 \${p}</span>\${loc}\`;
}
const fmtT=v=>CFG.temperatureUnit==='fahrenheit'?(v*9/5+32).toFixed(1)+'°F':v.toFixed(1)+'°C';
const fmtW=v=>{ let r=v,u='km/h'; if(CFG.windSpeedUnit==='ms'){r=v/3.6;u='m/s';}else if(CFG.windSpeedUnit==='mph'){r=v*.621;u='mph';}else if(CFG.windSpeedUnit==='kn'){r=v*.54;u='kn';} return r.toFixed(1)+' '+u; };
const fmtP=v=>CFG.precipitationUnit==='inch'?(v/25.4).toFixed(2)+'"':v.toFixed(1)+'mm';


// ============================================================
//  HEX COLOUR HELPERS (for pixel mode sky gradient)
// ============================================================
function hexR(h){ return parseInt(h.slice(1,3),16); }
function hexG(h){ return parseInt(h.slice(3,5),16); }
function hexB(h){ return parseInt(h.slice(5,7),16); }
function lerp(a,b,t){ return a+(b-a)*t; }

// ============================================================
//  PIXEL MODE – Particle Init
// ============================================================
function px_initParticles(){
  // Re-populate particle arrays for pixel-mode coordinate space (300×100).
  // initScene() already ran with pixel canvas dims, but counts & sizes need
  // tuning for the low-res grid.
  const W=canvas.width, H=canvas.height, hy=Math.floor(HY());

  // Stars
  stars=[];
  if(!isDay){
    const count=Math.floor(W*hy/120);
    for(let i=0;i<count;i++) stars.push({
      x:Math.floor(Math.random()*W),
      y:Math.floor(Math.random()*hy*.85),
      r:1, a:Math.random(), spd:Math.random()*.04+.01
    });
  }

  // Clouds
  clouds=[];
  const nc=condition==='clear'?1:condition==='partly-cloudy'?3:condition==='overcast'?6:4;
  for(let i=0;i<nc;i++) clouds.push({
    x:Math.floor(Math.random()*W),
    y:Math.floor(Math.random()*hy*.25)+3,
    w:Math.floor(Math.random()*16+10),
    h:Math.floor(Math.random()*4+3),
    spd:(Math.random()*.12+.03)*SPD(),
    alpha:1
  });

  // Rain
  raindrops=[];
  if(isRaining()){
    const n=condition==='drizzle'?Math.floor(W/15):isStorm()?Math.floor(W/5):Math.floor(W/8);
    for(let i=0;i<n;i++) raindrops.push({
      x:Math.random()*W,
      y:Math.random()*hy,
      vx:((windDirection%360)<180?1:-1)*(windSpeed/80),
      vy:(Math.random()*1.5+1)*SPD(),
      len:1, alpha:1,
      isHail:condition==='thunderstorm-hail'||condition==='freezing-rain'
    });
  }

  // Snow
  snowflakes=[];
  if(isSnowing()){
    const n=condition==='snow-grains'?Math.floor(W/15):Math.floor(W/8);
    for(let i=0;i<n;i++) snowflakes.push({
      x:Math.random()*W, y:Math.random()*hy,
      r:1, vy:(Math.random()*.4+.15)*SPD(),
      vx:(Math.random()-.5)*.25,
      wobble:Math.random()*Math.PI*2,
      wobbleSpd:Math.random()*.04+.01,
      wobbleAmp:Math.random()*.6+.2,
      angle:0, spin:0
    });
  }

  // Fog
  fogParticles=[];
  if(condition==='fog'){
    for(let i=0;i<15;i++) fogParticles.push({
      x:Math.random()*W,
      y:hy-Math.floor(Math.random()*15),
      w:Math.random()*20+8, h:Math.random()*4+2,
      spd:(Math.random()*.15+.03)*SPD(), alpha:.35
    });
  }

  // Fireflies
  fireflies=[];
  if(!isDay&&temperature>15&&(condition==='clear'||condition==='partly-cloudy')){
    const fc=Math.max(3,Math.floor(W/40));
    for(let i=0;i<fc;i++) fireflies.push({
      x:Math.random()*W,
      y:hy*.55+Math.random()*hy*.35,
      vx:(Math.random()-.5)*.25,
      vy:(Math.random()-.5)*.15,
      alpha:Math.random(),
      aDir:Math.random()>.5?1:-1,
      aSpd:Math.random()*.03+.008,
      r:1
    });
  }

  // Leaves
  leaves=[];
  if(CFG.showLeaves&&!isRaining()&&!isSnowing()){
    const lc=Math.max(5,Math.floor(W/40));
    for(let i=0;i<lc;i++) leaves.push({
      x:Math.random()*W, y:Math.random()*hy,
      vy:(Math.random()*.12+.06)*SPD()*0.5,
      vx:(Math.random()-.5)*.15,
      angle:0, spin:0,
      wobble:Math.random()*Math.PI*2,
      wobbleAmp:.2, size:1,
      color:['#d32f2f','#e64a19','#f57f17','#bf360c','#ff8f00'][Math.floor(Math.random()*5)]
    });
  }


  // Smoke, lightning
  smoke=[]; lightningBolts=[]; lightningFlash=0;

  // Trees – pixel-proportioned
  treeLayout=[];
  const farCount=Math.max(3,Math.floor(W/70));
  for(let i=0;i<farCount;i++){
    treeLayout.push({
      layer:0,
      x:(i+Math.random()*.6)*W/farCount+Math.random()*4-2,
      baseY:hy-1,
      h:Math.random()*7+5, w:Math.random()*4+3,
      species:TREE_SPECIES[Math.floor(Math.random()*TREE_SPECIES.length)],
      alpha:Math.random()*.2+.15
    });
  }
  const midCount=Math.max(4,Math.floor(W/55));
  for(let i=0;i<midCount;i++){
    const lb=W*.33, rs=W*.67;
    const x=Math.random()<.5?Math.random()*lb:rs+Math.random()*(W-rs);
    treeLayout.push({
      layer:1, x, baseY:hy-1,
      h:Math.random()*10+6, w:Math.random()*6+3,
      species:TREE_SPECIES[Math.floor(Math.random()*TREE_SPECIES.length)],
      alpha:Math.random()*.2+.55
    });
  }
  const nearX=[
    ...Array.from({length:2},(_,i)=>W*.03+i*W*.12+Math.random()*4),
    ...Array.from({length:2},(_,i)=>W*.74+i*W*.1+Math.random()*4)
  ];
  nearX.forEach(x=>{
    treeLayout.push({
      layer:2, x, baseY:hy,
      h:Math.random()*12+9, w:Math.random()*7+5,
      species:TREE_SPECIES[Math.floor(Math.random()*TREE_SPECIES.length)],
      alpha:1
    });
  });
  treeLayout.sort((a,b)=>a.layer-b.layer);
}

// ============================================================
//  PIXEL MODE – Render
// ============================================================
function renderPixelMode(){
  updatePhysics();
  const W=canvas.width, H=canvas.height, hy=Math.floor(HY());

  // --- Background ---
  px_sky(W,H);
  if(!isDay){ px_stars(); px_moon(W); }
  if(isDay&&!isRaining()&&!isSnowing()&&condition!=='fog'&&condition!=='overcast') px_sun(W);
  px_clouds();
  if(isDay&&!isRaining()&&!isSnowing()&&condition!=='fog') px_birds();
  if(isDay&&(condition==='clear'||condition==='partly-cloudy')) px_planes();
  if(!isDay&&temperature>15) px_fireflies();

  // --- Scene ---
  px_ground(W,H,hy);
  px_trees(hy);
  px_house(W,hy);

  // --- Chimney smoke ---
  if(!isRaining()&&!isStorm()) px_smoke();

  // --- Foreground ---
  if(isStorm()){ px_rain(); px_lightning(W,H); }
  else if(isRaining()) px_rain();
  else if(isSnowing()) px_snow();
  if(condition==='fog') px_fog(W);
  if(CFG.showLeaves&&!isRaining()&&!isSnowing()) px_leaves();

  updateHUD();
}

// ----- Pixel-mode draw helpers -----

// Sky gradient
function px_sky(W,H){
  let t0,t1;
  if(!isDay)                                      { t0='#010210'; t1='#0b0b26'; }
  else if(isStorm())                              { t0='#171728'; t1='#263238'; }
  else if(condition==='fog')                      { t0='#8a9ba8'; t1='#b0bec5'; }
  else if(condition==='overcast'||condition==='cloudy'){ t0='#455a64'; t1='#78909c'; }
  else if(condition==='clear')                    { t0='#0d1b6e'; t1='#40a0f0'; }
  else if(condition==='partly-cloudy')            { t0='#1a2f8a'; t1='#5db8f5'; }
  else                                            { t0='#1e2a45'; t1='#37474f'; }
  const r0=hexR(t0),g0=hexG(t0),b0=hexB(t0);
  const r1=hexR(t1),g1=hexG(t1),b1=hexB(t1);
  for(let y=0;y<H;y++){
    const t=y/H;
    ctx.fillStyle='rgb('+(lerp(r0,r1,t)|0)+','+(lerp(g0,g1,t)|0)+','+(lerp(b0,b1,t)|0)+')';
    ctx.fillRect(0,y,W,1);
  }
}

// Stars
function px_stars(){
  stars.forEach(s=>{
    ctx.globalAlpha=s.a;
    ctx.fillStyle=s.a>.6?'#ffffff':'#888888';
    ctx.fillRect(Math.floor(s.x),Math.floor(s.y),1,1);
  });
  ctx.globalAlpha=1;
}

// Moon
function px_moon(W){
  const mx=Math.floor(W*.78), my=Math.floor(canvas.height*.12), R=3;
  // Moon body
  ctx.fillStyle='#fff8e1';
  for(let dy=-R;dy<=R;dy++) for(let dx=-R;dx<=R;dx++){
    if(dx*dx+dy*dy<=R*R) ctx.fillRect(mx+dx,my+dy,1,1);
  }
  const sx=Math.floor(R*.45*(moonPhase>.5?1:-1));
  const sR=Math.floor(R*.75);
  ctx.fillStyle='#080820';
  for(let dy=-sR;dy<=sR;dy++) for(let dx=-sR;dx<=sR;dx++){
    if(dx*dx+dy*dy<=sR*sR) ctx.fillRect(mx+sx+dx,my+dy,1,1);
  }
}

// Sun
function px_sun(W){
  const sx=Math.floor(W*.82), sy=Math.floor(canvas.height*.1), R=3;
  // Body
  ctx.fillStyle='#ffeb3b';
  for(let dy=-R;dy<=R;dy++) for(let dx=-R;dx<=R;dx++){
    if(dx*dx+dy*dy<=R*R) ctx.fillRect(sx+dx,sy+dy,1,1);
  }
  const p=Math.floor(frame/15)%2;
  ctx.fillStyle='rgba(255,235,59,.7)';
  const rl=R+1+p;
  // Cardinal rays
  for(let i=R+1;i<=rl;i++){
    ctx.fillRect(sx+i,sy,1,1); ctx.fillRect(sx-i,sy,1,1);
    ctx.fillRect(sx,sy+i,1,1); ctx.fillRect(sx,sy-i,1,1);
  }
  // Diagonal rays
  for(let i=1;i<=rl-R;i++){
    const d=R+i;
    const diag=Math.round(d*.71);
    ctx.fillRect(sx+diag,sy-diag,1,1); ctx.fillRect(sx-diag,sy-diag,1,1);
    ctx.fillRect(sx+diag,sy+diag,1,1); ctx.fillRect(sx-diag,sy+diag,1,1);
  }
}

// Clouds
function px_clouds(){
  clouds.forEach(c=>{
    ctx.fillStyle=!isDay?'#23233a':isStorm()||isRaining()?'#546e7a':'#eceff1';
    const cx_=Math.floor(c.x), cy_=Math.floor(c.y);
    const hw=Math.min(Math.floor(c.w/2),10);
    const hh=Math.min(Math.floor(c.h/2),3);
    if(hw<1||hh<1) return;
    // Main body ellipse
    for(let dy=-hh;dy<=hh;dy++) for(let dx=-hw;dx<=hw;dx++){
      if((dx*dx)/(hw*hw)+(dy*dy)/(hh*hh)<=1) ctx.fillRect(cx_+dx,cy_+dy,1,1);
    }
    const bw=Math.max(1,Math.floor(hw*.6));
    const bh=Math.max(1,hh-1);
    if(bh>0) for(let dy=-bh;dy<=bh;dy++) for(let dx=-bw;dx<=bw;dx++){
      if((dx*dx)/(bw*bw)+(dy*dy)/(bh*bh)<=1)
        ctx.fillRect(cx_+Math.floor(hw*.4)+dx,cy_-hh+dy,1,1);
    }
  });
}

// Birds
function px_birds(){
  birds.forEach(b=>{
    const bx=Math.floor(b.x), by=Math.floor(b.y);
    if(bx<0||by<0||bx>=canvas.width||by>=canvas.height) return;
    const up=Math.sin(b.wing)>0;
    ctx.fillStyle='#37474f';
    ctx.fillRect(bx,by,1,1);
    if(up){ ctx.fillRect(bx-1,by-1,1,1); ctx.fillRect(bx+1,by-1,1,1); }
    else  { ctx.fillRect(bx-1,by,1,1);   ctx.fillRect(bx+1,by,1,1); }
  });
}

// Airplane
function px_planes(){
  planes.forEach(p=>{
    const px_=Math.floor(p.x), py_=Math.floor(p.y);
    if(px_<0||py_<0) return;
    // Contrail
    ctx.fillStyle='rgba(220,240,255,.4)';
    for(let i=1;i<=Math.min(8,px_);i++) ctx.fillRect(px_-i,py_,1,1);
    ctx.fillStyle='#eceff1';
    ctx.fillRect(px_,py_,2,1);
    ctx.fillRect(px_-1,py_-1,1,1);
    ctx.fillRect(px_+1,py_+1,1,1);
  });
}

// Fireflies
function px_fireflies(){
  fireflies.forEach(f=>{
    const fx=Math.floor(f.x), fy=Math.floor(f.y);
    if(fx<0||fy<0||fx>=canvas.width||fy>=canvas.height) return;
    if(f.alpha<.15) return;
    ctx.globalAlpha=f.alpha;
    ctx.fillStyle=f.alpha>.65?'#ccff33':f.alpha>.35?'#c8ff64':'#9aaa64';
    ctx.fillRect(fx,fy,1,1);
  });
  ctx.globalAlpha=1;
}

// Ground
function px_ground(W,H,hy){
  const groundH=H-hy;
  // Snow-covered variant
  if(isSnowing()||condition==='snow-grains'){
    ctx.fillStyle=isDay?'#e3f2fd':'#bbdefb';
    ctx.fillRect(0,hy,W,1);
    ctx.fillStyle=isDay?'#f1f8e9':'#c8e6c9';
    ctx.fillRect(0,hy+1,W,groundH-1);
    return;
  }
  // Soil base
  ctx.fillStyle=isDay?'#036510':'#023107';
  ctx.fillRect(0,hy+1,W,groundH-1);
  // Top grass row pixel-by-pixel
  const grass=isDay?['#388e3c','#2e7d32']:['#1b5e20','#003200'];
  const flowers=isDay?['#e91e63','#f44336','#00bcd4','#ffeb3b']:['#880e4f','#b71c1c','#1565c0','#f9a825'];
  for(let x=0;x<W;x++){
    const r=((x^0x5DEECE6)>>>0)%100;
    ctx.fillStyle=r<5?flowers[x%flowers.length]:r<15?grass[1]:grass[0];
    ctx.fillRect(x,hy,1,1);
  }
  // Sparse soil texture
  ctx.fillStyle=isDay?'#795548':'#4e342e';
  for(let y=1;y<Math.min(groundH,6);y++){
    for(let x=0;x<W;x+=3){
      if((((x^0x5DEECE6)*((y^0xB)+1))>>>0)%100<12) ctx.fillRect(x,hy+y,1,1);
    }
  }
}

// Trees
function px_trees(hy){
  treeLayout.forEach(t=>{
    const tx=Math.floor(t.x), tby=Math.floor(t.baseY);
    const th=Math.max(2,Math.floor(t.h));
    const tw=Math.max(1,Math.floor(t.w));
    const trunkW=Math.max(1,Math.round(tw*0.25));
    ctx.globalAlpha=t.alpha;
    const trH=Math.max(1,Math.floor(th*.3));
    ctx.fillStyle=isDay?'#5d3f23':'#322112';
    ctx.fillRect(tx-Math.floor(trunkW/2),tby-trH,trunkW,trH);
    // Canopy
    const cy=tby-trH;
    ctx.fillStyle=isDay?'#2e7d32':'#1b3e20';
    if(t.species==='pine'||t.species==='spruce'){
      const ch=Math.max(2,Math.floor(th*.55));
      for(let r=0;r<ch;r++){
        const rw=Math.max(1,Math.floor(tw*(r+1)/ch));
        ctx.fillRect(tx-Math.floor(rw/2),cy-ch+r,rw,1);
      }
    } else {
      const cr=Math.max(1,Math.floor(Math.min(tw,th*.4)/2));
      for(let dy=-cr;dy<=cr;dy++) for(let dx=-cr;dx<=cr;dx++){
        if(dx*dx+dy*dy<=cr*cr) ctx.fillRect(tx+dx,cy-cr+dy,1,1);
      }
    }
    // Snow cap
    if(isSnowing()){
      ctx.fillStyle='rgba(230,245,255,.75)';
      const cw=Math.max(1,Math.floor(tw*.5));
      ctx.fillRect(tx-Math.floor(cw/2),cy-Math.floor(th*.45),cw,1);
    }
  });
  ctx.globalAlpha=1;
}

// House
function px_house(W,hy){
  const scale=1.4;
  const hw=24*scale, hh=12*scale, hx=Math.floor(W/2-hw/2), wy=hy-hh;
  const roofC=isDay?'#b71c1c':isStorm()?'#4a148c':'#6a0dad';
  const wallC=isDay?'#d7b991':'#5f412d';
  const winC =isDay?'#80deea':isStorm()?'#ffd54f':'#fff176';

  // Chimney
  ctx.fillStyle='#4e342e';
  ctx.fillRect(hx+6*scale,wy-12*scale,3*scale,7*scale);


  // Walls
  ctx.fillStyle=wallC;
  ctx.fillRect(hx,wy,hw,hh);

  // Roof trapezoid
  ctx.fillStyle=roofC;
  for(let r=0;r<7;r++){
    const rw=Math.floor((hw+9)-(6-r)*2.4*scale);
    ctx.fillRect(hx+Math.floor(hw/2)-Math.floor(rw/2),wy-5*scale+r,rw,1);
  }

  // Windows
  if(!isDay||isStorm()){
    ctx.globalAlpha=.25; ctx.fillStyle=winC;
    ctx.fillRect(hx+4*scale,wy+2*scale,5*scale,5*scale); ctx.fillRect(hx+11*scale,wy+2*scale,5*scale,5*scale);
    ctx.fillRect(hx+hw-16*scale,wy+2*scale,5*scale,5*scale); ctx.fillRect(hx+hw-9*scale,wy+2*scale,5*scale,5*scale);
    ctx.globalAlpha=1;
  }

  ctx.fillStyle=winC;
  ctx.fillRect(hx+5*scale,wy+3*scale,3*scale,3*scale);
  ctx.fillRect(hx+12*scale,wy+3*scale,3*scale,3*scale);
  ctx.fillRect(hx+hw-15*scale,wy+3*scale,3*scale,3*scale);
  ctx.fillRect(hx+hw-8*scale,wy+3*scale,3*scale,3*scale);

  // Door
  const dx=hx+Math.floor(hw/2)-2*scale;
  ctx.fillStyle='#5d4037'; ctx.fillRect(dx,wy+hh-6*scale,4*scale,6*scale);
  ctx.fillStyle='#ffd54f'; ctx.fillRect(dx+3*scale,wy+hh-4*scale,1,1); // knob

  // Path
  ctx.fillStyle=isDay?'#9e9e9e':'#616161';
  ctx.fillRect(dx-1,hy,6*scale,3*scale);

  // Fences
  ctx.fillStyle=isDay?'#e6c96a':'#8d6e63';
  for(let i=0;i<7;i++) ctx.fillRect(hx-21*scale+i*3*scale,hy-4*scale,1,4*scale);
  ctx.fillRect(hx-21*scale,hy-3*scale,21*scale,1);
  for(let i=0;i<7;i++) ctx.fillRect(hx+hw+3*scale+i*3*scale,hy-4*scale,1,4*scale);
  ctx.fillRect(hx+hw+2*scale,hy-3*scale,21*scale,1);

  const mbx=hx-24*scale;
  if(mbx>0){
    ctx.fillStyle=isDay?'#1565c0':'#0d47a1';
    ctx.fillRect(mbx,hy-4*scale,3*scale,2*scale);
    ctx.fillRect(mbx+1,hy-2*scale,1,2*scale);
  }
}

// Chimney smoke
function px_smoke(){
  smoke.forEach(s=>{
    const sx=Math.floor(s.x), sy=Math.floor(s.y);
    if(sx<0||sy<0||sx>=canvas.width||sy>=canvas.height) return;
    ctx.globalAlpha=Math.max(0,s.alpha);
    ctx.fillStyle=s.life>.7?'#e0e0e0':s.life>.4?'#90a4ae':'#546e7a';
    ctx.fillRect(sx,sy,1,1);
  });
  ctx.globalAlpha=1;
}

// Rain
function px_rain(){
  raindrops.forEach(d=>{
    const rx=Math.floor(d.x), ry=Math.floor(d.y);
    if(rx<0||ry<0||rx>=canvas.width||ry>=canvas.height) return;
    if(d.isHail){
      ctx.fillStyle='rgba(200,230,255,.9)'; ctx.fillRect(rx,ry,1,1);
    } else {
      ctx.fillStyle=condition==='drizzle'?'#8ec8ff':'#64b5f6';
      ctx.fillRect(rx,ry,1,1);
      if(ry>0&&condition!=='drizzle') ctx.fillRect(rx,ry-1,1,1);
    }
  });
}

// Snow
function px_snow(){
  snowflakes.forEach(sf=>{
    const sx=Math.floor(sf.x), sy=Math.floor(sf.y);
    if(sx<0||sy<0||sx>=canvas.width||sy>=canvas.height) return;
    ctx.fillStyle='#ebf5ff'; ctx.fillRect(sx,sy,1,1);
  });
}

// Lightning
function px_lightning(W,H){
  if(lightningFlash>.04){
    ctx.globalAlpha=lightningFlash*.18;
    ctx.fillStyle='#c8e1ff'; ctx.fillRect(0,0,W,H);
    ctx.globalAlpha=1;
  }
  lightningBolts.forEach(b=>{
    ctx.globalAlpha=b.life; ctx.fillStyle='#c8dcff';
    b.segs.forEach(s=>{
      // Bresenham-like pixel line
      const sdx=s.x2-s.x1, sdy=s.y2-s.y1;
      const steps=Math.max(Math.abs(sdx|0),Math.abs(sdy|0),1);
      for(let i=0;i<=steps;i++){
        const t=i/steps;
        ctx.fillRect(Math.floor(s.x1+sdx*t),Math.floor(s.y1+sdy*t),1,1);
      }
    });
  });
  ctx.globalAlpha=1;
}

// Fog
function px_fog(W){
  fogParticles.forEach(f=>{
    ctx.globalAlpha=f.alpha; ctx.fillStyle='#b0bec5';
    const fx=Math.floor(f.x), fy=Math.floor(f.y);
    const fw=Math.min(Math.floor(f.w),16), fh=Math.min(Math.floor(f.h),4);
    for(let dy=0;dy<fh;dy++) for(let dx=0;dx<fw;dx+=2){
      if(fx+dx>=0&&fx+dx<W&&fy+dy>=0&&fy+dy<canvas.height)
        ctx.fillRect(fx+dx,fy+dy,1,1);
    }
  });
  ctx.globalAlpha=1;
}

// Leaves
function px_leaves(){
  leaves.forEach(l=>{
    const lx=Math.floor(l.x), ly=Math.floor(l.y);
    if(lx<0||ly<0||lx>=canvas.width||ly>=canvas.height) return;
    ctx.fillStyle=l.color; ctx.fillRect(lx,ly,1,1);
  });
}

// ============================================================
//  WEATHER FETCH
// ============================================================
const WMO={0:'clear',1:'clear',2:'partly-cloudy',3:'overcast',45:'fog',48:'fog',51:'drizzle',53:'drizzle',55:'drizzle',61:'rain',63:'rain',65:'rain',66:'freezing-rain',67:'freezing-rain',71:'snow',73:'snow',75:'snow',77:'snow-grains',80:'rain-showers',81:'rain-showers',82:'rain-showers',85:'snow-showers',86:'snow-showers',95:'thunderstorm',96:'thunderstorm-hail',99:'thunderstorm-hail'};

async function fetchWeather(){
  let lat=CFG.latitude, lon=CFG.longitude;

  // Handle location based on mode
  if(CFG.locationMode==='manual' && CFG.manualLocation){
    // Geocode manual location (town name or postcode)
    try{
      const geocodeUrl=\`https://nominatim.openstreetmap.org/search?q=\${encodeURIComponent(CFG.manualLocation)}&format=json&limit=1\`;
      const gRes=await fetch(geocodeUrl);
      const gData=await gRes.json();
      if(gData && gData.length>0){
        lat=parseFloat(gData[0].lat);
        lon=parseFloat(gData[0].lon);
        CFG.latitude=lat;
        CFG.longitude=lon;
      }
    }catch(e){
      console.error('Geocoding failed:', e);
    }
  } else if(CFG.autoLocation){
    // Auto-detect location from IP
    try{
      const g=await fetch('https://ipinfo.io/json').then(r=>r.json());
      if(g&&g.loc){const pts=g.loc.split(',');lat=parseFloat(pts[0]);lon=parseFloat(pts[1]);CFG.latitude=lat;CFG.longitude=lon;}
    }catch(e){}
  }

  const url=\`https://api.open-meteo.com/v1/forecast?latitude=\${lat}&longitude=\${lon}&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,wind_speed_10m,wind_direction_10m,cloud_cover,surface_pressure,is_day,weather_code&forecast_days=1&timezone=auto\`;
  const r=await fetch(url); if(!r.ok) throw new Error('api');
  const d=await r.json(); const c=d.current;
  weatherData=c; isOffline=false;
  temperature=c.temperature_2m; precipitation=c.precipitation;
  windSpeed=c.wind_speed_10m; windDirection=c.wind_direction_10m;
  isDay=c.is_day===1; condition=WMO[c.weather_code]??'cloudy';
  initScene(); if(CFG.pixelMode) px_initParticles(); hideLoad(); updateHUD();
}

function applySimulate(cond,night){
  condition=cond??condition; isDay=!night;
  temperature=20; precipitation=isRaining()?2.5:0;
  windSpeed=isStorm()?45:10; windDirection=225;
  weatherData={sim:true}; initScene(); if(CFG.pixelMode) px_initParticles(); hideLoad(); updateHUD();
}

function offlineWeather(){
  isOffline=true;
  const h=new Date().getHours(); isDay=h>=6&&h<18;
  condition=['clear','partly-cloudy','cloudy','rain'][Math.floor(Math.random()*4)];
  temperature=14+Math.random()*11; precipitation=isRaining()?2:0;
  windSpeed=7+Math.random()*8; windDirection=Math.random()*360;
  weatherData={offline:true}; initScene(); if(CFG.pixelMode) px_initParticles(); hideLoad(); updateHUD();
}

function hideLoad(){ load.classList.add('gone'); }

// ============================================================
//  MAIN LOOP
// ============================================================
let _lastW=0, _lastH=0, _lastPixelMode=CFG.pixelMode;
function loop(){
  frame++;

  const cw = canvas.offsetWidth  || canvas.clientWidth  || 0;
  const ch = canvas.offsetHeight || canvas.clientHeight || 0;
  if(cw < 2 || ch < 2){ requestAnimationFrame(loop); return; }

  // Handle pixelMode toggle (resize + scene rebuild)
  if(CFG.pixelMode !== _lastPixelMode){
    _lastPixelMode = CFG.pixelMode;
    resize();
    _lastW = canvas.width; _lastH = canvas.height;
    if(weatherData){
      initScene();
      if(CFG.pixelMode) px_initParticles();
    }
  }

  if(CFG.pixelMode){
    // Detect viewport aspect-ratio changes and resize the pixel buffer
    const cssW = canvas.offsetWidth  || canvas.clientWidth  || 0;
    const cssH = canvas.offsetHeight || canvas.clientHeight || 0;
    const needW = Math.max(80, Math.round(PIXEL_H * (cssW / (cssH||1))));
    if(canvas.width !== needW){
      canvas.width  = needW;
      canvas.height = PIXEL_H;
      _lastW = needW; _lastH = PIXEL_H;
      if(weatherData){ initScene(); px_initParticles(); }
    }
    ctx.clearRect(0,0,canvas.width,canvas.height);
    // Stars still need twinkle update (shared array, pixel coords already correct)
    if(!isDay) stars.forEach(s=>{
      s.a+=s.spd*(s.a>.9?-1:s.a<.15?1:(Math.random()>.5?1:-1));
      s.a=Math.max(.1,Math.min(1,s.a));
    });
    renderPixelMode();
  } else {
    if(cw !== _lastW || ch !== _lastH){
      _lastW = cw; _lastH = ch;
      canvas.width = cw; canvas.height = ch;
      if(weatherData) initScene();
    }
    ctx.clearRect(0,0,canvas.width,canvas.height);
    drawScene();
  }

  requestAnimationFrame(loop);
}

// Physics-only update (no drawing) — used by pixel mode so particles
// still move correctly through the low-res coordinate space.
function updatePhysics(){
  // clouds
  clouds.forEach(c=>{ c.x+=c.spd; });
  clouds=clouds.filter(c=>c.x<canvas.width+250);
  const maxC=condition==='clear'?2:condition==='partly-cloudy'?5:9;
  while(clouds.length<maxC) spawnCloud();

  // rain
  if(isRaining()){
    const target=condition==='drizzle'?20:isStorm()?60:40;
    while(raindrops.length<target) spawnDrop(false);
    raindrops.forEach(d=>{ d.x+=d.vx; d.y+=d.vy; });
    raindrops=raindrops.filter(d=>d.y<HY()+25&&d.x>-10&&d.x<canvas.width+10);
  }

  // snow
  if(isSnowing()){
    const target=condition==='snow-grains'?20:40;
    while(snowflakes.length<target) spawnFlake(false);
    snowflakes.forEach(s=>{
      s.wobble+=s.wobbleSpd;
      s.x+=Math.sin(s.wobble)*s.wobbleAmp*.5+s.vx;
      s.y+=s.vy; s.angle+=s.spin;
    });
    snowflakes=snowflakes.filter(s=>s.y<HY()+5);
  }

  // lightning
  if(isStorm()){
    lightningFlash=Math.max(0,lightningFlash-.04);
    if(frame>=nextLightFrame){
      nextLightFrame=frame+Math.floor(Math.random()*130+50);
      lightningFlash=1;
      lightningBolts.push({segs:buildBolt(Math.random()*canvas.width,0,HY()),life:1});
    }
    lightningBolts.forEach(b=>b.life-=.07);
    lightningBolts=lightningBolts.filter(b=>b.life>0);
  }

  // fireflies
  if(!isDay && temperature>15){
    fireflies.forEach(f=>{
      f.x+=f.vx; f.y+=f.vy;
      f.alpha+=f.aSpd*f.aDir;
      if(f.alpha>=1||f.alpha<=0) f.aDir*=-1;
      if(f.x<0||f.x>canvas.width) f.vx*=-1;
      if(f.y<HY()*.45||f.y>HY()) f.vy*=-1;
    });
  }

  // smoke
  smoke.forEach(s=>{ s.x+=s.vx; s.y+=s.vy; s.r+=.18; s.alpha-=.009; s.life-=.012; });
  smoke=smoke.filter(s=>s.life>0&&s.alpha>0);
  if(!isRaining()&&!isStorm()&&Math.random()<.07){
    const cx2=canvas.width/2-12+5+3;
    spawnSmoke(cx2, HY()-16-11);
  }

  // leaves
  if(CFG.showLeaves && !isRaining() && !isSnowing()){
    const target=10;
    while(leaves.length<target) spawnLeaf(false);
    leaves.forEach(l=>{
      l.wobble+=.025;
      l.x+=l.vx+Math.sin(l.wobble)*l.wobbleAmp*.5;
      l.y+=l.vy; l.angle+=l.spin;
    });
    leaves=leaves.filter(l=>l.y<HY()+5&&l.x>-5&&l.x<canvas.width+5);
    while(leaves.length<target) spawnLeaf(false);
  }

  // birds
  if(isDay&&!isRaining()&&!isSnowing()){
    birds.forEach(b=>{
      b.x+=b.spd;
      b.wing=(b.wing+b.wingSpd)%(Math.PI*2);
    });
    birds=birds.filter(b=>b.x<canvas.width+60);
    if(birds.length<5&&Math.random()<.004) spawnBird();
  }

  // airplanes
  if(isDay&&(condition==='clear'||condition==='partly-cloudy')){
    planes.forEach(p=>{
      p.x+=p.spd;
      p.trail.push({x:p.x,y:p.y});
      if(p.trail.length>80) p.trail.shift();
    });
    planes=planes.filter(p=>p.x<canvas.width+160);
    if(planes.length<1 && Math.random()<.0008) spawnPlane();
  }

  // stars twinkle
  if(!isDay){
    stars.forEach(s=>{
      s.a+=s.spd*(s.a>.9?-1:s.a<.15?1:(Math.random()>.5?1:-1));
      s.a=Math.max(.1,Math.min(1,s.a));
    });
  }
}

// Full smooth-canvas draw pass
function drawScene(){
  drawSky();
  updateAndDrawStars();
  drawMoon();
  drawSun();
  updateAndDrawClouds();
  updateAndDrawPlanes();
  updateAndDrawBirds();
  drawTrees();
  drawGround();
  updateAndDrawSmoke();
  drawHouse();
  updateAndDrawRain();
  updateAndDrawSnow();
  updateAndDrawThunder();
  updateAndDrawFog();
  updateAndDrawFireflies();
  updateAndDrawLeaves();
  updateHUD();
}

// ============================================================
//  VS CODE BRIDGE
// ============================================================
const vscodeApi = acquireVsCodeApi();
window.addEventListener('message', e=>{
  const m=e.data;
  if(m.command==='refreshWeather') fetchWeather().catch(offlineWeather);
  else if(m.command==='simulate')  applySimulate(m.condition,m.night);
  else if(m.command==='updateConfig'){
    const wasPixel=CFG.pixelMode;
    CFG=m.config;
    // If pixel mode changed, loop() handles resize on next tick.
    // Otherwise rebuild trees and HUD immediately.
    if(!CFG.pixelMode){ buildTrees(); }
    updateHUD();
  }
});

// ============================================================
//  BOOT
// ============================================================
loop();
if(SIM.condition) applySimulate(SIM.condition,SIM.night);
else fetchWeather().catch(offlineWeather);
setInterval(()=>{ if(!SIM.condition) fetchWeather().catch(()=>{ isOffline=true; updateHUD(); }); }, 5*60*1000);
</script>
</body>
</html>`
}
