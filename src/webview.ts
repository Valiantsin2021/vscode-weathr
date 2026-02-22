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
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; height: 100%; overflow: hidden; background: #0a0a1a; font-family: 'Courier New', Courier, monospace; }
  #canvas { display: block; width: 100%; height: 100%; }
  #hud {
    position: absolute;
    bottom: 0; left: 0; right: 0;
    padding: 6px 12px;
    background: rgba(0,0,0,0.55);
    color: #00e5ff;
    font-size: 11px;
    letter-spacing: 0.04em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    border-top: 1px solid rgba(0,229,255,0.2);
    backdrop-filter: blur(4px);
  }
  #hud span { opacity: 0.7; margin-right: 10px; }
  #hud .offline { color: #ff5252; font-weight: bold; }
  #loading-overlay {
    position: absolute; inset: 0;
    display: flex; align-items: center; justify-content: center;
    flex-direction: column; gap: 12px;
    background: #0a0a1a;
    color: #00e5ff;
    font-size: 14px;
    transition: opacity 0.5s;
  }
  #loading-overlay.hidden { opacity: 0; pointer-events: none; }
  .spinner { width: 32px; height: 32px; border: 3px solid rgba(0,229,255,0.2); border-top-color: #00e5ff; border-radius: 50%; animation: spin 0.8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  #error-bar {
    position: absolute; top: 0; left: 0; right: 0;
    background: rgba(255,82,82,0.85);
    color: #fff; font-size: 11px; padding: 5px 12px;
    display: none;
  }
</style>
</head>
<body>
<canvas id="canvas"></canvas>
<div id="hud"></div>
<div id="loading-overlay"><div class="spinner"></div><span>Fetching weather data...</span></div>
<div id="error-bar"></div>

<script>
// ============================================================
// Configuration (injected from extension)
// ============================================================
let CFG = ${configJson};
let SIMULATE = ${simulateJson};

// ============================================================
// Canvas setup
// ============================================================
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const hud = document.getElementById('hud');
const loadingOverlay = document.getElementById('loading-overlay');
const errorBar = document.getElementById('error-bar');

function resize() {
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
}
resize();
window.addEventListener('resize', () => { resize(); initScene(); });

// ============================================================
// Weather State
// ============================================================
let weatherData = null;
let isOffline = false;
let isDay = true;
let condition = 'clear';
let temperature = 20;
let apparentTemp = 19;
let humidity = 60;
let precipitation = 0;
let windSpeed = 10;
let windDirection = 180;
let cloudCover = 20;
let pressure = 1013;
let moonPhase = 0.5;

// ============================================================
// Animation particles / entities
// ============================================================
let raindrops = [];
let snowflakes = [];
let clouds = [];
let stars = [];
let fireflies = [];
let birds = [];
let airplanes = [];
let fogParticles = [];
let leaves = [];
let lightningFlash = 0;
let chimneySmoke = [];
let frame = 0;
let animFrame = null;

// Speed multiplier from config
function speedMultiplier() {
    return CFG.animationSpeed === 'slow' ? 0.5 : CFG.animationSpeed === 'fast' ? 2.0 : 1.0;
}

// ============================================================
// COLOR PALETTE  (day / night variants)
// ============================================================
function skyGradient() {
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    if (!isDay) {
        grad.addColorStop(0, '#020312');
        grad.addColorStop(1, '#0d0d2b');
    } else if (condition === 'thunderstorm' || condition === 'thunderstorm-hail') {
        grad.addColorStop(0, '#1a1a2e');
        grad.addColorStop(1, '#2a2a3e');
    } else if (condition === 'fog') {
        grad.addColorStop(0, '#8a9ba8');
        grad.addColorStop(1, '#b0bec5');
    } else if (condition === 'overcast' || condition === 'cloudy') {
        grad.addColorStop(0, '#546e7a');
        grad.addColorStop(1, '#78909c');
    } else if (condition === 'clear') {
        grad.addColorStop(0, '#1a237e');
        grad.addColorStop(1, '#42a5f5');
    } else if (condition === 'partly-cloudy') {
        grad.addColorStop(0, '#283593');
        grad.addColorStop(1, '#64b5f6');
    } else {
        grad.addColorStop(0, '#1e2a45');
        grad.addColorStop(1, '#37474f');
    }
    return grad;
}

function groundColor() {
    if (condition === 'snow' || condition === 'snow-grains' || condition === 'snow-showers') {
        return isDay ? '#e0f2f1' : '#b2dfdb';
    }
    return isDay ? '#2e7d32' : '#1b5e20';
}

// ============================================================
// SCENE INIT  –  spawn initial particles
// ============================================================
function initScene() {
    raindrops = [];
    snowflakes = [];
    clouds = [];
    stars = [];
    fireflies = [];
    birds = [];
    airplanes = [];
    fogParticles = [];
    leaves = [];
    chimneySmoke = [];

    // Stars (night)
    if (!isDay) {
        for (let i = 0; i < 120; i++) {
            stars.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height * 0.65,
                r: Math.random() * 1.5 + 0.3,
                alpha: Math.random(),
                twinkleSpeed: Math.random() * 0.04 + 0.01
            });
        }
    }

    // Clouds
    let cloudCount = condition === 'clear' ? 2 : condition === 'partly-cloudy' ? 4 : condition === 'overcast' ? 7 : 5;
    for (let i = 0; i < cloudCount; i++) {
        spawnCloud(Math.random() * canvas.width);
    }

    // Rain
    if (isRaining()) {
        let count = condition === 'drizzle' ? 40 : condition === 'thunderstorm-hail' ? 200 : condition === 'freezing-rain' ? 150 : 90;
        for (let i = 0; i < count; i++) spawnRaindrop(true);
    }

    // Snow
    if (isSnowing()) {
        let count = condition === 'snow-grains' ? 50 : condition === 'snow-showers' ? 100 : 120;
        for (let i = 0; i < count; i++) spawnSnowflake(true);
    }

    // Fog
    if (condition === 'fog') {
        for (let i = 0; i < 30; i++) spawnFogParticle(true);
    }

    // Birds (clear/partly-cloudy day)
    if (isDay && !isRaining() && !isSnowing() && condition !== 'fog') {
        for (let i = 0; i < 5; i++) spawnBird();
    }

    // Airplane (clear/partly-cloudy day)
    if (isDay && (condition === 'clear' || condition === 'partly-cloudy')) {
        spawnAirplane();
    }

    // Fireflies (warm clear night)
    if (!isDay && (condition === 'clear' || condition === 'partly-cloudy') && temperature > 15) {
        for (let i = 0; i < 20; i++) spawnFirefly();
    }

    // Falling leaves
    if (CFG.showLeaves && !isRaining() && !isSnowing()) {
        for (let i = 0; i < 16; i++) spawnLeaf(true);
    }
}

// ============================================================
// SPAWN helpers
// ============================================================
function horizonY() { return canvas.height * 0.72; }

function spawnCloud(x) {
    clouds.push({
        x: x ?? canvas.width + 60,
        y: Math.random() * canvas.height * 0.30 + 20,
        w: Math.random() * 100 + 60,
        h: Math.random() * 30 + 20,
        speed: (Math.random() * 0.3 + 0.1) * speedMultiplier(),
        alpha: condition === 'overcast' ? 0.9 : condition === 'fog' ? 0.6 : 0.75
    });
}

function spawnRaindrop(init) {
    const angle = (windDirection - 90) * Math.PI / 180;
    const speed = (Math.random() * 4 + 4) * speedMultiplier();
    raindrops.push({
        x: init ? Math.random() * canvas.width : -20,
        y: init ? Math.random() * horizonY() : Math.random() * -100,
        vx: Math.cos(angle) * 1.5 * (windSpeed / 20),
        vy: speed,
        len: Math.random() * 10 + 8,
        alpha: condition === 'drizzle' ? 0.4 : 0.7,
        isHail: condition === 'thunderstorm-hail' || condition === 'freezing-rain'
    });
}

function spawnSnowflake(init) {
    snowflakes.push({
        x: Math.random() * canvas.width,
        y: init ? Math.random() * horizonY() : -10,
        r: Math.random() * 3 + 1,
        vy: (Math.random() * 1 + 0.5) * speedMultiplier(),
        vx: (Math.random() - 0.5) * 0.5,
        wobble: Math.random() * Math.PI * 2,
        wobbleSpeed: Math.random() * 0.05 + 0.02
    });
}

function spawnFogParticle(init) {
    fogParticles.push({
        x: init ? Math.random() * canvas.width : -50,
        y: Math.random() * canvas.height,
        w: Math.random() * 180 + 80,
        h: Math.random() * 50 + 20,
        speed: (Math.random() * 0.5 + 0.2) * speedMultiplier(),
        alpha: Math.random() * 0.25 + 0.1
    });
}

function spawnBird() {
    birds.push({
        x: -30,
        y: Math.random() * horizonY() * 0.7 + 20,
        speed: (Math.random() * 1.5 + 1) * speedMultiplier(),
        wing: 0,
        wingDir: 1,
        size: Math.random() * 5 + 4
    });
}

function spawnAirplane() {
    airplanes.push({
        x: -100,
        y: Math.random() * horizonY() * 0.45 + 30,
        speed: (Math.random() * 1.5 + 2) * speedMultiplier(),
        dir: 1,
        trail: []
    });
}

function spawnFirefly() {
    const hy = horizonY();
    fireflies.push({
        x: Math.random() * canvas.width,
        y: hy * 0.5 + Math.random() * hy * 0.45,
        vx: (Math.random() - 0.5) * 0.6,
        vy: (Math.random() - 0.5) * 0.4,
        alpha: Math.random(),
        alphaDir: Math.random() > 0.5 ? 1 : -1,
        alphaSpeed: Math.random() * 0.03 + 0.01,
        r: Math.random() * 2 + 1
    });
}

function spawnLeaf(init) {
    leaves.push({
        x: Math.random() * canvas.width,
        y: init ? Math.random() * horizonY() : -16,
        vy: (Math.random() * 1.2 + 0.6) * speedMultiplier(),
        vx: (Math.random() - 0.5) * 1.2,
        angle: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.1,
        size: Math.random() * 8 + 5,
        color: ['#d32f2f','#e64a19','#f57f17','#e65100','#ff8f00'][Math.floor(Math.random()*5)]
    });
}

function spawnChimneySmoke(x, y) {
    chimneySmoke.push({
        x, y, vy: -(Math.random() * 0.8 + 0.3) * speedMultiplier(),
        vx: (Math.random() - 0.5) * 0.5,
        r: Math.random() * 4 + 3,
        alpha: 0.6,
        life: 1.0
    });
}

// ============================================================
// Condition helpers
// ============================================================
function isRaining() {
    return ['drizzle','rain','rain-showers','freezing-rain','thunderstorm','thunderstorm-hail'].includes(condition);
}
function isSnowing() {
    return ['snow','snow-grains','snow-showers'].includes(condition);
}
function isThunderstorm() {
    return condition === 'thunderstorm' || condition === 'thunderstorm-hail';
}

// ============================================================
// SUN drawing
// ============================================================
function drawSun() {
    if (!isDay) return;
    if (isRaining() || isSnowing() || condition === 'fog' || condition === 'overcast') return;

    const px = canvas.width * 0.8;
    const py = canvas.height * 0.12;
    const r = 30;
    const pulse = Math.sin(frame * 0.03) * 3;

    // Rays
    ctx.save();
    ctx.translate(px, py);
    ctx.strokeStyle = 'rgba(255,235,59,0.5)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2 + frame * 0.01;
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * (r + 6 + pulse), Math.sin(angle) * (r + 6 + pulse));
        ctx.lineTo(Math.cos(angle) * (r + 18 + pulse), Math.sin(angle) * (r + 18 + pulse));
        ctx.stroke();
    }

    // Glow
    const glow = ctx.createRadialGradient(0, 0, r * 0.5, 0, 0, r * 2.5);
    glow.addColorStop(0, 'rgba(255,235,59,0.3)');
    glow.addColorStop(1, 'rgba(255,235,59,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, r * 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Sun body
    const bodyGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    bodyGrad.addColorStop(0, '#fff9c4');
    bodyGrad.addColorStop(1, '#ffeb3b');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

// ============================================================
// MOON drawing
// ============================================================
function drawMoon() {
    if (isDay) return;
    const px = canvas.width * 0.75;
    const py = canvas.height * 0.12;
    const r = 22;

    ctx.save();
    ctx.translate(px, py);

    // Glow
    const glow = ctx.createRadialGradient(0, 0, r, 0, 0, r * 3);
    glow.addColorStop(0, 'rgba(255,253,231,0.25)');
    glow.addColorStop(1, 'rgba(255,253,231,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, r * 3, 0, Math.PI * 2);
    ctx.fill();

    // Moon body
    ctx.fillStyle = '#fff9e6';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    // Shadow (crescent)
    const shadowX = r * 0.4 * (moonPhase > 0.5 ? 1 : -1);
    ctx.fillStyle = '#0d0d2b';
    ctx.beginPath();
    ctx.arc(shadowX, 0, r * 0.85, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

// ============================================================
// STARS
// ============================================================
function updateStars() {
    if (isDay) return;
    stars.forEach(s => {
        s.alpha += s.twinkleSpeed * (s.alpha > 0.9 ? -1 : s.alpha < 0.2 ? 1 : (Math.random() > 0.5 ? 1 : -1));
        s.alpha = Math.max(0.1, Math.min(1, s.alpha));
    });
}
function drawStars() {
    if (isDay) return;
    stars.forEach(s => {
        ctx.save();
        ctx.globalAlpha = s.alpha;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    });
}

// ============================================================
// CLOUDS
// ============================================================
function updateClouds() {
    clouds.forEach(c => { c.x += c.speed; });
    clouds = clouds.filter(c => c.x < canvas.width + 200);
    const maxClouds = condition === 'clear' ? 2 : condition === 'partly-cloudy' ? 4 : 7;
    if (clouds.length < maxClouds && Math.random() < 0.005) spawnCloud();
}
function drawCloud(c) {
    ctx.save();
    ctx.globalAlpha = c.alpha;
    const night = !isDay;
    ctx.fillStyle = night ? '#2c2c3e' : (condition === 'thunderstorm' || isRaining() ? '#546e7a' : '#eceff1');
    // Draw puffs
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.h * 0.7, 0, Math.PI * 2);
    ctx.arc(c.x + c.w * 0.3, c.y - c.h * 0.2, c.h * 0.9, 0, Math.PI * 2);
    ctx.arc(c.x + c.w * 0.65, c.y, c.h * 0.7, 0, Math.PI * 2);
    ctx.arc(c.x + c.w * 0.2, c.y + c.h * 0.15, c.h * 0.5, 0, Math.PI * 2);
    ctx.arc(c.x + c.w * 0.5, c.y + c.h * 0.15, c.h * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

// ============================================================
// RAIN
// ============================================================
function updateRain() {
    const angle = (windDirection - 90) * Math.PI / 180;
    raindrops.forEach(r => {
        r.x += r.vx + Math.cos(angle) * speedMultiplier();
        r.y += r.vy;
    });
    raindrops = raindrops.filter(r => r.y < horizonY() + 20 && r.x > -50 && r.x < canvas.width + 50);
    const target = condition === 'drizzle' ? 40 : isThunderstorm() ? 200 : 90;
    while (raindrops.length < target) spawnRaindrop(false);
}
function drawRain() {
    if (!isRaining()) return;
    raindrops.forEach(rd => {
        ctx.save();
        ctx.globalAlpha = rd.alpha;
        if (rd.isHail) {
            ctx.fillStyle = '#b0e0e6';
            ctx.beginPath();
            ctx.arc(rd.x, rd.y, 2.5, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.strokeStyle = condition === 'drizzle' ? 'rgba(144,202,249,0.6)' : 'rgba(100,181,246,0.8)';
            ctx.lineWidth = condition === 'drizzle' ? 1 : 1.5;
            ctx.beginPath();
            ctx.moveTo(rd.x, rd.y);
            ctx.lineTo(rd.x + rd.vx * 3, rd.y - rd.len);
            ctx.stroke();
        }
        ctx.restore();
    });
}

// ============================================================
// SNOW
// ============================================================
function updateSnow() {
    snowflakes.forEach(s => {
        s.wobble += s.wobbleSpeed;
        s.x += Math.sin(s.wobble) * 0.5 + s.vx;
        s.y += s.vy;
        s.angle += s.spin;
    });
    snowflakes = snowflakes.filter(s => s.y < horizonY() + 10);
    const target = condition === 'snow-grains' ? 50 : 120;
    while (snowflakes.length < target) spawnSnowflake(false);
}
function drawSnow() {
    if (!isSnowing()) return;
    snowflakes.forEach(sf => {
        ctx.save();
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = '#e3f2fd';
        ctx.translate(sf.x, sf.y);
        ctx.rotate(sf.angle);
        ctx.beginPath();
        ctx.arc(0, 0, sf.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    });
}

// ============================================================
// THUNDERSTORM lightning
// ============================================================
let nextLightningFrame = 0;
let lightningBolts = [];

function updateThunderstorm() {
    if (!isThunderstorm()) return;
    lightningFlash = Math.max(0, lightningFlash - 0.05);
    if (frame >= nextLightningFrame) {
        nextLightningFrame = frame + Math.floor(Math.random() * 120 + 40);
        lightningFlash = 1.0;
        const x = Math.random() * canvas.width;
        lightningBolts.push({ x, segments: buildLightning(x, 0, horizonY()), life: 1.0 });
    }
    lightningBolts.forEach(b => { b.life -= 0.08; });
    lightningBolts = lightningBolts.filter(b => b.life > 0);
}

function buildLightning(x, yStart, yEnd) {
    const segs = [];
    let cx = x, cy = yStart;
    while (cy < yEnd) {
        const nx = cx + (Math.random() - 0.5) * 50;
        const ny = cy + Math.random() * 40 + 20;
        segs.push({ x1: cx, y1: cy, x2: nx, y2: ny });
        cx = nx; cy = ny;
    }
    return segs;
}

function drawThunderstorm() {
    if (!isThunderstorm()) return;
    // Flash overlay
    if (lightningFlash > 0.05) {
        ctx.save();
        ctx.fillStyle = \`rgba(200,230,255,\${lightningFlash * 0.15})\`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
    }
    // Bolts
    lightningBolts.forEach(b => {
        ctx.save();
        ctx.globalAlpha = b.life;
        ctx.strokeStyle = '#c0d8ff';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#80b0ff';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        b.segments.forEach((s, i) => {
            if (i === 0) ctx.moveTo(s.x1, s.y1);
            ctx.lineTo(s.x2, s.y2);
        });
        ctx.stroke();
        ctx.restore();
    });
}

// ============================================================
// FOG
// ============================================================
function updateFog() {
    fogParticles.forEach(f => { f.x += f.speed; });
    fogParticles = fogParticles.filter(f => f.x < canvas.width + 200);
    if (fogParticles.length < 25 && Math.random() < 0.03) spawnFogParticle(false);
}
function drawFog() {
    if (condition !== 'fog') return;
    fogParticles.forEach(f => {
        ctx.save();
        ctx.globalAlpha = f.alpha;
        const grad = ctx.createRadialGradient(f.x + f.w / 2, f.y + f.h / 2, 0, f.x + f.w / 2, f.y + f.h / 2, f.w / 2);
        grad.addColorStop(0, 'rgba(176,190,197,1)');
        grad.addColorStop(1, 'rgba(176,190,197,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(f.x + f.w / 2, f.y + f.h / 2, f.w / 2, f.h / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    });
}

// ============================================================
// BIRDS  (simple W-shape wings)
// ============================================================
function updateBirds() {
    if (!isDay || isRaining() || isSnowing()) return;
    birds.forEach(b => {
        b.x += b.speed;
        b.wing += 0.12 * b.wingDir * speedMultiplier();
        if (Math.abs(b.wing) > 0.4) b.wingDir *= -1;
    });
    birds = birds.filter(b => b.x < canvas.width + 50);
    if (birds.length < 5 && Math.random() < 0.004) spawnBird();
}
function drawBirds() {
    if (!isDay) return;
    birds.forEach(b => {
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.strokeStyle = isDay ? '#37474f' : '#90a4ae';
        ctx.lineWidth = 1.4;
        ctx.lineJoin = 'round';
        const w = b.wing;
        const s = b.size;
        ctx.beginPath();
        // Left wing
        ctx.moveTo(-s, w * s * 1.5);
        ctx.quadraticCurveTo(-s * 0.5, -w * s, 0, 0);
        // Right wing
        ctx.quadraticCurveTo(s * 0.5, -w * s, s, w * s * 1.5);
        ctx.stroke();
        ctx.restore();
    });
}

// ============================================================
// AIRPLANE
// ============================================================
function updateAirplanes() {
    if (!isDay || !(condition === 'clear' || condition === 'partly-cloudy')) return;
    airplanes.forEach(a => {
        a.x += a.speed;
        a.trail.push({ x: a.x - 12, y: a.y });
        if (a.trail.length > 60) a.trail.shift();
    });
    airplanes = airplanes.filter(a => a.x < canvas.width + 150);
    if (airplanes.length < 1 && Math.random() < 0.001) spawnAirplane();
}
function drawAirplanes() {
    airplanes.forEach(a => {
        // Trail
        if (a.trail.length > 1) {
            ctx.save();
            for (let i = 1; i < a.trail.length; i++) {
                const alpha = i / a.trail.length * 0.35;
                ctx.globalAlpha = alpha;
                ctx.strokeStyle = '#e0f7fa';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(a.trail[i - 1].x, a.trail[i - 1].y);
                ctx.lineTo(a.trail[i].x, a.trail[i].y);
                ctx.stroke();
            }
            ctx.restore();
        }

        // Body
        ctx.save();
        ctx.translate(a.x, a.y);
        ctx.fillStyle = '#eceff1';
        ctx.strokeStyle = '#90a4ae';
        ctx.lineWidth = 1;
        // fuselage
        ctx.beginPath();
        ctx.ellipse(0, 0, 16, 4, 0, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
        // wing
        ctx.beginPath();
        ctx.moveTo(-2, 0); ctx.lineTo(-8, -11); ctx.lineTo(8, 0); ctx.lineTo(-2, 0);
        ctx.fill(); ctx.stroke();
        // tail
        ctx.beginPath();
        ctx.moveTo(-14, 0); ctx.lineTo(-18, -6); ctx.lineTo(-12, 0); ctx.lineTo(-14, 0);
        ctx.fill(); ctx.stroke();
        ctx.restore();
    });
}

// ============================================================
// FIREFLIES
// ============================================================
function updateFireflies() {
    if (isDay || temperature <= 15) return;
    fireflies.forEach(f => {
        f.x += f.vx;
        f.y += f.vy;
        f.alpha += f.alphaSpeed * f.alphaDir;
        if (f.alpha >= 1 || f.alpha <= 0) f.alphaDir *= -1;
        if (f.x < 0 || f.x > canvas.width) f.vx *= -1;
        if (f.y < horizonY() * 0.5 || f.y > horizonY()) f.vy *= -1;
    });
}
function drawFireflies() {
    if (isDay) return;
    fireflies.forEach(f => {
        ctx.save();
        ctx.globalAlpha = f.alpha;
        const grd = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r * 4);
        grd.addColorStop(0, 'rgba(204,255,51,1)');
        grd.addColorStop(1, 'rgba(204,255,51,0)');
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r * 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ccff33';
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    });
}

// ============================================================
// LEAVES
// ============================================================
function updateLeaves() {
    if (!CFG.showLeaves || isRaining() || isSnowing()) return;
    leaves.forEach(l => {
        l.x += l.vx + Math.sin(frame * 0.02 + l.wobble) * 0.4;
        l.y += l.vy;
        l.angle += l.spin;
        if (!l.wobble) l.wobble = Math.random() * Math.PI * 2;
    });
    leaves = leaves.filter(l => l.y < horizonY() + 20);
    const target = 12;
    while (leaves.length < target && Math.random() < 0.05) spawnLeaf(false);
}
function drawLeaves() {
    if (!CFG.showLeaves) return;
    leaves.forEach(l => {
        ctx.save();
        ctx.translate(l.x, l.y);
        ctx.rotate(l.angle);
        ctx.fillStyle = l.color;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.ellipse(0, 0, l.size, l.size * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    });
}

// ============================================================
// CHIMNEY SMOKE
// ============================================================
function updateChimneySmoke() {
    chimneySmoke.forEach(s => {
        s.x += s.vx;
        s.y += s.vy;
        s.r += 0.15;
        s.alpha -= 0.008;
        s.life -= 0.01;
    });
    chimneySmoke = chimneySmoke.filter(s => s.life > 0 && s.alpha > 0);

    if (!isRaining() && !isThunderstorm() && Math.random() < 0.08) {
        const hx = canvas.width / 2 - 70;
        const hy = horizonY() - 90;
        spawnChimneySmoke(hx, hy);
    }
}
function drawChimneySmoke() {
    chimneySmoke.forEach(s => {
        ctx.save();
        ctx.globalAlpha = s.alpha;
        ctx.fillStyle = isDay ? '#90a4ae' : '#546e7a';
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    });
}

// ============================================================
// SCENE  (ground + house ASCII-art rendered as canvas shapes)
// ============================================================
function drawGround() {
    const hy = horizonY();
    // Ground
    const gGrad = ctx.createLinearGradient(0, hy, 0, canvas.height);
    if (isSnowing()) {
        gGrad.addColorStop(0, isDay ? '#e8f5e9' : '#c8e6c9');
        gGrad.addColorStop(1, isDay ? '#f1f8e9' : '#dcedc8');
    } else {
        gGrad.addColorStop(0, isDay ? '#388e3c' : '#2e7d32');
        gGrad.addColorStop(1, isDay ? '#2e7d32' : '#1b5e20');
    }
    ctx.fillStyle = gGrad;
    ctx.fillRect(0, hy, canvas.width, canvas.height - hy);

    // Horizon line glow
    ctx.save();
    ctx.strokeStyle = isSnowing() ? 'rgba(200,230,200,0.3)' : 'rgba(76,175,80,0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, hy); ctx.lineTo(canvas.width, hy);
    ctx.stroke();
    ctx.restore();
}

function drawHouse() {
    const hy = horizonY();
    const cx = canvas.width / 2 - 50;
    const houseW = 130;
    const houseH = 80;
    const by = hy - 6; // base y

    const roofColor = isDay ? '#c62828' : '#6a0dad';
    const wallColor = isDay ? 'rgba(210,180,140,1)' : 'rgba(100,70,50,1)';
    const windowColor = isDay ? '#80deea' : '#fff176';
    const doorColor = '#6d4c41';

    // Roof (triangle)
    ctx.save();
    ctx.fillStyle = roofColor;
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(cx - 15, by - houseH + 10);
    ctx.lineTo(cx + houseW + 15, by - houseH + 10);
    ctx.lineTo(cx + houseW * 0.7, by - houseH - 35);
    ctx.lineTo(cx + houseW * 0.3, by - houseH - 35);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Chimney
    ctx.save();
    ctx.fillStyle = '#5d4037';
    ctx.fillRect(cx + 22, by - houseH - 50, 14, 28);
    ctx.restore();

    // Wall
    ctx.save();
    ctx.fillStyle = wallColor;
    ctx.shadowColor = 'rgba(0,0,0,0.2)';
    ctx.shadowBlur = 4;
    ctx.fillRect(cx, by - houseH, houseW, houseH);
    ctx.restore();

    // Windows (2x)
    ctx.save();
    ctx.fillStyle = windowColor;
    ctx.shadowColor = windowColor;
    ctx.shadowBlur = isDay ? 0 : 12;
    ctx.fillRect(cx + 15, by - houseH + 18, 22, 20);
    ctx.fillRect(cx + houseW - 37, by - houseH + 18, 22, 20);
    // window pane cross
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx + 26, by - houseH + 18); ctx.lineTo(cx + 26, by - houseH + 38);
    ctx.moveTo(cx + 15, by - houseH + 28); ctx.lineTo(cx + 37, by - houseH + 28);
    ctx.moveTo(cx + houseW - 26, by - houseH + 18); ctx.lineTo(cx + houseW - 26, by - houseH + 38);
    ctx.moveTo(cx + houseW - 37, by - houseH + 28); ctx.lineTo(cx + houseW - 15, by - houseH + 28);
    ctx.stroke();
    ctx.restore();

    // Door
    ctx.save();
    ctx.fillStyle = doorColor;
    const dw = 20, dh = 30;
    const dx = cx + houseW / 2 - dw / 2;
    ctx.fillRect(dx, by - dh, dw, dh);
    ctx.beginPath();
    ctx.arc(dx + dw / 2, by - dh, dw / 2, Math.PI, 0);
    ctx.fill();
    // door knob
    ctx.fillStyle = '#ffd54f';
    ctx.beginPath();
    ctx.arc(dx + dw - 5, by - dh / 2, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Road / path
    ctx.save();
    ctx.fillStyle = isDay ? '#9e9e9e' : '#616161';
    ctx.beginPath();
    ctx.moveTo(cx + houseW / 2 - 12, by);
    ctx.lineTo(cx + houseW / 2 + 12, by);
    ctx.lineTo(cx + houseW / 2 + 20, hy + 10);
    ctx.lineTo(cx + houseW / 2 - 20, hy + 10);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Fence
    for (let i = 0; i < 6; i++) {
        const fx = cx - 50 + i * 14;
        const fy = by - 20;
        ctx.save();
        ctx.fillStyle = isDay ? '#ffe082' : '#8d6e63';
        ctx.fillRect(fx, fy, 4, 20);
        ctx.beginPath();
        ctx.moveTo(fx, fy);
        ctx.lineTo(fx + 2, fy - 6);
        ctx.lineTo(fx + 4, fy);
        ctx.fill();
        ctx.restore();
    }
    for (let i = 0; i < 6; i++) {
        const fx = cx + houseW + 8 + i * 14;
        const fy = by - 20;
        ctx.save();
        ctx.fillStyle = isDay ? '#ffe082' : '#8d6e63';
        ctx.fillRect(fx, fy, 4, 20);
        ctx.beginPath();
        ctx.moveTo(fx, fy);
        ctx.lineTo(fx + 2, fy - 6);
        ctx.lineTo(fx + 4, fy);
        ctx.fill();
        ctx.restore();
    }
}

function drawDecorations() {
    const hy = horizonY();
    // Trees (left)
    for (let t = 0; t < 3; t++) {
        const tx = 40 + t * 60;
        const ty = hy - 5;
        drawTree(tx, ty, isDay);
    }
    // Trees (right)
    for (let t = 0; t < 2; t++) {
        const tx = canvas.width - 60 - t * 60;
        const ty = hy - 5;
        drawTree(tx, ty, isDay);
    }
}

function drawTree(x, y, day) {
    const snowOnTree = isSnowing() || condition === 'snow-grains';
    // Trunk
    ctx.save();
    ctx.fillStyle = day ? '#5d4037' : '#3e2723';
    ctx.fillRect(x - 4, y - 28, 8, 28);
    ctx.restore();
    // Foliage (layered triangles)
    const leafColor = snowOnTree ? '#a5d6a7' : (day ? '#2e7d32' : '#1b5e20');
    const snowColor = 'rgba(255,255,255,0.8)';
    [0, 10, 20].forEach((offset, i) => {
        const w = 30 - i * 4;
        const h = 22;
        const layerY = y - 28 - offset;
        ctx.save();
        ctx.fillStyle = leafColor;
        ctx.beginPath();
        ctx.moveTo(x - w, layerY);
        ctx.lineTo(x + w, layerY);
        ctx.lineTo(x, layerY - h);
        ctx.closePath();
        ctx.fill();
        if (snowOnTree) {
            ctx.fillStyle = snowColor;
            ctx.beginPath();
            ctx.moveTo(x - w * 0.4, layerY - h * 0.4);
            ctx.lineTo(x + w * 0.4, layerY - h * 0.4);
            ctx.lineTo(x, layerY - h);
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();
    });
}

// ============================================================
// HUD
// ============================================================
function updateHUD() {
    if (CFG.hideHUD) {
        hud.style.display = 'none';
        return;
    }
    hud.style.display = 'block';

    if (!weatherData && !isOffline) {
        hud.innerHTML = 'Weather: Loading... <span class="spinner-inline">|</span>';
        return;
    }

    const condText = condition.replace(/-/g, ' ').replace(/\\b\\w/g, c => c.toUpperCase());
    const tempStr = formatTemp(temperature);
    const windStr = formatWind(windSpeed);
    const precipStr = formatPrecip(precipitation);

    let locStr = '';
    if (!CFG.hideLocation) {
        const lat = CFG.latitude >= 0 ? CFG.latitude.toFixed(2) + '°N' : (-CFG.latitude).toFixed(2) + '°S';
        const lon = CFG.longitude >= 0 ? CFG.longitude.toFixed(2) + '°E' : (-CFG.longitude).toFixed(2) + '°W';
        locStr = \`<span>📍 \${lat}, \${lon}</span>\`;
    }

    const offlineTag = isOffline ? '<span class="offline">OFFLINE</span>' : '';

    hud.innerHTML = \`\${offlineTag}<span>🌤 \${condText}</span><span>🌡 \${tempStr}</span><span>💨 \${windStr}</span><span>🌧 \${precipStr}</span>\${locStr}\`;
}

function formatTemp(v) {
    if (CFG.temperatureUnit === 'fahrenheit') return (v * 9 / 5 + 32).toFixed(1) + '°F';
    return v.toFixed(1) + '°C';
}
function formatWind(v) {
    let val = v, unit = 'km/h';
    if (CFG.windSpeedUnit === 'ms') { val = v / 3.6; unit = 'm/s'; }
    else if (CFG.windSpeedUnit === 'mph') { val = v * 0.621371; unit = 'mph'; }
    else if (CFG.windSpeedUnit === 'kn') { val = v * 0.539957; unit = 'kn'; }
    return val.toFixed(1) + ' ' + unit;
}
function formatPrecip(v) {
    if (CFG.precipitationUnit === 'inch') return (v / 25.4).toFixed(2) + '"';
    return v.toFixed(1) + 'mm';
}

// ============================================================
// WEATHER FETCH  (Open-Meteo API)
// ============================================================
const WMO_MAP = {
    0:'clear', 1:'clear', 2:'partly-cloudy', 3:'overcast',
    45:'fog', 48:'fog',
    51:'drizzle', 53:'drizzle', 55:'drizzle',
    61:'rain', 63:'rain', 65:'rain',
    66:'freezing-rain', 67:'freezing-rain',
    71:'snow', 73:'snow', 75:'snow',
    77:'snow-grains',
    80:'rain-showers', 81:'rain-showers', 82:'rain-showers',
    85:'snow-showers', 86:'snow-showers',
    95:'thunderstorm',
    96:'thunderstorm-hail', 99:'thunderstorm-hail'
};

async function fetchWeather() {
    let lat = CFG.latitude;
    let lon = CFG.longitude;

    if (CFG.autoLocation) {
        try {
            const geo = await fetch('https://ipinfo.io/json').then(r => r.json());
            if (geo && geo.loc) {
                const parts = geo.loc.split(',');
                lat = parseFloat(parts[0]);
                lon = parseFloat(parts[1]);
                CFG.latitude = lat;
                CFG.longitude = lon;
            }
        } catch(e) {
            console.warn('Auto-location failed, using configured coordinates');
        }
    }

    const url = \`https://api.open-meteo.com/v1/forecast?latitude=\${lat}&longitude=\${lon}&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,wind_speed_10m,wind_direction_10m,cloud_cover,surface_pressure,visibility,is_day,weather_code&daily=sunrise,sunset&forecast_days=1&timezone=auto\`;

    const resp = await fetch(url);
    if (!resp.ok) throw new Error('API error ' + resp.status);
    const data = await resp.json();
    const c = data.current;

    weatherData = c;
    isOffline = false;

    temperature = c.temperature_2m;
    apparentTemp = c.apparent_temperature ?? temperature;
    humidity = c.relative_humidity_2m;
    precipitation = c.precipitation;
    windSpeed = c.wind_speed_10m;
    windDirection = c.wind_direction_10m;
    cloudCover = c.cloud_cover;
    pressure = c.surface_pressure;
    isDay = c.is_day === 1;
    condition = WMO_MAP[c.weather_code] ?? 'cloudy';

    initScene();
    hideLoading();
    updateHUD();
}

function applySimulate(cond, night) {
    condition = cond ?? condition;
    isDay = !night;
    temperature = 20;
    precipitation = isRaining() ? 2.5 : 0;
    windSpeed = isThunderstorm() ? 45 : 10;
    windDirection = 225;
    humidity = 65;
    pressure = 1013;
    weatherData = { simulated: true };
    initScene();
    hideLoading();
    updateHUD();
}

function useOfflineWeather() {
    isOffline = true;
    const conds = ['clear','partly-cloudy','cloudy','rain'];
    const hour = new Date().getHours();
    isDay = hour >= 6 && hour < 18;
    condition = conds[Math.floor(Math.random() * (isDay ? conds.length : 2))];
    temperature = 15 + Math.random() * 10;
    precipitation = isRaining() ? 2 : 0;
    windSpeed = 8 + Math.random() * 7;
    windDirection = Math.random() * 360;
    weatherData = { offline: true };
    initScene();
    hideLoading();
    updateHUD();
}

function hideLoading() {
    loadingOverlay.classList.add('hidden');
}

// ============================================================
// MAIN LOOP
// ============================================================
function loop() {
    frame++;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Sky
    ctx.fillStyle = skyGradient();
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Background layer
    drawStars(); updateStars();
    drawMoon();
    drawSun();
    clouds.forEach(c => drawCloud(c)); updateClouds();

    // Scene
    drawGround();
    drawDecorations();
    drawChimneySmoke(); updateChimneySmoke();
    drawHouse();

    // Foreground weather effects
    drawRain(); updateRain();
    drawSnow(); updateSnow();
    drawThunderstorm(); updateThunderstorm();
    drawFog(); updateFog();
    drawBirds(); updateBirds();
    drawAirplanes(); updateAirplanes();
    drawFireflies(); updateFireflies();
    drawLeaves(); updateLeaves();

    animFrame = requestAnimationFrame(loop);
}

// ============================================================
// VS Code message bridge
// ============================================================
const vscode = acquireVsCodeApi();

window.addEventListener('message', e => {
    const msg = e.data;
    switch (msg.command) {
        case 'refreshWeather':
            fetchWeather().catch(useOfflineWeather);
            break;
        case 'simulate':
            applySimulate(msg.condition, msg.night);
            break;
        case 'updateConfig':
            CFG = msg.config;
            initScene();
            updateHUD();
            break;
    }
});

// ============================================================
// BOOT
// ============================================================
loop();

if (SIMULATE.condition) {
    applySimulate(SIMULATE.condition, SIMULATE.night);
} else {
    fetchWeather().catch(() => {
        useOfflineWeather();
    });
}

// Refresh weather every 5 minutes
setInterval(() => {
    if (!SIMULATE.condition) {
        fetchWeather().catch(() => { isOffline = true; updateHUD(); });
    }
}, 5 * 60 * 1000);
</script>
</body>
</html>`
}
