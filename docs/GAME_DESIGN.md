# GAME DESIGN — Nemo Dash, Coral Escape

## 1. Fantasy & promise
You are **Nemo**, a small clownfish swept out to the reef edge. Cross each reef **left → right**,
survive what's hunting/falling/snapping, and slip through the glowing **Coral Gate 🏁**.
Each reef is faster, darker, meaner. One more try always feels possible.

## 2. Core loop (60-second read)
`MENU → PLAY (dodge + collect + survive) → GATE → LEVEL COMPLETE (stats + Next) → harder reef…`
Death: `PLAY → GAME OVER (score/level/best + tip) → RETRY`. Best score persists (`localStorage nemoBest`).

## 3. Control scheme (up/down only — owner constraint)
- Forward motion is **automatic** (world scrolls left at `cfg.speed`; player x ≈ 170).
- Player steers **vertical only**: keyboard thrust (`▲▼`/`WS`) or pointer-drag spring.
- Water feel (drag + lag + bob) is the skill surface: overshooting kills. See `PHYSICS.md`.

## 4. Entities

| Entity | Moves | Unlock | Behavior / threat |
|---|---|---|---|
| Playable fish (roster of 4) | locked x, free y | menu shop | Nemo 🐠 free · Azure 🐟 4💎 · Puffy 🐡 10💎 · Razor 🦈 20💎. Bigger = bigger body + more HP (3/3/4/5) + eats smaller (might ladder below) |
| Silver fry (schools 3–5) | right → left, fast | L1 | **prey, edible by every fish (+15)**. The snack that teaches eating |
| Big blue hunter | right → left | L1 | sine wobble; from L2 **steers toward player y** (`hunterBrain`). **Telegraphs**: jaws gape + red `!` + hiss, 0.6s creep, 0.42s locked strike — dodge late! **MOUTH kills, BODY bumps only bruise (−1 HP)**. Edible iff your might ≥ 1.0 (Puffy/Razor DEVOUR +50) |
| Shark | right → left, fast | L2+ (mixed) | bigger hitbox, faster, same telegraph + mouth/body rule. Edible iff might ≥ 1.5 (Razor only) |
| Anglerfish | right → left | L3+ | glowing lure, mid speed, hunts, same telegraph + mouth/body rule. Edible iff might ≥ 1.1 (Puffy/Razor) |
| Jellyfish | drifts left, pulses y | L2+ | sine pulse (`pulse 2–3.5`), sting radius `r+6`. Hit = **−1 HP** |
| Fishing net + boat | drops from top | L2+ | 0.9s **warning** (shadow + flashing ring, no words), then falls. **Touching a falling net catches you: rope mesh over Nemo, dragged down with the cage — the landing ends the run** (shield bursts you free upward). Only dodge is to never touch it. |
| Hook | dangles, drifts left | L3+ | sway line + bait; line + hook both lethal. Hit = **−1 HP** |
| Crab (×3, floor patrol) | parallax patrol | L1 | snapping claws; lethal within 30px if player hugs floor (`FLOOR_Y-70`). Hit = **−1 HP** |
| Pearl (in clam) | drifts left | L1 | collect: +25, magnetisable |
| Powerups: 🛡️ shield / 🧲 magnet / 🌿 slow | drift left | L1 (`powerEvery` 9s) | 12s / 10s / 7s durations; shield absorbs one hit |
| Current band (teal) | static zone, animated flow | L2: 1 band; L3+: up to 3 | pushes player ±y (`strength ≈ 140–240 + level*22`) |
| Coral Gate | swims in from right | end of every level | safe zone: no spawns within ~420px of goal |

Predator mix: L1 all-big → L2 big+shark → L3 big+angler+shark → L4+ incl. double-big weighting.

## 5. Scoring, gems & addiction systems
- **Score** `= floor(distance/10) + pearls*25 + nearMisses*15 + eatenPts`, plus live near-miss bonus `15 × combo`.
- **Eating:** fry NOM! +15 · devoured hunter +50 (`DEVOURED!` floater, gulp sound, shake).
- **Might ladder** (eaters left → right): `fry 0.4 < Nemo/Azure 0.7 < big 1.0 < angler 1.1 < Puffy 1.15 < enemy shark 1.5 < Razor 1.7`.
  Touch resolves: `myMight >= foeMight` → eat, else (predator-class) → engulfed.
- **Gems 💎:** level clear banks `2 + floor(level/2) + floor(pearls/10)`; persisted with unlocks/selection.
- **Near-miss:** predator passes `x < player.x-10` with vertical gap < 86 → combo++, 2.5s window, `CLOSE! +pts` floater, rising blip.
- **Juice:** screen shake (hit 12, shield-break 7), hit slow-mo (0.35× for 0.35s), red vignette flash,
  burst particles, floating texts, level banners, win confetti, hunter-juke mind games.
- **Stakes:** health board (HP = selected fish: 3/3/4/5) + color bar (green→yellow→red, pulses + heartbeat at 1 HP),
  1.8s post-hit invulnerability, shield absorbs one hit of any kind (bite, cage, hazard).
- **Three death types:** obstacle HP-empty → "Out of hearts! 💔"; predator engulf → instant
  "SWALLOWED WHOLE! 🦈" with dedicated sting; net cage → instant "TRAPPED!" + trap sting.
  All play a slow-mo death cinematic first (Nemo shrinks/fades, banner, shake) so the cause is
  unmistakable — Nemo is always drawn while a run is live (gold glow + ▼ YOU tracker).
- **Boost ⚡:** button (above DOWN on phones) or hold `SHIFT`/`SPACE` (desktop): 1.75× reef
  speed for escapes; tank drains in ~3.5s, auto-refills in ~7s; never unlimited by design.
- **Phones play landscape:** portrait touch shows a turn-sideways overlay + auto-pause;
  installed app locks landscape. Narrow desktop windows keep the tall viewport fallback.

## 6. Difficulty: 10 reefs, sawtooth curve (`LEVELS` in `js/data.js`)
| LV | Reef | Goal | Speed | New mechanic | Feel |
|---|---|---|---|---|---|
| 1 | The Shallows | 2000 | 165 | swim + fry only | tutorial, zero threats but hunters |
| 2 | Kelp Edge | 2200 | 180 | jellies + nets debut (sparse) | gentle |
| 3 | Net Waters | 2400 | 195 | hooks + 1 current debut | learning |
| 4 | Deep Blue | 2600 | 210 | sharks debut (15%) | spicy |
| 5 | Hunter's Ground | 2800 | 225 | anglers debut, 70% hungry | PEAK I |
| 6 | Quiet Current | 2800 | 218 | nothing new (dip!) | BREATHER |
| 7 | Angler Deep | 3000 | 238 | anglers 25%, stronger currents | climb |
| 8 | Storm Surface | 3200 | 252 | nets heavy, 3 currents | PEAK II |
| 9 | The Gauntlet | 3400 | 265 | everything dense | hard |
| 10 | Leviathan Reef | 3600 | 280 | all maxed, 85% hungry | FINAL, fair |
Fairness guarantees: speed cap 285 (levels), spawn gaps ≥ ~1.0s, net falls scale with
reef speed, 420px safe zone + gate, opening calm (`first` 2.5s → 1.2s).

## 7. Endless Reef ∞ (unlocked by clearing reef 5; coronation still reef 10)
No gate, no finish line: tier rises every 900m (speed →300 max, gaps floored,
mix/hunger/current counts capped — hard, never impossible). Death banks +1💎 per 600m
so every run feeds the shop; best score + distance persist (`nemoBestEndless*`).
Menu button locked (🔒) until coronation.

## 8. Level flow states
`menu → playing ⇄ paused → levelComplete → playing(n+1)` or `playing → gameOver → playing(n) / menu`.
🌊 **Reef select** (menu): grid of 10 reefs (✅ cleared / ▶ current / 🔒 locked) + endless card;
clearing reef N unlocks N+1 (`nemoMaxLevel`); L10 clear crowns (`nemoCrowned`).
HUD: level pill, score + best, progress bar with 🐠 marker, HP board, pearls, gems, mute, pause. Touch ▲▼ nav buttons + ⚡ boost on phones.
