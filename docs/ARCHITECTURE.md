# ARCHITECTURE — code map (v1.3 multi-file)

```
Bike_race/
  index.html      markup only: HUD, 5 overlays, touch nav, script tags (load order below)
  css/style.css   all styling + responsive phone rules
  js/utils.js     canvas/ctx, W/H/FLOOR_Y, rand/clamp/lerp/TAU/circleHit
  js/audio.js     AudioSys (procedural WebAudio)
  js/data.js      VERSION, LEVELS table, levelConfig(), endlessCfg(), FISHES/FOE_MIGHT,
                  gems/unlocks/selection/endless persistence, renderRoster()
  js/state.js     state, level, endless, cfg, score counters, entity arrays, player, input
  js/world.js     seedDecor, spawners (pred/jelly/net/hook/pearl/power/fry), particles
  js/flow.js      startLevel/startEndless/banner/levelComplete/gameOver/death sys + HUD fns
  js/update.js    loop/update/currentForceAt (sim + collisions + endless tier-ups)
  js/render.js    render + all draw fns + rrPath (compat rounded rect)
  js/ui.js        input, buttons, touch nav, endless-btn state, error trap, boot
```
Classic `<script>` tags in that exact order (NOT modules — file:// double-click keeps working).
All cross-file calls resolve at runtime; `let/const` load order above must be preserved.

No imports, no build, no assets, no bundler. Canvas logical size **960×540**, `FLOOR_Y = H-64`.

## 1. DOM / HUD ids (don't rename without updating JS)
- Canvas: `#game` · Overlays: `#menu #how #levelDone #gameOver #paused` (`.hidden` toggles)
- HUD `#gameHud`: `#hudLevel #hudScore #hudBest #progressBar #progressFish #hpPill #hpWrap #hpBar #hearts #hudPearls #hudGems #btnMute #btnPause`
- Menu: `#menuGems #roster` (cards built by `renderRoster()`), `#touchNav #navUp #navDown`, `#errBox`, `#doneEaten #doneGems`
- v1.3: `#btnEndless #endlessLock #btnNext` (Next re-labels to Endless at L10)
- Feedback: `#toast` (+ injected `.floatTxt`), `#combo`, `#hint`, `#vignetteFlash`, `#levelBanner/#bannerSub/#bannerTitle`
- Stats screens: `#doneLevel #doneScore #donePearls #doneNear #doneFlavor`, `#overScore #overLevel #overBest #overTip #overTitle`

## 2. JS module map (in load order — see tree above for files)
1. Helpers: `rand/clamp/lerp/TAU/circleHit`
2. `AudioSys` — lazy WebAudio (see `AUDIO.md`)
3. `levelConfig(n)` — all difficulty numbers (see `GAME_DESIGN.md §6`)
4. State: `state, level, cfg, score, pearls, nearCount, combo(+Timer), best, distance, scrollX, shake, slowmo, flashA`
5. Entity arrays: `predators, jellies, nets, hooks, pearlsArr, powers, parts, bubbles, floaters, currents` + `spawnT` timers + `gate`
6. Decor: `seaweeds, corals, rocksFar, snow` (+ `seedDecor()`)
7. Flow: `startLevel, banner, levelComplete (banks gems), gameOver(reason, quiet), triggerDeath, finishDeath, engulfBy, damage`
   (`damage` = obstacles −1 HP; `engulfBy` = predator touch → might-check → eat or instant death cinematic → panel)
8. Roster/economy: `FISHES, FOE_MIGHT, gems, unlocks, selectedFish, fish(), saveRoster(), renderRoster(), eatFish(), spawnFry()`
8. Spawners: `spawnPredator/Jelly/Net/Hook/Pearl/Power` + `burst/addFloat/confetti/bubble`
9. Loop: `loop(t)` → `update(dt, rawDt)` → `render()`; `currentForceAt(y)`
10. Art: `drawPlayerMarker (topmost glow + ▼ YOU), drawPlayable dispatch → drawNemo/drawTang/drawPuffer/drawPlayShark, drawFry, drawDemoFish (menu parade), drawPredator/Jelly/Net/Hook/Pearl/Power/Seaweed/Coral/Crabs(drawCrabs)/Gate via rrPath`
    — render always draws the selected fish while a run is live (normal / death-cinematic shrink / HP-ghost), never hides him.
11. Input: keyboard/pointer/touch + buttons (`toggleMute/togglePause`) + boot (`seedDecor`, rAF start)

## 3. State machine
`menu → playing ⇄ paused → levelComplete → playing(n+1)` · `playing → gameOver → playing(n) | menu`.
`state` gates `update()`; `render()` always runs (menu shows live reef behind overlay — intentional).

## 4. `update(dt)` pipeline order (keep this order)
1. `elapsed`, `effSpeed` (slow ×0.62), `distance/scollX`, score, combo timer
2. Player physics (see `PHYSICS.md`) + walls + tilt/tail + timers + gill bubbles
3. Spawning (skipped in 420px safe zone; gate spawns instead)
4. Predators → jellies → nets → hooks → pearls → powerups (move → collide → `damage()`)
5. Particles/bubbles/floaters/snow housekeeping (parts capped 500)
6. Shake/flash decay → gate check (`gate.x < player.x+10` → `levelComplete()`)

## 5. `render()` layers (bottom → top)
1. Water gradient → 2. god rays → 3. far rocks + fish shadows → 4. sand + texture
5. current bands → 6. corals + seaweed + crabs → 7. gate → 8. pearls/powerups
9. hooks + nets → 10. jellies + predators → 11. Nemo (+shield) → 12. snow → 13. bubbles
14. particles → 15. surface shimmer + caustics + vignette → DOM flash + canvas floaters.

## 6. Tuning knobs (quick reference)
| Where | Knob | Effect |
|---|---|---|
| `player` | `r = 15*size+2`, `maxHearts` = fish HP (3/3/4/5) | hit forgiveness scales with unlocks |
| `update` | `ACC 2400, MAXV 560, drag 2.4, spring 16/3.2, bob 36` | water feel |
| `damage` | invuln 1.8s, shield-break 1.6s | mercy windows |
| `levelConfig` | goal/speed/intervals/`predSpeedMul` | difficulty curve |
| near-miss | gap <86, `15×combo`, window 2.5s | risk/reward economy |
| durations | shield 12s, magnet 10s, slow 7s | power fantasy |

## 7. Invariants for future edits
- Never set `player.y` directly from input — always go through acceleration.
- Spawners only run when `state==='playing'` and outside the safe zone.
- Every new entity needs: spawn fn + update/collide block + draw fn + filter line.
- Keep `updateHud()` cheap — it runs every frame.
