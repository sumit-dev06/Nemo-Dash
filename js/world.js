// ---------- world decoration (seeded per level) ----------
function seedDecor() {
  seaweeds = [];
  corals = [];
  rocksFar = [];
  snow = [];
  currents = [];
  let seHue = [140, 170], stCols = ['#ff8c42', '#ff6b81', '#c77dff', '#ffd66e'];
  try {
    const b = BIOMES[activeBiome];
    if (b) { seHue = b.seaweedHue; stCols = b.starCols; }
  } catch (e) {}
  for (let i = 0; i < 26; i++)
    seaweeds.push({
      x: rand(0, 2400),
      h: rand(50, 150),
      w: rand(8, 16),
      ph: rand(0, TAU),
      sp: rand(1, 2.2),
      hue: rand(seHue[0], seHue[1]),
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
  // marine snow 90 -> 60: at 90 the drifting specks read as screen noise over the
  // hazards rather than as depth. Same look, a third fewer fillRects per frame.
  for (let i = 0; i < 60; i++)
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
  for (let i = 0; i < 12; i++)
    starfish.push({
      x: rand(0, 2600),
      dx: rand(-30, 30),
      s: rand(7, 14),
      color: stCols[(Math.random() * stCols.length) | 0],
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
// Optional `y` on the hazard spawners: the Spawn Director's authored waves need to
// place a hazard at a specific depth to build a readable shape (a jelly wall with a
// door, a high/low pincer). Called with no argument they behave exactly as before.
function spawnPredator(y) {
  // mix driven by the level table (sharks/anglers debut mid-game, never day one)
  const r = Math.random();
  const t = r < cfg.sharkW ? 'shark' : r < cfg.sharkW + cfg.anglerW ? 'angler' : 'big';
  const yy = y != null ? y : rand(swimTop() + 10, Math.max(swimTop() + 30, swimBot() - 30));
  const base = t === 'shark' ? 150 : t === 'angler' ? 120 : 105;
  const s = base * rand(0.85, 1.2);
  predators.push({
    type: t,
    x: spawnX(),
    y: clamp(yy, swimTop() + 10, Math.max(swimTop() + 30, swimBot() - 30)),
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
    // v3.0: hunters are velocity-driven, not position-driven (see update.js). vy is
    // the real vertical speed and pitch is the drawn body angle derived from it, so
    // a fish that climbs is nose-up instead of sliding sideways perfectly level.
    vy: 0,
    pitch: 0,
    s: 0, // cached Math.sin(ph) for render
    // cached swim-cycle phase offsets: the body/fin animation reads these instead
    // of calling Math.sin three more times per frame (see render.js)
    fin: rand(0, TAU),
  });
}
function spawnJelly(y) {
  const yy = y != null ? y : rand(swimTop() + 20, Math.max(swimTop() + 40, swimBot() - 40));
  const y0 = clamp(yy, swimTop() + 20, Math.max(swimTop() + 40, swimBot() - 40));
  jellies.push({
    x: spawnX() - 40,
    y: y0,
    y0, // station-keeping depth: pulse propulsion drifts around this (update.js)
    vy: 0,
    thrust: rand(52, 74), // impulse per bell contraction
    fired: false,
    vx: -(cfg.speed * 0.45 + 30),
    r: rand(16, 24),
    ph: rand(0, TAU),
    pulse: rand(2, 3.5),
    s: 0, // cached sin/cos of the pulse phase for drawJelly
    c: 1,
    s3: 0,
    c3: 1,
  });
}
function spawnNet() {
  // v3.0: cages arrive as a READABLE OBSTACLE, not an ambush. v2.8 dropped them at
  // player.x + rand(-40,260) — i.e. on your head — with 0.9s of warning, and the
  // falling cage did not scroll, so wherever you were was where it landed. The
  // only counterplay was luck.
  // Now the boat drops the cage AHEAD of you and the whole rig scrolls with the
  // world (see update.js), so the mesh sweeps through your lane mid-fall: be above
  // it or below it. The lead distance is solved from the actual fall time so the
  // intercept lands 45-75% of the way down on any screen width or reef speed.
  const vy = rand(1.3, 1.7) * cfg.speed; // faster than v2.8: the drop is now the clock
  const fallT = (FLOOR_Y - 110 + 90) / vy;
  const lead = cfg.speed * (1.3 + fallT * rand(0.45, 0.75));
  const x = clamp(player.x + lead, W * 0.4, W - 60);
  boatX = x;
  nets.push({
    x,
    y: -90,
    vy,
    w: rand(64, 92),
    h: 110,
    sway: rand(0, TAU),
    warn: 1.3, // 0.9 -> 1.3s: enough to read the boat shadow and pick a lane
    landed: false,
  });
  AudioSys.splash();
}
function spawnHook(y) {
  // y (optional) = where the BAITED TIP should hang; the line is drawn from the
  // surface down to it, so the length is what we actually vary.
  const len = y != null ? clamp(y - 20, 90, FLOOR_Y - 60) : rand(120, 300);
  hooks.push({
    x: spawnX() - 50,
    y: -20,
    vy: rand(50, 90),
    len,
    sway: rand(0, TAU),
    r: 12,
    vx: -(cfg.speed * 0.5),
  });
  AudioSys.plink(); // the line breaking the surface — v2.8 dropped hooks in silence
}
function spawnPearl() {
  // v3.0: pearls arrive as a LINE, not as scattered singles. Same pearls per metre
  // (pearlEvery went 1.1s -> 2.6s), but they read as one collectible shape you can
  // choose to swim through instead of four unrelated dots competing with the
  // hazards for your attention.
  const n = 3 + ((Math.random() * 3) | 0);
  const y0 = rand(swimTop() + 30, Math.max(swimTop() + 50, swimBot() - 50));
  const slope = rand(-0.42, 0.42); // gentle arc so the line has some shape
  const gap = 34;
  for (let i = 0; i < n; i++)
    pearlsArr.push({
      x: spawnX() - 60 + i * gap,
      y: clamp(y0 + i * gap * slope, swimTop() + 14, swimBot() - 14),
      r: 9,
      ph: rand(0, TAU),
      vx: -(cfg.speed * 0.9),
    });
}
function spawnPower() {
  // hearts stay rare: ~1 in 8 random drops, only once reefs turn hard
  let kind = ['shield', 'magnet', 'slow'][(Math.random() * 3) | 0];
  if (allowsHeart() && Math.random() < 0.12) kind = 'heart';
  powers.push({ x: spawnX() - 60, y: rand(swimTop() + 20, Math.max(swimTop() + 40, swimBot() - 40)), kind, ph: 0, vx: -(cfg.speed * 0.8) });
}
// hearts appear only when it gets hard: reef 4+ (or deep endless)
function allowsHeart() {
  try {
    if (typeof endless !== 'undefined' && endless) return distance > 1800;
    return (typeof level !== 'undefined' ? level : 1) >= 4;
  } catch (e) {
    return false;
  }
}
// guaranteed mid-run gift (magnet / heart): drops at a fixed swim-line position.
// This one bypasses the Director's power cap on purpose — a promised gift that never
// arrives is worse than three pickups on screen — but it still refuses to pile up.
// Ceiling of 3 (2 ambient + this one): at 4 a census showed four glowing discs on
// screen at once, which is exactly the clutter the cap exists to stop.
function dropPower(kind) {
  if (powers.length >= 3) return;
  powers.push({
    x: spawnX() - 60,
    y: (swimTop() + swimBot()) / 2 + rand(-30, 30),
    kind,
    ph: 0,
    vx: -(cfg.speed * 0.8),
  });
}
let _schoolId = 0;
function spawnFry() {
  // A school of small silver prey — free snacks for every fish, any size.
  // v2.8 gave every fry an independent random wiggle phase, so a "school" read as
  // six unrelated flickering dots. Real schooling: ONE phase for the school and a
  // fixed per-member offset, which makes the wiggle travel through the group as a
  // wave, and a shared target line the members hold formation around (see update.js).
  const y0 = rand(swimTop() + 20, Math.max(swimTop() + 40, swimBot() - 40)),
    n = 3 + ((Math.random() * 2) | 0);
  const id = ++_schoolId;
  const ph0 = rand(0, TAU);
  for (let i = 0; i < n; i++)
    fries.push({
      x: spawnX() - 50 + i * rand(18, 30),
      y: clamp(y0 + rand(-24, 24), swimTop() + 10, swimBot() - 10),
      vx: -(cfg.speed * 0.75 + 70),
      vy: 0,
      r: rand(5, 7),
      ph: ph0 + i * 0.85, // travelling wave through the school, not noise
      sch: id,
      sy: y0, // the line the school swims along
      oy: rand(-14, 14), // this member's slot in the formation
      s: 0, // cached sin(ph) for render
    });
}

// ---------- seabed boulders (solid terrain) ----------
// A real reef floor is not a flat carpet of sand — it has boulders you have to swim
// OVER. The boulder is the only object in the game that is pure terrain: it never
// damages you and it can never kill you, it simply refuses to be swum through, and
// its mound profile lifts you over it if you were too low when it arrived. That turns
// the seabed from a backdrop into a lane you can lose.
// The boulder silhouette, as a 0..1 height fraction across -1..1 of its width.
// render.js draws EXACTLY this curve (see boulderSprite) so what you see is what
// blocks you. Shape choice matters for feel: an ellipse (`sqrt(1-t*t)`) is VERTICAL
// at the toe, so arriving at one snaps the fish upward. A crown-flattened raised
// cosine is tangent to the sand at both toes (slope 0) and its slope is bounded at
// ~1.8·h/(w/2), so the fish is eased into the climb and rides over the top.
function rockProfile(t) {
  if (t <= -1 || t >= 1) return 0;
  const c = 0.5 + 0.5 * Math.cos(Math.PI * t);
  const s = Math.sqrt(c);
  return s * Math.sqrt(s); // c^0.75 — flattens the crown into a boulder back
}
function boulderTop(b, x) {
  const t = (x - b.x) / (b.w * 0.5);
  if (t <= -1 || t >= 1) return FLOOR_Y;
  return FLOOR_Y - b.h * rockProfile(t);
}
function spawnBoulder() {
  // Fairness rule: a boulder may never occupy more than half the swim band, so
  // "go over it" is always a real option — including in the narrow cave reefs where
  // swimTop() has already dropped the ceiling by 78px.
  // Wide and low on purpose (w ≈ 2.1-3.4 × h): a tall narrow mound reads as a
  // mountain range, a wide one reads as a boulder shelf on the seabed.
  const room = Math.max(70, swimBot() - swimTop());
  const h = clamp(rand(40, 92), 34, room * 0.5);
  const w = h * rand(2.1, 3.4);
  // the biome picks ONE tint family so a reef reads as one place (granite in the
  // sunlit shallow, basalt in the wreck, dark basalt by the vents); boulders stay
  // keyed on their size bucket so the sprite cache stays small
  let rockTint = 0;
  try { rockTint = BIOMES[activeBiome] ? BIOMES[activeBiome].rock : 0; } catch (e) {}
  const push = (bx, bh, bw) =>
    boulders.push({
      x: bx,
      w: bw,
      h: bh,
      type: (Math.random() * 3) | 0,
      tint: rockTint,
      ride: 0, // >0 while the player is riding the surface (drives the scrape cue)
    });
  const x0 = spawnX() + rand(0, 140);
  push(x0, h, w);
  // ~45% of the time add a shoulder rock so it reads as a reef shelf, not a lone egg
  if (Math.random() < 0.45) {
    const h2 = h * rand(0.34, 0.6);
    const w2 = h2 * rand(2.2, 3.2);
    push(x0 + (Math.random() < 0.5 ? -1 : 1) * (w + w2) * 0.42, h2, w2);
  }
}

// ---------- sea urchins (per-biome signature hazard: shallow reefs) ----------
// Rocks are ground you RIDE over — never lethal. The urchin is the shallow-reef
// flip side: a low, wide cluster of spines on the seabed that STINGS. It reaches
// ~34px up into the swim band (swimBot() is FLOOR_Y-24), so it is survivable by
// doing the same thing a rock asks — rise over it — but a spell of inattention at
// the bottom of the lane costs you a heart, not just height. Urchins only appear
// in the sunlit and kelp biomes: deeper reef floors are firm rock, the scrubby
// shallow floor is spiky.
const URCHIN_BIOMES = { sunlit: 1, kelp: 1 };
function spawnUrchin() {
  if (!URCHIN_BIOMES[activeBiome]) return;
  // a cluster of a few cones reads as one sea urchin, not as a fence
  const x0 = spawnX() + rand(0, 120);
  const w = rand(56, 86);
  const spines = 3 + ((Math.random() * 3) | 0);
  // the crown must intrude INTO the swim band to be a real hazard: the lowest a
  // player can dive is swimBot() = FLOOR_Y-24, so a 26px urchin sits fully below
  // reach and reads as scenery. climb 42-56px up (60%+ leaves a clean rise).
  const h = rand(42, 56);
  const urch = {
    x: x0,
    w,
    h,
    spines,
    ph: rand(0, TAU),
    tint: (Math.random() * 3) | 0,
  };
  // never bury a cluster behind a boulder: that is an unfair wall (rock reads as
  // climbable, urchin reads as harm); stagger x from any live boulder on the right
  for (const b of boulders) {
    if (b.x > urch.x - 40 && b.x < urch.x + urch.w + 40) { urch.x = b.x + b.w + 120; break; }
  }
  urchins.push(urch);
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
  try {
    player.gulpT = 0.32;
  } catch (e) {} // eating pulse: lunge + swell on the eater
  burst(x, y, 10, '#ffe9a8');
  blood(x, y, 14, 1); // prey bleeds where it died — cloudy plume, not dots
  addFloat(x, y - 20, label ? label + ' +' + pts : '', '#7dffc4');
  shake = Math.max(shake, 3);
}
