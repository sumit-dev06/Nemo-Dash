# PROJECT MEMORY — do not lose context 🧠

> **Read this file first in every new session.** It is the persistent brain of this project.
> Implementation: `index.html` + `css/style.css` + `js/` + `sw.js` + `manifest.webmanifest` (v1.4).
> Load order: `utils → audio → data → state → world → flow → update → render → ui`
> (classic scripts, double-click works; PWA/serving unlocks manifest+SW).
>
> **Owner status: SERIOUS PROJECT.** He liked v1.1 and committed. Quality bar: no silent bugs,
> phone-ready, economy + roster live. See `docs/CHANGELOG.md` for version history.

## 1. What we're building

- **Game:** NEMO DASH — Coral Escape. 2D underwater dodger, Canvas 960×540 (`FLOOR_Y = H-64`).
- **Fantasy:** little clownfish (Nemo-like) crosses the reef left → right to a Coral Gate.
- **Constraint from owner:** player motion is **UP/DOWN only** — forward swim is automatic
  (world scrolls left, player x locked at ~170).
- **Non-negotiables:** water + physics must *feel real*; characters must look good;
  proper sound; highly engaging/addictive; **browser version tested first**, then decide Android vs browser-only.

## 2. Decisions locked (don't re-litigate without owner)

1. **Single-file browser prototype first** (`index.html`, ~1070 lines, zero deps, offline-safe).
   Reason: fastest test loop, no CDN/build/asset risk.
2. **Custom water physics, not engine physics.** Spring-damper + drag + buoyancy + currents,
   hand-tuned (see `docs/PHYSICS.md`). Phaser Arcade is *less* water-realistic out of the box.
3. **All art procedural** (Canvas gradients): clownfish stripes, shark/angler/big-blue predators,
   jellies, nets+boat, hooks, crabs, seaweed, corals, god rays, marine snow. No external images.
4. **All audio procedural** (WebAudio, no files): `AudioSys` with `tone()` + `noiseBurst()` primitives,
   brown-noise ambient loop + droplet blips. See `docs/AUDIO.md`.
5. **Libraries allowed without limit** (owner: *"if phaser is necessary then use that"*).
   Verdict: Phaser **not necessary yet** — adopt it at the Android/content-scale gate (see `docs/ROADMAP.md`).
6. **Addiction systems shipped:** near-miss combo, pearls, health board (3 HP) + shield, best-score persistence,
   screen shake + slow-mo hit feedback, floating score text, confetti, level banners.
7. **Death rules (owner-locked, v1.1):** small hazards (jelly/net/hook/crab/slam) cost **1 HP**;
   touch from **any bigger fish = instant engulf → game over** (shield still saves once).
   Every death plays a slow-mo cinematic (Nemo shrinks/fades, banner + sting) so the fish never
   "just vanishes" — root cause of the old ~184-pts complaint was 3 idle predator hits → `alive=false`
   → render hid Nemo with only the panel as explanation. Fixed: Nemo is always drawn while a run is live
   (gold glow + ▼ YOU tracker), plus HP bar, low-HP heartbeat, per-cause titles/sounds.
8. **Roster + gems (owner-locked, v1.2):** 4 fish (Nemo 0💎 / Azure 4💎 / Puffy 10💎 / Razor 20💎),
   bigger = bigger body + more HP + eats smaller (might ladder, see `docs/GAME_DESIGN.md`).
   Gems from level clears only (no IAP yet). Persisted keys: `nemoGems`, `nemoFish`, `nemoSelected`.
9. **Phone is first-class (v1.2):** touch ▲▼ buttons, responsive HUD, auto-pause on hide,
   compat-safe canvas (no `roundRect`), on-screen error trap. Zero-dependency multi-file kept
   deliberately — still the fastest test loop; Phaser migration stays gated (see `docs/ROADMAP.md`).
10. **The vanishing bug, truly fixed (v1.3):** it was NEVER game logic — `drawPower(pw)` used
    undefined `p`, so the first powerup (~score 150–250) killed `render()` every frame while the
    sim + score ran on. Fixed + full-cast/fuzz regression tests. Paranoia retained (watchdog, trap).
11. **Levels vs endless verdict (v1.3, researched): HYBRID.** 10 finite levels (teach → peak →
    coronation) PLUS Endless Reef (score chase, tier/900m, gem trickle). Opened at L10 in v1.3,
    moved to **L5 in v1.4** per owner. Evidence + curve notes in `docs/ROADMAP.md`.
12. **Fair fights (v1.4):** lethal hunters telegraph (jaws gape + red `!` + hiss, 0.6s wind-up
    creeping toward you, 0.42s locked-line strike — dodge late to live). Nets are a cage:
    trapped = instant end (no HP scratch). Boost tank (1.75×, drains/refills). SFX refresh
    (`locked/gulp/lunge/boost/trap`; water ambience kept). Blood clouds on eats.
13. **Phone proven (v1.4):** full-bleed portrait viewport (`fitScreen`, zero distortion),
    `spawnX()` fairness bonus, on-screen ▲▼ + ⚡, headless phone screenshots verified clean console.
14. **Reef select + PWA (v1.4):** grid with ✅/▶/🔒 + progress (`nemoMaxLevel`, crowned at L10);
    `manifest.webmanifest` + offline `sw.js` + install button (needs http serving).
15. **Full quality + no bezels + music + drag-down cage (v1.6, owner corrections):**
    all visual downgrades deleted (lag fought with the invisible bg bake only); stage is
    full-viewport everywhere with aspect-matched canvas; first tap goes fullscreen AND
    locks landscape (Android auto-rotates); island music loop; per-cause stings
    (jelly zap, crab snap); falling-net touch traps you — rope mesh, dragged down,
    landing ends it (shield pops you free).
16. **Sharp + installed + loud (v1.7):** DPR-aware canvas (≤2×) + DPR-baked background;
    iOS 3-step install guide (no Apple API exists); menu version label + `?v=` cache-bust;
    SFX unlock warmup + louder files + louder music; fullscreen+landscape on first tap
    (Android rotates itself; iPhone can't — install instead).
17. **Budget phones (v1.9):** dynamic resolution (DPR steps with frame time, art untouched),
    no backdrop-blur on touch, lure-glow sprite, memoized gradients. Boost double-fire fixed
    (pointer-only toggle). Fullscreen retries till it takes. Install visible on all touch
    phones. Fin flaps on every fish (cheap sine, zero lag risk).
18. **Proper-app pass (v2.0):** boost 1.75×; install button at menu top; snow-as-rects +
    cached write-on-change HUD (invisible lag cuts); full progress memory (last reef resume,
    menu best line; unlocks/gems/max already persisted); scrollable touch overlays.

## 3. Current state (v2.1 — truth as of this file)

- Playable loop: menu (+logo, roster, reef select, endless, install) ⇄ playing ⇄ pause
  (resume/restart/sound/bests/quality/menu) → levelComplete → next / gameOver → retry.
- Phones play LANDSCAPE (portrait = turn overlay + auto-pause; installed app locks it);
  portrait tall-viewport retained as fallback. Fullscreen on first tap (browser rule).
- Combat: predator MOUTH kills, BODY bruises (−1 HP soft); edible foes devoured any touch;
  lunges telegraphed (0.6s wind-up, locked 0.42s strike); nets kill only when landed.
- Boost: button/Shift/Space, 1.75×, tank drains ~3.5s, refills ~7s.
- Sound: 18 Mixkit mp3s (`assets/sfx/`, pooled, cut/rate, synth fallback) + procedural sea/bubbles.
- Perf: baked bg, cheap mode (auto on slow frames / manual / `?quality=`), caps; fairness untouched.
- Texts: canvas-only small popups, visual-only warnings, plain words everywhere.
- Entities: jellies, hooks, 3 crabs, pearls, 3 powerups, fry schools, current bands, Coral Gate.
- Death rules: jelly/hook/crab/slam/body-bump −1 HP (soft thud for bumps); **mouth engulf OR
  landed-net trap = instant cinematic end** ("Got you!" / "Caught in the net!" + file stings).
  Shield saves once from all.
- Hearts = selected fish HP (3/3/4/5); post-hit invuln 1.8s; combo 2.5s; 1-HP heartbeat (file).
- Difficulty: `LEVELS` table (L1 gentle → L5 peak → L6 breather → L10 Leviathan, fair caps);
  Endless tiers/900m to speed 300; endless death banks +1💎/600m; L5 opens endless.
- Score: `floor(distance/10) + pearls*25 + nearCount*15 + eatenPts`, near-miss live bonus `15×combo`.
- Swim rule depends on selected fish (`fish().might/size/hp`): Nemo/Azure eat fry only;
  Puffy (4 HP) devours fry + big + angler; Razor (5 HP) devours everything incl. enemy sharks.
- 10 levels (`LEVELS` table in `js/data.js`): L1 pure swim → L2 jellies/nets → L3 hooks/currents
  → L4 sharks → L5 peak+anglers → L6 breather → L7–L9 climb → L10 Leviathan (280 speed, fair caps).
  L5 clear opens endless (`nemoEndless`); final clear crowns (`nemoCrowned`); clears unlock next
  (`nemoMaxLevel`). Endless tiers/900m to speed 300 max; endless death banks +1💎/600m.
- 15 levels (v2.6): L11–L15 are the cave (Cave Mouth → Heart of the Cave, `cfg.cave`
  0.35→1.0): darker baked water, rock roof + stalactites + glowworms, narrower swim
  band (`swimTop/swimBot` in `js/utils.js`), spawns clamped to the band, speed ≤298,
  intervals ≥~1s, predator mult capped 1.8. Endless tier 4+ descends into the cave
  (`Endless Cave` past tier 5, re-bakes once per tier). Starfish beds on the seabed
  everywhere (`starfish` in `seedDecor`, `drawStarfish`). Perf: bake-time gradients
  only, ~30 extra arcs/frame, no per-frame allocations.
- Vanish-proofing: finite watchdog; compat `rrPath`; `#errBox` trap (now with line numbers);
  tracker glow topmost; 70-assert headless suite incl. DOM-ID cross-check + full-cast/fuzz renders.
- Known limits: art is stylized-procedural; no native APK (PWA install instead for now);
  balance needs human playtest (owner device).

## 4. How to resume work

1. Read this file → `docs/ROADMAP.md` (for *what next*) → `docs/ARCHITECTURE.md` (for *where*).
2. Open `index.html` and playtest before changing tuning.
3. Change tuning via the knobs table in `docs/ARCHITECTURE.md`; keep docs in sync.

## 5. Next actions (owner-ordered, serious project)

- [ ] **Owner re-test v1.4 on phone (install it!) + desktop:** lunges dodgeable? boost fun?
      cage-final fair? reef select clear? endless@5 pace? Nemo visible 100%?
- [ ] Serve over http for PWA test: `python3 -m http.server` (or any static host) → install prompt.
- [ ] Then decide: (a) more content (5th fish, eel, boss), (b) native Android (Capacitor),
      (c) polish + store listing assets (use `assets/` icon set).

## 6. Open questions for owner

1. Browser test verdict: fun enough? What feels off (speed, difficulty, controls)?
2. If Android: target stores + portrait or landscape? (Game is landscape 16:9 today.)
3. Art direction: keep procedural cartoon-real, or move to photo-style sprite pack?
