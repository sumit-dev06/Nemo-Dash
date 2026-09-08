# PHYSICS — water feel (most important system) 🌊

> Owner priority: *"the physics should be very real."* This doc is the tuning contract.
> All numbers are live values from `update()` in `js/update.js`. Change code + this doc together.
> Fairness caps (v1.3): world speed caps at 285 (levels) / 300 (endless); spawn gaps floored
> (~1.0s levels, ~0.85s endless); net falls scale with reef speed — runs stay hard, never impossible.

## 1. Player vertical water model (per frame, `dt` clamped ≤ 0.033s)

```
ACC = 2400 px/s², MAXV = 560 px/s
ay = keyboard(±ACC) + pointerSpring + bob + currents
pointerSpring = (pointerY - y) * 16  -  vy * 3.2     // spring-damper => laggy underwater chase
bob         = sin(time * 2.1) * 36                   // gentle buoyancy breathing
vy += ay * dt
vy *= exp(-2.4 * dt)                                 // quadratic-ish water drag
vy = clamp(vy, -MAXV, +MAXV)
y  += vy * dt
```

Why it feels like water: **force → velocity → position** (never set position directly),
heavy exponential drag, spring lag on touch, and a constant buoyancy sine so Nemo never sits dead still.

- **Walls:** ceiling `y=46` (soft bounce 0.3×), floor `FLOOR_Y-24` (bounce 0.25×; hard slam >260px/s hurts — crab-zone slam).
- **Tilt:** `tilt → clamp(vy/900, ±0.55)`, smoothed `1-exp(-8dt)` — nose follows velocity.
- **Tail:** `tail += dt*(9 + |vy|/70 + speed/90)` — kicks harder when working.
- **Gills:** bubble every 0.25–0.6s + occasional blip.

## 2. Currents (the reef pushes back)
- 0 bands L1, 1 band L2, up to 3 bands L3+; each `{y, h 70–130, ±direction, strength 140–240 + level*22}`.
- Applied as pure acceleration inside the band; rendered as animated teal flow lines so pushes are readable.
- Design rule: bands must be **visible before felt** — never spawn a band covering full height.

## 3. Everything else that moves (same `dt`, same world speed)
- **World:** `distance/scollX += effSpeed*dt`; slow powerup ×0.62 (predators ×0.6 too — consistent).
- **Predators:** `vx = -(speed*(0.55–0.85) + 60) * predSpeedMul`; sine wobble; L2+ hunter steer
  `y += clamp((playerY-y)*1.6, ±90) * dt * (0.5 + level*0.08)` — deliberately slower than player so jukes work.
- **Jellies:** drift `-(speed*0.45+30)`, pulse-steer `cos(phase)*50*dt`.
- **Nets:** 0.9s warning hover → fall `120–170 + level*12` px/s → rest on floor, drift left 0.85×.
- **Hooks:** sway pendulum, drift left 0.5× world speed.
- **Bubbles:** rise −40…−90 px/s + sine wobble; gill bubbles + ambient floor bubbles (8/s).
- **Marine snow:** 90 motes, depth `z 0.2–1`, drift `(20 + z*60) × speed/220` — sells forward motion + depth.
- **Hit feedback:** shake decay 30/s, flash decay 2.2/s, slow-mo 0.35× for 0.35s on damage.

## 4. Collision (circle-based, forgiving)
`circleHit()` with reduced radii: player ×0.8 (×0.75 tail/hook), predator body `size*0.32`,
jelly `r+6`. Nets use clamped-point-vs-circle ×0.7. Forgiving on purpose — near-misses fuel the combo game.

## 5. Tuning guide (what to touch when playtest says…)
| Complaint | Knob | Direction |
|---|---|---|
| Sluggish / floaty | `ACC` 2400 / drag 2.4 / spring 16 | ACC↑, drag↓ slightly, spring↑ |
| Too twitchy | drag / damper 3.2 | drag↑ or damper↑ |
| Touch lags too much | spring `16 / 3.2` | both up proportionally |
| Levels too hard | `predEvery`, `predSpeedMul`, hunter gain | intervals↑, mul↓ |
| Currents unfair | band `strength`, `h` | strength↓, h↓ |

## 6. Engine note (Phaser verdict)
Phaser Arcade/Matter would **not** give this feel for free — both need the same custom
drag/spring/buoyancy layered on top. Keep this hand-tuned model as the reference implementation;
if we migrate to Phaser, port these exact constants into the Phaser scene rather than adopting
default arcade gravity/friction.

## 7. Performance contract (v1.9 — 10k phones must hold 60fps, zero visual loss)
- Static layers baked once per resize (`bakeBackground`): one blit replaces ~8 fullscreen gradients.
- Dynamic resolution (`DPR`/`dprTarget` in `utils.js`, monitor in `loop()`): pixel count steps
  down/up with frame time — art, fairness and gameplay never change, only pixel density.
- No backdrop-blur on touch GPUs (flat fills, same look); angler glow is a pre-rendered
  sprite; all body gradients memoized (`grad()` — no per-frame allocation churn).
- Fin flaps are pure sine + tiny fills: immeasurable cost, verified no regression.
## 8. v3.0 — velocity-driven animals (hunters, jellies, fry)
The predators/jellies left the position-driven model for a real two-axis one. Every
hazard now owns `vy` and derives its drawn body angle from it, so a fish that climbs is
nose-up instead of gliding sideways perfectly level.

```
FOE_VY_MAX = 205 px/s            // measured ceiling of the old model, kept as the cap
kFoe = 1 - exp(-6 * dt)          // one shared exp per frame, used by every entity
wantVy: each state writes its target vertical speed (hunter steer, wobble, lunge)
vy += (wantVy - vy) * kFoe       // smooth approach — nothing snaps vertically
vy  = clamp(vy, -FOE_VY_MAX, FOE_VY_MAX)
y  += vy * dt * slowM
pitch += (clamp(atan2(vy, fwd)*0.72, -0.6, 0.6) - pitch) * kFoe
```

The visible body angle is `atan2(vy, |vx|)` (clamped, scaled 0.72) — the faster the dive
or climb, the steeper the fish sits, and it eases back to level on the straight. Hunters
never swim backwards: the curve that would have produced a rightward `vx` is discarded.

**Jellies pulse-propulse.** A bell contraction (`s > 0.6`) fires one `vy -= thrust`
impulse (52–74), then negative buoyancy (+26·dt), station-keeping toward `y0`
(`(y0-y)*0.6*dt` — keeps the authored wave doors open), and an exponential damp
(`dampJ = exp(-2.2·dt)`). So a jelly *drifts* around its depth in pulses rather than
gliding in a straight line.

**Fry school + scatter.** `want = (sy + oy - y)*3.2 + s*30` holds formation with a
wiggle; within ~122 px of Nemo they add a ±210 px/s flee and +40 px/s downstream so a
school *parts* around you. All clamped to the swim band.

Cost note: this is NET-cheaper than what it replaced — the renderer now calls
`Math.exp` twice per frame total (not once per entity) and jelly tentacles render in one
path stroke, five `beginPath`/`stroke` calls removed.
