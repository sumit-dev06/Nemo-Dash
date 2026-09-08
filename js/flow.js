// ---------- flow ----------
let engulfT = 0;
// Shared run reset. startLevel() and startEndless() used to carry two
// near-identical 40-line copies of this; anything added to one (the Spawn
// Director, a new powerup timer) had to be remembered in the other.
function resetRun(spawnTimers) {
  score = 0;
  pearls = 0;
  nearCount = 0;
  combo = 0;
  comboTimer = 0;
  eaten = 0;
  eatenPts = 0;
  distance = 0;
  scrollX = 0;
  elapsed = 0;
  predators = [];
  jellies = [];
  nets = [];
  hooks = [];
  pearlsArr = [];
  powers = [];
  parts = [];
  bubbles = [];
  floaters = [];
  currents = [];
  fries = [];
  boulders = [];
  urchins = [];
  spawnT = spawnTimers;
  // seabed boulders are terrain, so their cadence is measured in METRES of reef, not
  // seconds — the first one is set here rather than by the callers.
  if (spawnT && spawnT.rock == null) spawnT.rock = 2.2;
  if (spawnT && spawnT.urch == null) spawnT.urch = 4;
  if (typeof Director !== 'undefined') Director.reset();
  // no boss carries over between runs, and the score drops out of boss mode
  if (typeof Boss !== 'undefined') Boss.clear();
  try {
    AudioSys.musicBoss(false);
  } catch (e) {}
  player.maxHearts = fish().hp + (typeof hullBonus === 'function' ? hullBonus() : 0);
  player.hearts = player.maxHearts;
  player.r = Math.round(15 * fish().size) + 2;
  player.boost = 100;
  player.boosting = false;
  player.boostToggle = false;
  player.trappedIn = null;
  player.x = 170;
  player.y = H / 2;
  player.vy = 0;
  player.invuln = 0;
  player.shield = 0;
  player.magnet = 0;
  player.slow = 0;
  player.alive = true;
  player.dead = false;
  player.deathT = 0;
  player.deadReason = '';
  player.eatenBy = null;
  player.feedT = 0;
  player.snapDone = false;
  player.gulpT = 0;
  player.heartT = 0;
  player.abilityCd = 0;
  player.abilityT = 0;
  player.frenzy = 0;
  player.thorns = 0;
  midMagnet = false;
  midHeart = false;
  // never start a run with the stick still held from the menu tap
  input.joyTX = 0;
  input.joyTY = 0;
  input.joyX = 0;
  input.joyY = 0;
  input.pointerActive = false;
  if (typeof window.joyReset === 'function') window.joyReset();
  // this reef belongs to a biome: pick its palette BEFORE the decor and the water
  // bake, so the seaweed hue, rock tint, sand and god-ray strength all agree
  if (typeof setActiveBiome === 'function') {
    try { setActiveBiome(endless ? distance : level); } catch (e) { setActiveBiome(level); }
  }
  seedDecor();
  if (typeof bakeBackground !== 'undefined') bakeBackground(); // cave darkness is baked
  shake = 0;
  slowmo = 0;
  state = 'playing';
  showHud(true);
  hideAllOverlays();
}
function startLevel(n) {
  try {
    AudioSys.stopEndStings();
  } catch (e) {}
  level = clamp(Math.round(n) || 1, 1, MAX_LEVEL);
  endless = false;
  rememberRun(level, false);
  cfg = levelConfig(level);
  resetRun({
    pred: cfg.first,
    jelly: 2.0,
    net: 3.2,
    hook: 3.4,
    pearl: 0.4,
    power: 6,
    fry: 0.8,
  });
  document.getElementById('hint').style.display = 'block';
  setTimeout(() => {
    const h = document.getElementById('hint');
    if (h) h.style.display = 'none';
  }, 6000);
  // the biome's name rides on the sub-line so each reef announces its palette:
  // 'LEVEL 7 — Storm Surface · Shipwreck Graveyard' reads as a destination, not
  // just another number. The FIRST reef of a biome is its "story card": the
  // title swaps to the place's one-line lore instead of a generic tagline, so
  // the descent reads as a story with chapters, not 15 identical swims.
  const firstOfBiome = level === 1 || biomeAt(level) !== biomeAt(level - 1);
  banner(
    'LEVEL ' + level + ' — ' + cfg.name + ' · ' + biomeName(level),
    firstOfBiome
      ? (BIOMES[biomeAt(level)] || {}).desc || pickFlavor()
      : level === 11
        ? 'INTO THE DARK 🕳️'
        : pickFlavor(),
  );
  updateHud();
}
function startEndless() {
  try {
    AudioSys.stopEndStings();
  } catch (e) {}
  endless = true;
  level = MAX_LEVEL;
  rememberRun(0, true);
  cfg = endlessCfg(0);
  resetRun({ pred: 1.5, jelly: 3.0, net: 4.5, hook: 4.0, pearl: 0.4, power: 6, fry: 0.8 });
  banner('ENDLESS REEF', 'HOW FAR CAN YOU SWIM? 🌊');
  updateHud();
}
function pickFlavor() {
  const f = [
    'THEY SMELL YOU…',
    'DARKER WATER AHEAD',
    'HOLD YOUR BREATH',
    'THE REEF FIGHTS BACK',
    'NO MERCY OUT HERE',
  ];
  return f[(level - 2) % f.length];
}
function banner(sub, title) {
  const b = document.getElementById('levelBanner');
  document.getElementById('bannerSub').textContent = sub;
  document.getElementById('bannerTitle').textContent = title;
  b.style.transition = 'none';
  b.style.opacity = '1';
  b.style.transform = 'scale(.9)';
  requestAnimationFrame(() => {
    b.style.transition = 'all .8s ease';
    b.style.transform = 'scale(1)';
  });
  setTimeout(() => {
    b.style.opacity = '0';
  }, 2100);
}
function levelComplete() {
  state = 'levelComplete';
  AudioSys.musicDuck(3.4); // pull the score down so the win sting lands in clear air
  AudioSys.win();
  showHud(false);
  best = Math.max(best, score);
  localStorage.setItem('nemoBest', String(best));
  document.getElementById('doneLevel').textContent = level;
  document.getElementById('doneScore').textContent = score;
  document.getElementById('donePearls').textContent = pearls;
  document.getElementById('doneEaten').textContent = eaten;
  document.getElementById('doneNear').textContent = nearCount;
  const gemGain = 2 + Math.floor(level / 2) + Math.floor(pearls / 10);
  gems += gemGain;
  saveRoster();
  // clearing reef N unlocks reef N+1 on the reef-select screen
  if (!endless && level >= maxLevel && level < MAX_LEVEL) {
    maxLevel = level + 1;
    localStorage.setItem('nemoMaxLevel', String(maxLevel));
  }
  if (!endless && level >= MAX_LEVEL && !crowned) {
    crowned = true;
    localStorage.setItem('nemoCrowned', '1');
  }
  document.getElementById('doneGems').textContent =
    '+' + gemGain + ' 💎 gems banked! (total ' + gems + ')';
  if (level >= ENDLESS_AT && !endlessUnlocked) {
    endlessUnlocked = true;
    localStorage.setItem('nemoEndless', '1');
  }
  document.getElementById('doneFlavor').textContent =
    level >= MAX_LEVEL
      ? '👑 CAVE CONQUERED! You beat all 15 reefs — the Endless Cave is yours.'
      : level === 10
        ? '🕳️ Something dark opens ahead… the cave mouth waits.'
        : level === ENDLESS_AT
          ? '🌊 ENDLESS REEF UNLOCKED! How far can you swim?'
          : level === 1
            ? 'The reef gets darker ahead… predators smell you now.'
            : level === 2
              ? 'Nets everywhere. The sailors know your route.'
              : 'Level ' + (level + 1) + ' waters run red. Good luck, little one.';
  document.getElementById('btnNext').textContent =
    level >= MAX_LEVEL ? 'ENDLESS REEF ∞ →' : 'NEXT REEF ▶';
  show('levelDone');
  confetti();
  updateHud();
  try { recordDaily(); } catch (e) {}
}
function gameOver(reason, quiet) {
  if (state !== 'playing') return;
  state = 'gameOver';
  if (!quiet) AudioSys.lose(); // every death ends on the lose sting
  showHud(false);
  burst(player.x, player.y, 40, '#ffb347');
  let endGain = 0;
  if (endless) {
    // endless always feeds the shop: +1 gem per 600m survived
    endGain = Math.floor(distance / 600);
    if (endGain > 0) {
      gems += endGain;
      saveRoster();
    }
    bestEndless = Math.max(bestEndless, score);
    bestEndlessDist = Math.max(bestEndlessDist, Math.floor(distance));
    localStorage.setItem('nemoBestEndless', String(bestEndless));
    localStorage.setItem('nemoBestEndlessDist', String(bestEndlessDist));
  } else {
    best = Math.max(best, score);
    localStorage.setItem('nemoBest', String(best));
  }
  document.getElementById('overScore').textContent = score;
  document.getElementById('overLevel').textContent = endless
    ? '∞ ' + Math.floor(distance) + 'm'
    : level;
  document.getElementById('overBest').textContent = endless ? bestEndless : best;
  const tips = [
    'Tip: stay mid-water, watch net shadows, and use near-misses for combo points.',
    'Tip: bait a hunter one way, then juke the other — they turn slowly.',
    'Tip: teal current bands push you. Swim across them quickly.',
    'Tip: grab the bubble shield before the deep stretch.',
    'Tip: pearls magnetise when you have the pink powerup.',
  ];
  const tipByReason = {
    net: 'Caught in a fishing net! Watch for the boat shadow & splash ring.',
    bite: 'Big fish swallow whole — no HP can save you. Bait them one way, then juke!',
    hp: 'Out of health! Small hazards cost 1 HP each — grab the 🛡️ shield bubble.',
  };
  let tip = tipByReason[reason] || tips[(Math.random() * tips.length) | 0];
  if (endless)
    tip =
      'You survived ' +
      Math.floor(distance) +
      'm of the Endless Reef!' +
      (endGain > 0 ? ' +' + endGain + ' 💎 banked.' : '') +
      ' ' +
      tip;
  document.getElementById('overTip').textContent = tip;
  const titleByReason = {
    net: 'Caught in the net!',
    bite: 'SWALLOWED WHOLE! 🦈',
    jelly: 'Stung by a jellyfish!',
    hook: 'Snagged by a hook!',
    crab: 'Snapped by a crab! 🦀',
    hp: 'Out of hearts! 💔',
  };
  document.getElementById('overTitle').textContent = titleByReason[reason] || 'Nemo got nibbled!';
  show('gameOver');
  try { recordDaily(); } catch (e) {}
}
// Shield absorbs one hit of ANY kind (bite, cage, hazard). Returns true if it saved you.
function useShield() {
  if (player.shield <= 0) return false;
  player.shield = 0;
  player.invuln = 1.6;
  AudioSys.shieldBreak();
  burst(player.x, player.y, 26, '#7de9ff');
  addFloat(player.x, player.y - 30, 'Saved! 🛡️', '#7de9ff');
  shake = Math.max(shake, 7);
  updateHud();
  return true;
}
// Death always plays a short cinematic first (slow-mo + banner + Nemo visibly
// shrinking/fading) so the player SEES what killed them — Nemo never just vanishes.
function triggerDeath(reason) {
  if (player.dead || state !== 'playing') return;
  player.dead = true;
  player.deadReason = reason;
  player.alive = false;
  player.boosting = false;
  player.boostToggle = false;
  player.deathT = reason === 'bite' ? 1.5 : 1.2;
  // duck the music through the death cinematic: the sting, the roar and the blood
  // read far better against near-silence than against a bassline still driving.
  AudioSys.musicDuck(reason === 'bite' ? 3.6 : 2.6);
  shake = Math.max(shake, reason === 'bite' ? 18 : 12);
  flashA = 1;
  slowmo = reason === 'bite' ? 1.2 : 0.5;
  if (reason === 'bite') {
    // the roar follows a beat after the grab
    // (cancelled if a new run starts first — see stopEndStings).
    try {
      if (engulfT) clearTimeout(engulfT);
    } catch (e) {}
    engulfT = setTimeout(() => {
      engulfT = 0;
      if (state === 'playing' && player.dead) AudioSys.engulf();
    }, 250);
    // jaws are open and rushing in — the snap + blood land in the cinematic
    banner('A BIG FISH', 'IT GOT YOU!');
  } else if (reason === 'net') {
    AudioSys.trap();
    burst(player.x, player.y, 40, '#d8b98a');
    burst(player.x, player.y, 20, '#ff5e62');
    addFloat(player.x, player.y - 46, 'Caught in the net!', '#ffd66e');
    banner('THE NET', 'CAUGHT!');
  } else {
    // every cause gets its own relatable sting
    if (reason === 'jelly') AudioSys.zap();
    else if (reason === 'crab') AudioSys.snap();
    else AudioSys.hurt();
    burst(player.x, player.y, 40, '#ff6b81');
    addFloat(player.x, player.y - 46, 'No hearts left!', '#ff6b81');
  }
  updateHud();
}
function finishDeath() {
  if (state !== 'playing' || !player.dead) return;
  gameOver(player.deadReason, false); // lose sting plays on every death panel
}
// Engulfed by a bigger fish = instant game over (shield still saves once).
// The killer grabs you here; the jaw snap + blood land ~0.38s later in the
// death cinematic, so you SEE the catch before the kill.
function engulfBy(p) {
  if (player.invuln > 0 || player.dead || player.trappedIn || state !== 'playing') return;
  if (useShield()) return;
  if (p) {
    player.eatenBy = p;
    player.catchX = player.x;
    player.catchY = player.y;
  }
  player.feedT = 0;
  player.snapDone = false;
  AudioSys.chomp();
  triggerDeath('bite');
}
function damage(reason, x, y, soft) {
  if (player.invuln > 0 || player.dead || player.trappedIn || state !== 'playing') return;
  if (useShield()) return;
  // Small hazards (jelly / hook / crab / slam / side-bump) cost exactly 1 HP.
  // soft (side-bump): gentler shake + thud, no slow-mo drama.
  player.hearts--;
  player.invuln = 1.8;
  shake = Math.max(shake, soft ? 6 : 12);
  flashA = 1;
  if (!soft) slowmo = 0.35;
  combo = 0;
  updateCombo();
  if (player.hearts <= 0) {
    updateHud();
    triggerDeath('hp');
    return;
  }
  if (soft) AudioSys.graze();
  else if (reason === 'jelly' || reason === 'urch') AudioSys.zap();
  else if (reason === 'crab') AudioSys.snap();
  else AudioSys.hurt();
  burst(x || player.x, y || player.y, 30, '#ff5e62');
  addFloat(player.x, player.y - 30, 'Ouch!', '#ff6b81');
  updateHud();
}

// ---------- HUD ----------
// HUD refs cached once at boot: no per-frame DOM lookups, writes only on change
// (DOM writes every frame force layout/paint work that lags budget phones).
const hud = {};
function cacheHud() {
  for (const id of [
    'hudLevel',
    'hudScore',
    'hudBest',
    'hudPearls',
    'hudGems',
    'hearts',
    'hpBar',
    'hpPill',
    'progressBar',
    'progressFish',
    'boostFill',
    'boostBtn',
  ]) {
    const el = document.getElementById(id);
    if (el) hud[id] = el;
  }
}
function setText(el, v) {
  if (el && el.__v !== v) {
    el.__v = v;
    el.textContent = v;
  }
}
function updateHud() {
  setText(hud.hudLevel, endless ? '∞' : String(level));
  setText(hud.hudScore, String(score));
  setText(hud.hudBest, String(endless ? bestEndless : Math.max(best, score)));
  setText(hud.hudPearls, String(pearls));
  setText(hud.hudGems, String(gems));
  const maxH = player.maxHearts || 3;
  setText(
    hud.hearts,
    '❤'.repeat(Math.max(0, player.hearts)) + '🖤'.repeat(Math.max(0, maxH - player.hearts)),
  );
  const hpFrac = clamp(player.hearts / maxH, 0, 1);
  if (hud.hpBar) {
    const w = hpFrac * 100 + '%';
    if (hud.hpBar.__w !== w) {
      hud.hpBar.__w = w;
      hud.hpBar.style.width = w;
    }
    const bg =
      hpFrac > 0.6
        ? 'linear-gradient(90deg,#3df5a6,#22c8ee)'
        : hpFrac > 0.33
          ? 'linear-gradient(90deg,#ffd66e,#ff9f43)'
          : 'linear-gradient(90deg,#ff5e62,#ff2e4d)';
    if (hud.hpBar.__bg !== bg) {
      hud.hpBar.__bg = bg;
      hud.hpBar.style.background = bg;
    }
  }
  if (hud.hpPill) hud.hpPill.classList.toggle('low', player.hearts === 1 && state === 'playing');
  const pct = endless ? (distance % 900) / 9 : clamp((distance / cfg.goal) * 100, 0, 100);
  if (hud.progressBar) hud.progressBar.style.width = pct + '%';
  if (hud.progressFish) hud.progressFish.style.left = pct + '%';
  if (hud.boostFill) {
    hud.boostFill.style.width = clamp(player.boost, 0, 100) + '%';
    hud.boostFill.style.background =
      player.boost > 30
        ? 'linear-gradient(90deg,#ffd66e,#ff9f43)'
        : 'linear-gradient(90deg,#ff5e62,#ff2e4d)';
  }
  if (hud.boostBtn) hud.boostBtn.classList.toggle('on', !!player.boosting);
  // boss health: only shown during a boss fight. The fight is one object, so
  // this is a one-write-per-frame DOM touch like the other bars.
  const bossOn = typeof Boss !== 'undefined' && Boss.active();
  const bPill = document.getElementById('bossPill');
  const bBar = document.getElementById('bossBar');
  if (bPill) bPill.style.display = bossOn ? 'flex' : 'none';
  if (bossOn) {
    const nameEl = document.getElementById('bossName');
    if (nameEl) nameEl.textContent = Boss.name();
    if (bBar) {
      const w = Math.round(Boss.frac() * 100) + '%';
      if (bBar.__w !== w) {
        bBar.__w = w;
        bBar.style.width = w;
      }
    }
  }
}
function updateCombo() {
  const el = document.getElementById('combo');
  if (combo > 1) {
    el.style.display = 'block';
    el.textContent = 'COMBO x' + combo + ' 🔥';
  } else el.style.display = 'none';
}
function showHud(on) {
  document.getElementById('gameHud').style.display = on ? 'flex' : 'none';
}
function show(id) {
  document.getElementById(id).classList.remove('hidden');
}
function hide(id) {
  document.getElementById(id).classList.add('hidden');
}
function hideAllOverlays() {
  ['menu', 'how', 'levels', 'iosGuide', 'levelDone', 'gameOver', 'paused'].forEach(hide);
}

// ============================================================
