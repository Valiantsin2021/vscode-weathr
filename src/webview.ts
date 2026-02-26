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
  #canvas{display:block;width:100%;height:100%;cursor:crosshair}
  #canvas.pixel-mode{image-rendering:pixelated;image-rendering:crisp-edges}
  #canvas.dragging{cursor:grab}

  /* HUD */
  #hud{position:absolute;bottom:0;left:0;right:0;padding:5px 10px;background:rgba(0,0,0,0.58);color:#00e5ff;font-size:10px;letter-spacing:.04em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border-top:1px solid rgba(0,229,255,0.2);backdrop-filter:blur(4px);transition:opacity .3s}
  #hud span{opacity:.75;margin-right:9px}
  #hud .offline{color:#ff5252;font-weight:bold;margin-right:8px}

  /* Loading overlay */
  #load{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;background:#0a0a1a;color:#00e5ff;font-size:13px;transition:opacity .5s}
  #load.gone{opacity:0;pointer-events:none}
  .spin{width:30px;height:30px;border:3px solid rgba(0,229,255,.2);border-top-color:#00e5ff;border-radius:50%;animation:sp .8s linear infinite}
  @keyframes sp{to{transform:rotate(360deg)}}

  /* Tooltip */
  #tooltip{
    position:absolute;pointer-events:none;background:rgba(0,0,0,.82);border:1px solid rgba(0,229,255,.35);
    color:#00e5ff;font-size:10px;padding:7px 10px;border-radius:4px;backdrop-filter:blur(6px);
    opacity:0;transition:opacity .15s;white-space:nowrap;max-width:200px;line-height:1.6;
    box-shadow:0 2px 12px rgba(0,229,255,.15);z-index:20
  }
  #tooltip.vis{opacity:1}
  #tooltip .tt-title{font-size:11px;font-weight:bold;margin-bottom:3px;color:#fff;letter-spacing:.05em}
  #tooltip .tt-row{display:flex;justify-content:space-between;gap:16px}
  #tooltip .tt-key{opacity:.6}
  #tooltip .tt-val{color:#80deea}

  /* Context menu */
  #ctxmenu{
    position:absolute;background:rgba(10,10,26,.95);border:1px solid rgba(0,229,255,.25);
    color:#cdd;font-size:11px;border-radius:5px;overflow:hidden;z-index:50;
    box-shadow:0 4px 20px rgba(0,0,0,.6);min-width:160px;display:none
  }
  #ctxmenu .ctx-header{padding:6px 12px 4px;font-size:9px;text-transform:uppercase;
    letter-spacing:.1em;opacity:.45;border-bottom:1px solid rgba(255,255,255,.07)}
  #ctxmenu .ctx-item{
    padding:7px 12px;cursor:pointer;transition:background .1s;display:flex;align-items:center;gap:8px
  }
  #ctxmenu .ctx-item:hover{background:rgba(0,229,255,.12);color:#00e5ff}
  #ctxmenu .ctx-item .ctx-icon{font-size:14px;width:18px;text-align:center}
  #ctxmenu .ctx-sep{height:1px;background:rgba(255,255,255,.07);margin:2px 0}
  #ctxmenu .ctx-check{margin-left:auto;opacity:.5;font-size:9px}
  #ctxmenu .ctx-check.on{opacity:1;color:#00e5ff}

  /* Floating control bar */
  #controls{
    position:absolute;bottom:30px;left:50%;transform:translateX(-50%) translateY(8px);
    display:flex;gap:4px;background:rgba(0,0,0,.65);border:1px solid rgba(0,229,255,.2);
    border-radius:24px;padding:4px 8px;backdrop-filter:blur(8px);
    opacity:0;transition:opacity .3s, transform .3s;pointer-events:none;z-index:15
  }
  #controls.vis{opacity:1;transform:translateX(-50%) translateY(0);pointer-events:all}
  .ctrl-btn{
    width:28px;height:28px;border-radius:50%;border:none;background:transparent;
    cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;
    transition:background .15s, transform .1s;position:relative
  }
  .ctrl-btn:hover{background:rgba(0,229,255,.15);transform:scale(1.15)}
  .ctrl-btn:active{transform:scale(.92)}
  .ctrl-btn.active{background:rgba(0,229,255,.22)}
  .ctrl-btn[data-tip]:hover::after{
    content:attr(data-tip);position:absolute;bottom:calc(100% + 6px);left:50%;
    transform:translateX(-50%);background:rgba(0,0,0,.9);color:#00e5ff;
    font-size:9px;white-space:nowrap;padding:3px 7px;border-radius:3px;pointer-events:none;
    border:1px solid rgba(0,229,255,.2)
  }

  /* Ripple/splash effects container */
  #fx{position:absolute;inset:0;pointer-events:none;z-index:10}

  /* Keyboard shortcut hint */
  #keyhint{
    position:absolute;top:8px;right:8px;color:rgba(0,229,255,.35);font-size:8px;
    letter-spacing:.06em;text-align:right;pointer-events:none;line-height:1.7;
    opacity:0;transition:opacity .4s
  }
  #keyhint.vis{opacity:1}

  /* Wind direction indicator */
  #windrose{
    position:absolute;top:10px;left:10px;width:36px;height:36px;
    pointer-events:none;opacity:0;transition:opacity .3s
  }
  #windrose.vis{opacity:.7}

  /* Rainbow overlay canvas */
  #rainbowCanvas{position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity 1s;z-index:5}

  /* Shooting star canvas */
  #shootCanvas{position:absolute;inset:0;pointer-events:none;z-index:6}

  /* Click ripple SVG */
  .ripple-svg{position:absolute;pointer-events:none;animation:rippleFade .8s ease-out forwards}
  @keyframes rippleFade{0%{opacity:.9;transform:scale(.3)}100%{opacity:0;transform:scale(1)}}

  /* Snowpuff */
  .snowpuff{position:absolute;pointer-events:none;font-size:18px;animation:puffUp .7s ease-out forwards}
  @keyframes puffUp{0%{opacity:1;transform:translateY(0) scale(1)}100%{opacity:0;transform:translateY(-30px) scale(1.8)}}

  /* Firefly burst */
  .ff-burst{position:absolute;pointer-events:none;width:6px;height:6px;border-radius:50%;
    background:#ccff33;animation:ffBurst var(--d,.6s) ease-out forwards}
  @keyframes ffBurst{0%{opacity:1;transform:translate(0,0) scale(1)}100%{opacity:0;transform:translate(var(--tx,0),var(--ty,0)) scale(.4)}}

  /* Wind gust flash */
  #windgust{position:absolute;inset:0;pointer-events:none;z-index:4;opacity:0}
</style>
</head>
<body>
<canvas id="canvas"></canvas>
<canvas id="rainbowCanvas"></canvas>
<canvas id="shootCanvas"></canvas>
<div id="windgust"></div>
<div id="fx"></div>
<div id="hud"></div>
<div id="tooltip"></div>
<div id="ctxmenu"></div>
<div id="controls"></div>
<svg id="windrose" viewBox="0 0 36 36"></svg>
<div id="keyhint"></div>
<div id="load"><div class="spin"></div><span>Fetching weather...</span></div>

<script>
// ============================================================
//  CONFIG
// ============================================================
let CFG = ${configJson};
let SIM = ${simulateJson};

// ============================================================
//  PIXEL MODE CONSTANTS
// ============================================================
const PIXEL_W = 300;
const PIXEL_H = 100;

// ============================================================
//  CANVAS
// ============================================================
const canvas = document.getElementById('canvas');
const ctx    = canvas.getContext('2d');
const hud    = document.getElementById('hud');
const load   = document.getElementById('load');
const tooltip = document.getElementById('tooltip');
const ctxmenu = document.getElementById('ctxmenu');
const controls = document.getElementById('controls');
const fxDiv   = document.getElementById('fx');
const keyhint = document.getElementById('keyhint');
const windrose = document.getElementById('windrose');
const rainbowCanvas = document.getElementById('rainbowCanvas');
const rainbowCtx = rainbowCanvas.getContext('2d');
const shootCanvas = document.getElementById('shootCanvas');
const shootCtx = shootCanvas.getContext('2d');
const windgust = document.getElementById('windgust');

function resize(){
  // Sync overlay canvases to viewport
  rainbowCanvas.width  = window.innerWidth;
  rainbowCanvas.height = window.innerHeight;
  shootCanvas.width    = window.innerWidth;
  shootCanvas.height   = window.innerHeight;

  if(CFG.pixelMode){
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

// ============================================================
//  WEATHER STATE
// ============================================================
let weatherData=null, isOffline=false, isDay=true, condition='clear';
let temperature=20, precipitation=0, windSpeed=10, windDirection=180, moonPhase=0.5;

// ============================================================
//  PARTICLE POOLS
// ============================================================
let raindrops=[], snowflakes=[], clouds=[], stars=[], fireflies=[];
let birds=[], planes=[], fogParticles=[], leaves=[], smoke=[];
let lightningBolts=[], lightningFlash=0, nextLightFrame=200;
let treeLayout=[];
let frame=0;

const SPD = ()=> CFG.animationSpeed==='slow'?.5:CFG.animationSpeed==='fast'?2:1;
const HY  = ()=> canvas.height * 0.73;

// ---- CONDITION HELPERS ----
const RAIN_CONDS  = new Set(['drizzle','rain','rain-showers','freezing-rain','thunderstorm','thunderstorm-hail']);
const SNOW_CONDS  = new Set(['snow','snow-grains','snow-showers']);
const STORM_CONDS = new Set(['thunderstorm','thunderstorm-hail']);
const isRaining   = ()=> RAIN_CONDS.has(condition);
const isSnowing   = ()=> SNOW_CONDS.has(condition);
const isStorm     = ()=> STORM_CONDS.has(condition);

// ============================================================
//  INTERACTION STATE
// ============================================================
let mouseX=0, mouseY=0;
let isDragging=false, dragStartX=0, dragWindBase=windDirection;
let showControls=false, controlsHoverTimeout=null;
let keyhintVisible=false;

// Click effects pool
let clickSplashes=[];   // {x,y,t,type}
let shootingStars=[];   // {x,y,vx,vy,trail:[],life,maxLife}
let rainbowAlpha=0, rainbowTarget=0;

function updateControlStates(){
  const pixelBtn = document.getElementById('btn-pixel');
  const leavesBtn = document.getElementById('btn-leaves');
  const nightBtn = document.getElementById('btn-night');
  if(pixelBtn) pixelBtn.classList.toggle('active', !!CFG.pixelMode);
  if(leavesBtn) leavesBtn.classList.toggle('active', !!CFG.showLeaves);
  if(nightBtn) nightBtn.classList.toggle('active', !isDay);
}

// ============================================================
//  KEYBOARD SHORTCUTS
// ============================================================
function buildKeyhint(){
  keyhint.innerHTML = 'N night · P pixel · L leaves · R refresh<br>scroll = time · drag = wind · dblclick = event';
}

document.addEventListener('keydown', e=>{
  if(e.target !== document.body && e.target.tagName !== 'BODY') return;
  switch(e.key.toLowerCase()){
    case 'n': isDay=!isDay; initScene(); if(CFG.pixelMode) px_initParticles(); updateHUD(); updateControlStates(); break;
    case 'p': CFG.pixelMode=!CFG.pixelMode; resize(); if(weatherData){ initScene(); if(CFG.pixelMode) px_initParticles(); } updateHUD(); updateControlStates(); break;
    case 'l': CFG.showLeaves=!CFG.showLeaves; if(!CFG.showLeaves) leaves=[]; updateControlStates(); break;
    case 'r': fetchWeather().catch(offlineWeather); break;
    case '?': case 'h':
      keyhintVisible=!keyhintVisible;
      keyhint.classList.toggle('vis', keyhintVisible);
      break;
    case 'escape': hideContextMenu(); break;
  }
});

// ============================================================
//  MOUSE / TOUCH INTERACTIONS
// ============================================================

// --- Hover tooltip ---
canvas.addEventListener('mousemove', e=>{
  mouseX = e.clientX; mouseY = e.clientY;
  updateTooltipPosition(e.clientX, e.clientY);
  if(!tooltip.classList.contains('vis') && weatherData) showTooltip();

  // Show controls bar when cursor in lower 30%
  const relY = e.clientY / window.innerHeight;
  if(relY > 0.65){
    clearTimeout(controlsHoverTimeout);
    controls.classList.add('vis');
    showControls=true;
    controlsHoverTimeout = setTimeout(()=>{ controls.classList.remove('vis'); showControls=false; }, 2500);
  }

  // Show keyhint briefly on first move
  if(!keyhintVisible){
    keyhint.classList.add('vis');
    clearTimeout(keyhint._t);
    keyhint._t = setTimeout(()=> keyhint.classList.remove('vis'), 2000);
  }

  // Drag = shift wind direction
  if(isDragging){
    const dx = e.clientX - dragStartX;
    windDirection = ((dragWindBase + dx * 1.2) % 360 + 360) % 360;
    updateWindRose();
    // Respawn rain with new direction
    if(isRaining()){
      raindrops.forEach(d=>{
        const drift = ((windDirection%360)<180?1:-1) * (windSpeed/50) * (Math.random()*1.5+.5);
        d.vx = drift;
      });
    }
  }
});

canvas.addEventListener('mouseleave', ()=>{
  tooltip.classList.remove('vis');
  windrose.classList.remove('vis');
});

canvas.addEventListener('mouseenter', ()=>{
  updateWindRose();
  windrose.classList.add('vis');
});

// --- Scroll = cycle time ---
canvas.addEventListener('wheel', e=>{
  e.preventDefault();
  if(Math.abs(e.deltaY) > 10){
    isDay = !isDay;
    initScene();
    if(CFG.pixelMode) px_initParticles();
    updateHUD();
    updateControlStates();
    flashConditionBanner(isDay ? '🌅 Day' : '🌙 Night');
  }
}, { passive: false });

// --- Click = weather-specific effect ---
canvas.addEventListener('click', e=>{
  hideContextMenu();
  const x = e.clientX, y = e.clientY;
  if(isStorm()){
    triggerManualLightning(toCanvasX(x), toCanvasY(y));
    spawnClickSplash(x, y, 'lightning');
  } else if(isRaining()){
    spawnRainSplash(x, y);
  } else if(isSnowing()){
    spawnSnowPuff(x, y);
  } else if(!isDay &&temperature>10 && (condition==='clear'||condition==='partly-cloudy')){
    spawnFireflyBurst(x, y);
  } else if(isDay && (condition==='clear'||condition==='partly-cloudy')){
    spawnSunSparkle(x, y);
  } else if(condition==='fog'){
    clearFogAt(toCanvasX(x), toCanvasY(y));
  } else {
    spawnLeafBurst(x, y);
  }
});

// --- Double-click = dramatic weather event ---
canvas.addEventListener('dblclick', e=>{
  e.preventDefault();
  if(isStorm()){
    // Multiple lightning bolts
    for(let i=0;i<4;i++){
      setTimeout(()=>{
        lightningFlash=1;
        lightningBolts.push({segs:buildBolt(Math.random()*canvas.width,0,HY()),life:1});
      }, i*120);
    }
    flashConditionBanner('⚡ Mega Strike!');
  } else if(isRaining()){
    // Trigger rainbow
    rainbowTarget = 1;
    rainbowCanvas.style.opacity = '1';
    drawRainbow();
    setTimeout(()=>{ rainbowTarget=0; fadeOutRainbow(); }, 4000);
    flashConditionBanner('🌈 Rainbow!');
  } else if(!isDay && condition==='clear'){
    // Shooting star shower
    for(let i=0;i<5;i++){
      setTimeout(()=> spawnShootingStar(), i * 300);
    }
    flashConditionBanner('🌠 Shooting Stars!');
  } else if(isDay && condition==='clear'){
    // Sun flare burst
    spawnSunFlare(e.clientX, e.clientY);
    flashConditionBanner('☀️ Solar Flare!');
  } else if(isSnowing()){
    // Blizzard burst — temp boost to snow count
    for(let i=0;i<30;i++) spawnFlake(false);
    flashConditionBanner('🌨 Blizzard!');
  } else {
    // Wind gust
    triggerWindGust();
    flashConditionBanner('💨 Wind Gust!');
  }
});

// --- Right-click = context menu ---
canvas.addEventListener('contextmenu', e=>{
  e.preventDefault();
  showContextMenu(e.clientX, e.clientY);
});

// --- Drag = wind direction ---
canvas.addEventListener('mousedown', e=>{
  if(e.button !== 0) return;
  isDragging=true;
  dragStartX=e.clientX;
  dragWindBase=windDirection;
  canvas.classList.add('dragging');
  windrose.classList.add('vis');
});

window.addEventListener('mouseup', ()=>{
  isDragging=false;
  canvas.classList.remove('dragging');
});

// --- Touch support ---
let lastTouchDist=0, touchStartX=0, touchStartTime=0;

canvas.addEventListener('touchstart', e=>{
  e.preventDefault();
  if(e.touches.length===2){
    lastTouchDist = Math.hypot(
      e.touches[0].clientX-e.touches[1].clientX,
      e.touches[0].clientY-e.touches[1].clientY
    );
  } else if(e.touches.length===1){
    touchStartX = e.touches[0].clientX;
    touchStartTime = Date.now();
    dragStartX = touchStartX;
    dragWindBase = windDirection;
    isDragging=true;
  }
},{ passive:false });

canvas.addEventListener('touchmove', e=>{
  e.preventDefault();
  if(e.touches.length===2){
    const dist = Math.hypot(
      e.touches[0].clientX-e.touches[1].clientX,
      e.touches[0].clientY-e.touches[1].clientY
    );
    const ratio = dist / (lastTouchDist||dist);
    if(ratio < 0.75){ CFG.pixelMode=true; resize(); if(weatherData){ initScene(); px_initParticles(); } flashConditionBanner('🕹 Pixel Mode'); }
    if(ratio > 1.35){ CFG.pixelMode=false; resize(); if(weatherData){ initScene(); } flashConditionBanner('🖼 Smooth Mode'); }
    lastTouchDist=dist;
  } else if(e.touches.length===1 && isDragging){
    const dx = e.touches[0].clientX - dragStartX;
    windDirection = ((dragWindBase + dx*1.5)%360+360)%360;
    updateWindRose();
  }
},{ passive:false });

canvas.addEventListener('touchend', e=>{
  e.preventDefault();
  isDragging=false;
  if(e.changedTouches.length===1){
    const dt = Date.now()-touchStartTime;
    const moved = Math.abs(e.changedTouches[0].clientX - touchStartX);
    if(dt < 200 && moved < 10){
      // Tap = click effect
      const t = e.changedTouches[0];
      canvas.dispatchEvent(new MouseEvent('click',{clientX:t.clientX,clientY:t.clientY,bubbles:true}));
    } else if(dt > 400 && moved < 15){
      // Long-press = context menu
      showContextMenu(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
    } else if(Math.abs(e.changedTouches[0].clientX - touchStartX) > 60){
      // Swipe left/right = next/prev condition
      const dir = e.changedTouches[0].clientX < touchStartX ? 1 : -1;
      cycleCondition(dir);
    }
  }
},{ passive:false });

// ============================================================
//  COORDINATE HELPERS (handle pixel mode scaling)
// ============================================================
function toCanvasX(clientX){
  const rect = canvas.getBoundingClientRect();
  return (clientX - rect.left) / rect.width * canvas.width;
}
function toCanvasY(clientY){
  const rect = canvas.getBoundingClientRect();
  return (clientY - rect.top) / rect.height * canvas.height;
}

// ============================================================
//  CLICK EFFECTS
// ============================================================

function spawnRainSplash(cx, cy){
  // DOM ripple for smooth mode, dot-flash for pixel
  const el = document.createElement('div');
  el.style.cssText = \`position:absolute;left:\${cx-16}px;top:\${cy-16}px;width:32px;height:32px;pointer-events:none\`;
  el.innerHTML = \`<svg width="32" height="32" viewBox="0 0 32 32">
    <circle cx="16" cy="16" r="2" fill="none" stroke="rgba(100,180,255,.8)" stroke-width="1.5">
      <animate attributeName="r" from="2" to="14" dur=".5s" fill="freeze"/>
      <animate attributeName="stroke-opacity" from=".8" to="0" dur=".5s" fill="freeze"/>
    </circle>
    <circle cx="16" cy="16" r="2" fill="none" stroke="rgba(100,180,255,.5)" stroke-width="1">
      <animate attributeName="r" from="2" to="10" begin=".1s" dur=".45s" fill="freeze"/>
      <animate attributeName="stroke-opacity" from=".5" to="0" begin=".1s" dur=".45s" fill="freeze"/>
    </circle>
  </svg>\`;
  fxDiv.appendChild(el);
  setTimeout(()=>el.remove(), 600);

  // Also add a few extra raindrops from click origin (canvas coords)
  const cx2 = toCanvasX(cx), cy2 = toCanvasY(cy);
  for(let i=0;i<6;i++){
    const a=Math.random()*Math.PI*2, sp=Math.random()*3+1;
    raindrops.push({x:cx2,y:cy2,vx:Math.cos(a)*sp*.5,vy:Math.sin(a)*sp+2,
      len:6,alpha:.9,isHail:false});
  }
}

function spawnSnowPuff(cx, cy){
  const el = document.createElement('div');
  el.className='snowpuff';
  el.style.cssText=\`left:\${cx-10}px;top:\${cy-10}px\`;
  el.textContent='❄';
  fxDiv.appendChild(el);
  setTimeout(()=>el.remove(), 800);

  // Spawn extra snowflakes around click
  const cx2=toCanvasX(cx), cy2=toCanvasY(cy);
  for(let i=0;i<8;i++){
    const a=Math.random()*Math.PI*2, r=Math.random()*20+5;
    snowflakes.push({
      x:cx2+Math.cos(a)*r, y:cy2+Math.sin(a)*r,
      r:Math.random()*2.5+1, vy:(Math.random()*.6+.3)*SPD(),
      vx:(Math.random()-.5)*.8,
      wobble:Math.random()*Math.PI*2, wobbleSpd:.05, wobbleAmp:1.2,
      angle:Math.random()*Math.PI*2, spin:(Math.random()-.5)*.06
    });
  }
}

function spawnFireflyBurst(cx, cy){
  const count=8;
  for(let i=0;i<count;i++){
    const el=document.createElement('div');
    el.className='ff-burst';
    const a=(i/count)*Math.PI*2, r=30+Math.random()*20;
    el.style.cssText=\`left:\${cx}px;top:\${cy}px;--tx:\${Math.cos(a)*r}px;--ty:\${Math.sin(a)*r}px;--d:\${.4+Math.random()*.4}s\`;
    fxDiv.appendChild(el);
    setTimeout(()=>el.remove(), 900);
  }

  // Add persistent fireflies near click
  const cx2=toCanvasX(cx), cy2=toCanvasY(cy);
  for(let i=0;i<5;i++){
    fireflies.push({
      x:cx2+(Math.random()-.5)*30, y:cy2+(Math.random()-.5)*20,
      vx:(Math.random()-.5)*.7, vy:(Math.random()-.5)*.45,
      alpha:Math.random(), aDir:1, aSpd:.04, r:1.5
    });
  }
}

function spawnSunSparkle(cx, cy){
  const el=document.createElement('div');
  el.style.cssText=\`position:absolute;left:\${cx-20}px;top:\${cy-20}px;width:40px;height:40px;pointer-events:none\`;
  el.innerHTML=\`<svg width="40" height="40" viewBox="0 0 40 40">
    \${[0,45,90,135].map(a=>{
      const r1=a*Math.PI/180, r2=(a+180)*Math.PI/180;
      const x1=20+Math.cos(r1)*5, y1=20+Math.sin(r1)*5;
      const x2=20+Math.cos(r1)*18, y2=20+Math.sin(r1)*18;
      const x3=20+Math.cos(r2)*5, y3=20+Math.sin(r2)*5;
      const x4=20+Math.cos(r2)*18, y4=20+Math.sin(r2)*18;
      return \`<line x1="\${x1}" y1="\${y1}" x2="\${x2}" y2="\${y2}" stroke="rgba(255,235,59,.9)" stroke-width="1.5" stroke-linecap="round">
        <animate attributeName="stroke-opacity" from=".9" to="0" dur=".5s" fill="freeze"/>
        <animate attributeName="x2" from="\${x2}" to="\${20+Math.cos(r1)*28}" dur=".4s" fill="freeze"/>
        <animate attributeName="y2" from="\${y2}" to="\${20+Math.sin(r1)*28}" dur=".4s" fill="freeze"/>
      </line>
      <line x1="\${x3}" y1="\${y3}" x2="\${x4}" y2="\${y4}" stroke="rgba(255,235,59,.9)" stroke-width="1.5" stroke-linecap="round">
        <animate attributeName="stroke-opacity" from=".9" to="0" dur=".5s" fill="freeze"/>
      </line>\`;
    }).join('')}
  </svg>\`;
  fxDiv.appendChild(el);
  setTimeout(()=>el.remove(), 600);
}

function spawnLeafBurst(cx, cy){
  const emojis=['🍂','🍁','🍃'];
  for(let i=0;i<5;i++){
    const el=document.createElement('div');
    el.style.cssText=\`position:absolute;left:\${cx+(Math.random()-0.5)*30}px;top:\${cy}px;font-size:\${10+Math.random()*8}px;pointer-events:none;animation:puffUp \${.5+Math.random()*.3}s ease-out forwards\`;
    el.textContent=emojis[Math.floor(Math.random()*emojis.length)];
    fxDiv.appendChild(el);
    setTimeout(()=>el.remove(), 900);
  }
}

function clearFogAt(cx, cy){
  // Remove fog particles near click
  fogParticles=fogParticles.filter(f=>{
    const dx=f.x+f.w/2-cx, dy=f.y+f.h/2-cy;
    return Math.sqrt(dx*dx+dy*dy)>40;
  });
}

function spawnClickSplash(cx, cy, type){
  // Generic lightning bolt click flash
  if(type==='lightning'){
    const el=document.createElement('div');
    el.style.cssText=\`position:absolute;left:\${cx-12}px;top:\${cy-12}px;font-size:24px;pointer-events:none;animation:puffUp .5s ease-out forwards\`;
    el.textContent='⚡';
    fxDiv.appendChild(el);
    setTimeout(()=>el.remove(), 600);
  }
}

// ============================================================
//  MANUAL LIGHTNING TRIGGER
// ============================================================
function triggerManualLightning(cx, cy){
  lightningFlash=1;
  lightningBolts.push({segs:buildBolt(cx,0,cy),life:1.2});
}

// ============================================================
//  SHOOTING STARS
// ============================================================
function spawnShootingStar(){
  const sw=shootCanvas.width, sh=shootCanvas.height;
  shootingStars.push({
    x: Math.random()*sw*.7,
    y: Math.random()*sh*.3,
    vx: 5+Math.random()*4,
    vy: 2+Math.random()*3,
    trail:[],
    life:1, maxLife:1
  });
}

function updateShootingStars(){
  shootCtx.clearRect(0,0,shootCanvas.width,shootCanvas.height);
  shootingStars.forEach(s=>{
    s.x+=s.vx; s.y+=s.vy;
    s.trail.push({x:s.x,y:s.y});
    if(s.trail.length>20) s.trail.shift();
    s.life-=0.025;

    // Draw trail
    for(let i=1;i<s.trail.length;i++){
      const t=i/s.trail.length;
      shootCtx.globalAlpha=t*s.life*.9;
      shootCtx.strokeStyle=\`rgba(255,250,200,\${t})\`;
      shootCtx.lineWidth=1.5*t;
      shootCtx.beginPath();
      shootCtx.moveTo(s.trail[i-1].x,s.trail[i-1].y);
      shootCtx.lineTo(s.trail[i].x,s.trail[i].y);
      shootCtx.stroke();
    }
    // Head
    shootCtx.globalAlpha=s.life;
    shootCtx.fillStyle='#fff8c0';
    shootCtx.beginPath();
    shootCtx.arc(s.x,s.y,2,0,Math.PI*2);
    shootCtx.fill();
  });
  shootCtx.globalAlpha=1;
  shootingStars=shootingStars.filter(s=>s.life>0&&s.x<shootCanvas.width&&s.y<shootCanvas.height);
}

// ============================================================
//  RAINBOW
// ============================================================
function drawRainbow(){
  const w=rainbowCanvas.width, h=rainbowCanvas.height;
  rainbowCtx.clearRect(0,0,w,h);
  const cx=w/2, cy=h*1.2;
  const radii=[h*.88,h*.83,h*.78,h*.73,h*.68,h*.63,h*.58];
  const colors=['rgba(255,0,0,.18)','rgba(255,127,0,.18)','rgba(255,255,0,.18)',
                'rgba(0,200,0,.18)','rgba(0,0,255,.18)','rgba(75,0,130,.15)','rgba(148,0,211,.12)'];
  radii.forEach((r,i)=>{
    rainbowCtx.beginPath();
    rainbowCtx.arc(cx,cy,r,Math.PI,0);
    rainbowCtx.strokeStyle=colors[i];
    rainbowCtx.lineWidth=h*.045;
    rainbowCtx.stroke();
  });
}

function fadeOutRainbow(){
  let a=1;
  const fade=()=>{
    a-=0.02;
    rainbowCanvas.style.opacity=Math.max(0,a).toString();
    if(a>0) requestAnimationFrame(fade);
    else { rainbowCtx.clearRect(0,0,rainbowCanvas.width,rainbowCanvas.height); rainbowCanvas.style.opacity='0'; }
  };
  fade();
}

// ============================================================
//  SUN FLARE
// ============================================================
function spawnSunFlare(cx, cy){
  const el=document.createElement('div');
  el.style.cssText=\`position:absolute;left:\${cx-60}px;top:\${cy-60}px;width:120px;height:120px;
    border-radius:50%;background:radial-gradient(circle,rgba(255,240,100,.6) 0%,rgba(255,220,50,.2) 50%,transparent 100%);
    pointer-events:none;animation:flareOut .8s ease-out forwards\`;
  const style=document.createElement('style');
  style.textContent='@keyframes flareOut{0%{opacity:1;transform:scale(.2)}100%{opacity:0;transform:scale(3)}}';
  document.head.appendChild(style);
  fxDiv.appendChild(el);
  setTimeout(()=>{ el.remove(); style.remove(); }, 900);
}

// ============================================================
//  WIND GUST
// ============================================================
function triggerWindGust(){
  // Temporarily triple wind speed for leaves/smoke
  const origSpeed=windSpeed;
  windSpeed=origSpeed*3;
  windgust.style.background='linear-gradient(90deg,transparent,rgba(200,230,255,.06),transparent)';
  windgust.style.opacity='1';
  windgust.style.animation='none';
  // Spawn burst of leaves
  for(let i=0;i<15;i++) spawnLeaf(true);
  setTimeout(()=>{
    windSpeed=origSpeed;
    windgust.style.opacity='0';
  }, 1500);
}

// ============================================================
//  CONDITION CYCLE (swipe)
// ============================================================
const CONDITION_CYCLE=['clear','partly-cloudy','overcast','drizzle','rain','thunderstorm','snow','fog'];
function cycleCondition(dir){
  const idx=CONDITION_CYCLE.indexOf(condition);
  const next=(idx+dir+CONDITION_CYCLE.length)%CONDITION_CYCLE.length;
  applySimulate(CONDITION_CYCLE[next], !isDay);
  flashConditionBanner('→ '+CONDITION_CYCLE[next].replace(/-/g,' '));
}

// ============================================================
//  CONDITION BANNER
// ============================================================
let bannerTimeout=null;
function flashConditionBanner(text){
  let banner=document.getElementById('banner');
  if(!banner){
    banner=document.createElement('div');
    banner.id='banner';
    banner.style.cssText=\`position:absolute;top:12px;left:50%;transform:translateX(-50%);
      background:rgba(0,0,0,.75);border:1px solid rgba(0,229,255,.3);color:#00e5ff;
      font-size:11px;padding:5px 14px;border-radius:20px;pointer-events:none;
      backdrop-filter:blur(6px);z-index:30;transition:opacity .4s;letter-spacing:.06em\`;
    document.body.appendChild(banner);
  }
  banner.textContent=text;
  banner.style.opacity='1';
  clearTimeout(bannerTimeout);
  bannerTimeout=setTimeout(()=>{ banner.style.opacity='0'; }, 1800);
}

// ============================================================
//  TOOLTIP
// ============================================================
function showTooltip(){
  if(!weatherData||CFG.hideHUD) return;
  const ct=condition.replace(/-/g,' ').replace(/\\b\\w/g,c=>c.toUpperCase());
  const t=fmtT(temperature), w=fmtW(windSpeed), p=fmtP(precipitation);
  const wd=Math.round(windDirection)+'°';
  const moonStr=moonPhase<.15?'🌑 New':moonPhase<.35?'🌒 Crescent':moonPhase<.65?'🌕 Full':moonPhase<.85?'🌖 Gibbous':'🌘 Crescent';
  tooltip.innerHTML=\`
    <div class="tt-title">\${ct}</div>
    <div class="tt-row"><span class="tt-key">Temp</span><span class="tt-val">\${t}</span></div>
    <div class="tt-row"><span class="tt-key">Wind</span><span class="tt-val">\${w} \${wd}</span></div>
    <div class="tt-row"><span class="tt-key">Precip</span><span class="tt-val">\${p}</span></div>
    \${!isDay?'<div class="tt-row"><span class="tt-key">Moon</span><span class="tt-val">'+moonStr+'</span></div>':''}
    <div class="tt-row" style="margin-top:4px;opacity:.45;font-size:9px"><span>Click · Drag · Scroll · ✦</span></div>
  \`;
  tooltip.classList.add('vis');
}

function updateTooltipPosition(cx, cy){
  const pad=14, tw=tooltip.offsetWidth||160, th=tooltip.offsetHeight||80;
  let tx=cx+pad, ty=cy+pad;
  if(tx+tw>window.innerWidth-10) tx=cx-tw-pad;
  if(ty+th>window.innerHeight-35) ty=cy-th-pad;
  tooltip.style.left=tx+'px'; tooltip.style.top=ty+'px';
}

// ============================================================
//  WIND ROSE
// ============================================================
function updateWindRose(){
  const a=windDirection*Math.PI/180;
  const cx=18,cy=18,r=12;
  const nx=cx+Math.sin(a)*r, ny=cy-Math.cos(a)*r;
  windrose.innerHTML=\`
    <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(0,229,255,.2)" stroke-width="1"/>
    <circle cx="18" cy="18" r="2" fill="rgba(0,229,255,.5)"/>
    <line x1="18" y1="18" x2="\${nx}" y2="\${ny}" stroke="#00e5ff" stroke-width="1.5" stroke-linecap="round"/>
    <text x="18" y="5" fill="rgba(0,229,255,.5)" font-size="5" text-anchor="middle" font-family="monospace">N</text>
    <text x="31" y="20" fill="rgba(0,229,255,.35)" font-size="4.5" text-anchor="middle" font-family="monospace">E</text>
    <text x="18" y="34" fill="rgba(0,229,255,.35)" font-size="4.5" text-anchor="middle" font-family="monospace">S</text>
    <text x="5" y="20" fill="rgba(0,229,255,.35)" font-size="4.5" text-anchor="middle" font-family="monospace">W</text>
  \`;
}

// ============================================================
//  CONTEXT MENU
// ============================================================
function showContextMenu(cx, cy){
  const items=[
    { header:'Simulate' },
    { icon:'☀️', label:'Clear Day',      action:()=>applySimulate('clear',false) },
    { icon:'🌙', label:'Clear Night',    action:()=>applySimulate('clear',true) },
    { icon:'⛅', label:'Partly Cloudy', action:()=>applySimulate('partly-cloudy',!isDay) },
    { icon:'🌧', label:'Rain',           action:()=>applySimulate('rain',!isDay) },
    { icon:'⛈', label:'Thunderstorm',  action:()=>applySimulate('thunderstorm',!isDay) },
    { icon:'❄️', label:'Snow',           action:()=>applySimulate('snow',!isDay) },
    { icon:'🌫', label:'Fog',            action:()=>applySimulate('fog',!isDay) },
    { sep:true },
    { header:'Toggle' },
    { icon:'🌙', label:'Day / Night',    check:!isDay, action:()=>{ isDay=!isDay; initScene(); if(CFG.pixelMode) px_initParticles(); updateHUD(); updateControlStates(); } },
    { icon:'🕹', label:'Pixel Mode',     check:CFG.pixelMode, action:()=>{ CFG.pixelMode=!CFG.pixelMode; resize(); if(weatherData){initScene();if(CFG.pixelMode)px_initParticles();} updateHUD(); updateControlStates(); } },
    { icon:'🍂', label:'Falling Leaves', check:CFG.showLeaves, action:()=>{ CFG.showLeaves=!CFG.showLeaves; if(!CFG.showLeaves)leaves=[]; updateControlStates(); } },
    { sep:true },
    { icon:'🔄', label:'Refresh Weather',action:()=> fetchWeather().catch(offlineWeather) },
  ];

  ctxmenu.innerHTML='';
  items.forEach(item=>{
    if(item.sep){ const sep=document.createElement('div'); sep.className='ctx-sep'; ctxmenu.appendChild(sep); return; }
    if(item.header){ const h=document.createElement('div'); h.className='ctx-header'; h.textContent=item.header; ctxmenu.appendChild(h); return; }
    const el=document.createElement('div');
    el.className='ctx-item';
    el.innerHTML=\`<span class="ctx-icon">\${item.icon}</span><span>\${item.label}</span>\${item.check!==undefined?'<span class="ctx-check '+(item.check?'on':'')+'">'+(item.check?'✓':'')+'</span>':''}\`;
    el.addEventListener('click', ()=>{ item.action(); hideContextMenu(); });
    ctxmenu.appendChild(el);
  });

  ctxmenu.style.display='block';
  const menuW=ctxmenu.offsetWidth||170, menuH=ctxmenu.offsetHeight||300;
  let mx=cx+2, my=cy+2;
  if(mx+menuW>window.innerWidth-6) mx=cx-menuW-2;
  if(my+menuH>window.innerHeight-6) my=cy-menuH-2;
  ctxmenu.style.left=mx+'px'; ctxmenu.style.top=my+'px';
}

function hideContextMenu(){ ctxmenu.style.display='none'; }
document.addEventListener('click', ()=> hideContextMenu());

// ============================================================
//  SCENE INIT
// ============================================================
function initScene(){
  raindrops=[]; snowflakes=[]; clouds=[]; stars=[];
  fireflies=[]; birds=[]; planes=[]; fogParticles=[];
  leaves=[]; smoke=[]; lightningBolts=[];
  shootingStars=[];

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

  if(!isDay&&temperature>10 && (condition==='clear'||condition==='partly-cloudy')){
    for(let i=0;i<22;i++) spawnFirefly();
  }

  if(CFG.showLeaves && !isRaining() && !isSnowing()){
    for(let i=0;i<20;i++) spawnLeaf(true);
  }

  buildTrees();
  updateWindRose();
  updateControlStates();
}

// ============================================================
//  TREE LAYOUT
// ============================================================
const TREE_SPECIES=['pine','round','tall','birch','spruce'];
function buildTrees(){
  treeLayout=[];
  const hy=HY();
  const W=canvas.width;

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
    vy:(Math.random()*.2+.15)*SPD(),
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
  if(isSnowing() || temperature < -2){
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
  if(isDay) return;
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
  // Interactive hint in HUD
  hud.innerHTML=\`\${off}<span>🌤 \${ct}</span><span>🌡 \${t}</span><span>💨 \${w}</span><span>🌧 \${p}</span>\${loc}\`;
}
const fmtT=v=>CFG.temperatureUnit==='fahrenheit'?(v*9/5+32).toFixed(1)+'°F':v.toFixed(1)+'°C';
const fmtW=v=>{ let r=v,u='km/h'; if(CFG.windSpeedUnit==='ms'){r=v/3.6;u='m/s';}else if(CFG.windSpeedUnit==='mph'){r=v/1.609;u='mph';}else if(CFG.windSpeedUnit==='kn'){r=v*.54;u='kn';} return r.toFixed(1)+' '+u; };
const fmtP=v=>CFG.precipitationUnit==='inch'?(v/25.4).toFixed(2)+'"':v.toFixed(1)+'mm';

// ============================================================
//  HEX COLOUR HELPERS
// ============================================================
function hexR(h){ return parseInt(h.slice(1,3),16); }
function hexG(h){ return parseInt(h.slice(3,5),16); }
function hexB(h){ return parseInt(h.slice(5,7),16); }
function lerp(a,b,t){ return a+(b-a)*t; }

// ============================================================
//  PIXEL MODE – Particle Init
// ============================================================
function px_initParticles(){
  const W=canvas.width, H=canvas.height, hy=Math.floor(HY());

  stars=[];
  if(!isDay){
    const count=Math.floor(W*hy/120);
    for(let i=0;i<count;i++) stars.push({
      x:Math.floor(Math.random()*W),
      y:Math.floor(Math.random()*hy*.85),
      r:1, a:Math.random(), spd:Math.random()*.04+.01
    });
  }

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

  snowflakes=[];
  if(isSnowing()){
    const n=condition==='snow-grains'?Math.floor(W/15):Math.floor(W/8);
    for(let i=0;i<n;i++) snowflakes.push({
      x:Math.random()*W, y:Math.random()*hy,
      r:1, vy:(Math.random()*.1+.06)*SPD(),
      vx:(Math.random()-.5)*.25,
      wobble:Math.random()*Math.PI*2,
      wobbleSpd:Math.random()*.04+.01,
      wobbleAmp:Math.random()*.6+.2,
      angle:0, spin:0
    });
  }

  fogParticles=[];
  if(condition==='fog'){
    for(let i=0;i<15;i++) fogParticles.push({
      x:Math.random()*W,
      y:hy-Math.floor(Math.random()*15),
      w:Math.random()*20+8, h:Math.random()*4+2,
      spd:(Math.random()*.15+.03)*SPD(), alpha:.35
    });
  }

  fireflies=[];
  if(!isDay&&temperature>10&&(condition==='clear'||condition==='partly-cloudy')){
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

  smoke=[]; lightningBolts=[]; lightningFlash=0;

  // Pixel-proportioned trees
  treeLayout=[];
  const farCount=Math.max(3,Math.floor(W/70));
  for(let i=0;i<farCount;i++){
    treeLayout.push({
      layer:0,
      x:(i+Math.random()*.6)*W/farCount+Math.random()*4-2,
      baseY:hy-1,
      h:Math.random()*12+9, w:Math.random()*7+5,
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
      h:Math.random()*18+12, w:Math.random()*10+6,
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
      h:Math.random()*22+18, w:Math.random()*12+8,
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

  px_sky(W,H);
  if(!isDay){ px_stars(); px_moon(W); }
  if(isDay&&!isRaining()&&!isSnowing()&&condition!=='fog'&&condition!=='overcast') px_sun(W);
  px_clouds();
  if(isDay&&!isRaining()&&!isSnowing()&&condition!=='fog') px_birds();
  if(isDay&&(condition==='clear'||condition==='partly-cloudy')) px_planes();
  if(!isDay) px_fireflies();

  px_ground(W,H,hy);
  px_trees(hy);
  px_house(W,hy);

  if(!isRaining()&&!isStorm()) px_smoke();

  if(isStorm()){ px_rain(); px_lightning(W,H); }
  else if(isRaining()) px_rain();
  else if(isSnowing()) px_snow();
  if(condition==='fog') px_fog(W);
  if(CFG.showLeaves&&!isRaining()&&!isSnowing()) px_leaves();

  updateHUD();
}

// ============================================================
//  PIXEL DRAW HELPERS
// ============================================================

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

function px_stars(){
  stars.forEach(s=>{
    ctx.globalAlpha=s.a;
    ctx.fillStyle=s.a>.6?'#ffffff':'#888888';
    ctx.fillRect(Math.floor(s.x),Math.floor(s.y),1,1);
  });
  ctx.globalAlpha=1;
}

function px_moon(W){
  const mx=Math.floor(W*.78), my=Math.floor(canvas.height*.12), R=3;
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

function px_sun(W){
  const sx=Math.floor(W*.82), sy=Math.floor(canvas.height*.1), R=3;
  ctx.fillStyle='#ffeb3b';
  for(let dy=-R;dy<=R;dy++) for(let dx=-R;dx<=R;dx++){
    if(dx*dx+dy*dy<=R*R) ctx.fillRect(sx+dx,sy+dy,1,1);
  }
  const p=Math.floor(frame/15)%2;
  ctx.fillStyle='rgba(255,235,59,.7)';
  const rl=R+1+p;
  for(let i=R+1;i<=rl;i++){
    ctx.fillRect(sx+i,sy,1,1); ctx.fillRect(sx-i,sy,1,1);
    ctx.fillRect(sx,sy+i,1,1); ctx.fillRect(sx,sy-i,1,1);
  }
  for(let i=1;i<=rl-R;i++){
    const d=R+i;
    const diag=Math.round(d*.71);
    ctx.fillRect(sx+diag,sy-diag,1,1); ctx.fillRect(sx-diag,sy-diag,1,1);
    ctx.fillRect(sx+diag,sy+diag,1,1); ctx.fillRect(sx-diag,sy+diag,1,1);
  }
}

function px_clouds(){
  clouds.forEach(c=>{
    ctx.fillStyle=!isDay?'#23233a':isStorm()||isRaining()?'#546e7a':'#eceff1';
    const cx_=Math.floor(c.x), cy_=Math.floor(c.y);
    const hw=Math.min(Math.floor(c.w/2),10);
    const hh=Math.min(Math.floor(c.h/2),3);
    if(hw<1||hh<1) return;
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

function px_planes(){
  planes.forEach(p=>{
    const px_=Math.floor(p.x), py_=Math.floor(p.y);
    if(px_<0||py_<0) return;
    ctx.fillStyle='rgba(220,240,255,.4)';
    for(let i=1;i<=Math.min(8,px_);i++) ctx.fillRect(px_-i,py_,1,1);
    ctx.fillStyle='#eceff1';
    ctx.fillRect(px_,py_,2,1);
    ctx.fillRect(px_-1,py_-1,1,1);
    ctx.fillRect(px_+1,py_+1,1,1);
  });
}

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

function px_ground(W,H,hy){
  const groundH=H-hy;
  if(isSnowing()||condition==='snow-grains'||temperature<-2){
    ctx.fillStyle=isDay?'#e3f2fd':'#bbdefb';
    ctx.fillRect(0,hy,W,1);
    ctx.fillStyle=isDay?'#f1f8e9':'#c8e6c9';
    ctx.fillRect(0,hy+1,W,groundH-1);
    return;
  }
  ctx.fillStyle=isDay?'#036510':'#023107';
  ctx.fillRect(0,hy+1,W,groundH-1);
  const grass=isDay?['#388e3c','#2e7d32']:['#1b5e20','#003200'];
  const flowers=isDay?['#e91e63','#f44336','#00bcd4','#ffeb3b']:['#880e4f','#b71c1c','#1565c0','#f9a825'];
  for(let x=0;x<W;x++){
    const r=((x^0x5DEECE6)>>>0)%100;
    ctx.fillStyle=r<5?flowers[x%flowers.length]:r<15?grass[1]:grass[0];
    ctx.fillRect(x,hy,1,1);
  }
  ctx.fillStyle=isDay?'#795548':'#4e342e';
  for(let y=1;y<Math.min(groundH,6);y++){
    for(let x=0;x<W;x+=3){
      if((((x^0x5DEECE6)*((y^0xB)+1))>>>0)%100<12) ctx.fillRect(x,hy+y,1,1);
    }
  }
}

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
    if(isSnowing()){
      ctx.fillStyle='rgba(230,245,255,.75)';
      const cw=Math.max(1,Math.floor(tw*.5));
      ctx.fillRect(tx-Math.floor(cw/2),cy-Math.floor(th*.45),cw,1);
    }
  });
  ctx.globalAlpha=1;
}

function px_house(W,hy){
  const scale=1.4;
  const hw=24*scale, hh=12*scale, hx=Math.floor(W/2-hw/2), wy=hy-hh;
  const roofC=isDay?'#b71c1c':isStorm()?'#4a148c':'#6a0dad';
  const wallC=isDay?'#d7b991':'#5f412d';
  const winC =isDay?'#80deea':isStorm()?'#ffd54f':'#fff176';

  // Chimney — positioned relative to pixel house, not smooth canvas
  ctx.fillStyle='#4e342e';
  ctx.fillRect(hx+Math.floor(hw*.25), wy-Math.floor(hh*.9), Math.max(2,Math.floor(scale*3)), Math.floor(hh*.6));

  ctx.fillStyle=wallC;
  ctx.fillRect(hx,wy,hw,hh);

  ctx.fillStyle=roofC;
  for(let r=0;r<7;r++){
    const rw=Math.floor((hw+9)-(6-r)*2.4*scale);
    ctx.fillRect(hx+Math.floor(hw/2)-Math.floor(rw/2),wy-5*scale+r,rw,1);
  }

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

  const dx=hx+Math.floor(hw/2)-2*scale;
  ctx.fillStyle='#5d4037'; ctx.fillRect(dx,wy+hh-6*scale,4*scale,6*scale);
  ctx.fillStyle='#ffd54f'; ctx.fillRect(dx+3*scale,wy+hh-4*scale,1,1);

  ctx.fillStyle=isDay?'#9e9e9e':'#616161';
  ctx.fillRect(dx-1,hy,6*scale,3*scale);

  // Clamp fence extents to canvas width to prevent overflow on narrow pixel canvas
  const fenceL=Math.max(0, hx-Math.floor(21*scale));
  const fenceR=Math.min(W-1, hx+hw+Math.floor(24*scale));
  ctx.fillStyle=isDay?'#e6c96a':'#8d6e63';
  for(let i=0;i<7;i++){
    const fx=hx-Math.floor(21*scale)+i*Math.floor(3*scale);
    if(fx>=0&&fx<W) ctx.fillRect(fx,hy-Math.floor(4*scale),1,Math.floor(4*scale));
  }
  if(fenceL<hx) ctx.fillRect(fenceL,hy-Math.floor(3*scale),hx-fenceL,1);
  for(let i=0;i<7;i++){
    const fx=hx+hw+Math.floor(3*scale)+i*Math.floor(3*scale);
    if(fx>=0&&fx<W) ctx.fillRect(fx,hy-Math.floor(4*scale),1,Math.floor(4*scale));
  }
  if(hx+hw<fenceR) ctx.fillRect(hx+hw,hy-Math.floor(3*scale),fenceR-(hx+hw),1);
}

function px_smoke(){
  // Correct chimney position for pixel canvas
  const scale=1.4;
  const hw=24*scale;
  const hx=Math.floor(canvas.width/2-hw/2);
  const hy=Math.floor(HY());
  const hh=12*scale;
  const chimneyX=hx+Math.floor(hw*.25)+Math.floor(Math.max(2,Math.floor(scale*3))/2);
  const chimneyY=hy-hh-Math.floor(hh*.9);  // matches px_house: wy - floor(hh*.9)

  smoke.forEach(s=>{
    const sx=Math.floor(s.x), sy=Math.floor(s.y);
    if(sx<0||sy<0||sx>=canvas.width||sy>=canvas.height) return;
    ctx.globalAlpha=Math.max(0,s.alpha);
    ctx.fillStyle=s.life>.7?'#e0e0e0':s.life>.4?'#90a4ae':'#546e7a';
    ctx.fillRect(sx,sy,1,1);
  });
  ctx.globalAlpha=1;

  if(Math.random()<.07){
    spawnSmoke(chimneyX, chimneyY);
  }
}

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

function px_snow(){
  snowflakes.forEach(sf=>{
    const sx=Math.floor(sf.x), sy=Math.floor(sf.y);
    if(sx<0||sy<0||sx>=canvas.width||sy>=canvas.height) return;
    ctx.fillStyle='#ebf5ff'; ctx.fillRect(sx,sy,1,1);
  });
}

function px_lightning(W,H){
  if(lightningFlash>.04){
    ctx.globalAlpha=lightningFlash*.18;
    ctx.fillStyle='#c8e1ff'; ctx.fillRect(0,0,W,H);
    ctx.globalAlpha=1;
  }
  lightningBolts.forEach(b=>{
    ctx.globalAlpha=b.life; ctx.fillStyle='#c8dcff';
    b.segs.forEach(s=>{
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

  if(CFG.locationMode==='manual' && CFG.manualLocation){
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
    }catch(e){ console.error('Geocoding failed:', e); }
  } else if(CFG.autoLocation){
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
    // Stars twinkle — only once per frame (updatePhysics handles the rest)
    // Note: updatePhysics() is called inside renderPixelMode → do NOT also
    //       twinkle stars here to avoid the double-update bug.
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

  // Overlay effects (always in screen-space)
  updateShootingStars();

  requestAnimationFrame(loop);
}

// Physics-only update — used by pixel mode
function updatePhysics(){
  clouds.forEach(c=>{ c.x+=c.spd; });
  clouds=clouds.filter(c=>c.x<canvas.width+250);
  const maxC=condition==='clear'?2:condition==='partly-cloudy'?5:9;
  while(clouds.length<maxC) spawnCloud();

  if(isRaining()){
    const target=condition==='drizzle'?20:isStorm()?60:40;
    while(raindrops.length<target) spawnDrop(false);
    raindrops.forEach(d=>{ d.x+=d.vx; d.y+=d.vy; });
    raindrops=raindrops.filter(d=>d.y<HY()+25&&d.x>-10&&d.x<canvas.width+10);
  }

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

  if(!isDay && fireflies.length > 0){
    fireflies.forEach(f=>{
      f.x+=f.vx; f.y+=f.vy;
      f.alpha+=f.aSpd*f.aDir;
      if(f.alpha>=1||f.alpha<=0) f.aDir*=-1;
      if(f.x<0||f.x>canvas.width) f.vx*=-1;
      if(f.y<HY()*.45||f.y>HY()) f.vy*=-1;
    });
  }

  smoke.forEach(s=>{ s.x+=s.vx; s.y+=s.vy; s.r+=.18; s.alpha-=.009; s.life-=.012; });
  smoke=smoke.filter(s=>s.life>0&&s.alpha>0);
  // Note: pixel-mode smoke spawning is handled inside px_smoke() with correct coords.

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

  if(isDay&&!isRaining()&&!isSnowing()){
    birds.forEach(b=>{
      b.x+=b.spd;
      b.wing=(b.wing+b.wingSpd)%(Math.PI*2);
    });
    birds=birds.filter(b=>b.x<canvas.width+60);
    if(birds.length<5&&Math.random()<.004) spawnBird();
  }

  if(isDay&&(condition==='clear'||condition==='partly-cloudy')){
    planes.forEach(p=>{
      p.x+=p.spd;
      p.trail.push({x:p.x,y:p.y});
      if(p.trail.length>80) p.trail.shift();
    });
    planes=planes.filter(p=>p.x<canvas.width+160);
    if(planes.length<1 && Math.random()<.0008) spawnPlane();
  }

  // Star twinkle lives here for pixel mode only
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
    CFG=m.config;
    if(!CFG.pixelMode){ buildTrees(); }
    updateHUD();
    updateControlStates();
  }
});

// ============================================================
//  BOOT
// ============================================================
buildKeyhint();
updateWindRose();
loop();
if(SIM.condition) applySimulate(SIM.condition,SIM.night);
else fetchWeather().catch(offlineWeather);
setInterval(()=>{ if(!SIM.condition) fetchWeather().catch(()=>{ isOffline=true; updateHUD(); }); }, 5*60*1000);
</script>
</body>
</html>`
}
