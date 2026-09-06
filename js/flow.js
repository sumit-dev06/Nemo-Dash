// ---------- flow ----------
let engulfT = 0;
function startLevel(n) {
  try {
    AudioSys.stopEndStings();
  } catch (e) {}
  level = clamp(Math.round(n) || 1, 1, MAX_LEVEL);
  endless = false;
  rememberRun(level, false);
  cfg = levelConfig(level);
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
  spawnT = {
    pred: cfg.first,
    jelly: 2.0,
    net: 2.6,
    hook: 3.4,
    pearl: 0.4,
    power: 6,
    fry: 0.8,
  };
  player.maxHearts = fish().hp;
  player.hearts = fish().hp;
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
  player.heartT = 0;
  seedDecor();
  shake = 0;
  slowmo = 0;
  state = 'playing';
  showHud(true);
  hideAllOverlays();
  document.getElementById('hint').style.display = 'block';
  setTimeout(() => {
    const h = document.getElementById('hint');
    if (h) h.style.display = 'none';
  }, 6000);
  banner(
    'LEVEL ' + level + ' — ' + cfg.name,
    level === 1 ? 'REACH THE CORAL GATE 🏁' : pickFlavor(),
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
  spawnT = { pred: 1.5, jelly: 3.0, net: 3.5, hook: 4.0, pearl: 0.4, power: 6, fry: 0.8 };
  player.maxHearts = fish().hp;
  player.hearts = fish().hp;
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
  player.heartT = 0;
  seedDecor();
  shake = 0;
  slowmo = 0;
  state = 'playing';
  showHud(true);
  hideAllOverlays();
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
      ? '👑 REEF CONQUERED! You beat all 10 reefs — the Endless Reef is yours.'
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
  shake = Math.max(shake, reason === 'bite' ? 18 : 12);
  flashA = 1;
  slowmo = reason === 'bite' ? 1.2 : 0.5;
  if (reason === 'bite') {
    // chomp already snapped at the bite moment (engulfBy) — the roar follows a beat later
    // (cancelled if a new run starts first — see stopEndStings).
    try {
      if (engulfT) clearTimeout(engulfT);
    } catch (e) {}
    engulfT = setTimeout(() => {
      engulfT = 0;
      if (state === 'playing' && player.dead) AudioSys.engulf();
    }, 250);
    burst(player.x, player.y, 60, '#ff5e62');
    burst(player.x, player.y, 25, '#ffd66e');
    addFloat(player.x, player.y - 46, 'Got you!', '#ff5e62');
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
function engulfBy() {
  if (player.invuln > 0 || player.dead || player.trappedIn || state !== 'playing') return;
  if (useShield()) return;
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
  else if (reason === 'jelly') AudioSys.zap();
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
