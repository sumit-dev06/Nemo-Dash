# ROADMAP — browser test → platform decision → scale 🗺️

## Phase 0 — DONE ✅ (v1.0 browser prototype)
Single-file `index.html`: full loop, 3 predator types, jellies, nets, hooks, crabs, currents,
pearls, 3 powerups, Coral Gate, procedural art + audio, juice (shake/slow-mo/combo/confetti).

## Phase 1 — BROWSER TEST (round 10 with owner, v2.1)
- [x] v2.0: boost 1.75×, install at menu top, invisible HUD/snow cuts, full memory.
- [x] v2.1: reference-style install banner (all platforms) + install actually works via
      prompt/guide; buttons nudged in/up with notch insets.
- [ ] Owner: publish to GitHub Pages (repo exists!) → real install test on phone.
      Menu must show **v2.1**.

## Phase 4 — the scope release (v3.0, DONE ✅)
Owner asked for *"plan something big, make the scope look big"* — six biomes, an adaptive
score, seabed boulders, real animal physics, a clutter ceiling and a bigger perf budget.
Everything landed in v3.0; see `CHANGELOG.md`.
- [x] **Biomes** (`js/biomes.js`): Sunlit Reef / Kelp Forest / Shipwreck Graveyard /
      Jellyfish Bloom / Volcanic Vents / The Abyss. Palette data only — zero frame cost.
- [x] **Adaptive score**: generated in `musicInit()`, driven by the Director's live threat
      weight, 82 → 104 BPM. No mp3 any more.
- [x] **Seabed boulders** (request: *"stones the fish can't cross, so move over them"*),
      fair by construction (shared collision/art profile, capped at 3).
- [x] **Cage frequency** fixed (starvation override + authored waves; 9.2 s min gap).
- [x] **Animal physics**: velocity-driven hunters/jellies/fry, derived body pitch.
- [x] **Clutter ceiling** ~110 → 27 live objects.
- [x] **Perf**: baked seabed strip, memoised cave-roof + gate gradients, off-screen culls,
      zero per-frame gradients, 3554 → ~2100 draw ops. New `?perf=1` / `?perf=2` overlay.

## Phase 5 — plausible next (not started)
- Per-biome score colour (Abyss whole-tone, Vents phrygian) — see `AUDIO.md §7`.
- Boss angler with an HP-driven music layer.
- Hazards per biome: urchins in the reef, moray lunges in the wreck, ink in the vents.
- The `?perf=2` overlay is the measurement rig — keep the budget under ~2000 ops/frame.

## Levels vs endless — RESEARCH VERDICT: HYBRID (don't drop either)
Researched Sept 2026 (runner market + difficulty-curve literature). Evidence:
- **Endless owns the genre** (~52% of runner revenue; Subway Surfers/Temple Run): best
  replayability, score-chase addiction, DAU. BUT pure endless with no progression dies in
  2–3 sessions (2026 LiveOps case study: +45% installs/+29% repeat sessions came only AFTER
  adding challenges, unlocks, leaderboards — the loop alone doesn't retain).
- **Levels own onboarding + goals** (~27% share, faster-growing): discrete objectives teach
  mechanics one at a time, completion rewards feel earned, cliffs are measurable per level.
  Industry consensus (Subway Surfers City 2026): **finite tour + endless classic side by side**.
- **Difficulty science:** sawtooth beats straight ramp (rise → relief → higher peak);
  introduce one mechanic at a time; cap speed + floor spacing so it stays reactable;
  breather levels rebuild confidence (our L6).
- **For Nemo Dash specifically:** our gem/roster meta IS the progression layer endless needs,
  and levels are what unlock it. So: **10 teaching-to-triumph levels, Endless Reef as the
  coronation prize** — score chasers get infinity, completionists get the journey, the shop
  gets fed by both. Revisit only if data ever says endless dominates playtime 10:1.
- [x] First playtest done — owner feedback v1.1 (fixed):
  1. *"Fish gets lost as I move ahead"* → Nemo is now always drawn during a run (gold glow + ▼ YOU tracker),
     gentler invuln blink, out-of-bounds auto-rescue.
  2. *"Want a health board: obstacles −HP, big-fish engulf = game over"* → shipped: 3-HP board with color bar,
     obstacles −1 HP, any predator touch = instant "SWALLOWED WHOLE! 🦈" + `engulf()` sting.
  3. *"Character auto-lost around 184 pts"* → root cause: 3 idle predator hits ≈ score 180 killed the run
     while Nemo silently vanished (`alive=false` hid him). Fixed with death cinematics, per-cause
     titles/tips/sounds, and low-HP heartbeat warning.
- [ ] Re-test v1.1 and score 1–5:
Play `index.html` (double-click or `python3 -m http.server 8000`) and score 1–5:
- [ ] Fun in 60 seconds? Would you hit "Next reef"?
- [ ] Physics feel (weighty water vs sluggish)? Note device + input (keys vs touch).
- [ ] Difficulty curve L1→L3 (too easy / fair / brutal)? Where did hearts go?
- [ ] Readability: net warnings, current bands, claw zones — ever felt cheated?
- [ ] Sound on/off: does ambience + SFX add or annoy?
- [ ] Bugs: attach level + what happened + screenshot if possible.
**Exit:** owner verdict → (A) browser-only polish or (B) Android.

## Phase 2 — PHASER VERDICT (owner-approved libs, no limits)
**Use Phaser only if necessary — today it is not.** Honest breakdown:
- Vanilla wins now: zero-dep test, custom water feel already tuned, one-file iteration.
- Phaser becomes necessary when: (a) Android packaging, (b) scenes/assets outgrow one file,
  (c) we want its Scale Manager, particle emitters, tween chains, sound manager for free.
- If we migrate: port `PHYSICS.md` constants exactly (don't adopt arcade defaults),
  split `ARCHITECTURE.md §2` modules into Phaser scenes 1:1, keep `AudioSys` API.

## Phase 3A — If BROWSER-ONLY
- Juice pass: predator intro cards, daily-seed reef, leaderboard (`localStorage` → tiny backend).
- Balance pass from Phase 1 notes; add urchins/eel/ink as L4–L6 content.
- PWA wrap (manifest + service worker) so it installs like an app, still browser.

## Phase 3B — If ANDROID
1. Migrate to Phaser 3 + Vite/Capacitor (landscape 16:9 locked, `Scale.FIT`).
2. Touch-first: bigger hit zones option, haptics on `hurt()`, pause on blur.
3. Store needs: icon/splash, 64-bit build, content rating (cartoon violence), privacy note (scores local).
4. Alpha track → owner device test → tune perf (particle caps already in place: 500).

## Backlog (post-verdict)
Urchins · moray eel lunges · octopus ink (vision cut) · night-reef lighting · boss angler ·
photo-style sprite pack option · real music stem · Hindi/English toggle.
