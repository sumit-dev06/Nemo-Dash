# CHANGELOG — Nemo Dash (serious project, `index.html` + `css/` + `js/` + PWA)

## v3.0 — The scope release: biomes, adaptive score, boulders, real animal physics
- **Six biomes, not just "darker blue".** Reefs 1-15 now belong to named places you can
  *see* you've entered — Sunlit Reef (1-3, turquoise), Kelp Forest (4-6, green sea),
  Shipwreck Graveyard (7-8, steel-teal + rust), Jellyfish Bloom (9-10, magenta-lavender),
  Volcanic Vents (11-12, sulphurous dark), The Abyss (13-15, near-black). The biome drives
  the water gradient, the god-ray strength, the seaweed hue, the starfish palette, the
  seabed sand tint and the boulder rock family (`js/biomes.js`). The descent mechanic
  (swim band narrows, water darkens as caveK → 1) is untouched — the biomes only repaint
  it. The level banner now reads `LEVEL 5 — Hunter's Ground · Kelp Forest`.
- **The music is generated, and it reacts.** v2.8 looped an R&B mp3 that never changed.
  v3.0 synthesises the whole score (`musicInit`): drone (D1/D2/A2) + pad (Dm–B♭–F–C) +
  pentatonic pluck + kick + hat, four layers each on their own gain under one 1900 Hz
  lowpass so it sits *in* the water. `musicIntensity(0..1)` is written every frame from
  the Director's live threat weight (+0.28 on the last heart, +0.12 boosting) and the
  tempo rides it 82 → 104 BPM. It runs on a WebAudio two-clock scheduler (setTimeout on
  90 ms, books notes 350 ms ahead) so the groove is sample-accurate even when the render
  loop stutters, and a muted game creates zero nodes. `musicDuck(sec)` pulls it to
  silence for the death cinematic and the win sting.
- **Every event has a sound now.** Eight generated cues with no mp3 needed: `thud`,
  `netLand` (cage hits the seabed), `slam` (you're driven into the sand), `plink` (a
  fishing line breaks the surface), `scrape` (riding a boulder — pitch by rock height),
  `buffEnd` (shield/magnet/slow has 1.5 s left), `comboUp` (every 5th combo, rises),
  `gate` (the coral gate appears). Mis-assigned sounds fixed: the seabed slam played the
  crab-claw file, net capture played the boat splash, the boulder ride played a bubble.
  The empty-tank cue now also fires on the keyboard.
- **Seabed boulders, and they're fair.** Sharing one `rockProfile(t)` between collision
  and art means what you see is exactly what blocks you. Crown-flattened raised cosine
  `(0.5+0.5cos πt)^0.75` is tangent to the sand at both toes (slope 0) and never traps —
  verified ride: 0 px penetration, 0 hearts lost, 66 ride frames, max 8.5 px lift/frame.
  Rocks are wide (w ≈ 2.1-3.4 × h), erosion-only silhouette, a sand skirt, and take the
  biome's rock family. Caps hold at 3 (shoulder rocks reserve 2 slots so they cannot
  creep past the cap).
- **Cage frequency fixed.** The `patience`/`starving` starvation override plus authored
  waves went from *zero cages in 82 s* to 8 cages in 90 s with a 9.2 s minimum gap —
  the net is a hazard now, not a memory.
- **Real animal physics, and it's cheaper than what it replaced.** Hunters, jellies and
  fry are velocity-driven rather than position-driven: each owns `vy` and its drawn body
  pitch derives from `atan2(vy, |vx|)`, so a shark that climbs is nose-up instead of
  gliding sideways level. Jellies pulse-propulse (a contraction kicks `vy`, then station-
  keeping, negative buoyancy and a damp restore the drift). All trig rebuilt on cached
  sin/cos and the angle-sum identity, jellies render all five tentacles in one path, and
  the renderer now computes two `Math.exp` per frame total instead of one per entity.
- **Clutter got a hard ceiling.** max live gameplay objects dropped ~110 → 27 (2 current
  bands, not 3; capped predators/jellies/fry/nets/hooks/pearls/powerups). The screens can
  breathe.
- **Perf cuts you can't see but your phone can.** The seabed (sand gradient + 40 pebbles
  + 392 caustic points) is baked into ONE horizontally-tiling strip blitted twice; the
  cave-roof and gate glow gradients are memoised; off-screen hazards are culled before
  they cost a path walk. Per-frame gradient count went to **zero** and peak draw ops
  dropped **3554 → ~2100** (measured with a new `?perf=1` / `?perf=2` overlay that also
  reports fps, frame ms, live entity counts, DPR and sprite cache size).


## v2.1 — Install banner + comfy buttons (current)
- **Install banner like a proper app:** top strip (icon + name + Installable App badge +
  Install App + ×) on phones AND desktop, HUD drops below it; menu button mirrors it;
  × dismisses forever; one-tap auto-install when the browser offers it, manual
  Android/iPhone guide otherwise.
- **Buttons moved in/up:** touch ▲▼ + ⚡ sit 26px in and 30px up with notch-safe insets.
- **LIVE on https:** repo public + GitHub Pages enabled after LAN-http proved uninstallable
  (secure context is a hard browser rule). Verified live + install prompt fires.
- **Install banner like a proper app:** top strip (icon + name + Installable App badge +
  Install App + ×) on phones AND desktop, HUD drops below it; menu button mirrors it;
  × dismisses forever; one-tap auto-install when the browser offers it, manual
  Android/iPhone guide otherwise.
- **Buttons moved in/up:** touch ▲▼ + ⚡ sit 26px in and 30px up with notch-safe insets.
- Note: auto-install needs https — localhost/LAN http can never prompt (browser rule).

## v2.0 — The proper-app release (current)
- **Boost 1.5× → 1.75×** (faster, not wild).
- **Install button unmissable:** moved to the top of the menu, above the roster.
- **Lag cuts nobody can see:** marine snow drawn as rects (identical at 1–2px), HUD refs
  cached once with write-only-on-change (no per-frame DOM churn).
- **Memory:** SWIM resumes your last reef (`nemoLastLevel`), menu shows best + gems;
  unlocks/gems/selection/max-level already persisted — all progress now survives restarts.

## v1.9 — Budget-phone smooth, working boost, fins everywhere (current)
- **10k-phone lag, fixed without touching quality:** dynamic resolution (renders sharp
  while the device copes, steps pixel count down/up with load — art identical),
  backdrop-blur removed on touch GPUs (flat fills, same look), angler glow pre-rendered
  to a sprite, all body gradients memoized (no per-frame GC churn). One hunter's fins cost
  less than one blurred pixel row did.
- **Boost actually works on phones:** the toggle was firing twice per tap (on, then
  instantly off) — pointer-events only now, plus a regression test that taps twice.
- **Fullscreen keeps trying** until it takes (first attempt can fail while settling);
  install button shows on every non-installed touch phone (auto prompt, else manual guide).
- **Fin movement on every fish:** hunters row their pectorals, anglers paddle leg-fins,
  Puffy flutters side fins, Razor paddles — pure sine math, ~zero cost. Fry keep tail-wag.

## v1.8 — Exact sound map: gulp → chomp → lose (current)
- Eating plays the **gulp** (first snappy second of the 5s munch recording).
- Getting eaten: **chomp** snaps at the bite instant, beast **roar** follows a beat later.
- **Every death panel ends on the lose sting** (sad trombone), whatever killed you.
- Jellyfish = electric zap, crab = hard snap, hook/slam = thud, side-bump = soft thud.

## v1.7 — Retina sharp, iOS install path, louder reliable SFX (current)
- **Crisp rendering:** canvas backing now scales with device pixels (up to 2×) — no more
  720p blur on retina phones. Same world, same speed, just sharp.
- **iOS install path:** iPhones have no auto-install button (Apple rule), so the menu now
  shows HOW TO INSTALL → 3-step Share → Add to Home Screen guide. Android keeps the
  one-tap prompt. Fullscreen note: iPhone Safari can't go fullscreen from a page at all —
  the installed app is the fullscreen route there.
- **SFX reliability:** unlock warmup on first tap (every pool touched once, muted), louder
  files across the board, music up. Plus a **version label** on the menu (`v1.7`) so any
  tester can confirm they're on the latest build, and `?v=` cache-busting on all assets
  so updates actually arrive through the service worker.

## v1.6 — Full quality back, no bezels, music, drag-down cage (current)
- **Quality restored:** owner vetoed all visible downgrades — kelp, caustics, lure glow all
  back, always. Auto-degrade + quality selector deleted. Lag is fought with invisible wins
  only (baked background blit). Full visuals + smooth on any decent phone.
- **No bezels:** stage is full-viewport everywhere; wide screens get a wider reef
  (`fitScreen` matches the canvas to the real aspect, zero stretch).
- **True auto-landscape:** first tap goes fullscreen AND locks sideways (Android rotates
  by itself); iPhone uses the turn card + install. Plus fullscreen-on-touch everywhere.
- **Music:** soft island loop under the whole game (mute-safe, cached offline).
- **Every hit has its sound:** jellyfish sting = electric zap, crab = hard snap,
  hook/slam = thud, side-bump = soft thud.
- **Drag-down cage:** touching a falling net catches you — rope mesh over Nemo, dragged
  down with the cage while it falls, landing ends the run (shield bursts you free upward).

## v1.5 — Real sounds, fast phones, fair teeth, clean words
- **Real SFX:** 18 studio recordings (`assets/sfx/`, Mixkit royalty-free) via a pooled file
  bank with per-sound volume/cut/pitch and synth fallback — a missing file degrades to
  beeps, never silence. Water ambience + bubbles stay procedural (owner-approved).
- **Perf engine:** baked background (one blit replaces ~8 fullscreen gradients), glow-blur
  off, half kelp, particle/bubble caps, auto quality (slow frames → cheap mode) + manual
  selector. (v1.6: visible downgrades removed again per owner — only the bake remains.)
- **Landscape-only phones:** portrait touch shows turn overlay + auto-pause; manifest locks
  landscape for installs. (v1.6: + orientation lock on first tap = true auto-rotate.)
- **Fair teeth:** predator MOUTH kills, BODY bumps only bruise (gentle −1 HP, soft thud).
- **Cage = instant end** (v1.6: reworked into drag-down trap). **Endless opens at reef 5.**
- **Phone HUD:** fit-guaranteed slim bar; pause card gains sound/bests/restart/quality.
- **Clean words:** big DOM popups deleted; warnings visual-only; plain simple English.
- **Layout:** UP-left / DOWN-right / ⚡-above-DOWN; `SPACE` also boosts.

## v1.4 — Lunges, boost, logo, portrait phones, reef select, installable app
- Telegraphed predator strikes (jaws gape + red `!` + hiss, dodgeable locked lunge).
- Boost tank (button/Shift, 1.5×, drains/refills). Blood clouds on eats.
- `assets/logo.svg` + favicon set; tall portrait viewport; reef-select grid; PWA shell.

## v1.3 — The `p` bug, proper structure, 10 levels + Endless Reef
- **ROOT CAUSE of every "Nemo disappears" report:** `drawPower(pw)` read `p.x/p.y/p.h`
  (`p` never existed in that scope). First powerup spawns ~6–9s in (score ~150–250) →
  `render()` threw every frame → layers after it (Nemo!) never drew, while the world
  behind stayed visible and the score kept climbing. One-line-class fix, caught by the
  on-screen error trap. Added full-cast + 40s fuzz regression tests (40 asserts total).
- **Proper structure (owner request):** single file split into `index.html` (markup),
  `css/style.css`, `js/` (`utils, audio, data, state, world, flow, update, render, ui` —
  classic scripts, double-click still works), all Prettier-formatted, no more one-liners.
- **10 hand-tuned levels** (sawtooth curve: gentle L1, peaks L5/L8/L10, breather L6;
  one mechanic debut at a time; speed cap 285, spawn floors ≥ ~1s — always reactable).
- **Endless Reef (research verdict: HYBRID):** unlocked by clearing L10; tier +difficulty
  every 900m with hard fairness caps; death banks +1💎/600m; best distance/score persisted.
- Predator mix + hunger now data-driven per level (`sharkW/anglerW/hungry`); net fall speed
  scales with reef speed; L10 clear coronation re-labels Next → `ENDLESS REEF ∞ →`.

## v1.2 — Roster, gems, phones, hardening (current)
**Owner verdict: liked it, going serious.** Big feature + reliability release.
- **Fish roster + gem shop:** opening screen shows your fish live + a swipeable carousel —
  Nemo (free) · Azure (4💎) · Puffy (10💎) · Razor (20💎). Bigger fish = bigger body + more HP.
  Gems banked per level clear (`2 + floor(level/2) + floor(pearls/10)`), persisted
  (`nemoGems` / `nemoFish` / `nemoSelected`).
- **Bigger fish eat smaller:** might system (`fry 0.4 < Nemo/Azure 0.7 < big 1.0 < angler 1.1 < Puffy 1.15 < enemy shark 1.5 < Razor 1.7`).
  Touch resolution: `might >= foe` → DEVOURED (+50) else engulfed. New silver-fry schools (+15 each, edible by all).
  Score += `eatenPts`; level-complete card shows EATEN stat + gem payout.
- **Phone-ready:** on-screen ▲▼ nav buttons (auto-show on touch), responsive HUD CSS,
  `viewport-fit=cover` + theme-color, long-press menu suppression, auto-pause when tab hidden.
- **Opening screen cleaned:** menu wall-of-text removed → title + tagline + gems + roster + SWIM/?.
- **Vanish-proofing (forensic):** per-frame finite watchdog (NaN can never hide Nemo again),
  `ctx.roundRect` replaced with compat path (froze older phones near the gate), on-screen error trap
  (`#errBox`), pointer-input sanitization, tracker glow moved to topmost canvas layer.
- Verified: `node --check` clean + 23-assert headless smoke (`render` in menu/playing/game-over,
  roster, gems, eat/devour, watchdog, legacy HP/engulf rules).

## v1.1 — Health board + engulf rules
- Obstacles −1 HP (3-HP board + color bar + low-HP heartbeat); predator touch = instant
  "SWALLOWED WHOLE! 🦈" with `engulf()` sting; death cinematics; Nemo always drawn (gold glow + ▼ YOU).
- Fixed ~184-pt silent death (3 idle predator hits hid Nemo with panel as only feedback).

## v1.0 — Browser prototype
- Full loop (menu → swim → gate → next / game-over → retry), 3 predators + hunter AI, jellies,
  nets, hooks, crabs, currents, pearls, 3 powerups, procedural art + WebAudio, juice systems.
