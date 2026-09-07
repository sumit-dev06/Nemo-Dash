# NEMO DASH — Coral Escape 🐠

**▶ Play now: https://sumit-dev06.github.io/Nemo-Dash/** (installable, offline-ready)

A highly addictive 2D underwater dodger, now a **4-fish roster game with a gem economy**.
You **auto-swim left → right** and steer **only UP / DOWN**. Dodge what you can't eat,
**eat what you can**, grab pearls, and reach the **Coral Gate 🏁**. Bigger fish, bigger appetite.

**Status:** `v1.9` — structured project, zero dependencies, phone-proven, works offline.
See `docs/CHANGELOG.md`.
**Play it:** double-click `index.html`. **Install it:** serve over http
(`python3 -m http.server 8000` → open the LAN URL on your phone → 📲 INSTALL APP,
or iOS Share → Add to Home Screen). PWA needs http; double-click play needs nothing.

```bash
python3 -m http.server 8000
# then visit http://localhost:8000/index.html
```

## Controls

| Input | Action |
|---|---|
| `▲` / `▼` or `W` / `S` (hold) | Thrust up / down (water drag + buoyancy — feels weighty) |
| Mouse / touch press + drag up-down | Fish springs toward your pointer with lag |
| On-screen joystick (left, phones) | Steer up/down + push right to surge forward (never backwards) |
| ⚡ button or hold `Shift` | Boost: 1.75× speed while the tank lasts (auto-refills) |
| `M` / `P` or `Esc` | Mute / pause (`Enter` starts from menu) |

## Rules in 30 seconds

- You have a **health board** ❤ (3–5 HP by fish) with a color bar. Jellies, hooks, claws = **−1 HP**.
- **A bigger fish's frontal bite swallows you whole — instant game over** 🦈 (shield saves once).
  Brushing past above/below or bumping its body only bruises (−1 HP).
  Hunters telegraph first: gaping jaws + red `!` + hiss → dodge the locked strike!
- **Nets are a cage** 🎣 — touch a falling net and it drags you to the bottom; the landing ends the run (shield breaks you free).
- **Eat or be eaten:** silver fry are snacks (+15, red blood cloud); big unlocked fish **devour smaller hunters (+50)**.
- 🏁 Clear levels to bank **💎 gems** and unlock Azure → Puffy → Razor on the opening screen.
- **10 hand-tuned reefs** (gentle start, breather L6, fierce L10) + **∞ Endless Reef**
  score chase unlocked by clearing Level 5. 🌊 Reef-select replays anything you've cleared.
- 🦪 Pearl = **+25**. 😱 Near-miss = **+15 × combo** (combo window 2.5s).
- Score = `floor(distance/10) + pearls*25 + nearMisses*15 + eatenPts` (+ live combo bonus).
- Last ~420px before the gate is a **safe zone** — no new spawns, gate swims in from the right.
- Swim through the **Coral Gate** to clear the level. Bests persist in `localStorage`.

## What's in the repo

| File | Purpose — read this to restore context |
|---|---|
| `index.html` | Markup only (HUD, overlays, touch nav). Loads `css/` + `js/` below in order. |
| `css/style.css` | All styling incl. phone rules. |
| `js/` | `utils → audio → data → state → world → flow → update → render → ui`. THE GAME. |
| `PROJECT_MEMORY.md` | Persistent memory: decisions, current state, next steps. **Read first.** |
| `docs/CHANGELOG.md` | Version history (v1.0 → v1.2). |
| `docs/GAME_DESIGN.md` | Core loop, entities, scoring, difficulty formulas. |
| `docs/PHYSICS.md` | Water-physics model + all tuning numbers (most important doc). |
| `docs/ARCHITECTURE.md` | Code map of `index.html`, state machine, render layers, tuning knobs. |
| `docs/AUDIO.md` | Procedural WebAudio sound design. |
| `docs/ROADMAP.md` | Browser-test plan → Android decision, Phaser verdict, backlog. |

## Tech decision (short version)

Built **dependency-free on purpose** for the fastest browser test: no CDN, no build step, no asset downloads.
**Phaser is approved for use** (no limitations) — see `docs/ROADMAP.md` for the verdict:
vanilla custom water-feel wins for this prototype; Phaser (+ Capacitor packaging) becomes the right
move if/when we go Android or the scene/asset count outgrows one file.
