// ---------- level design: 15 hand-tuned reefs (1-10 open reef, 11-15 cave) + endless ----------
// Curve research (docs/ROADMAP.md): sawtooth, not a straight ramp —
// one new mechanic at a time in isolation, a breather at L6, peaks at L5/L8/L10.
// L11+ enter the cave: darker water, narrower path (cfg.cave 0→1), fair caps kept
// (speed ≤300, spawn intervals never below ~1s, always reactable).
const MAX_LEVEL = 15;
const ENDLESS_AT = 5; // clear reef 5 → Endless Reef opens (coronation still at 10)
// goal: px to swim • speed: world px/s • spawn gaps in seconds • hungry: hunter %
// sharkW/anglerW: predator mix • first: opening calm before 1st predator
const LEVELS = [
  {
    name: 'The Shallows',
    goal: 2000,
    speed: 165,
    pred: 2.4,
    jelly: 0,
    net: 0,
    hook: 0,
    fry: 1.6,
    power: 9,
    cur: 0,
    curStr: 150,
    hungry: 0,
    sharkW: 0,
    anglerW: 0,
    first: 2.5,
  },
  {
    name: 'Kelp Edge',
    goal: 2200,
    speed: 180,
    pred: 2.1,
    jelly: 4.5,
    net: 5.0,
    hook: 0,
    fry: 1.5,
    power: 9,
    cur: 0,
    curStr: 150,
    hungry: 0.35,
    sharkW: 0,
    anglerW: 0,
    first: 2.0,
  },
  {
    name: 'Net Waters',
    goal: 2400,
    speed: 195,
    pred: 1.9,
    jelly: 3.8,
    net: 4.2,
    hook: 5.5,
    fry: 1.4,
    power: 9,
    cur: 1,
    curStr: 160,
    hungry: 0.45,
    sharkW: 0,
    anglerW: 0,
    first: 1.8,
  },
  {
    name: 'Deep Blue',
    goal: 2600,
    speed: 210,
    pred: 1.7,
    jelly: 3.4,
    net: 3.8,
    hook: 4.8,
    fry: 1.3,
    power: 9,
    cur: 1,
    curStr: 175,
    hungry: 0.55,
    sharkW: 0.15,
    anglerW: 0,
    first: 1.6,
  },
  {
    name: "Hunter's Ground",
    goal: 2800,
    speed: 225,
    pred: 1.55,
    jelly: 3.2,
    net: 3.4,
    hook: 4.4,
    fry: 1.2,
    power: 9,
    cur: 2,
    curStr: 185,
    hungry: 0.7,
    sharkW: 0.2,
    anglerW: 0.15,
    first: 1.4,
  },
  {
    name: 'Quiet Current',
    goal: 2800,
    speed: 218,
    pred: 1.75,
    jelly: 3.6,
    net: 4.2,
    hook: 5.0,
    fry: 1.2,
    power: 8,
    cur: 2,
    curStr: 160,
    hungry: 0.5,
    sharkW: 0.15,
    anglerW: 0.1,
    first: 1.6,
  },
  {
    name: 'Angler Deep',
    goal: 3000,
    speed: 238,
    pred: 1.45,
    jelly: 3.0,
    net: 3.4,
    hook: 4.2,
    fry: 1.1,
    power: 8,
    cur: 2,
    curStr: 200,
    hungry: 0.65,
    sharkW: 0.2,
    anglerW: 0.25,
    first: 1.4,
  },
  {
    name: 'Storm Surface',
    goal: 3200,
    speed: 252,
    pred: 1.35,
    jelly: 2.8,
    net: 2.8,
    hook: 3.8,
    fry: 1.0,
    power: 8,
    cur: 3,
    curStr: 210,
    hungry: 0.75,
    sharkW: 0.25,
    anglerW: 0.25,
    first: 1.3,
  },
  {
    name: 'The Gauntlet',
    goal: 3400,
    speed: 265,
    pred: 1.2,
    jelly: 2.6,
    net: 2.8,
    hook: 3.5,
    fry: 1.0,
    power: 8,
    cur: 3,
    curStr: 225,
    hungry: 0.8,
    sharkW: 0.28,
    anglerW: 0.28,
    first: 1.2,
  },
  {
    name: 'Leviathan Reef',
    goal: 3600,
    speed: 280,
    pred: 1.1,
    jelly: 2.4,
    net: 2.6,
    hook: 3.2,
    fry: 0.9,
    power: 8,
    cur: 3,
    curStr: 240,
    hungry: 0.85,
    sharkW: 0.3,
    anglerW: 0.3,
    first: 1.2,
  },
  {
    name: 'Cave Mouth',
    goal: 3400,
    speed: 272,
    pred: 1.25,
    jelly: 2.6,
    net: 2.8,
    hook: 3.4,
    fry: 1.0,
    power: 8,
    cur: 2,
    curStr: 230,
    hungry: 0.8,
    sharkW: 0.28,
    anglerW: 0.28,
    first: 1.3,
    cave: 0.35,
  },
  {
    name: 'Dark Descent',
    goal: 3500,
    speed: 278,
    pred: 1.2,
    jelly: 2.5,
    net: 2.7,
    hook: 3.3,
    fry: 1.0,
    power: 8,
    cur: 3,
    curStr: 235,
    hungry: 0.82,
    sharkW: 0.3,
    anglerW: 0.3,
    first: 1.2,
    cave: 0.55,
  },
  {
    name: 'Narrow Squeeze',
    goal: 3600,
    speed: 285,
    pred: 1.15,
    jelly: 2.4,
    net: 2.6,
    hook: 3.2,
    fry: 0.95,
    power: 8,
    cur: 3,
    curStr: 240,
    hungry: 0.85,
    sharkW: 0.3,
    anglerW: 0.3,
    first: 1.2,
    cave: 0.75,
  },
  {
    name: 'Abyssal Halls',
    goal: 3700,
    speed: 292,
    pred: 1.1,
    jelly: 2.3,
    net: 2.5,
    hook: 3.1,
    fry: 0.9,
    power: 8,
    cur: 3,
    curStr: 245,
    hungry: 0.87,
    sharkW: 0.3,
    anglerW: 0.3,
    first: 1.1,
    cave: 0.9,
  },
  {
    name: 'Heart of the Cave',
    goal: 3800,
    speed: 298,
    pred: 1.05,
    jelly: 2.2,
    net: 2.4,
    hook: 3.0,
    fry: 0.9,
    power: 8,
    cur: 3,
    curStr: 250,
    hungry: 0.88,
    sharkW: 0.3,
    anglerW: 0.3,
    first: 1.1,
    cave: 1.0,
  },
];
function levelConfig(n) {
  const L = LEVELS[clamp(Math.round(n) || 1, 1, MAX_LEVEL) - 1];
  const off = (v) => (v > 0 ? v : 9999); // 0 in the table = mechanic not yet introduced
  return {
    n,
    name: L.name,
    goal: L.goal,
    speed: L.speed,
    predEvery: L.pred,
    jellyEvery: off(L.jelly),
    netEvery: off(L.net),
    hookEvery: off(L.hook),
    pearlEvery: 1.1,
    powerEvery: L.power,
    fryEvery: L.fry,
    cur: L.cur,
    curStr: L.curStr,
    hungry: L.hungry,
    sharkW: L.sharkW,
    anglerW: L.anglerW,
    first: L.first,
    cave: L.cave || 0, // 0 = open reef, →1 = deep cave (darker + narrower)
    predSpeedMul: Math.min(1.8, 1 + (n - 1) * 0.08), // capped so cave stays fair
    hunterBrain: n >= 2, // predators steer toward player
  };
}
// Endless Reef: tier rises every 900m, all curves capped so runs stay fair, never impossible.
// Deep tiers (4+) descend into the cave: darker + narrower as you swim further.
function endlessCfg(dist) {
  const tier = Math.floor(Math.max(0, dist) / 900);
  const cave = tier < 4 ? 0 : Math.min(1, (tier - 3) / 3);
  return {
    n: '∞',
    name: cave > 0.5 ? 'Endless Cave' : 'Endless Reef',
    goal: Infinity,
    speed: Math.min(300, 195 + tier * 9),
    predEvery: Math.max(0.85, 1.9 - tier * 0.09),
    jellyEvery: Math.max(1.8, 3.6 - tier * 0.16),
    netEvery: Math.max(2.0, 3.8 - tier * 0.16),
    hookEvery: Math.max(2.6, 4.6 - tier * 0.16),
    pearlEvery: 1.1,
    powerEvery: 8,
    fryEvery: 1.0,
    cur: Math.min(3, Math.floor(tier / 2)),
    curStr: 180 + tier * 8,
    hungry: Math.min(0.9, 0.4 + tier * 0.05),
    sharkW: Math.min(0.3, 0.1 + tier * 0.02),
    anglerW: Math.min(0.3, 0.1 + tier * 0.02),
    first: 1.2,
    cave,
    predSpeedMul: 1 + tier * 0.03,
    hunterBrain: true,
    endless: true,
    tier,
  };
}
let endlessUnlocked = localStorage.getItem('nemoEndless') === '1';
let bestEndless = parseInt(localStorage.getItem('nemoBestEndless') || '0', 10) || 0;
let bestEndlessDist = parseInt(localStorage.getItem('nemoBestEndlessDist') || '0', 10) || 0;
// reef progress: highest unlocked reef (clearing reef N unlocks N+1)
let maxLevel = parseInt(localStorage.getItem('nemoMaxLevel') || '1', 10) || 1;
maxLevel = clamp(maxLevel, 1, MAX_LEVEL);
let crowned = localStorage.getItem('nemoCrowned') === '1'; // cleared final reef at least once
// resume memory: where you played last (reef number, or endless)
let lastLevel = parseInt(localStorage.getItem('nemoLastLevel') || '1', 10) || 1;
lastLevel = clamp(lastLevel, 1, MAX_LEVEL);
let lastEndless = localStorage.getItem('nemoLastEndless') === '1';
function rememberRun(n, isEndless) {
  try {
    if (isEndless) localStorage.setItem('nemoLastEndless', '1');
    else {
      localStorage.setItem('nemoLastEndless', '0');
      localStorage.setItem('nemoLastLevel', String(clamp(n, 1, MAX_LEVEL)));
    }
  } catch (e) {}
  lastEndless = !!isEndless;
  if (!isEndless) lastLevel = clamp(n, 1, MAX_LEVEL);
}
// SWIM button resumes where you left off; menu shows your best
function updatePlayBtn() {
  const b = document.getElementById('btnPlay');
  if (b) b.textContent = lastEndless && endlessUnlocked ? '▶ ∞ Endless' : '▶ Reef ' + lastLevel;
  const m = document.getElementById('menuBest');
  if (m) m.textContent = '⭐ Best: ' + Math.max(best, score) + ' • 💎 ' + gems;
}

// ---------- fish roster: unlock bigger fish with gems; bigger fish eat smaller ones ----------
const VERSION = '2.6';
const FISHES = [
  {
    id: 'nemo',
    name: 'Nemo',
    art: '🐠',
    cost: 0,
    size: 1.0,
    hp: 3,
    might: 0.7,
    diet: 'eats silver fry',
  },
  {
    id: 'damsel',
    name: 'Azure',
    art: '🐟',
    cost: 4,
    size: 1.0,
    hp: 3,
    might: 0.7,
    diet: 'eats silver fry',
  },
  {
    id: 'puffer',
    name: 'Puffy',
    art: '🐡',
    cost: 10,
    size: 1.2,
    hp: 4,
    might: 1.15,
    diet: 'eats fry + hunters',
  },
  {
    id: 'shark',
    name: 'Razor',
    art: '🦈',
    cost: 20,
    size: 1.45,
    hp: 5,
    might: 1.7,
    diet: 'eats almost all fish',
  },
];
const FOE_MIGHT = { fry: 0.4, big: 1.0, angler: 1.1, shark: 1.5 };
let gems = parseInt(localStorage.getItem('nemoGems') || '0', 10) || 0;
let unlocks = ['nemo'];
try {
  const u = JSON.parse(localStorage.getItem('nemoFish') || '["nemo"]');
  if (Array.isArray(u) && u.length) unlocks = u;
} catch (e) {}
if (!unlocks.includes('nemo')) unlocks.push('nemo');
let selectedFish = localStorage.getItem('nemoSelected') || 'nemo';
if (!unlocks.includes(selectedFish)) selectedFish = 'nemo';
function fish() {
  return FISHES.find((f) => f.id === selectedFish) || FISHES[0];
}
function saveRoster() {
  localStorage.setItem('nemoGems', String(gems));
  localStorage.setItem('nemoFish', JSON.stringify(unlocks));
  localStorage.setItem('nemoSelected', selectedFish);
}
function renderRoster() {
  const r = document.getElementById('roster');
  if (!r) return;
  r.innerHTML = '';
  document.getElementById('menuGems').textContent = gems;
  for (const f of FISHES) {
    const owned = unlocks.includes(f.id),
      cur = selectedFish === f.id;
    const card = document.createElement('div');
    card.className = 'fishCard' + (cur ? ' sel' : '');
    card.innerHTML =
      '<div class="art">' +
      f.art +
      '</div><b>' +
      f.name +
      '</b><div class="spec">HP ' +
      f.hp +
      ' • ' +
      f.size +
      'x<br>' +
      f.diet +
      '</div>';
    const b = document.createElement('button');
    b.textContent = owned
      ? cur
        ? 'SELECTED ✓'
        : 'SELECT'
      : gems >= f.cost
        ? '🔓 ' + f.cost + ' 💎'
        : '🔒 ' + f.cost + ' 💎';
    b.className = cur ? 'current' : owned ? 'owned' : gems >= f.cost ? '' : 'cant';
    b.onclick = (() => {
      const id = f.id;
      return () => {
        AudioSys.ensure();
        if (unlocks.includes(id)) {
          selectedFish = id;
          saveRoster();
          AudioSys.click();
        } else {
          const spec = FISHES.find((q) => q.id === id);
          if (gems < spec.cost) {
            AudioSys.locked();
            return;
          }
          gems -= spec.cost;
          unlocks.push(id);
          selectedFish = id;
          saveRoster();
          AudioSys.power();
        }
        renderRoster();
      };
    })();
    card.appendChild(b);
    r.appendChild(card);
  }
}
// reef select: progress at a glance, replay any cleared reef, endless card at the end
function renderLevels() {
  const g = document.getElementById('levelGrid');
  if (!g) return;
  g.innerHTML = '';
  document.getElementById('levelsTitle').textContent =
    'Reefs — conquered ' +
    (crowned ? MAX_LEVEL : Math.min(maxLevel - 1, MAX_LEVEL)) +
    '/' +
    MAX_LEVEL;
  LEVELS.forEach((L, i) => {
    const n = i + 1;
    const unlocked = n <= maxLevel;
    const cleared = n < maxLevel;
    const card = document.createElement('div');
    card.className =
      'lvCard' +
      (cleared ? ' done' : n === maxLevel ? ' current' : '') +
      (unlocked ? '' : ' locked');
    card.innerHTML =
      '<b>' +
      n +
      '</b><span>' +
      L.name +
      '</span><em>' +
      (cleared ? '✅' : unlocked ? '▶' : '🔒') +
      '</em>';
    if (unlocked)
      card.onclick = (() => {
        const lv = n;
        return () => {
          AudioSys.ensure();
          AudioSys.click();
          startLevel(lv);
        };
      })();
    else card.onclick = () => AudioSys.locked();
    g.appendChild(card);
  });
  const e = document.createElement('div');
  e.className = 'lvCard endless' + (endlessUnlocked ? ' current' : ' locked');
  e.innerHTML = '<b>∞</b><span>Endless Reef</span><em>' + (endlessUnlocked ? '▶' : '🔒') + '</em>';
  e.onclick = () => {
    AudioSys.ensure();
    if (endlessUnlocked) {
      AudioSys.click();
      startEndless();
    } else AudioSys.locked();
  };
  g.appendChild(e);
}
