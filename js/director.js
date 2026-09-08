// ---------- Spawn Director ----------
// v2.8 spawned hazards from seven independent countdown timers that knew nothing
// about each other or about what was already on screen. A census of an Endless
// run at tier 17 (844x390) found 4 predators, 5 jellies, 20 fry, 3 hooks, 2 cages,
// 4 pearls and 4 powerups live at once — ~110 gameplay objects. Real threats were
// impossible to pick out of the noise, and nothing stopped a cage, a shark lunge,
// a jelly and a hook landing inside the same 300ms.
//
// The Director does not replace the level tuning in data.js — those intervals are
// still the pacing. It is the gate every hazard spawn has to pass:
//   1. hard per-type caps          -> a guaranteed ceiling on live objects (and
//                                     therefore on draw calls, which is what keeps
//                                     low-end phones inside the frame budget)
//   2. a live threat-weight budget -> "how much danger is on screen right now"
//   3. minimum separation          -> no two hazards inside the same instant
//   4. a lane guard                -> never two hazards in the player's own lane,
//                                     so there is always somewhere to swim
//   5. breathers                   -> a real ~2.5s lull every ~14s, so a run has
//                                     rhythm instead of uniform noise
//   6. authored waves              -> readable shapes (jelly wall with a door, a
//                                     pincer, a clean duel) that read as *designed*
//
// Cost: a handful of array-length reads and one loop over live hazards per spawn
// attempt (a few times a second, over arrays of <10). Nothing per frame per entity.

const DIR_WEIGHT = { shark: 3, angler: 3, big: 2, net: 3, hook: 2, jelly: 1 };

// Authored waves. Each build() returns [{kind, y, t}] — t is seconds from the
// start of the wave. `needs` lists the hazard types the level must have unlocked.
// Keep every shape to a 3-hazard maximum: a wave should read at a glance.
const DIR_PATTERNS = [
  {
    id: 'single-hunter',
    needs: [],
    minThreat: 0,
    build: (c) => [{ kind: 'pred', y: c.py + rand(-40, 40), t: 0 }],
  },
  {
    id: 'pincer',
    needs: [],
    minThreat: 4,
    // two hunters, one high one low, door left open in the middle
    build: (c) => [
      { kind: 'pred', y: c.top + 30, t: 0 },
      { kind: 'pred', y: c.bot - 30, t: 0.35 },
    ],
  },
  {
    id: 'jelly-wall',
    needs: ['jelly'],
    minThreat: 3,
    // a stack of jellies with exactly one door — the clearest "designed" shape
    // in the game: read it, aim for the gap, swim through.
    build: (c) => {
      const span = c.bot - c.top;
      const door = c.top + 70 + Math.random() * Math.max(1, span - 140); // door centre
      const out = [];
      let t = 0;
      for (let y = c.top + 24; y <= c.bot - 24; y += 52) {
        if (Math.abs(y - door) < 78) continue; // leave the door open
        out.push({ kind: 'jelly', y, t });
        t += 0.04;
      }
      return out.slice(0, 5);
    },
  },
  {
    id: 'gap-high',
    needs: ['jelly'],
    minThreat: 3,
    // floor is closed off — go high
    build: (c) => [
      { kind: 'jelly', y: c.bot - 30, t: 0 },
      { kind: 'jelly', y: c.bot - 80, t: 0.05 },
      { kind: 'pred', y: c.bot - 130, t: 0.5 },
    ],
  },
  {
    id: 'gap-low',
    needs: ['jelly'],
    minThreat: 3,
    // ceiling is closed off — stay low
    build: (c) => [
      { kind: 'jelly', y: c.top + 30, t: 0 },
      { kind: 'jelly', y: c.top + 80, t: 0.05 },
      { kind: 'pred', y: c.top + 130, t: 0.5 },
    ],
  },
  {
    id: 'hook-row',
    needs: ['hook'],
    minThreat: 4,
    // two lines in the water at different depths: thread between them
    build: (c) => [
      { kind: 'hook', y: c.top + (c.bot - c.top) * 0.35, t: 0 },
      { kind: 'hook', y: c.top + (c.bot - c.top) * 0.72, t: 0.45 },
    ],
  },
];

const Director = {
  // hard live-object ceilings. `pearl` and `fry` are food, not threats, but they
  // are the two biggest contributors to visual noise so they are capped too.
  caps: { pred: 3, jelly: 4, net: 1, hook: 2, pearl: 12, power: 2, fry: 8, rock: 3, urch: 3 },
  threatMax: 6, // set per level from cfg.threatMax
  minGap: 0.55, // seconds between any two hazard spawns
  laneR: 55, // half-height of "the player's lane", px
  breatherEvery: 14,
  breatherLen: 2.5,
  waveEvery: 9, // an authored wave roughly this often (jittered)
  // Anti-starvation. A pure threat budget has a nasty failure mode, measured in an
  // 82s census at tier 35: FOUR jellies (weight 1 each) plus one hunter (2-3) fill
  // 6-7 of a budget of 8, and a cage needs 3 headroom — so ZERO cages spawned in the
  // whole run. The signature hazard of the game had been silently switched off.
  // Once a type has gone this long without spawning it may exceed the threat budget.
  // The hard cap, the minimum gap and the breather still apply, so this can never
  // produce a pile-up — it just guarantees variety.
  patience: { net: 9, hook: 8, pred: 6, jelly: 5 },

  reset() {
    this.t = 0;
    this.lastSpawn = -9;
    this.breatherT = this.breatherEvery;
    this.breathing = 0;
    this.waveT = 5; // never open a run with a wave — let the player settle first
    this.queue = [];
    this.suppress = 0; // ambient timers stand down while a wave plays out
    this.threatMax = (typeof cfg !== 'undefined' && cfg.threatMax) || 6;
    this.wait = { pred: 0, jelly: 0, net: 0, hook: 0 }; // seconds since last of each
    this.stats = {
      spawned: 0,
      blockedCap: 0,
      blockedThreat: 0,
      blockedGap: 0,
      blockedLane: 0,
      waves: 0,
      starved: 0,
    };
  },

  // live counts are array lengths on purpose: entities are culled shortly after
  // leaving the screen, so length == "in flight", and capping length is what makes
  // the draw-call ceiling a guarantee rather than a hope.
  count(kind) {
    switch (kind) {
      case 'pred':
        return predators.length;
      case 'jelly':
        return jellies.length;
      case 'net':
        return nets.length;
      case 'hook':
        return hooks.length;
      case 'pearl':
        return pearlsArr.length;
      case 'power':
        return powers.length;
      case 'fry':
        return fries.length;
      case 'rock':
        return boulders.length;
      case 'urch':
        return urchins.length;
    }
    return 0;
  },

  // How far the seabed is currently raised by incoming rock. Waves must respect it:
  // a jelly wall whose door sits behind a boulder is an unwinnable shape, and the
  // bottom jellies of the wall would be buried inside the rock.
  floorLift() {
    let m = 0;
    for (const b of boulders) if (b.x > W * 0.45) m = Math.max(m, b.h);
    return m;
  },

  // how much danger is on screen right now
  threat() {
    let w = 0;
    for (const p of predators) w += DIR_WEIGHT[p.type] || DIR_WEIGHT.big;
    w += nets.length * DIR_WEIGHT.net;
    w += hooks.length * DIR_WEIGHT.hook;
    w += jellies.length * DIR_WEIGHT.jelly;
    return w;
  },

  // is something already sitting in the player's lane, ahead of them?
  laneBusy() {
    const py = player.y,
      px = player.x;
    for (const p of predators) if (p.x > px && Math.abs(p.y - py) < this.laneR) return true;
    for (const j of jellies) if (j.x > px && Math.abs(j.y - py) < this.laneR) return true;
    for (const h of hooks) {
      const hy = h.hy != null ? h.hy : h.y + h.len;
      if (h.x > px && Math.abs(hy - py) < this.laneR) return true;
    }
    for (const n of nets)
      if (n.x > px && py > n.y - this.laneR && py < n.y + n.h + this.laneR) return true;
    return false;
  },

  // The gate. `y` is optional — pass it when the caller already knows where the
  // hazard will appear so the lane guard can do its job. `slots` is how many live
  // objects this spawn will actually create: fry arrive as a school of 4 and pearls
  // as a line of up to 5, so checking headroom for ONE would let a school of 4 land
  // on a count of 7 and push a cap of 8 to 11 (measured).
  allow(kind, y, fromWave, slots) {
    const threatKind = kind === 'pred' || kind === 'jelly' || kind === 'net' || kind === 'hook';
    if ((this.count(kind) || 0) + (slots || 1) - 1 >= (this.caps[kind] || 99)) {
      this.stats.blockedCap++;
      return false;
    }
    if (!threatKind) return true; // pearls / powers / fry only face their cap
    if (this.breathing > 0) return false; // enforced lull
    if (!fromWave && this.suppress > 0) return false; // a wave owns the next second
    // starving types may exceed the budget (see `patience` above) — never the cap
    const starving = (this.wait[kind] || 0) > (this.patience[kind] || 99);
    if (!starving && this.threat() + (DIR_WEIGHT[kind] || 2) > this.threatMax) {
      this.stats.blockedThreat++;
      return false;
    }
    if (this.t - this.lastSpawn < this.minGap) {
      this.stats.blockedGap++;
      return false;
    }
    // lane guard: at most one hazard in the player's own lane, so there is always
    // a direction that is not a wall
    if (y != null && Math.abs(y - player.y) < this.laneR && this.laneBusy()) {
      this.stats.blockedLane++;
      return false;
    }
    if (starving) this.stats.starved++;
    return true;
  },

  note(kind) {
    this.lastSpawn = this.t;
    this.stats.spawned++;
    if (kind && this.wait) this.wait[kind] = 0;
  },

  // pick a wave the current level can actually express
  pickPattern() {
    const th = this.threat();
    const pool = DIR_PATTERNS.filter((p) => {
      if (p.minThreat > this.threatMax) return false;
      for (const n of p.needs) {
        if (n === 'jelly' && !(cfg.jellyEvery < 9000)) return false;
        if (n === 'hook' && !(cfg.hookEvery < 9000)) return false;
      }
      return true;
    });
    if (!pool.length) return null;
    return pool[(Math.random() * pool.length) | 0];
  },

  startWave() {
    const p = this.pickPattern();
    if (!p) return;
    const top = swimTop() + 20,
      bot = Math.max(swimTop() + 90, swimBot() - 20 - this.floorLift());
    const items = p.build({ top, bot, py: clamp(player.y, top, bot) });
    let last = 0;
    for (const it of items) {
      this.queue.push({ t: it.t, kind: it.kind, y: clamp(it.y, top, bot) });
      last = Math.max(last, it.t);
    }
    // ambient timers stand down until the wave has fully arrived, so a wave is a
    // shape you can read rather than a shape buried under random spawns
    this.suppress = last + 1.4;
    this.stats.waves++;
    this.lastWave = p.id;
  },

  spawnQueued(kind, y) {
    if (kind === 'pred') spawnPredator(y);
    else if (kind === 'jelly') spawnJelly(y);
    else if (kind === 'hook') spawnHook(y);
    else if (kind === 'net') spawnNet();
    this.note(kind);
  },

  // called once per frame from update(), before any spawning
  tick(dt, safe) {
    this.t += dt;
    if (this.suppress > 0) this.suppress -= dt;
    for (const k in this.wait) this.wait[k] += dt; // starvation clocks
    // breather clock
    if (this.breathing > 0) {
      this.breathing -= dt;
    } else {
      this.breatherT -= dt;
      if (this.breatherT <= 0) {
        this.breathing = this.breatherLen;
        this.breatherT = this.breatherEvery * rand(0.85, 1.2);
      }
    }
    // authored waves
    if (!safe && this.breathing <= 0 && this.queue.length === 0) {
      this.waveT -= dt;
      if (this.waveT <= 0) {
        this.waveT = this.waveEvery * rand(0.8, 1.25);
        this.startWave();
      }
    }
    // drain the wave queue (caps still apply — a wave may never blow the ceiling)
    if (this.queue.length) {
      for (const q of this.queue) q.t -= dt;
      let i = 0;
      while (i < this.queue.length) {
        const q = this.queue[i];
        if (q.t <= 0) {
          if (this.count(q.kind) < (this.caps[q.kind] || 99)) this.spawnQueued(q.kind, q.y);
          this.queue.splice(i, 1);
        } else i++;
      }
    }
  },
};
