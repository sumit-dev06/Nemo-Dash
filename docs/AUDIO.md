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
| background music | music.mp3 | Island Beat (Contemporary R&B) — soft loop |
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

## 4. Rules for new sounds
- Route everything through `AudioSys.playFile(name, vol, cut, rate)` with a synth fallback.
- Keep volumes ≤0.9, trim long tails with `cut`; prefer pitch/rate over loudness.
- Test with mute toggle + rapid retrigger (coin chains) — pools of 3 absorb overlaps.

## 5. Next upgrades
1. Music: looping kelp-forest bed under the sea ambience (file, low volume).
2. Mobile: haptics (`navigator.vibrate`) alongside `hurt()` — cheap juice on Android.
