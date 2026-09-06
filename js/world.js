// ---------- world decoration (seeded per level) ----------
function seedDecor() {
  seaweeds = [];
  corals = [];
  rocksFar = [];
  snow = [];
  currents = [];
  for (let i = 0; i < 26; i++)
    seaweeds.push({
      x: rand(0, 2400),
      h: rand(50, 150),
      w: rand(8, 16),
      ph: rand(0, TAU),
      sp: rand(1, 2.2),
      hue: rand(140, 170),
    });
  for (let i = 0; i < 14; i++)
    corals.push({
      x: rand(0, 2400),
      s: rand(0.6, 1.4),
      type: (Math.random() * 3) | 0,
      ph: rand(0, TAU),
    });
  for (let i = 0; i < 10; i++)
    rocksFar.push({ x: rand(0, 2400), w: rand(120, 300), h: rand(40, 110) });
  for (let i = 0; i < 90; i++)
    snow.push({ x: rand(0, W), y: rand(0, H), z: rand(0.2, 1), s: rand(0.6, 2.2) });
  for (let i = 0; i < cfg.cur; i++) {
    currents.push({
      y: rand(swimTop() + 40, Math.max(swimTop() + 60, swimBot() - 60)),
      h: rand(70, 130),
      force: rand(0, 1) > 0.5 ? 1 : -1,
      strength: rand(0.8, 1.2) * cfg.curStr,
      ph: rand(0, TAU),
    });
  }
  // cave teeth: stalactites hanging from the cave roof (drawn by caveK alpha)
  caveTeeth = [];
  for (let i = 0; i < 16; i++)
    caveTeeth.push({
      x: rand(0, 2600),
      len: rand(40, 110),
      w: rand(26, 60),
      ph: rand(0, TAU),
    });
  // starfish beds on the seabed (all reefs — the bottom feels alive)
  starfish = [];
  const starCols = ['#ff8c42', '#ff6b81', '#c77dff', '#ffd66e'];
  for (let i = 0; i < 12; i++)
    starfish.push({
      x: rand(0, 2600),
      dx: rand(-30, 30),
      s: rand(7, 14),
      color: starCols[(Math.random() * starCols.length) | 0],
      ph: rand(0, TAU),
    });
  gate = null;
}

// ---------- spawning ----------
// spawn line: off the right edge with a fairness bonus on narrow (portrait) screens,
// so reaction time stays the same whatever the viewport is
function spawnX() {
  return W + 90 + Math.max(0, 960 - W) * 0.6;
}
function foeMight(p) {
  return p.type === 'shark'
    ? FOE_MIGHT.shark
    : p.type === 'angler'
      ? FOE_MIGHT.angler
      : FOE_MIGHT.big;
}
function spawnPredator() {
  // mix driven by the level table (sharks/anglers debut mid-game, never day one)
  const r = Math.random();
  const t = r < cfg.sharkW ? 'shark' : r < cfg.sharkW + cfg.anglerW ? 'angler' : 'big';
  const y = rand(swimTop() + 10, Math.max(swimTop() + 30, swimBot() - 30));
  const base = t === 'shark' ? 150 : t === 'angler' ? 120 : 105;
  const s = base * rand(0.85, 1.2);
  predators.push({
    type: t,
    x: spawnX(),
    y,
    vx: -(cfg.speed * rand(0.55, 0.85) + 60) * cfg.predSpeedMul,
    size: s,
    ph: rand(0, TAU),
    wob: rand(2, 4),
    counted: false,
    hungry: Math.random() < cfg.hungry,
    lunge: 0, // >0 winding up (telegraph), <0 striking, 0 cruising
    cool: rand(1, 2.5),
    mouth: 0, // 0 shut → 1 gaping
    lx: 0,
    ly: 0,
  });
}
function spawnJelly() {
  jellies.push({
    x: spawnX() - 40,
    y: rand(swimTop() + 20, Math.max(swimTop() + 40, swimBot() - 40)),
    vx: -(cfg.speed * 0.45 + 30),
    r: rand(16, 24),
    ph: rand(0, TAU),
    pulse: rand(2, 3.5),
  });
}
function spawnNet() {
  const x = clamp(player.x + rand(-40, 260), 80, W - 80);
  boatX = x;
  nets.push({
    x,
    y: -90,
    vy: rand(0.7, 1.0) * cfg.speed, // falls scale with reef speed — always dodgeable
    w: rand(64, 92),
    h: 110,
    sway: rand(0, TAU),
    warn: 0.9,
    landed: false,
  });
  AudioSys.splash();
}
function spawnHook() {
  hooks.push({
    x: spawnX() - 50,
    y: -20,
    vy: rand(50, 90),
    len: rand(120, 300),
    sway: rand(0, TAU),
    r: 12,
    vx: -(cfg.speed * 0.5),
  });
}
function spawnPearl() {
  pearlsArr.push({
    x: spawnX() - 60,
    y: rand(swimTop() + 10, Math.max(swimTop() + 30, swimBot() - 30)),
    r: 9,
    ph: rand(0, TAU),
    vx: -(cfg.speed * 0.9),
  });
}
function spawnPower() {
  const kind = ['shield', 'magnet', 'slow'][(Math.random() * 3) | 0];
  powers.push({ x: spawnX() - 60, y: rand(swimTop() + 20, Math.max(swimTop() + 40, swimBot() - 40)), kind, ph: 0, vx: -(cfg.speed * 0.8) });
}
function spawnFry() {
  // school of small silver prey — free snacks for every fish, any size
  const y0 = rand(swimTop() + 20, Math.max(swimTop() + 40, swimBot() - 40)),
    n = 3 + ((Math.random() * 3) | 0);
  for (let i = 0; i < n; i++)
    fries.push({
      x: spawnX() - 50 + i * rand(18, 30),
      y: clamp(y0 + rand(-36, 36), swimTop() + 10, swimBot() - 10),
      vx: -(cfg.speed * 0.75 + 70),
      r: rand(5, 7),
      ph: rand(0, TAU),
    });
}

// ---------- particles ----------
function burst(x, y, n, color) {
  for (let i = 0; i < n; i++)
    parts.push({
      x,
      y,
      vx: rand(-220, 120),
      vy: rand(-220, 220),
      life: rand(0.4, 1),
      max: 1,
      r: rand(1.5, 4.5),
      color,
    });
}
// Real underwater blood: dark red plume that blooms, hangs, drifts with the
// current and dissolves — not hard dots. kind:'blood' grows + drags (see
// update.js) and renders soft (see render.js). Cheap: plain arcs, no gradients.
function blood(x, y, n, scale) {
  const s = scale || 1;
  const shades = ['#7a0000', '#a41313', '#c1121f', '#e63946', '#ff5e62'];
  for (let i = 0; i < n; i++) {
    const life = rand(0.9, 1.7);
    parts.push({
      kind: 'blood',
      x: x + rand(-8, 8) * s,
      y: y + rand(-8, 8) * s,
      vx: rand(-150, 50) * s,
      vy: rand(-80, 50) * s,
      life,
      max: life,
      r: rand(2.5, 5.5) * s,
      grow: rand(7, 16) * s,
      color: shades[(Math.random() * shades.length) | 0],
    });
  }
}
// small canvas-only popup (no big DOM words — keeps the screen clean)
function addFloat(x, y, txt, color) {
  if (!txt) return;
  floaters.push({ x, y, txt, color: color || '#fff', life: 1.1 });
}
function confetti() {
  for (let i = 0; i < 80; i++)
    parts.push({
      x: rand(0, W),
      y: rand(-40, 0),
      vx: rand(-40, 40),
      vy: rand(80, 240),
      life: rand(1, 2.4),
      max: 2.4,
      r: rand(2, 5),
      color: ['#3df5a6', '#4dc9ff', '#ffd66e', '#ff8c42', '#ff6b81'][(Math.random() * 5) | 0],
    });
}
function bubble(x, y, big) {
  bubbles.push({
    x,
    y,
    r: big ? rand(3, 7) : rand(1, 3.5),
    vy: rand(-90, -40),
    vx: rand(-15, 15),
    ph: rand(0, TAU),
  });
}
function eatFish(x, y, pts, label) {
  eaten++;
  eatenPts += pts;
  AudioSys.gulp();
  burst(x, y, 10, '#ffe9a8');
  blood(x, y, 14, 1); // prey bleeds where it died — cloudy plume, not dots
  addFloat(x, y - 20, label ? label + ' +' + pts : '', '#7dffc4');
  shake = Math.max(shake, 3);
}
