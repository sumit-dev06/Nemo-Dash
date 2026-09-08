'use strict';
/* META — ability + upgrades/missions + atlas + daily board. All localStorage, offline-safe. */
const ABILITIES = {
  nemo: { name: 'Bubble Dash', icon: '💨', cd: 25, dur: 2, desc: '2s ghost + burst' },
  damsel: { name: 'Slipstream', icon: '🌀', cd: 30, dur: 3, desc: '3s slow water' },
  puffer: { name: 'Spike Guard', icon: '🛡️', cd: 35, dur: 5, desc: '5s shield + thorns' },
  shark: { name: 'Frenzy', icon: '🩸', cd: 40, dur: 6, desc: '6s speed+magnet+hunt' },
};
const UPG = [
  { id: 'fin', name: 'Swift Fins', icon: '⚡', max: 3, costs: [2, 5, 9], desc: '+8% speed/lvl' },
  { id: 'hull', name: 'Reef Hull', icon: '❤', max: 3, costs: [3, 6, 10], desc: '+1 HP at lv2, +2 at lv3' },
  { id: 'lure', name: 'Pearl Lure', icon: '🧲', max: 3, costs: [2, 4, 8], desc: '+40% magnet/lvl' },
  { id: 'tank', name: 'Boost Tank', icon: '🔋', max: 3, costs: [2, 5, 8], desc: '+20% tank/lvl' },
];
const MISSIONS = [
  { id: 'eat', name: 'Snack Hunt — eat 12 fish', target: 12, reward: 3, metric: 'eat' },
  { id: 'near', name: 'Daredevil — 8 near-misses', target: 8, reward: 3, metric: 'near' },
  { id: 'dist', name: 'Marathon — swim 3000m', target: 3000, reward: 4, metric: 'dist' },
];
const ATLAS = [
  { id: 'nemo', icon: '🐠', name: 'Nemo', desc: 'Balanced starter. Dash ghosts through danger.' },
  { id: 'damsel', icon: '🐟', name: 'Azure', desc: 'Same heart, slipstream slows the reef.' },
  { id: 'puffer', icon: '🐡', name: 'Puffy', desc: 'Eats hunters. Guard reflects bites.' },
  { id: 'shark', icon: '🦈', name: 'Razor', desc: 'Apex. Frenzy eats almost anything.' },
  { id: 'foe-shark', icon: '🦈', name: 'Reef Shark', desc: 'Telegraphed lunge — dodge late.' },
  { id: 'foe-angler', icon: '🔦', name: 'Angler', desc: 'Lure lies. Mouth kills, body bruises.' },
  { id: 'foe-big', icon: '🐟', name: 'Hunter', desc: 'Bigger might = engulf. Smaller = snack.' },
  { id: 'jelly', icon: '🪼', name: 'Jelly', desc: 'Pulse-swims. Stings 1 HP.' },
  { id: 'net', icon: '🎣', name: 'Cage Net', desc: 'Drags you down. Shield breaks free.' },
  { id: 'hook', icon: '🪝', name: 'Hook', desc: 'Dangles. 1 HP on touch.' },
  { id: 'urch', icon: '🦔', name: 'Urchin', desc: 'Shallow spikes. Lethal crown.' },
  { id: 'rock', icon: '🪨', name: 'Boulder', desc: 'Ride over it — never lethal.' },
  { id: 'boss-3', icon: '👑', name: 'Grandpa Goliath', desc: 'Sunlit king. Lunges your lane.' },
  { id: 'boss-6', icon: '👑', name: 'Moray Maw', desc: 'Kelp coil. Sweeps your x.' },
  { id: 'boss-8', icon: '👑', name: 'The Caldron', desc: 'Wreck volley. Aimed fans.' },
  { id: 'boss-10', icon: '👑', name: 'Queen Bloom', desc: 'Ring of baby jellies.' },
  { id: 'boss-12', icon: '👑', name: 'Magma Eel', desc: 'Vent sweeps, enrages low.' },
  { id: 'boss-15', icon: '👑', name: 'The Devourer', desc: 'Abyss volley. Fast + enraged.' },
];
const DAILY_BOTS = ['CoralKid', 'Finley', 'Marina', 'Bubbles', 'TideHunter'];

function _ls(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
function _ss(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
let _upg = _ls('nemoUpg', {});
let _mis = _ls('nemoMis', { eat: 0, near: 0, dist: 0, claimed: [] });
let _seen = _ls('nemoSeen', ['nemo']);
function _today() { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
function _hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

function upgLvl(id) { return clamp(_upg[id] || 0, 0, 3); }
function hullBonus() { const l = upgLvl('hull'); return l >= 3 ? 2 : l >= 1 ? 1 : 0; }
function finMul() { return 1 + 0.08 * upgLvl('fin'); }
function lureMul() { return 1 + 0.4 * upgLvl('lure'); }
function tankMul() { return 1 + 0.2 * upgLvl('tank'); }
function abilCdMul() { return 1 - 0.1 * upgLvl('fin'); }
function abil() { return ABILITIES[selectedFish] || ABILITIES.nemo; }
function markSeen(id) { if (!_seen.includes(id)) { _seen.push(id); _ss('nemoSeen', _seen); } }
function misAdd(metric, n) {
  if (!_mis || typeof _mis[metric] !== 'number') return;
  const m = MISSIONS.find((x) => x.metric === metric);
  if (!m || _mis[metric] >= m.target) return;
  _mis[metric] = Math.min(m.target, _mis[metric] + n);
  _ss('nemoMis', _mis);
  const el = document.getElementById('misBar');
  if (el) el.textContent = '🎯 ' + _mis.eat + '/12 eat • ' + _mis.near + '/8 near • ' + Math.floor(_mis.dist) + '/3000m';
}
function dailyBest() { return _ls('nemoDaily-' + _today(), 0); }
function recordDaily() {
  const k = 'nemoDaily-' + _today();
  if (score > _ls(k, 0)) _ss(k, score);
}
function dailyBoard() {
  const seed = _hash(_today());
  const rows = DAILY_BOTS.map((n, i) => {
    const r = _hash(n + seed) % 1000;
    return { n, s: 400 + ((seed >> (i * 3)) % 2200) + r };
  });
  rows.push({ n: 'YOU 🐠', s: Math.max(score, dailyBest()), you: true });
  rows.sort((a, b) => b.s - a.s);
  return rows;
}

const Meta = {
  tickAbility(dt) {
    if (player.abilityCd > 0) player.abilityCd -= dt;
    if (player.abilityT > 0) {
      player.abilityT -= dt;
      if (player.abilityT <= 0) { player.abilityT = 0; player.frenzy = 0; player.thorns = 0; }
    }
    const b = document.getElementById('abilityBtn');
    if (b) {
      const a = abil();
      const ready = (player.abilityCd || 0) <= 0 && state === 'playing' && !player.dead;
      b.textContent = ready ? a.icon : Math.ceil(player.abilityCd || 0) + '';
      b.classList.toggle('ready', !!ready);
      b.classList.toggle('active', (player.abilityT || 0) > 0);
      b.title = a.name + ' — ' + a.desc + ' (E)';
    }
  },
  tryAbility() {
    if (state !== 'playing' || player.dead || player.trappedIn) return;
    if ((player.abilityCd || 0) > 0 || (player.abilityT || 0) > 0) return;
    const a = abil();
    const id = selectedFish;
    player.abilityT = a.dur;
    player.abilityCd = a.cd * abilCdMul();
    if (id === 'nemo') { player.invuln = Math.max(player.invuln, a.dur); player.boost = 100; player.boosting = true; }
    else if (id === 'damsel') { player.slow = Math.max(player.slow, a.dur); player.invuln = Math.max(player.invuln, 1); }
    else if (id === 'puffer') { player.shield = Math.max(player.shield, a.dur); player.thorns = a.dur; }
    else { player.frenzy = a.dur; player.magnet = Math.max(player.magnet, a.dur); player.boost = 100; player.boosting = true; }
    addFloat(player.x, player.y - 40, a.name + '! ' + a.icon, '#ffd66e');
    burst(player.x, player.y, 18, '#ffd66e');
    try { AudioSys.ability(); } catch (e) {}
    misAdd('dist', 0);
  },
  tick() { // atlas auto-unlock: cheap presence checks, no spawner edits
    try {
      markSeen(selectedFish);
      if (typeof activeBiome !== 'undefined') markSeen('bio-' + activeBiome);
      for (const p of predators) markSeen('foe-' + p.type);
      if (jellies.length) markSeen('jelly');
      if (nets.length) markSeen('net');
      if (hooks.length) markSeen('hook');
      if (urchins.length) markSeen('urch');
      if (boulders.length) markSeen('rock');
      if (typeof Boss !== 'undefined' && Boss.active()) {
        const nm = Boss.name();
        const hit = ATLAS.find((x) => x.name === nm);
        if (hit) markSeen(hit.id);
      }
    } catch (e) {}
  },
};

function metaOverlay(id, title) {
  let o = document.getElementById(id);
  if (o) return o;
  o = document.createElement('div');
  o.className = 'overlay hidden';
  o.id = id;
  o.innerHTML = '<div class="card wide"><div class="tag blue">' + title + '</div><div id="' + id + 'Body"></div><div class="row"><button class="btn secondary" data-close="' + id + '">← Back</button></div></div>';
  document.getElementById('stage').appendChild(o);
  o.querySelector('[data-close]').onclick = () => { o.classList.add('hidden'); try { AudioSys.click(); } catch (e) {} };
  return o;
}
function renderUpgrades() {
  const o = metaOverlay('ovUpg', '⬆️ UPGRADES & 🎯 MISSIONS');
  const b = document.getElementById('ovUpgBody');
  let h = '<div class="menu-sub">💎 ' + gems + ' gems</div><div id="upgGrid">';
  for (const u of UPG) {
    const l = upgLvl(u.id);
    const maxed = l >= u.max;
    const cost = maxed ? 'MAX' : u.costs[l] + '💎';
    h += '<div class="lvCard' + (maxed ? ' done' : ' current') + '"><b>' + u.icon + ' ' + u.name + '</b><span>' + u.desc + ' • Lv' + l + '/' + u.max + '</span><em><button class="btn secondary" data-upg="' + u.id + '"' + (maxed ? ' disabled' : '') + '>' + cost + '</button></em></div>';
  }
  h += '</div><div class="menu-sub">🎯 MISSIONS (persist across runs — claim anytime)</div><div id="misGrid">';
  for (const m of MISSIONS) {
    const v = Math.floor(_mis[m.metric] || 0);
    const done = v >= m.target;
    const claimed = (_mis.claimed || []).includes(m.id);
    h += '<div class="lvCard' + (done ? ' done' : '') + '"><b>🎯</b><span>' + m.name + ' — ' + v + '/' + m.target + ' (+' + m.reward + '💎)</span><em>' + (claimed ? '✅' : done ? '<button class="btn secondary" data-claim="' + m.id + '">CLAIM</button>' : '…') + '</em></div>';
  }
  b.innerHTML = h + '</div>';
  b.querySelectorAll('[data-upg]').forEach((btn) => btn.onclick = () => {
    const u = UPG.find((x) => x.id === btn.getAttribute('data-upg'));
    const l = upgLvl(u.id);
    if (l >= u.max || gems < u.costs[l]) { try { AudioSys.locked(); } catch (e) {} return; }
    gems -= u.costs[l];
    _upg[u.id] = l + 1;
    _ss('nemoUpg', _upg);
    saveRoster();
    try { AudioSys.buy(); } catch (e) {}
    renderUpgrades();
  });
  b.querySelectorAll('[data-claim]').forEach((btn) => btn.onclick = () => {
    const m = MISSIONS.find((x) => x.id === btn.getAttribute('data-claim'));
    if (!m || (_mis.claimed || []).includes(m.id) || (_mis[m.metric] || 0) < m.target) return;
    _mis.claimed.push(m.id);
    gems += m.reward;
    _ss('nemoMis', _mis);
    saveRoster();
    try { AudioSys.buy(); } catch (e) {}
    renderUpgrades();
  });
  o.classList.remove('hidden');
}
function renderAtlas() {
  const o = metaOverlay('ovAtlas', '📖 SPECIES ATLAS');
  const b = document.getElementById('ovAtlasBody');
  let h = '<div class="menu-sub">' + _seen.length + '/' + ATLAS.length + ' discovered — play to unlock</div><div id="upgGrid">';
  for (const a of ATLAS) {
    const got = _seen.includes(a.id) || _seen.includes('bio-' + a.id);
    h += '<div class="lvCard' + (got ? ' done' : ' locked') + '"><b>' + (got ? a.icon : '❓') + '</b><span>' + (got ? a.name + ' — ' + a.desc : '??? — keep swimming') + '</span></div>';
  }
  b.innerHTML = h + '</div>';
  o.classList.remove('hidden');
}
function renderDaily() {
  const o = metaOverlay('ovDaily', '🏆 DAILY LEADERS — ' + _today());
  const b = document.getElementById('ovDailyBody');
  const rows = dailyBoard();
  let h = '<div class="menu-sub">Your best today: <b>' + Math.max(score, dailyBest()) + '</b> — one board per day, bots seeded by date</div>';
  rows.forEach((r, i) => {
    h += '<div class="lvCard' + (r.you ? ' current' : i === 0 ? ' done' : '') + '"><b>#' + (i + 1) + '</b><span>' + r.n + '</span><em>' + r.s + ' ⭐</em></div>';
  });
  b.innerHTML = h;
  o.classList.remove('hidden');
}
function metaInit() {
  if (!player.abilityCd) { player.abilityCd = 0; player.abilityT = 0; player.frenzy = 0; player.thorns = 0; }
  const hud = document.getElementById('gameHud');
  if (hud && !document.getElementById('abilityBtn')) {
    const btn = document.createElement('button');
    btn.id = 'abilityBtn';
    btn.className = 'iconbtn';
    btn.title = 'Ability (E)';
    btn.textContent = '💨';
    hud.insertBefore(btn, document.getElementById('btnMute'));
    btn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); try { AudioSys.ensure(); } catch (x) {} Meta.tryAbility(); });
  }
  const row = document.querySelector('.menu-play-row');
  if (row && !document.getElementById('btnUpg')) {
    const mk = (id, txt, fn) => {
      const x = document.createElement('button');
      x.className = 'btn secondary';
      x.id = id;
      x.textContent = txt;
      x.onclick = () => { try { AudioSys.ensure(); AudioSys.click(); } catch (e) {} fn(); };
      row.appendChild(x);
    };
    mk('btnUpg', '⬆️ UPGRADES', renderUpgrades);
    mk('btnAtlas', '📖 ATLAS', renderAtlas);
    mk('btnDaily', '🏆 DAILY', renderDaily);
    const bar = document.createElement('p');
    bar.className = 'menu-sub';
    bar.id = 'misBar';
    row.parentElement.appendChild(bar);
  }
  window.addEventListener('keydown', (e) => {
    if ((e.key === 'e' || e.key === 'E') && state === 'playing') Meta.tryAbility();
  });
}
try { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', metaInit); else metaInit(); } catch (e) {}
