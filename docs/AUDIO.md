# AUDIO — real recordings + procedural bed 🔊

18 real SFX in `assets/sfx/*.mp3`, sourced from Mixkit (mixkit.co, royalty-free license —
thank you!). Water-sea ambience + bubble blips stay procedural (WebAudio) per owner taste.

## 1. File bank (`SFX_FILES` + `pools` in `js/audio.js`)
| Game call | File | Mixkit title |
|---|---|---|
| click | click.mp3 | Cool interface click tone |
| coin (pearl) | coin.mp3 | Arcade game jump coin |
| near-miss | near.mp3 | Fast whoosh transition (pitched up with combo!) |
| hurt / graze | hurt.mp3 | Falling hit on gravel (graze at low volume) |
| chomp (bite) | chomp.mp3 | Human bites a juicy sausage |
| gulp (eat) | gulp.mp3 | Animal eating juicy meat |
| shield | shield.mp3 | Fairy arcade sparkle |
| splash (net warn) | splash.mp3 | Water splash |
| power | power.mp3 | Fairy magic sparkle |
| win | win.mp3 | Quick win video game notification |
| lose | lose.mp3 | Slow sad trombone fail |
| locked | locked.mp3 | Wood hard hit |
| lunge warn | lunge.mp3 | Bubble pop up alert notification |
| boost | boost.mp3 | Fast rocket whoosh |
| boost empty | empty.mp3 | Dry pop up notification alert |
| engulf | roar.mp3 | Aggressive beast roar |
| heartbeat | heart.mp3 | Human single heart beat |
| trap (cage) | trap.mp3 | Creaky door open |
| jelly sting | zap.mp3 | Electricity lightning blast |
| crab snap | snap.mp3 | Hard pop click |
| background music | — | **generated** — adaptive score, see §5 (music.mp3 is unused as of v3.0) |
| bubbles | — | procedural (kept, owner-approved) |
| sea bed | — | procedural brown-noise loop (kept, owner-approved) |

Each name keeps a pool of 3 `<audio>` elements routed through the master gain (mute-safe),
round-robin for overlaps, optional `cut` (stop long tails) and `rate` (near-miss rises).
`playFile()` returns false when unavailable → every call falls back to the old synth recipe.
Files are precached by `sw.js`, so installed/offline play keeps full sound.
Damage routes by cause: jelly → `zap()`, crab → `snap()`, side-bump → `graze()`, else `hurt()`.
Death timeline for a bite: `chomp()` at the snap instant → `engulf()` roar +250ms →
`lose()` trombone on the game-over panel. Eating plays only the first second of `gulp.mp3`.

## 2. Synth fallback primitives (used only if a file is missing/blocked)
- `tone(freq, dur, type, vol, slideTo, delay)` — enveloped oscillator (attack 15ms, exp decay).
- `noiseBurst(dur, filterFreq, vol, delay)` — decaying noise buffer → bandpass → gain.
- Master gain `0.55`; `setMuted()` → 0. `M` key + 🔊 button + pause-menu toggle.
- Old per-event synth recipes live inline as fallbacks in each `AudioSys` method.

## 3. Ambient bed (`startAmbient()`, once — procedural, kept)
- 2s looping **brown-ish noise** (integrated white noise, `last=(last+0.02w)/1.02`) → lowpass 320 Hz → gain 0.16,
  slow LFO 0.12 Hz breathing ±0.06 — reads as deep-water rumble.
- Random droplet blips every 0.9–2.6s while `state==='playing'`.
- All ambient routes through master, so mute kills it cleanly.

## 4. Generated cues (v3.0 — no file needed)
Every one of these is a few oscillators or one noise burst; none allocate a buffer per hit.
| Game call | What it is | Fires when |
|---|---|---|
| `thud(v)` | 150→48 Hz sine drop + noise skin | generic soft impact |
| `netLand()` | `thud` + iron rattle (3 detuned squares) | a cage hits the seabed |
| `slam()` | 90→34 Hz body-blow + sand noise | you're driven into the seabed |
| `plink()` | 2 short highs, 1180/1760 Hz | a fishing line breaks the surface |
| `scrape(k)` | bandpassed noise, pitch by rock height | riding a boulder's back |
| `buffEnd()` | 3-note fall, 880→392 Hz | shield/magnet/slow has 1.5 s left |
| `comboUp(n)` | pentatonic step up, rises with the combo | every 5th combo |
| `gate()` | open fifth, 392+587 Hz, long tail | the level gate appears |

## 5. The score is generated (v3.0)
v2.8 looped `music.mp3` (an R&B track — wrong ocean, and it never reacted to the game).
v3.0 synthesises the whole thing in `musicInit()`, four layers on their own gain, all under
one lowpass (1900 Hz, Q 0.5) so it sits *under* the water rather than on top of it:

| Layer | Content | Enters at intensity |
|---|---|---|
| drone | 3 oscillators, D1/D2/A2 (36.71 / 73.42 / 110 Hz), detuned 0 / +5 / −4 | always |
| pad | Dm–B♭–F–C, 3-note voicings, slow swell per bar | always |
| pluck | 8th-note pentatonic walk (D minor), 4 patterns with rests | 0.16 |
| pulse | kick on beats 1 and 3 | 0.34 |
| hat | filtered noise on the offbeats | 0.72 |

**Adaptive.** `update.js` writes `AudioSys.musicIntensity(0..1)` every frame from the
Director's live threat weight, plus +0.28 on the last heart and +0.12 while boosting.
The value is *stored*, never acted on in the render loop. Tempo rides it too:
**82 BPM adrift → 104 BPM hunted**. `musicIntensity` moves 7% per tick (~1.2 s across the
whole range) so it swells instead of jumping. Menus clamp it to 0.08 — bed only.
`musicDuck(sec)` drops the score to silence for the death cinematic and the win sting.

**Scheduling.** `musicTick()` runs on a `setTimeout` (90 ms), NOT on the animation frame,
and books every note due in the next 350 ms against `ctx.currentTime`. The groove stays
sample-accurate even when the render loop stutters or the phone throttles the tab — this
is the standard WebAudio two-clock pattern, and it's why the music costs the frame nothing.
When muted the clock still advances but no nodes are created: a muted game costs zero.

## 6. Rules for new sounds
- Route everything through `AudioSys.playFile(name, vol, cut, rate)` with a synth fallback.
- Keep volumes ≤0.9, trim long tails with `cut`; prefer pitch/rate over loudness.
- Test with mute toggle + rapid retrigger (coin chains) — pools of 3 absorb overlaps.

## 7. Next upgrades
1. Per-biome score colour: swap `MUS_CHORDS`/`MUS_PENT` per biome (Abyss = whole-tone, Vents = phrygian).
2. Mobile: haptics (`navigator.vibrate`) alongside `hurt()` — cheap juice on Android.
3. Boss layer: a 5th gain that only exists during a boss fight, driven by its HP.
