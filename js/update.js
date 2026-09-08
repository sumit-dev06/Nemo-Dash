// ---------- update ----------
let lastT = 0;
// Vertical speed ceiling for hunters, px/s. 205 is the fastest a v2.8 predator could
// ever climb or dive (measured at reef 15: the wobble + hunterBrain terms summed to
// ~205), so keeping the cap here means the new velocity model changed how the fish
// MOVES without changing how hard it is to dodge.
const FOE_VY_MAX = 205;
function loop(t) {
  requestAnimationFrame(loop);
  const rawDt = Math.min(0.033, (t - lastT) / 1000 || 0.016);
  lastT = t;
  perfEMA = perfEMA * 0.95 + rawDt * 0.05;
  if (time - perfLastQ > 2.5) {
    perfLastQ = time;
    if (perfEMA > 0.027 && DPR > 1) {
      DPR = Math.max(1, DPR - 0.5); // struggling: fewer pixels, same picture
      applyDPR();
    } else if (perfEMA < 0.015 && DPR < dprTarget) {
      DPR = Math.min(dprTarget, DPR + 0.5); // cruising: sharpen back up
      applyDPR();
    }
  }
  let dt = rawDt;
  if (slowmo > 0) {
    slowmo -= rawDt;
    dt *= 0.35;
  }
  time += dt;
  // perfEMA above measures the frame INTERVAL (what the display gave us). This
  // measures the frame COST (what we spent), which is the number that tells you
  // whether there is headroom left on the device. Only sampled with ?perf=1.
  const t0 = PERF.on ? performance.now() : 0;
  if (state === 'playing') update(dt, rawDt);
  render();
  if (PERF.on) PERF.sample(performance.now() - t0, rawDt);
}
function currentForceAt(y) {
  let f = 0;
  for (const c of currents) {
    if (y > c.y - c.h / 2 && y < c.y + c.h / 2) f += c.force * c.strength;
  }
  return f;
}
function update(dt, rawDt) {
  // finite watchdog: no NaN/Infinity may ever hide Nemo — snap back to safety instead
  if (!isFinite(player.y) || !isFinite(player.vy)) {
    player.y = H / 2;
    player.vy = 0;
  }
  if (!isFinite(input.pointerY)) {
    input.pointerY = H / 2;
    input.pointerActive = false;
  }
  elapsed += dt;
  // boost tank: toggle/hold to burst; drains fast, refills at rest — never unlimited
  if (!player.dead && (input.boostHeld || player.boostToggle) && player.boost > 0) {
    if (!player.boosting) {
      player.boosting = true;
      AudioSys.boost();
    }
  } else player.boosting = false;
  if (player.boosting) {
    player.boost = Math.max(0, player.boost - (BOOST.drain / (typeof tankMul === 'function' ? tankMul() : 1)) * dt);
    if (player.boost <= 0) {
      player.boosting = false;
      player.boostToggle = false;
    }
    for (let i = 0; i < 2; i++)
      parts.push({
        x: rand(0, W),
        y: rand(0, H),
        vx: -900,
        vy: 0,
        life: 0.3,
        max: 0.3,
        r: 1.5,
        color: '#dff4ff',
      });
    bubble(player.x - 20, player.y + rand(-6, 6), false);
  } else player.boost = Math.min(100, player.boost + BOOST.fill * dt);
  const effSpeed =
    cfg.speed *
    (typeof finMul === 'function' ? finMul() : 1) *
    (player.frenzy > 0 ? 1.25 : 1) *
    (player.slow > 0 ? 0.62 : 1) *
    (player.magnet > 0 ? 1.05 : 1) *
    (player.boosting ? BOOST.mul : 1);
  distance += effSpeed * dt;
  scrollX += effSpeed * dt;
  if (endless) {
    // endless hardness climbs with distance, one tier per 900m (capped, always fair)
    const t = Math.floor(distance / 900);
    if (t !== cfg.tier) {
      const wasCave = cfg.cave || 0;
      cfg = endlessCfg(distance);
      midMagnet = false; // fresh tier, fresh mid-tier restock
      midHeart = false;
      currents = [];
      for (let i = 0; i < cfg.cur; i++)
        currents.push({
          y: rand(swimTop() + 40, Math.max(swimTop() + 60, swimBot() - 60)),
          h: rand(70, 130),
          force: rand(0, 1) > 0.5 ? 1 : -1,
          strength: rand(0.8, 1.2) * cfg.curStr,
          ph: rand(0, TAU),
        });
      // descending into the cave mid-run: re-bake the darker water once per tier
      if (Math.abs((cfg.cave || 0) - wasCave) > 0.05 && typeof bakeBackground !== 'undefined')
        bakeBackground();
    }
  }
  score = Math.floor(distance / 10) + pearls * 25 + nearCount * 15 + eatenPts;
  if (comboTimer > 0) {
    comboTimer -= rawDt;
    if (comboTimer <= 0) {
      combo = 0;
      updateCombo();
    }
  }

  // --- death cinematic: world drifts on, the kill plays out, then the panel ---
  if (player.dead) {
    player.deathT -= rawDt;
    const feeding = player.deadReason === 'bite' && player.eatenBy;
    if (feeding) player.feedT += rawDt;
    const SNAP_AT = 0.38; // jaws shut this many seconds after the grab
    for (const p of predators) {
      p.ph += dt * p.wob * 2;
      if (feeding && p === player.eatenBy) {
        if (!player.snapDone) {
          // RUN-DOWN: jaws gaping wider, darting onto the grabbed victim
          p.mouth = Math.min(1, p.mouth + rawDt * 5);
          const tx = player.catchX + p.size * 0.3; // put the mouth on the victim
          const ty = player.catchY;
          const k = 1 - Math.exp(-9 * dt);
          p.x += (tx - p.x) * k;
          p.y += (ty - p.y) * k;
          player.tail += dt * 30; // victim thrashing
          if (player.feedT >= SNAP_AT) {
            // SNAP: jaws shut on the victim — chomp, shake, blood, gone
            player.snapDone = true;
            AudioSys.chomp();
            shake = Math.max(shake, 16);
            blood(player.catchX, player.catchY, 26, 1.5);
            burst(player.catchX, player.catchY, 10, '#ffd66e');
            addFloat(player.catchX, player.catchY - 46, 'Got you!', '#ff5e62');
          }
        } else {
          // SWALLOW: jaws closing, killer drifts off slowly with the meal
          p.mouth = Math.max(0, p.mouth - rawDt * 1.8);
          p.x += p.vx * dt * 0.15;
        }
        continue;
      }
      p.x += p.vx * dt * 0.3;
    }
    for (const q of parts) {
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      if (q.kind === 'blood') {
        q.vx *= 1 - 1.9 * dt;
        q.vy = q.vy * (1 - 1.9 * dt) - 14 * dt;
        q.r += (q.grow || 10) * dt;
      } else {
        q.vy += 180 * dt * 0.3;
      }
      q.life -= dt;
    }
    parts = parts.filter((q) => q.life > 0);
    for (const b of bubbles) {
      b.y += b.vy * dt;
      b.x += b.vx * dt + Math.sin(time * 4 + b.ph) * 12 * dt;
    }
    bubbles = bubbles.filter((b) => b.y > -10);
    if (shake > 0) shake = Math.max(0, shake - rawDt * 30);
    if (flashA > 0) flashA = Math.max(0, flashA - rawDt * 2.2);
    if (player.deathT <= 0) finishDeath();
    return;
  }

  // --- player water physics (the important part) ---
  // v3.0 CONTROL MODEL — velocity steering, not acceleration.
  // v2.8 (ACC 2400 + drag 2.4) measured, stick pinned full-down:
  //   17ms -11px (WRONG WAY) · 100ms -1px (still wrong) · 200ms +5px · 500ms +95px,
  //   then ~500ms of coast after release. The buoyancy bob (36 px/s^2, applied
  //   unconditionally) simply out-muscled the stick for the first ~80ms.
  // v3.0: the stick sets a TARGET SPEED and vy converges on it in ~45ms. Water
  //   character survives as (a) that convergence, (b) the idle bob, (c) currents
  //   pushing on top — but none of it may ever fight your thumb.
  //   17ms +7px · 100ms +39px · 200ms +113px · 500ms +300px, stops in ~180ms.
  const MAXV = 660 * (typeof finMul === 'function' ? finMul() : 1); // top steering speed (+fins)
  // stick follow: ~14ms. Just enough to kill touch jitter; anything slower is
  // pure latency stacked on top of the physics (v2.8 used 14/s = 71ms).
  const sk = 1 - Math.exp(-70 * dt);
  input.joyX += ((input.joyTX || 0) - input.joyX) * sk;
  input.joyY += ((input.joyTY || 0) - input.joyY) * sk;
  if (Math.abs(input.joyX) < 0.02) input.joyX = 0;
  if (Math.abs(input.joyY) < 0.02) input.joyY = 0;
  // analog curve: 1.10 not 1.35 — a flatter low end is where fine dodging lives
  const jx = Math.sign(input.joyX) * Math.pow(Math.abs(input.joyX), 1.1);
  const jy = Math.sign(input.joyY) * Math.pow(Math.abs(input.joyY), 1.1);
  // one steer value, -1 (up) .. +1 (down), whatever the input device
  let steer = 0;
  if (input.up) steer -= 1;
  if (input.down) steer += 1;
  steer = clamp(steer + jy, -1, 1);
  if (input.pointerActive && Math.abs(steer) < 0.05) {
    // desktop mouse drag (touch devices never set this — see ui.js)
    steer = clamp((input.pointerY - player.y) / 90, -1, 1);
  }
  const steering = Math.abs(steer) > 0.02;
  // joystick right = surge forward toward 170+jx*120; released = eases back
  // to 170, so x never drifts (left half is already zeroed at input).
  const targetX = 170 + Math.max(0, jx) * 120;
  player.x += (targetX - player.x) * (1 - Math.exp(-8 * dt));
  player.x = clamp(player.x, 100, Math.max(200, W - 120));
  // bob fades to nothing the instant you steer, so it can never push you the
  // wrong way. 16 px/s of velocity wobble = ~7px of float, matching v2.8's idle.
  const bob = Math.sin(time * 2.1) * 16 * (1 - Math.abs(steer));
  const vyTarget = steer * MAXV + currentForceAt(player.y) * 0.35 + bob;
  const tc = steering ? 22 : 16; // ~45ms into a turn, ~180ms to a full stop on release
  player.vy += (vyTarget - player.vy) * (1 - Math.exp(-tc * dt));
  // headroom above MAXV so a current you are already steering with still pushes
  // (clamping at exactly MAXV would silently delete the current mechanic)
  player.vy = clamp(player.vy, -MAXV * 1.2, MAXV * 1.2);
  player.y += player.vy * dt;
  if (player.y < swimTop()) {
    player.y = swimTop();
    player.vy = Math.abs(player.vy) * 0.3;
  }
  if (player.y > swimBot()) {
    player.y = swimBot();
    player.vy = -Math.abs(player.vy) * 0.25;
    // seabed slam still costs 1 HP. 260 -> 430 (~65% of MAXV) because the new
    // model reaches any given speed ~5x sooner: at 260 an ordinary downward
    // steer would have been punished. 430 keeps it at "you dived into the sand".
    if (Math.abs(player.vy) > 430) {
      AudioSys.slam(); // was AudioSys.snap() via damage('crab') — a CRAB CLAW for hitting sand
      damage('crab', player.x, player.y);
    }
  }
  player.tilt = lerp(player.tilt, clamp(player.vy / 900, -0.55, 0.55), 1 - Math.exp(-8 * dt));
  player.tail += dt * (9 + Math.abs(player.vy) / 70 + effSpeed / 90) * (player.boosting ? 1.8 : 1);
  if (player.invuln > 0) player.invuln -= dt;
  if (player.gulpT > 0) player.gulpT -= rawDt;
  try { Meta.tickAbility(dt); Meta.tick(); } catch (e) {}
  try { misAdd('dist', effSpeed * dt); } catch (e) {}
  // buff expiry gets a cue: the ring already blinks, but on a phone your eyes are
  // on the hazard, not on your own fish. One warning at 1.5s, none after.
  const buffTick = (was, now) => {
    if (was > 1.5 && now <= 1.5) AudioSys.buffEnd();
  };
  if (player.shield > 0) {
    const w = player.shield;
    player.shield -= dt;
    buffTick(w, player.shield);
  }
  if (player.magnet > 0) {
    const w = player.magnet;
    player.magnet -= dt;
    buffTick(w, player.magnet);
  }
  if (player.slow > 0) {
    const w = player.slow;
    player.slow -= dt;
    buffTick(w, player.slow);
  }
  // MUSIC follows the danger, not the clock: the live threat weight the Director
  // already computes for spawning, plus a push when you are one hit from dead.
  // Cost is one number per frame — all the scheduling lives on the audio timer.
  AudioSys.musicIntensity(
    clamp(
      (Director.threat() / Math.max(1, Director.threatMax)) * 0.8 +
        (player.hearts <= 1 ? 0.28 : 0) +
        (player.boosting ? 0.12 : 0),
      0.12,
      1,
    ),
  );
  player.gillT -= dt;
  if (player.gillT <= 0) {
    player.gillT = rand(0.25, 0.6);
    bubble(player.x - 14, player.y - 4, false);
    if (Math.random() < 0.3) AudioSys.bubble();
  }
  // low-HP heartbeat warning so the last hit never feels "automatic"
  if (player.hearts === 1) {
    player.heartT -= dt;
    if (player.heartT <= 0) {
      player.heartT = 1.1;
      AudioSys.heartbeat();
    }
  }

  // --- spawn (stop near finish) ---
  // Every hazard now goes through the Spawn Director (js/director.js): the level
  // table still sets the pacing, but the Director owns caps, the live threat
  // budget, minimum separation, the player's-lane guard, breathers and waves.
  // A blocked spawn is retried shortly rather than queued, so density degrades
  // gracefully instead of bursting the moment the gate opens.
  const remaining = endless ? Infinity : cfg.goal - distance;
  // the last 420m before a reef's goal is a breather AND a boss fight pauses the
  // Director for its whole length — the fight owns the screen, no random hunters
  // drifting in mid-boss
  const safe =
    !endless && (remaining < 420 || (typeof Boss !== 'undefined' && Boss.active()));
  const RETRY = 0.3;
  Director.tick(dt, safe);
  spawnT.pred -= dt;
  spawnT.jelly -= dt;
  spawnT.net -= dt;
  spawnT.hook -= dt;
  spawnT.pearl -= dt;
  spawnT.power -= dt;
  spawnT.fry -= dt;
  spawnT.rock -= dt;
  spawnT.urch -= dt;
  if (!safe) {
    if (spawnT.pred <= 0) {
      if (Director.allow('pred')) {
        spawnT.pred = cfg.predEvery * rand(0.7, 1.3);
        spawnPredator();
        Director.note('pred');
      } else spawnT.pred = RETRY;
    }
    if (spawnT.jelly <= 0) {
      if (cfg.jellyEvery >= 9000) spawnT.jelly = 9999;
      else if (Director.allow('jelly')) {
        spawnT.jelly = cfg.jellyEvery * rand(0.8, 1.3);
        spawnJelly();
        Director.note('jelly');
      } else spawnT.jelly = RETRY;
    }
    if (spawnT.net <= 0) {
      if (cfg.netEvery >= 9000) spawnT.net = 9999;
      else if (Director.allow('net')) {
        spawnT.net = cfg.netEvery * rand(0.8, 1.3);
        spawnNet();
        Director.note('net');
      } else spawnT.net = RETRY;
    }
    if (spawnT.hook <= 0) {
      if (cfg.hookEvery >= 9000) spawnT.hook = 9999;
      else if (Director.allow('hook')) {
        spawnT.hook = cfg.hookEvery * rand(0.8, 1.3);
        spawnHook();
        Director.note('hook');
      } else spawnT.hook = RETRY;
    }
    if (spawnT.pearl <= 0) {
      // pearls arrive as a line of up to 5 — reserve that many slots
      if (Director.allow('pearl', null, false, 5)) {
        spawnT.pearl = cfg.pearlEvery * rand(0.8, 1.2);
        spawnPearl();
      } else spawnT.pearl = RETRY;
    }
    if (spawnT.fry <= 0) {
      // a school is 4 fish: reserving 1 slot let a cap of 8 reach 11 (measured)
      if (Director.allow('fry', null, false, 4)) {
        spawnT.fry = cfg.fryEvery * rand(0.7, 1.3);
        spawnFry();
      } else spawnT.fry = RETRY;
    }
    if (spawnT.rock <= 0) {
      // terrain cadence is measured in METRES of reef, not seconds, so rock spacing
      // stays the same whether the reef scrolls at 190 or 400 px/s.
      // slots 2: spawnBoulder() may add a shoulder rock, and asking for headroom of
      // ONE let a cap of 3 reach 4 (measured in a 90s census).
      if (Director.allow('rock', null, false, 2)) {
        spawnT.rock = rand(680, 1500) / Math.max(80, cfg.speed);
        spawnBoulder();
        Director.note('rock');
      } else spawnT.rock = RETRY;
    }
    // sea urchins are the shallow reefs' signature hazard — spikier, more frequent
    // than rocks, but a narrower footprint. Spawner no-ops off shallow biomes.
    if (spawnT.urch <= 0) {
      if (Director.allow('urch')) {
        spawnT.urch = rand(0.9, 1.5) * 2600 / Math.max(80, cfg.speed);
        spawnUrchin();
        Director.note('urch');
      } else spawnT.urch = RETRY;
    }
    if (spawnT.power <= 0) {
      if (Director.allow('power')) {
        spawnT.power = cfg.powerEvery * rand(0.9, 1.3);
        spawnPower();
      } else spawnT.power = RETRY;
    }
    // guaranteed mid-run gifts as reefs get harder: a magnet mid-reef for
    // everyone, plus one heart past the middle on hard reefs (never frequent).
    if (!endless && !safe) {
      if (!midMagnet && distance >= cfg.goal * 0.45) {
        midMagnet = true;
        dropPower('magnet');
      }
      if (!midHeart && level >= 4 && distance >= cfg.goal * 0.62) {
        midHeart = true;
        dropPower('heart');
      }
    }
    if (endless) {
      // endless restocks per tier: magnet mid-tier, heart late-tier on deep tiers
      const phase = distance - cfg.tier * 900;
      if (!midMagnet && phase >= 360) {
        midMagnet = true;
        dropPower('magnet');
      }
      if (!midHeart && cfg.tier >= 2 && phase >= 585) {
        midHeart = true;
        dropPower('heart');
      }
    }
  } else if (!gate) {
    gate = { x: spawnX() + 70 };
    AudioSys.gate();
  }

  // --- entities ---
  const px = player.x,
    py = player.y;
  // Body inertia, shared by every animal this frame: ONE Math.exp for the whole
  // update instead of one per entity. 6/s ≈ a 170ms time constant — enough that a
  // hunter leans into a turn instead of teleporting onto your depth.
  const kFoe = 1 - Math.exp(-6 * dt);
  const dampJ = Math.exp(-2.2 * dt); // jelly water drag
  for (const p of predators) {
    p.ph += dt * p.wob * 2;
    p.s = Math.sin(p.ph); // cached: drawPredator read this 6x per frame per foe
    const slowM = player.slow > 0 ? 0.6 : 1;
    const lethal = fish().might < foeMight(p); // can this foe actually swallow me?
    if (p.cool > 0) p.cool -= dt;
    const mouthWant = p.lunge !== 0 ? 1 : 0; // jaws gape during wind-up + lunge
    p.mouth += clamp(mouthWant - p.mouth, -dt * 3, dt * 3);
    // v3.0 physics: predators used to have their Y *displaced* every frame by a sum
    // of sine terms, so a hunter tracking you slid sideways through the water at up
    // to 205px/s while its body stayed perfectly level — the single most obviously
    // fake motion in the game. Now every state writes a TARGET vertical speed, the
    // body converges on it (kFoe), and the drawn pitch comes from the velocity, so
    // a fish that climbs is nose-up. Speeds and clamps are the v2.8 numbers, so the
    // difficulty is unchanged.
    let wantVy = 0;
    if (p.lunge > 0) {
      // WIND-UP: drift slows, creeps toward your height, jaws open — DODGE NOW!
      p.lunge -= dt;
      p.x += p.vx * 0.35 * dt * slowM;
      wantVy = clamp((py - p.y) * 2.2, -110, 110);
      if (p.lunge <= 0) {
        // STRIKE — locked onto where you ARE this instant. Move and it misses.
        // Hunters never swim backwards: if you surged past the jaws, the
        // strike aborts instead of throwing the fish tail-first at you.
        const dx = px - p.x,
          dy = py - p.y,
          d = Math.hypot(dx, dy) || 1;
        if (dx > -20) {
          p.lunge = 0;
          p.cool = rand(1.2, 2);
        } else {
          const sp = Math.max(300, cfg.speed * 1.7);
          p.lx = Math.min((dx / d) * sp, -120); // always leftward, never back
          p.ly = (dy / d) * sp;
          p.lunge = -0.42;
        }
      }
    } else if (p.lunge < 0) {
      // lunging along the locked line
      p.lunge += dt;
      p.x += p.lx * dt * slowM;
      p.y += p.ly * dt * slowM;
      p.vy = p.ly; // the strike IS the velocity: the body angles along the lunge
      if (p.lunge >= 0) {
        p.lunge = 0;
        p.cool = rand(1.6, 2.6);
      }
    } else {
      // cruising
      p.x += p.vx * dt * slowM;
      wantVy = p.s * 40 + Math.sin(time * 1.7 + p.ph) * 12;
      if (cfg.hunterBrain && p.hungry && p.x > W * 0.15 && p.x < W + 40) {
        const want = clamp((py - p.y) * 1.6, -90, 90);
        wantVy += want * (0.5 + level * 0.08);
      }
      // start a telegraphed strike? (only lethal foes bother; edible ones just get eaten)
      if (
        lethal &&
        p.cool <= 0 &&
        !player.dead &&
        p.x > px &&
        p.x - px < 280 &&
        Math.abs(p.y - py) < 130
      ) {
        p.lunge = 0.6;
        AudioSys.lunge();
        addFloat(p.x, p.y - 34, '!', '#ff5e62');
      }
    }
    if (p.lunge >= 0) {
      p.vy += (wantVy - p.vy) * kFoe;
      p.vy = clamp(p.vy, -FOE_VY_MAX, FOE_VY_MAX);
      p.y += p.vy * dt * slowM;
    }
    if (p.y < 50 || p.y > FLOOR_Y - 40) p.vy = 0; // don't grind against the wall
    p.y = clamp(p.y, 50, FLOOR_Y - 40);
    // pitch follows the velocity, damped. 0.72 keeps a full-speed dive under 35°
    // (a 90° nose-dive on a 62px-long shark reads as a glitch, not as swimming).
    const fwd = Math.max(90, Math.abs(p.lunge < 0 ? p.lx : p.vx));
    p.pitch += (clamp(Math.atan2(p.vy, fwd) * 0.72, -0.6, 0.6) - p.pitch) * kFoe;
    // near miss
    if (!p.counted && p.x < px - 10) {
      p.counted = true;
      const gap = Math.abs(p.y - py);
      if (gap < 86) {
        nearCount++;
        try { misAdd('near', 1); } catch (e) {}
        combo++;
        comboTimer = 2.5;
        const pts = 15 * combo;
        score += pts;
        AudioSys.nearMiss(combo);
        // in a boss fight this same dodge also wears the boss down — agency: the
        // player's clean dodging is the damage, not just survival
        if (typeof Boss !== 'undefined') Boss.nearMiss(player);
        if (combo % 5 === 0) AudioSys.comboUp(combo); // every 5th: a real reward
        updateCombo();
      }
    }
    if (player.invuln <= 0 && !player.dead) {
      const rr = p.size * 0.32;
      // MOUTH (front of the hunter, faces left): teeth kill ONLY on a frontal
      // bite — the victim must be level with the jaws and ahead of the hunter.
      // Brushing past above/below, or touching the hunter from behind, just
      // bruises (body rule below) — it never eats you.
      const mouthDY = Math.abs(py - p.y);
      const frontal = px < p.x + p.size * 0.05 && mouthDY < rr * 0.62;
      const touchMouth =
        frontal && circleHit(px, py, player.r * 0.8, p.x - p.size * 0.3, p.y, rr * 0.95);
      // BODY (middle + tail): a bump only bruises — gentle 1 HP, never death
      const touchBody =
        !touchMouth && circleHit(px, py, player.r * 0.85, p.x + p.size * 0.1, p.y, rr * 1.05);
      if (touchMouth || touchBody) {
        // thorns (Puffy guard) + frenzy (Razor): contact becomes YOUR kill
        if ((player.thorns > 0 || player.frenzy > 0) && fish().might + 0.6 >= foeMight(p)) {
          p.dead = true;
          p.counted = true;
          eatFish(p.x, p.y, 50, '');
        } else if (fish().might >= foeMight(p)) {
          p.dead = true;
          p.counted = true;
          eatFish(p.x, p.y, 50, '');
        } else if (touchMouth) engulfBy(p);
        else damage('graze', p.x, p.y, true);
      }
    }
  }
  predators = predators.filter((p) => p.x > -160 && !p.dead);

  // A school is not six independent wigglers. Each fry holds a slot (`oy`) on its
  // school's line (`sy`), the wiggle travels through the group as a wave (the phase
  // offsets are baked in at spawn), and the whole school BOLTS when the player gets
  // close — which is the moment fry stop being scenery and start being prey.
  for (const f of fries) {
    f.ph += dt * 6;
    f.s = Math.sin(f.ph); // cached for drawFry
    f.x += f.vx * dt * (player.slow > 0 ? 0.6 : 1);
    const dyp = f.y - py,
      dxp = f.x - px;
    let want = (f.sy + f.oy - f.y) * 3.2 + f.s * 30; // formation + body wiggle
    if (!player.dead && dxp * dxp + dyp * dyp < 15000) {
      // scatter: swim away from the mouth, hardest when it is closest
      want += (dyp > 0 ? 1 : -1) * 210;
      f.x += 40 * dt;
    }
    f.vy += (want - f.vy) * kFoe;
    f.y = clamp(f.y + f.vy * dt, swimTop() + 8, swimBot() - 8);
    if (!player.dead && !player.trappedIn && circleHit(px, py, player.r + 6, f.x, f.y, f.r)) {
      f.dead = true;
      eatFish(f.x, f.y, 15, '');
    }
  }
  fries = fries.filter((f) => !f.dead && f.x > -60);

  // --- seabed boulders: solid terrain, never lethal ---
  // The mound LIFTS you as it passes rather than stopping you dead, so a rock you
  // read too late costs you height and tempo, not a heart. Profile and lift rate are
  // shared with world.js rockProfile(), so what you see is exactly what blocks you.
  // Measured: the profile's steepest slope is 1.40 px/px on the narrowest (2.1:1)
  // rock and 0.86 on the widest, and it is TANGENT to the sand at both toes — the
  // shove ramps up from zero instead of snapping. A 90s ride test with the stick
  // pinned into the rock: 0px penetration, 0 hearts lost, max 8.5px of lift a frame.
  for (const b of boulders) {
    b.x -= effSpeed * 0.9 * dt; // matches the seabed decor parallax in render.js
    if (b.ride > 0) b.ride -= dt;
    const reach = b.w * 0.5;
    // nothing else may hide inside the rock either: a handful of checks (<=3 rocks
    // x <=3 hunters), and without it a shark can sit invisible inside a boulder
    for (const p of predators) {
      if (Math.abs(p.x - b.x) > reach + p.size * 0.3) continue;
      const lim = boulderTop(b, p.x) - p.size * 0.22;
      if (p.y > lim) {
        p.y = lim;
        if (p.vy > 0) p.vy = 0;
      }
    }
    for (const j of jellies) {
      if (Math.abs(j.x - b.x) > reach + j.r) continue;
      const lim = boulderTop(b, j.x) - j.r;
      if (j.y > lim) {
        j.y = lim;
        if (j.vy > 0) j.vy = 0;
      }
    }
    if (player.dead || player.trappedIn) continue;
    if (px < b.x - reach - player.r || px > b.x + reach + player.r) continue;
    const limit = boulderTop(b, px) - player.r * 0.85;
    if (player.y > limit) {
      player.y = limit;
      if (player.vy > 0) player.vy = 0; // you cannot swim down through rock
      if (b.ride <= 0) {
        b.ride = 0.35;
        AudioSys.scrape(b.h / 90);
        shake = Math.max(shake, 2);
        for (let i = 0; i < 3; i++) bubble(px + rand(-10, 6), player.y + 10, false);
      }
    }
  }
  boulders = boulders.filter((b) => b.x > -240);

  // --- sea urchins: shallow-reef spikes, LETHAL ---
  // Same seabed scroll as the boulders (they sit on the same ground). A single
  // sprite per cluster is baked (render.js), so this is one filter + one collision
  // test per cluster a frame. Box collision, generous to the player: only the
  // upper ~70% of each spine tip cuts, never the base.
  for (const u of urchins) {
    u.x -= effSpeed * 0.9 * dt;
    if (player.dead || player.trappedIn || player.invuln > 0) continue;
    const reach = (u.w * 0.5) + 2;
    if (px < u.x - reach - player.r || px > u.x + reach + player.r) continue;
    // only the spiny crown cuts; the base is kind
    const top = FLOOR_Y - u.h;
    if (player.y + player.r * 0.8 > top) {
      damage('urch', u.x, top + u.h * 0.5);
    }
  }
  urchins = urchins.filter((u) => u.x > -240);

  // Jellyfish swim by PULSING, which is nothing like the sine wave v2.8 slid them
  // along: the bell contracts, that squirts water and shoves the animal up, then it
  // sinks while the bell refills. So: an impulse on each contraction, negative
  // buoyancy pulling it back down, water drag, and a weak spring back to the depth
  // it spawned at (that last one is what keeps a Director jelly-WALL's door open —
  // free-drifting jellies would close the gap and make the shape unwinnable).
  for (const j of jellies) {
    j.ph += dt * j.pulse;
    // cached for drawJelly: the tentacle loop used 10 Math.sin per jelly per frame,
    // all of which are now angle-sum identities over these four numbers.
    j.s = Math.sin(j.ph);
    j.c = Math.cos(j.ph);
    j.s3 = Math.sin(j.ph * 1.3);
    j.c3 = Math.cos(j.ph * 1.3);
    j.x += j.vx * dt * (player.slow > 0 ? 0.6 : 1);
    if (j.s > 0.6) {
      if (!j.fired) {
        j.fired = true;
        j.vy -= j.thrust; // the contraction
      }
    } else if (j.s < 0) j.fired = false;
    j.vy += 26 * dt; // slightly heavier than water — it always sinks between pulses
    j.vy += (j.y0 - j.y) * 0.6 * dt; // hold station at spawn depth
    j.vy = clamp(j.vy * dampJ, -90, 70);
    j.y += j.vy * dt;
    if (j.y < 60 || j.y > FLOOR_Y - 60) j.vy = 0;
    j.y = clamp(j.y, 60, FLOOR_Y - 60);
    if (player.invuln <= 0 && circleHit(px, py, player.r * 0.8, j.x, j.y, j.r + 6))
      damage('jelly', j.x, j.y);
  }
  jellies = jellies.filter((j) => j.x > -80);

  for (const n of nets) {
    n.sway += dt * 1.4;
    if (n.warn > 0) {
      n.warn -= dt;
      // warning phase: the boat holds station overhead, cage still on the ropes.
      // It scrolls with the world so the shadow you read is where it will land.
      n.x -= effSpeed * dt;
    } else if (!n.landed) {
      // straight drop, but carried leftward by the world like everything else —
      // so a cage dropped ahead of you sweeps in as a readable wall instead of
      // materialising overhead. No chasing, no screen tracking: pure world scroll.
      n.y += n.vy * dt;
      n.x -= effSpeed * dt;
      n.x += Math.sin(n.sway) * 6 * dt; // alive, never enough to slide into the fish
      if (n.y >= FLOOR_Y - n.h) {
        n.y = FLOOR_Y - n.h;
        n.landed = true;
        AudioSys.netLand(); // steel hitting the seabed used to be completely silent
        shake = Math.max(shake, 4);
      }
    } else {
      // landed cage sits on the seabed and scrolls with the world at full speed
      // (0.85x made spent cages loiter in frame for ~5s — pure clutter)
      n.x -= effSpeed * dt;
    }
    // TRAPPED only when the fish centre is TRULY INSIDE the mesh —
    // brushing past / swimming near it never traps. Simple rule.
    if (!player.dead && !player.trappedIn && n.warn <= 0 && player.invuln <= 0 && !n.landed) {
      const m = 12; // inner margin: must be well inside, not on the edge
      const inside =
        px > n.x - n.w / 2 + m &&
        px < n.x + n.w / 2 - m &&
        py > n.y + m &&
        py < n.y + n.h - m;
      if (inside) {
        player.trappedIn = n;
        player.boosting = false;
        player.boostToggle = false;
        AudioSys.trap(); // splash() was the boat dropping it; this is the mesh closing
        burst(player.x, player.y, 12, '#d8b98a');
      }
    }
  }
  nets = nets.filter((n) => n.x > -100);

  // dragged down inside the cage: pinned to it, struggling, awaiting the landing
  if (player.trappedIn && !player.dead) {
    const t = player.trappedIn;
    player.x = t.x;
    player.y = t.y + t.h - player.r - 6;
    player.vy = 0;
    player.tail += dt * 30;
    if (t.landed) {
      player.trappedIn = null;
      if (!useShield()) triggerDeath('net');
      else {
        player.x = 170; // shield bursts you free — snap back to swim lane, no left drift
        player.vy = -260; // shield bursts you free, upward!
      }
    }
  }

  for (const hk of hooks) {
    hk.sway += dt * 1.2;
    hk.x += hk.vx * dt;
    hk.y += hk.vy * dt * 0.25;
    if (hk.y > 40) hk.y = 40;
    const hx = hk.x + Math.sin(hk.sway) * 26,
      hy = hk.y + hk.len;
    hk.hx = hx;
    hk.hy = hy;
    if (
      player.invuln <= 0 &&
      (circleHit(px, py, player.r * 0.75, hx, hy, hk.r) ||
        (Math.abs(px - hx) < 10 && py > hk.y && py < hy))
    )
      damage('hook', hx, hy);
  }
  hooks = hooks.filter((h) => h.x > -80);

  for (const pl of pearlsArr) {
    pl.ph += dt * 3;
    pl.x += pl.vx * dt;
    if (player.magnet > 0) {
      const dx = px - pl.x,
        dy = py - pl.y,
        d = Math.hypot(dx, dy);
      if (d < 190) {
        pl.x += (dx / d) * 260 * dt;
        pl.y += (dy / d) * 260 * dt;
      }
    }
    if (!player.trappedIn && circleHit(px, py, player.r + 8, pl.x, pl.y, pl.r)) {
      pl.dead = true;
      pearls++;
      AudioSys.coin();
      burst(pl.x, pl.y, 10, '#ffe9a8');
    }
  }
  pearlsArr = pearlsArr.filter((p) => !p.dead && p.x > -40);

  for (const pw of powers) {
    pw.ph += dt * 2.5;
    pw.x += pw.vx * dt;
    if (circleHit(px, py, player.r + 12, pw.x, pw.y, 16)) {
      pw.dead = true;
      AudioSys.power();
      if (pw.kind === 'shield') {
        player.shield = 12;
        addFloat(px, py - 34, 'Shield! 🛡️', '#7de9ff');
      }
      if (pw.kind === 'magnet') {
        player.magnet = 10 * (typeof lureMul === 'function' ? lureMul() : 1);
        addFloat(px, py - 34, 'Magnet! 🧲', '#ff9ff3');
      }
      if (pw.kind === 'slow') {
        player.slow = 7;
        addFloat(px, py - 34, 'Slow water! 🌿', '#7dffc4');
      }
      if (pw.kind === 'heart') {
        if (player.hearts < player.maxHearts) {
          player.hearts++;
          AudioSys.heartbeat();
          addFloat(px, py - 34, '+1 ❤', '#ff6b81');
        } else {
          score += 50;
          addFloat(px, py - 34, 'Full hearts +50', '#ff6b81');
        }
        updateHud();
      }
      burst(pw.x, pw.y, 16, '#ffffff');
    }
  }
  powers = powers.filter((p) => !p.dead && p.x > -40);

  // particles / bubbles / floaters
  for (const q of parts) {
    q.x += q.vx * dt;
    q.y += q.vy * dt;
    if (q.kind === 'blood') {
      // blood hangs in the water: heavy drag, faint rise, keeps blooming
      q.vx *= 1 - 1.9 * dt;
      q.vy = q.vy * (1 - 1.9 * dt) - 14 * dt;
      q.r += (q.grow || 10) * dt;
    } else {
      q.vy += 180 * dt * 0.3;
    }
    q.life -= dt;
  }
  parts = parts.filter((q) => q.life > 0);
  // 500 was never reached in normal play but WAS reached during a boost through a
  // kill (2 spark/frame + 40-particle bursts + blood): the screen went white-ish
  // and the phone dropped frames exactly when the player needed to see. 260 still
  // holds two full death bursts plus a blood plume.
  const partCap = 260;
  if (parts.length > partCap) parts.splice(0, parts.length - partCap);
  for (const b of bubbles) {
    b.y += b.vy * dt;
    b.x += b.vx * dt + Math.sin(time * 4 + b.ph) * 12 * dt;
  }
  bubbles = bubbles.filter((b) => b.y > -10);
  // ambient seabed bubbles: 8/s kept ~65 stroked circles alive at once, which is
  // both the busiest thing on screen and the least informative. 4/s reads the same.
  if (Math.random() < dt * 4) bubble(rand(0, W), H + 6, false);
  for (const f of floaters) {
    f.y -= 30 * dt;
    f.life -= dt;
  }
  floaters = floaters.filter((f) => f.life > 0);
  for (const s of snow) {
    s.x -= (20 + s.z * 60) * dt * (effSpeed / 220);
    if (s.x < 0) {
      s.x = W;
      s.y = rand(0, H);
    }
  }

  if (shake > 0) shake = Math.max(0, shake - rawDt * 30);
  if (flashA > 0) flashA = Math.max(0, flashA - rawDt * 2.2);

  // gate / boss (levels only — endless has no finish line)
  if (!endless) {
    const bossReef = typeof cfg.boss === 'boolean' && cfg.boss;
    if (bossReef) {
      // a boss reef ends by BEATING THE BOSS, not by crossing a line. When the
      // run reaches the goal the boss rises; normal spawning stands down; the
      // fight owns the screen until its health is drained.
      if (Boss.active()) {
        Boss.tick(dt, px, py);
        Boss.tickShots(dt, px, py);
        Boss.tickBody(px, py);
        if (Boss.beaten()) {
          Boss.defeat();
          levelComplete();
          return;
        }
      } else if (remaining <= 0) {
        Boss.start();
      }
    } else if (gate) {
      gate.x -= effSpeed * dt;
      if (gate.x < px + 10) {
        levelComplete();
        return;
      }
    } else if (remaining <= 0) {
      gate = { x: spawnX() - 10 };
      AudioSys.gate();
    }
  }
  if (player.y < -40 || player.y > H + 40) {
    player.y = clamp(player.y, swimTop() + 14, swimBot() - 16);
    player.vy = 0;
    damage('out', player.x, player.y);
  }

  updateHud();
}
