// ---------- update ----------
let lastT = 0;
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
  if (state === 'playing') update(dt, rawDt);
  render();
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
    player.boost = Math.max(0, player.boost - BOOST.drain * dt);
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
    (player.slow > 0 ? 0.62 : 1) *
    (player.magnet > 0 ? 1.05 : 1) *
    (player.boosting ? BOOST.mul : 1);
  distance += effSpeed * dt;
  scrollX += effSpeed * dt;
  if (endless) {
    // endless hardness climbs with distance, one tier per 900m (capped, always fair)
    const t = Math.floor(distance / 900);
    if (t !== cfg.tier) {
      cfg = endlessCfg(distance);
      currents = [];
      for (let i = 0; i < cfg.cur; i++)
        currents.push({
          y: rand(90, H - 160),
          h: rand(70, 130),
          force: rand(0, 1) > 0.5 ? 1 : -1,
          strength: rand(0.8, 1.2) * cfg.curStr,
          ph: rand(0, TAU),
        });
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

  // --- death cinematic: world drifts on, Nemo shrinks/fades, then the panel ---
  if (player.dead) {
    player.deathT -= rawDt;
    for (const p of predators) {
      p.ph += dt * p.wob * 2;
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
  const ACC = 2400,
    MAXV = 560;
  let ay = 0;
  if (input.up) ay -= ACC;
  if (input.down) ay += ACC;
  if (input.pointerActive) {
    const dy = input.pointerY - player.y;
    ay += dy * 16 - player.vy * 3.2; // spring-damper => laggy underwater feel
  }
  ay += Math.sin(time * 2.1) * 36; // gentle buoyancy bob
  ay += currentForceAt(player.y); // current bands
  player.vy += ay * dt;
  // quadratic-ish water drag
  const drag = Math.exp(-2.4 * dt);
  player.vy *= drag;
  player.vy = clamp(player.vy, -MAXV, MAXV);
  player.y += player.vy * dt;
  if (player.y < 46) {
    player.y = 46;
    player.vy = Math.abs(player.vy) * 0.3;
  }
  if (player.y > FLOOR_Y - 24) {
    player.y = FLOOR_Y - 24;
    player.vy = -Math.abs(player.vy) * 0.25;
    if (Math.abs(player.vy) > 260) {
      damage('crab', player.x, player.y);
    }
  }
  player.tilt = lerp(player.tilt, clamp(player.vy / 900, -0.55, 0.55), 1 - Math.exp(-8 * dt));
  player.tail += dt * (9 + Math.abs(player.vy) / 70 + effSpeed / 90) * (player.boosting ? 1.8 : 1);
  if (player.invuln > 0) player.invuln -= dt;
  if (player.shield > 0) player.shield -= dt;
  if (player.magnet > 0) player.magnet -= dt;
  if (player.slow > 0) player.slow -= dt;
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
  const remaining = endless ? Infinity : cfg.goal - distance;
  const safe = !endless && remaining < 420;
  spawnT.pred -= dt;
  spawnT.jelly -= dt;
  spawnT.net -= dt;
  spawnT.hook -= dt;
  spawnT.pearl -= dt;
  spawnT.power -= dt;
  spawnT.fry -= dt;
  if (!safe) {
    if (spawnT.pred <= 0) {
      spawnT.pred = cfg.predEvery * rand(0.7, 1.3);
      spawnPredator();
    }
    if (spawnT.jelly <= 0) {
      spawnT.jelly = cfg.jellyEvery * rand(0.8, 1.3);
      if (cfg.jellyEvery < 9000) spawnJelly();
    }
    if (spawnT.net <= 0) {
      spawnT.net = cfg.netEvery * rand(0.8, 1.3);
      if (cfg.netEvery < 9000) spawnNet();
    }
    if (spawnT.hook <= 0) {
      spawnT.hook = cfg.hookEvery * rand(0.8, 1.3);
      if (cfg.hookEvery < 9000) spawnHook();
    }
    if (spawnT.pearl <= 0) {
      spawnT.pearl = cfg.pearlEvery * rand(0.7, 1.3);
      spawnPearl();
    }
    if (spawnT.fry <= 0) {
      spawnT.fry = cfg.fryEvery * rand(0.7, 1.3);
      spawnFry();
    }
    if (spawnT.power <= 0) {
      spawnT.power = cfg.powerEvery * rand(0.9, 1.3);
      spawnPower();
    }
  } else if (!gate) {
    gate = { x: spawnX() + 70 };
  }

  // --- entities ---
  const px = player.x,
    py = player.y;
  for (const p of predators) {
    p.ph += dt * p.wob * 2;
    const slowM = player.slow > 0 ? 0.6 : 1;
    const lethal = fish().might < foeMight(p); // can this foe actually swallow me?
    if (p.cool > 0) p.cool -= dt;
    const mouthWant = p.lunge !== 0 ? 1 : 0; // jaws gape during wind-up + lunge
    p.mouth += clamp(mouthWant - p.mouth, -dt * 3, dt * 3);
    if (p.lunge > 0) {
      // WIND-UP: drift slows, creeps toward your height, jaws open — DODGE NOW!
      p.lunge -= dt;
      p.x += p.vx * 0.35 * dt * slowM;
      p.y += clamp((py - p.y) * 2.2, -110, 110) * dt;
      if (p.lunge <= 0) {
        // STRIKE — locked onto where you ARE this instant. Move and it misses.
        const dx = px - p.x,
          dy = py - p.y,
          d = Math.hypot(dx, dy) || 1;
        const sp = Math.max(300, cfg.speed * 1.7);
        p.lx = (dx / d) * sp;
        p.ly = (dy / d) * sp;
        p.lunge = -0.42;
      }
    } else if (p.lunge < 0) {
      // lunging along the locked line
      p.lunge += dt;
      p.x += p.lx * dt * slowM;
      p.y += p.ly * dt * slowM;
      if (p.lunge >= 0) {
        p.lunge = 0;
        p.cool = rand(1.6, 2.6);
      }
    } else {
      // cruising
      p.x += p.vx * dt * slowM;
      p.y += Math.sin(p.ph) * 40 * dt + Math.sin(time * 1.7 + p.ph) * 12 * dt;
      if (cfg.hunterBrain && p.hungry && p.x > W * 0.15 && p.x < W + 40) {
        const want = clamp((py - p.y) * 1.6, -90, 90);
        p.y += want * dt * (0.5 + level * 0.08);
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
    p.y = clamp(p.y, 50, FLOOR_Y - 40);
    // near miss
    if (!p.counted && p.x < px - 10) {
      p.counted = true;
      const gap = Math.abs(p.y - py);
      if (gap < 86) {
        nearCount++;
        combo++;
        comboTimer = 2.5;
        const pts = 15 * combo;
        score += pts;
        AudioSys.nearMiss(combo);
        updateCombo();
      }
    }
    if (player.invuln <= 0 && !player.dead) {
      const rr = p.size * 0.32;
      // MOUTH (front of the hunter, faces left): teeth kill
      const touchMouth = circleHit(px, py, player.r * 0.8, p.x - p.size * 0.3, p.y, rr * 0.95);
      // BODY (middle + tail): a bump only bruises — gentle 1 HP, never death
      const touchBody =
        !touchMouth && circleHit(px, py, player.r * 0.85, p.x + p.size * 0.1, p.y, rr * 1.05);
      if (touchMouth || touchBody) {
        // bigger fish eat smaller ones: might decides who swallows whom
        if (fish().might >= foeMight(p)) {
          p.dead = true;
          p.counted = true;
          eatFish(p.x, p.y, 50, '');
        } else if (touchMouth) engulfBy();
        else damage('graze', p.x, p.y, true);
      }
    }
  }
  predators = predators.filter((p) => p.x > -160 && !p.dead);

  for (const f of fries) {
    f.ph += dt * 6;
    f.x += f.vx * dt * (player.slow > 0 ? 0.6 : 1);
    f.y += Math.sin(f.ph) * 60 * dt;
    if (!player.dead && !player.trappedIn && circleHit(px, py, player.r + 6, f.x, f.y, f.r)) {
      f.dead = true;
      eatFish(f.x, f.y, 15, '');
    }
  }
  fries = fries.filter((f) => !f.dead && f.x > -60);

  for (const j of jellies) {
    j.ph += dt * j.pulse;
    j.x += j.vx * dt * (player.slow > 0 ? 0.6 : 1);
    j.y += Math.cos(j.ph) * 50 * dt + Math.sin(time + j.ph) * 10 * dt;
    j.y = clamp(j.y, 60, FLOOR_Y - 60);
    if (player.invuln <= 0 && circleHit(px, py, player.r * 0.8, j.x, j.y, j.r + 6))
      damage('jelly', j.x, j.y);
  }
  jellies = jellies.filter((j) => j.x > -80);

  for (const n of nets) {
    n.sway += dt * 1.4;
    if (n.warn > 0) {
      n.warn -= dt;
      // warning phase: cage hangs, no drift
    } else if (!n.landed) {
      // straight drop from the top — no horizontal chase, no screen tracking.
      // tiny sway only so it feels alive, never enough to slide into the fish.
      n.y += n.vy * dt;
      n.x += Math.sin(n.sway) * 6 * dt;
      if (n.y >= FLOOR_Y - n.h) {
        n.y = FLOOR_Y - n.h;
        n.landed = true;
      }
    } else {
      // landed cage sits on the seabed and scrolls with the world (correct)
      n.x -= effSpeed * 0.85 * dt;
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
        AudioSys.splash();
        burst(player.x, player.y, 12, '#d8b98a');
      }
    }
  }
  nets = nets.filter((n) => n.x > -140);

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
        player.magnet = 10;
        addFloat(px, py - 34, 'Magnet! 🧲', '#ff9ff3');
      }
      if (pw.kind === 'slow') {
        player.slow = 7;
        addFloat(px, py - 34, 'Slow water! 🌿', '#7dffc4');
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
  const partCap = 500;
  if (parts.length > partCap) parts.splice(0, parts.length - partCap);
  for (const b of bubbles) {
    b.y += b.vy * dt;
    b.x += b.vx * dt + Math.sin(time * 4 + b.ph) * 12 * dt;
  }
  bubbles = bubbles.filter((b) => b.y > -10);
  if (Math.random() < dt * 8) bubble(rand(0, W), H + 6, false);
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

  // gate (levels only — endless has no finish line)
  if (!endless) {
    if (gate) {
      gate.x -= effSpeed * dt;
      if (gate.x < px + 10) {
        levelComplete();
        return;
      }
    } else if (remaining <= 0) {
      gate = { x: spawnX() - 10 };
    }
  }
  if (player.y < -40 || player.y > H + 40) {
    player.y = clamp(player.y, 60, FLOOR_Y - 40);
    player.vy = 0;
    damage('out', player.x, player.y);
  }

  updateHud();
}
