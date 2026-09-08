// ---------- BOSSES — the phase-A "make the scope look big" payoff ----------
// The Spawn Director made the reefs readable; the biomes made them distinct;
// the boss makes each biome's last reef a DESTINATION. Clear the gate on a boss
// reef and a named apex predator rises out of the dark to stop you.
//
// Design rules, in order of priority:
//   1. LAG-FREE. There is exactly ONE boss alive at a time. Its body is a single
//      path composition (no gradient builds per frame — one memoised gradient per
//      boss, re-read every frame). Its attacks are the game's own hazards re-used:
//      a lunge is a shark lunge, a shot is a pearl-sized hitbox, a sweep is a
//      vertical rail. Nothing new for the rasteriser to learn. Boss shots are a
//      capped array (<=10 live) so they can never blow the draw budget.
//   2. FAIR. Every attack is telegraphed with a coloured warning ring + a cue
//      before it lands, exactly like the hunter's red "!" — read it, dodge it.
//   3. AGENCY. The boss drains on a timer, but your near-misses drain it FASTER
//      (+0.9s of damage each) and combo resets when you take a hit. So dodging
//      well = shorter fight, and it is always your skill, not the clock.
//   4. THE FLOOR IS YOUR FRIEND. The boss lives in the swim band (swimTop..swimBot)
//      like every other entity; if it ever left that it would be an off-screen
//      invisible death.
//
// One boss per biome, keyed by the biome's FINAL reef (BIOME_BOSS_ZONES below).
// `%start()` is called from update.js when the run crosses the goal on a boss
// reef. The boss PAUSES the Spawn Director (normal hazards stand down — the boss
// owns the screen), then feeds levelComplete() when its health hits 0.
//
// Health is expressed in SECONDS of survival pressure (12-19s). nearMiss() adds
// up to +0.9s per dodge, capped, so a clean fight is ~half the listed time.

const BIOME_BOSS_ZONES = [
  [3, 6, 8, 10, 12, 15], // final reef of each biome
];

// Which reef is a boss reef? Pure check, no state.
function isBossLevel(n) {
  return BIOME_BOSS_ZONES[0].includes(n);
}

// ---- boss cast: one per biome ----
// Each entry is data + small hooks. The body draw, attack timing and health are
// all per-boss; the movement/physics/telegraph/shared collision is generic.
const BOSSES = {
  sunlit: {
    name: 'GRANDPA GOLIATH',
    title: 'The Last Sunlit King',
    // a huge old tunny — the biggest fish in the bright reef, all fins and scars
    size: 150,
    hp: 10, // seconds
    body: ['#c8a06a', '#8a5a34', '#4a2a15'],
    eye: '#f6e8c8',
    accent: '#ffd66e',
    attack: 'lunge', // powerful, readable dart — a sun-lit king is honest
  },
  kelp: {
    name: 'MORAY MAW',
    title: 'Devourer of the Forest',
    // an eel that threads the kelp corridors — long, sinuous, comes from below
    size: 175,
    hp: 11,
    body: ['#3f7a4c', '#244a2c', '#122416'],
    eye: '#d8ffb0',
    accent: '#7dffb2',
    attack: 'sweep', // a vertical coil through your lane — dodge high or low
  },
  shipwreck: {
    name: 'THE CALDRON',
    title: 'Keeper of the Wreck',
    // a rigged trawler's ghost mouth — rust and chain, spills a cage-trail
    size: 185,
    hp: 12,
    body: ['#5b5f66', '#34383f', '#161a20'],
    eye: '#ff8c42',
    accent: '#ff8c42',
    attack: 'volley', // fans of shot — the wreck's cannons remembered
  },
  jellyfish: {
    name: 'QUEEN BLOOM',
    title: 'Mother of the Drift',
    // a giant bell that pulses, spawning a ring of jellies around you
    size: 165,
    hp: 12,
    body: ['#7a3f9e', '#4a256e', '#241040'],
    eye: '#ff9de2',
    accent: '#c77dff',
    attack: 'ring', // a pulse sends baby jellies in a closing circle
  },
  vents: {
    name: 'MAGMA EEL',
    title: 'Serpent of the Rift',
    // a volcanic eel that heats the water and dives from the dark above
    size: 190,
    hp: 12.5,
    body: ['#8a3d1f', '#4a1e0e', '#1c0a05'],
    eye: '#ffb347',
    accent: '#ff7a3c',
    attack: 'sweep',
  },
  abyss: {
    name: 'THE DEVOURER',
    title: 'What Lives Below',
    // the angler-lure shadow at the bottom of everything — a teleporting hunter
    size: 200,
    hp: 14,
    body: ['#2c3c52', '#16202e', '#080d14'],
    eye: '#5adcff',
    accent: '#5adcff',
    attack: 'volley',
  },
};

function bossForBiome(key) {
  return BOSSES[key] || BOSSES.sunlit;
}

// The live boss. Null when none. Kept module-scoped so render/update can read it
// without a global lookup, but exposed via Boss.active / Boss.get().
let _boss = null;

// Boss shots: a small capped pool. Each is a glowing orb that drifts toward the
// player's lane and costs 1 HP on contact. Fired by volley/ring attacks.
let _shots = [];
const _SHOT_MAX = 10;

// The Boss controller holds no per-frame gradient: only a memoised body gradient
// (built once per boss per DPR bucket by the draw) and a couple of timers.
const Boss = {
  // current instance
  get() {
    return _boss;
  },
  active() {
    return !!_boss;
  },
  shots() {
    return _shots;
  },

  // re-entrant safe start (a run reset calls this)
  clear() {
    _boss = null;
    _shots = [];
  },

  // Called from update.js when the run's distance crosses the goal on a boss reef.
  // The regular levelComplete() gate is suppressed for these reefs (see update.js),
  // so this is the only way the level ends — beat the boss.
  start() {
    const biome = typeof activeBiome === 'string' ? activeBiome : biomeAt(level);
    const spec = bossForBiome(biome);
    const top = swimTop(),
      bot = swimBot();
    _boss = {
      spec,
      biome,
      x: W + 70,
      y: (top + bot) / 2,
      home: (top + bot) / 2,
      ax: Math.max(320, W * 0.62), // arena anchor — every strike returns here
      vx: -cfg.speed * 0.7, // drifts in from the right, then holds
      vy: 0,
      size: spec.size,
      hp: spec.hp,
      hpMax: spec.hp,
      phase: 'enter', // enter -> attack -> telegraph -> recover -> attack ...
      t: 0, // seconds left in the current phase
      hold: 2, // seconds idling between attacks
      attack: 0, // how many attacks this fight (drives damage)
      body0: 0, // attack origin (for the guard rail)
      warnX: 0,
      warnY: 0,
      punch: 0, // screen shake kick on near-miss
      mouth: 0, // 0 shut -> 1 gaping (like a predator), for reading the tell
      fired: false,
      s: 0, // cached sin for the swim roll
      lastAt: 0,
      hitT: 0, // flash the hurt overlay briefly
      shotT: 0, // cooldown between fan / ring pulse
      noise: 0,
    };
    // the fight replaces the reef's hazards: normal spawning stands down
    // (handled in update.js via Boss.active()), and the score keeps counting.
    try {
      AudioSys.boss();
      AudioSys.musicBoss(true); // hold the score at a high floor for the fight
    } catch (e) {}
    banner(Boss.name() || spec.name, spec.title.toUpperCase());
  },

  // Name of the live boss, for the HUD bar and the banner.
  name() {
    return _boss ? _boss.spec.name : '';
  },
  // 0..1 health, for the HUD bar.
  frac() {
    return _boss ? clamp(_boss.hp / _boss.hpMax, 0, 1) : 0;
  },
  // Has the boss been worn down? update.js polls this and ends the level.
  beaten() {
    return !!_boss && _boss.hp <= 0;
  },
  // The kill: a burst where it died, the victory sting, and the score drops out
  // of boss mode. levelComplete() is called by update.js right after.
  defeat() {
    const b = _boss;
    if (!b) return;
    burst(b.x, b.y, 46, b.spec.accent);
    burst(b.x, b.y, 30, '#fff');
    shake = Math.max(shake, 16);
    score += 500;
    addFloat(b.x, b.y - 40, b.spec.name + ' DOWN! +500', b.spec.accent);
    try {
      AudioSys.bossDown();
      AudioSys.musicBoss(false);
    } catch (e) {}
    _boss = null;
    _shots = [];
  },

  // --- fighting (called every frame from update.js when Boss.active()) ---
  // Returns a {hit} if the player took damage this frame (the caller applies it).
  tick(dt, px, py) {
    const b = _boss;
    if (!b) return {};
    b.t += dt;
    b.s = Math.sin(b.t * 3.1);
    b.mouth += clamp((b.phase === 'telegraph' ? 1 : 0) - b.mouth, -dt * 2.4, dt * 2.4);

    const top = swimTop(),
      bot = swimBot();

    // ---- enter: glide into the arena from the right, then stop and announce ----
    if (b.phase === 'enter') {
      b.x += b.vx * dt;
      b.y = b.home + Math.sin(b.t * 2) * 24;
      if (b.x <= Math.max(300, W * 0.62)) {
        b.x = Math.max(300, W * 0.62);
        b.phase = 'roar';
        b.t = 0;
        // the opening roar: shake + cue, so the player KNOWS the fight started
        try {
          AudioSys.bossRoar();
        } catch (e) {}
        shake = Math.max(shake, 8);
        addFloat(b.x - b.size * 0.2, b.y - b.size * 0.5, b.spec.name + '!', '#ff5e62');
      }
      return {};
    }
    // ---- roar: a beat of stillness while the name sits on screen ----
    if (b.phase === 'roar') {
      b.y = b.home + Math.sin(b.t * 2) * 14;
      b.x += b.vx * dt * 0.05; // settle
      if (b.t > 1.15) {
        b.phase = 'attack';
        b.t = 0;
        b.hold = rand(1.4, 2.0);
      }
      return {};
    }

    // ---- attack: holds an arena anchor, visibly tracks your lane ----
    // The anchor keeps the boss ON screen (a lunge that walks off-screen was
    // the old "standing there" bug: x never came back, y overshot the band).
    if (b.phase === 'attack') {
      const enr = b.hp < b.hpMax * 0.35 ? 1.5 : 1; // enrage: faster + tighter
      if (b.ax == null) b.ax = Math.max(320, W * 0.62);
      b.home += clamp(py - b.home, -1, 1) * 110 * dt * enr;
      b.home = clamp(b.home, top + 40, bot - 40);
      b.x += clamp(b.ax - b.x, -1, 1) * 150 * dt; // always comes back home
      b.y = b.home + Math.sin(b.t * 2.4) * 14;
      b.attack += dt;
      if (b.hold <= 0 && b.attack >= 0.8) {
        b.phase = 'telegraph';
        b.t = 0;
        b.warnY = clamp(py + player.vy * 0.25, top + 30, bot - 30); // leads you
        b.fired = false;
        try {
          AudioSys.lunge();
        } catch (e) {}
      }
      b.hold -= dt;
    }

    // ---- telegraph: 0.65s, boss rears back and aims (you SEE the lane) ----
    if (b.phase === 'telegraph') {
      if (b.ax == null) b.ax = Math.max(320, W * 0.62);
      b.x += clamp(b.ax + 34 - b.x, -1, 1) * 90 * dt; // rear back, then go
      b.y += clamp((b.warnY - b.y) * 0.5, -1, 1) * 90 * dt; // aims at the lane
      b.y = clamp(b.y, top + 20, bot - 20);
      if (!b.fired && b.t >= 0.65) {
        b.fired = true;
        b.phase = 'strike';
        b.t = 0;
        b.attack = 0;
        try {
          AudioSys.bossStrike();
        } catch (e) {}
        shake = Math.max(shake, 5);
        if (b.spec.attack === 'lunge') {
          b.x0 = b.x;
          b.y0 = b.y;
          b.x1 = clamp(px + 170, 230, b.ax); // dives AT you, never past x=230
        } else if (b.spec.attack === 'sweep') {
          b.sweepX = clamp(px + 210, 300, W * 0.72); // sweeps through YOUR x
          b.y0 = py < (top + bot) / 2 ? bot - 24 : top + 24; // starts opposite
          b.y1 = py < (top + bot) / 2 ? top + 24 : bot - 24;
        } else if (b.spec.attack === 'volley') {
          b.shotN = b.hp < b.hpMax * 0.35 ? 7 : 5;
          b.shotT = 0;
        } else if (b.spec.attack === 'ring') {
          b.shotN = 10;
          b.shotT = 0;
        }
      }
    }

    // ---- strike: the charge. Out, pause, BACK — always ends at the anchor ----
    if (b.phase === 'strike') {
      const cy = (v) => clamp(v, top + 20, bot - 20);
      const ease = (p) => p * p * (3 - 2 * p);
      if (b.spec.attack === 'lunge') {
        // 0-0.42s dash in, 0.42-0.57 hold, 0.57-1.07 return. Reads as a BITE.
        if (b.t < 0.42) {
          const e = ease(b.t / 0.42);
          b.x = b.x0 + (b.x1 - b.x0) * e;
          b.y = cy(b.y0 + (b.warnY - b.y0) * e);
        } else if (b.t < 0.57) {
          b.x = b.x1;
          b.y = cy(b.warnY);
        } else {
          const e = ease(Math.min(1, (b.t - 0.57) / 0.5));
          b.x = b.x1 + (b.ax - b.x1) * e;
          b.y = cy(b.warnY + (b.home - b.warnY) * e);
        }
        b.x = Math.max(200, b.x);
        if (b.t >= 1.07) {
          b.phase = 'attack';
          b.t = 0;
          b.home = cy(b.warnY);
          b.hold = rand(0.8, 1.2);
        }
      } else if (b.spec.attack === 'sweep') {
        // 0.8s vertical coil through your x — dodge the TIMING, not just depth
        const e = Math.min(1, b.t / 0.8);
        b.y = cy(b.y0 + (b.y1 - b.y0) * e);
        b.x = b.sweepX + Math.sin(b.t * 9) * 12;
        if (b.t >= 0.85) {
          b.phase = 'attack';
          b.t = 0;
          b.home = top + (bot - top) * 0.5;
          b.hold = rand(0.8, 1.2);
        }
      } else if (b.spec.attack === 'volley' || b.spec.attack === 'ring') {
        const enr = b.hp < b.hpMax * 0.35 ? 1.3 : 1;
        b.x += clamp(b.ax - b.x, -1, 1) * 120 * dt;
        b.y = cy(b.home + Math.sin(b.t * 3) * 16);
        b.shotT -= dt;
        if (b.shotT <= 0 && b.shotN > 0 && _shots.length < _SHOT_MAX) {
          b.shotN--;
          b.shotT = b.spec.attack === 'volley' ? 0.11 : 0.07;
          const dx = px - b.x,
            dy = py - b.y;
          const base = Math.atan2(dy, dx);
          const ang =
            b.spec.attack === 'volley'
              ? base + (Math.random() - 0.5) * 0.55
              : ((10 - b.shotN) / 10) * TAU;
          const spd = (b.spec.attack === 'volley' ? 360 : 250) * enr;
          _shots.push({
            x: b.x - 20,
            y: b.y,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd,
            r: 9,
            life: 3.2,
            ph: rand(0, TAU),
          });
          try {
            AudioSys.plink();
          } catch (e) {}
        }
        if (b.shotN <= 0 && b.t > 0.9) {
          b.phase = 'attack';
          b.t = 0;
          b.hold = rand(0.7, 1.1);
        }
      }
      if (b.t > 2.2) {
        b.phase = 'attack';
        b.t = 0;
        b.hold = rand(0.8, 1.1);
      }
    }

    // ---- drain: the clock ticks the boss down; your near-misses tick it faster ----
    // (near-miss damage is applied in update.js where the scoring combo lives)
    if (b.phase !== 'enter' && b.phase !== 'roar') {
      b.hp -= dt * (1 + Math.min(0.6, b.attack / 40)); // boss gets slightly faster as it tires
    }
    if (b.hitT > 0) b.hitT -= dt;
    if (b.phase !== 'enter' && b.phase !== 'roar') {
      // a red-overlay tint when you land a near-miss (see Boss.hit())
      b.noise = Math.max(0, b.noise - dt);
    }
    return {};
  },

  // A near-miss against the boss's body/lunge (connected in update.js): drains the
  // boss faster and pops a float. The gate is a small cooldown so a single long
  // burst can't stack 10 near-misses.
  nearMiss(pj) {
    const b = _boss;
    if (!b) return;
    if (b.phase === 'enter' || b.phase === 'roar') return;
    const extra = 1.2;
    b.hp -= extra;
    b.hitT = 0.35; // flash its hurt colour
    shake = Math.max(shake, 5);
    addFloat(pj.x, pj.y - 40, 'Boss -' + extra.toFixed(1) + 's!', '#ffd66e');
    try {
      AudioSys.nearMiss(Math.max(1, combo));
    } catch (e) {}
  },

  // Boss drains the shot update: move the shots, collide with the player, spawn
  // boss body collision with the player. Returns nothing; calls damage() directly.
  // dt and px/py are the already-computed player position.
  tickShots(dt, px, py) {
    if (!_shots.length) return;
    const top = swimTop(),
      bot = swimBot();
    for (const s of _shots) {
      s.life -= dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.ph += dt * 6;
      if (s.y < top + 8 || s.y > bot - 4) s.vy = -s.vy * 0.6; // bounce in the band
      if (s.life > 0 && player.invuln <= 0 && !player.dead && !player.trappedIn) {
        if (circleHit(px, py, player.r * 0.82, s.x, s.y, s.r)) {
          s.life = 0;
          damage('boss', s.x, s.y, false);
          return; // one hit per shot, then bail; the update loop re-checks
        }
      }
    }
    _shots = _shots.filter((s) => s.life > 0);
  },

  // Boss body collision — the boss itself is the biggest hazard in the game.
  // A frontal mouth touch is a bite (instant-ish), a body touch is a graze.
  // Mirrors the predator rule in update.js.
  tickBody(px, py) {
    const b = _boss;
    if (!b || b.phase === 'enter' || b.phase === 'roar' || b.phase === 'telegraph') return;
    if (player.invuln > 0 || player.dead || player.trappedIn) return;
    const r = b.size * 0.3;
    const mouthDY = Math.abs(py - b.y);
    const frontal = px < b.x + b.size * 0.05 && mouthDY < r * 0.7;
    const touchMouth = frontal && circleHit(px, py, player.r * 0.8, b.x - b.size * 0.2, b.y, r * 0.92);
    const touchBody = !touchMouth && circleHit(px, py, player.r * 0.85, b.x + b.size * 0.1, b.y, r);
    if (touchMouth) {
      // a frontal bite from the boss is a kill (unless shield), like the big fish
      engulfBy(null); // no predator obj; the death cinematic adapts (eatenBy null
      // -> generic death path); engulfBy() itself consumes the shield if held
    } else if (touchBody) {
      damage('boss', b.x, b.y, true);
    }
  },
};

// ---- render (called from render.js, only when Boss.active()) ----
// Built in LOCAL units so it is resolution-independent, one memoised gradient per
// boss type, and one beginPath/fill per shape. Culled to the viewport by the
// caller. The body is a huge "imposing silhouette" with the biome's palette; the
// mouth/eye/punch animate from the phase so the attack tell is always readable.
function drawBoss() {
  const b = _boss;
  if (!b) return;
  // never let the boss leave the swim band in a way that can clip the player
  const top = swimTop() - 20,
    bot = swimBot() + 20;
  if (b.y < top || b.y > bot) return;
  if (b.x < -b.size || b.x > W + b.size) return;

  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.scale(-1, 1); // faces left toward the player, like every predator
  const k = b.size / 150; // 150 is the reference drew Grad
  ctx.scale(k, k);
  const s = b.s;
  const spec = b.spec;
  const mouth = b.mouth;
  const hurt = b.hitT > 0;

  // swim roll, + mouth gape on telegraph
  ctx.rotate(s * 0.03 + (b.phase === 'strike' ? -0.06 : 0));

  // body: one memoised gradient, tinted red when you just hit it
  const g = grad('bossBody' + spec.name, () => {
    const gg = ctx.createLinearGradient(0, -46, 0, 46);
    gg.addColorStop(0, spec.body[0]);
    gg.addColorStop(0.5, spec.body[1]);
    gg.addColorStop(1, spec.body[2]);
    return gg;
  });
  ctx.fillStyle = hurt ? '#ff5e62' : g;
  ctx.beginPath();
  ctx.ellipse(0, 0, 78, 34, 0, 0, TAU);
  ctx.fill();

  // dorsal / tail / glow to make it read as THE thing at the end of the biome
  ctx.fillStyle = hurt ? '#ff8085' : spec.body[2];
  ctx.beginPath();
  ctx.moveTo(-14, -28);
  ctx.lineTo(26, -66);
  ctx.lineTo(42, -26);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-52, 0);
  ctx.lineTo(-82, -20);
  ctx.lineTo(-82, 20);
  ctx.closePath();
  ctx.fill();

  // pectoral fin (animated)
  ctx.save();
  ctx.translate(8, 26);
  ctx.rotate(Math.sin(b.t * 2) * 0.3);
  ctx.fillStyle = hurt ? '#ff8085' : spec.body[1];
  ctx.beginPath();
  ctx.ellipse(0, 0, 22, 8, 0.5, 0, TAU);
  ctx.fill();
  ctx.restore();

  // glow: the accent colour of the biome bled around it, so you always know
  // which place you are fighting in (cached sprite, no gradient per frame)
  const glow = glowSprite(spec.accent.slice(1), 90, 0.22);
  ctx.globalAlpha = 0.85;
  blit(glow, 0, 0, 1.8);
  ctx.globalAlpha = 1;

  // eye + mouth with the gape tell
  const eyeGlow = glowSprite('255,255,255', 12, 0.7);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(52, -8, 8, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#0a0a0a';
  ctx.beginPath();
  ctx.arc(54, -8, 4, 0, TAU);
  ctx.fill();
  blit(eyeGlow, 52, -8, 1.2);

  ctx.fillStyle = '#5c0a0a';
  ctx.beginPath();
  ctx.ellipse(54, 12, 30, 4 + mouth * 16, 0.06, 0, TAU);
  ctx.fill();

  // the TELEGRAPH WARNING ring — this is what you read, the tell, the dodge cue.
  // Drawn AFTER the outer restore, in plain world space, because inside the
  // mirrored/scaled body transform a translation is not world metres and the ring
  // would land in the wrong place. Also drawn as a tiny screen-space "!"-style cue
  // in the arena (see below), so a phone player sees the line while their thumb
  // is busy.
  ctx.restore();

  if (b.phase === 'telegraph') {
    const rr = Math.min(180, (0.9 - b.t) * 300);
    ctx.strokeStyle = spec.accent;
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.85;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.arc(b.x, b.warnY, Math.max(10, rr), 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }
}

// A boss shot: a small glowing orb in the boss's accent colour, with a soft
// halo and a bright core — visible against every biome's water because the halo
// is a cached glow sprite, not a per-frame gradient.
function drawBossShot(s) {
  ctx.save();
  ctx.translate(s.x, s.y);
  const pul = 1 + Math.sin(s.ph) * 0.15;
  ctx.globalAlpha = 0.5;
  blit(glowSprite('255,120,120', 26, 0.8), 0, 0, 1 + pul);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#ff6b6b';
  ctx.beginPath();
  ctx.arc(0, 0, s.r * pul, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#ffd9d9';
  ctx.beginPath();
  ctx.arc(0, 0, s.r * pul * 0.5, 0, TAU);
  ctx.fill();
  ctx.restore();
}

// A small screen-space "boss incoming" cue while telegraphing: a coloured arc +
// direction hash near the player, independent of the boss body. Cheap and clear.
function drawBossCue() {
  const b = _boss;
  if (!b) return;
  if (b.phase === 'telegraph') {
    // a chevron pointing toward the danger lane, at the side of the player
    const dir = Math.sign(b.warnY - player.y);
    ctx.save();
    ctx.translate(player.x + 60, player.y + dir * 40);
    ctx.strokeStyle = b.spec.accent;
    ctx.lineWidth = 4;
    ctx.globalAlpha = 0.95;
    ctx.beginPath();
    ctx.moveTo(0, dir * 10);
    ctx.lineTo(22, 0);
    ctx.lineTo(0, -dir * 10);
    ctx.stroke();
    ctx.restore();
  }
}
