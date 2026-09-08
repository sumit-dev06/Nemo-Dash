'use strict';
/* ============================================================
   NEMO DASH — Coral Escape
   Single-file browser prototype.
   - Canvas 2D, procedural realistic art (no external assets)
   - Real-feel water physics: thrust + drag + buoyancy + currents
   - WebAudio procedural sound (no audio files)
   ============================================================ */
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
// Logical viewport: landscape runs 540 high (width follows screen), portrait gets tall.
// fitScreen() keeps backing == element aspect; DPR backing keeps it razor sharp.
let W = 960,
  H = 540;
let FLOOR_Y = H - 64;
let DPR = 1; // current render scale (dynamic — see loop monitor)
let dprTarget = 1; // best sharpness this screen allows
function applyDPR() {
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (typeof bakeBackground !== 'undefined') bakeBackground();
}
function fitScreen() {
  const r = document.getElementById('stage').getBoundingClientRect();
  const aspect = r.width / Math.max(1, r.height);
  if (aspect >= 1.15) {
    // landscape & desktop: fixed height, width follows the screen — no bezels, no stretch
    H = 540;
    W = Math.min(1600, Math.max(960, Math.round(H * aspect)));
  } else {
    H = 800;
    W = Math.max(360, Math.round(H * aspect));
  }
  FLOOR_Y = H - 64;
  dprTarget = Math.min(2, window.devicePixelRatio || 1);
  DPR = dprTarget;
  applyDPR();
  if (typeof player !== 'undefined') {
    player.y = clamp(player.y, swimTop(), swimBot());
    // hard lock: fish never drifts — x is always 170 (traps must not drag it left)
    player.x = clamp(player.x, 80, Math.max(170, W - 120));
    if (player.trappedIn) player.x = 170;
  }
  if (typeof snow !== 'undefined' && Array.isArray(snow)) {
    snow.length = 0;
    for (let i = 0; i < 60; i++) // keep in step with seedDecor()
      snow.push({ x: rand(0, W), y: rand(0, H), z: rand(0.2, 1), s: rand(0.6, 2.2) });
  }
  if (typeof bakeBackground !== 'undefined') bakeBackground();
}
window.addEventListener('resize', fitScreen);
window.addEventListener('orientationchange', () => setTimeout(fitScreen, 200));

// ---------- helpers ----------
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
// cave factor 0 (open reef) → 1 (deep cave); narrows the swim band.
function caveK() {
  try {
    return clamp((typeof cfg !== 'undefined' && cfg && cfg.cave) || 0, 0, 1);
  } catch (e) {
    return 0;
  }
}
// swim band: ceiling drops as the cave closes in, floor rises slightly.
function swimTop() {
  return 46 + caveK() * 78;
}
function swimBot() {
  return FLOOR_Y - 24 - caveK() * 40;
}
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;
function circleHit(ax, ay, ar, bx, by, br) {
  const dx = ax - bx,
    dy = ay - by;
  return dx * dx + dy * dy < (ar + br) * (ar + br);
}
