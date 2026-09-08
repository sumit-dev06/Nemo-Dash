// ---------- audio: real SFX files + procedural bed + generated score ----------
// Recordings: assets/sfx/*.mp3 (Mixkit, royalty-free — credit in docs/AUDIO.md).
// Water ambience, bubbles and (as of v3.0) the MUSIC are generated in WebAudio.
// Every file SFX keeps a synth fallback, so a missing/blocked file degrades to
// beeps, never silence.
//
// Music note tables (D natural minor). Melody notes are the D minor pentatonic in
// Hz — D4 F4 G4 A4 C5 D5 — so the walked line can never hit a sour interval; the
// pluck layer doubles them an octave up when the game gets frantic.
const MUS_PENT = [293.66, 349.23, 392.0, 440.0, 523.25, 587.33];
// Melody patterns, as indices into MUS_PENT; -1 is a rest, and the rests are the
// point — a line with no gaps reads as a ringtone.
const MUS_PAT = [
  [0, -1, 2, 3, -1, 1, 2, -1],
  [4, 3, -1, 2, 0, -1, 1, -1],
  [0, 2, 3, -1, 4, -1, 3, 2],
  [-1, 1, 2, 4, -1, 3, -1, 0],
];
// i - VI - III - VII in D minor (Dm, B♭, F, C): the standard "vast and a little
// sad" cycle. Full triads (root position) — earlier B♭/F were root+fifth+octave
// power chords and rang hollow against the drone.
const MUS_CHORDS = [
  [146.83, 220.0, 349.23], // Dm  : D3 A3 F4
  [116.54, 146.83, 174.61], // B♭ : B♭2 D3 F3
  [174.61, 220.0, 261.63], // F   : F3 A3 C4
  [130.81, 196.0, 329.63], // C   : C3 G3 E4
];
const SFX_FILES = {
  click: 'click.mp3',
  coin: 'coin.mp3',
  near: 'near.mp3',
  hurt: 'hurt.mp3',
  chomp: 'chomp.mp3',
  gulp: 'gulp.mp3',
  locked: 'locked.mp3',
  lunge: 'lunge.mp3',
  boost: 'boost.mp3',
  empty: 'empty.mp3',
  trap: 'trap.mp3',
  shield: 'shield.mp3',
  splash: 'splash.mp3',
  power: 'power.mp3',
  win: 'win.mp3',
  lose: 'lose.mp3',
  roar: 'roar.mp3',
  heart: 'heart.mp3',
  zap: 'zap.mp3',
  snap: 'snap.mp3',
};
const AudioSys = {
  ctx: null,
  master: null,
  sfxBus: null, // effects: file SFX + synth cues (own volume)
  musBus: null, // background: generated score + sea bed (own volume)
  musVol: 0.55, // background default 55% — the old full-blast score was too loud
  sfxVol: 1.0,
  muted: false,
  ambientNodes: null,
  pools: null, // name -> [{el, ok}] x3, each routed through master (mute-safe)
  mus: null, // procedural music engine (see musicInit)
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
      // two sub-buses so music and effects get SEPARATE volumes (old: one
      // master, mute killed both). Volumes persist across sessions.
      try {
        const mv = parseFloat(localStorage.getItem('nemoMusVol'));
        if (isFinite(mv)) this.musVol = clamp(mv, 0, 1);
        const sv = parseFloat(localStorage.getItem('nemoSfxVol'));
        if (isFinite(sv)) this.sfxVol = clamp(sv, 0, 1);
        this.muted = localStorage.getItem('nemoMuted') === '1';
      } catch (e) {}
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = this.sfxVol;
      this.sfxBus.connect(this.master);
      this.musBus = this.ctx.createGain();
      this.musBus.gain.value = this.musVol;
      this.musBus.connect(this.master);
      if (this.muted) this.master.gain.value = 0;
      this.startAmbient();
      this.ensureMedia();
      this.musicInit();
    } catch (e) {
      /* no audio */
    }
  },
  setMuted(m) {
    this.muted = m;
    try {
      localStorage.setItem('nemoMuted', m ? '1' : '0');
    } catch (e) {}
    if (this.master) this.master.gain.value = m ? 0 : 0.55;
  },
  setMusicVol(v) {
    this.musVol = clamp(v, 0, 1);
    try {
      localStorage.setItem('nemoMusVol', String(this.musVol));
    } catch (e) {}
    if (this.musBus) this.musBus.gain.setTargetAtTime(this.musVol, this.ctx.currentTime, 0.05);
  },
  setSfxVol(v) {
    this.sfxVol = clamp(v, 0, 1);
    try {
      localStorage.setItem('nemoSfxVol', String(this.sfxVol));
    } catch (e) {}
    if (this.sfxBus) this.sfxBus.gain.setTargetAtTime(this.sfxVol, this.ctx.currentTime, 0.05);
  },
  ensureMedia() {
    if (!this.ctx || this.pools) return;
    this.pools = {};
    for (const [name, file] of Object.entries(SFX_FILES)) {
      this.pools[name] = [];
      for (let i = 0; i < 3; i++) {
        try {
          const el = new Audio('assets/sfx/' + file);
          el.preload = 'auto';
          const ch = { el, ok: true };
          el.addEventListener('error', () => {
            ch.ok = false;
          });
          this.ctx.createMediaElementSource(el).connect(this.sfxBus || this.master);
          this.pools[name].push(ch);
        } catch (e) {}
      }
    }
    // unlock warmup: this runs inside the first tap, so touch every pool once —
    // muted, then restored. Guarantees later plays are never blocked as "not allowed".
    for (const name of Object.keys(this.pools)) {
      const ch = this.pools[name][0];
      if (!ch) continue;
      try {
        ch.el.muted = true;
        const pr = ch.el.play();
        if (pr && pr.then)
          pr.then(() => {
            try {
              ch.el.pause();
              ch.el.currentTime = 0;
              ch.el.muted = false;
            } catch (e) {}
          }).catch(() => {
            try {
              ch.el.muted = false;
            } catch (e) {}
          });
      } catch (e) {}
    }
  },
  // stop a named SFX pool immediately (used when a new run starts —
  // the lose sting must never bleed into the fresh game).
  stop(name) {
    try {
      const pool = this.pools && this.pools[name];
      if (!pool) return;
      for (const ch of pool) {
        try {
          ch.el.pause();
          ch.el.currentTime = 0;
        } catch (e) {}
      }
    } catch (e) {}
  },
  stopEndStings() {
    this.stop('lose');
    this.stop('roar');
    this.stop('trap');
    this.stop('hurt');
    try {
      if (typeof engulfT !== 'undefined' && engulfT) {
        clearTimeout(engulfT);
        engulfT = 0;
      }
    } catch (e) {}
  },
  // play a file; returns false when unavailable (caller falls back to synth)
  playFile(name, vol = 0.8, cut = 0, rate = 1) {    if (!this.ctx || this.muted || !this.pools || !this.pools[name]) return false;
    const pool = this.pools[name];
    const ch = pool.find((c) => c.ok && (c.el.paused || c.el.ended)) || pool.find((c) => c.ok);
    if (!ch) return false;
    try {
      ch.el.pause();
      ch.el.currentTime = 0;
      ch.el.volume = vol;
      ch.el.playbackRate = rate;
      const pr = ch.el.play();
      if (pr && pr.catch) pr.catch(() => {});
      if (cut > 0)
        setTimeout(() => {
          // fade out ~75ms, never hard-pause: stopping a loud file mid-wave
          // is a click, and cut() is used on the longest samples
          try {
            const el = ch.el,
              v0 = el.volume;
            let k = 3;
            const iv = setInterval(() => {
              try {
                el.volume = (v0 * --k) / 3;
                if (k <= 0) {
                  clearInterval(iv);
                  el.pause();
                  el.volume = v0;
                }
              } catch (e) {
                clearInterval(iv);
              }
            }, 25);
          } catch (e) {}
        }, cut);
      return true;
    } catch (e) {
      return false;
    }
  },
  tone(freq, dur, type = 'sine', vol = 0.25, slideTo = null, delay = 0) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(),
      g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(this.sfxBus || this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  },
  noiseBurst(dur = 0.2, filterFreq = 1200, vol = 0.3, delay = 0) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.max(1, (dur * this.ctx.sampleRate) | 0);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    // fade IN over ~4ms: a buffer starting at full-scale noise is a click,
    // and this fires on every hit/scrape/hat — the background "cracking".
    const ramp = Math.max(1, Math.floor(0.004 * this.ctx.sampleRate));
    for (let i = 0; i < len; i++)
      d[i] = (Math.random() * 2 - 1) * (1 - i / len) * Math.min(1, i / ramp);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = filterFreq;
    f.Q.value = 0.9;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(f);
    f.connect(g);
    g.connect(this.sfxBus || this.master);
    src.start(t0);
  },
  click() {
    if (!this.playFile('click', 0.8)) this.tone(700, 0.08, 'triangle', 0.2, 900);
  },
  coin() {
    if (!this.playFile('coin', 0.9)) {
      this.tone(950, 0.12, 'sine', 0.28, 1500);
      this.tone(1420, 0.18, 'sine', 0.22, 1900, 0.07);
    }
  },
  nearMiss(n) {
    if (!this.playFile('near', 0.65, 0, 1 + n * 0.06))
      this.tone(500 + n * 60, 0.14, 'square', 0.12, 900 + n * 60);
  },
  hurt() {
    if (!this.playFile('hurt', 1.0)) {
      this.noiseBurst(0.3, 300, 0.5);
      this.tone(220, 0.35, 'sawtooth', 0.25, 70);
    }
  },
  graze() {
    // soft side-bump thud (same recording, gentle volume)
    if (!this.playFile('hurt', 0.45)) this.tone(150, 0.15, 'sine', 0.15, 90);
  },
  chomp() {
    if (!this.playFile('chomp', 1.0)) {
      this.noiseBurst(0.12, 900, 0.4);
      this.tone(180, 0.12, 'square', 0.2, 90);
    }
  },
  gulp() {
    if (!this.playFile('gulp', 1.0, 1000)) {
      this.noiseBurst(0.09, 1900, 0.4);
      this.tone(210, 0.09, 'square', 0.3, 85);
      this.tone(420, 0.14, 'sine', 0.25, 180, 0.08);
      this.tone(520, 0.1, 'sine', 0.18, 940, 0.18);
    }
  },
  locked() {
    if (!this.playFile('locked', 0.9)) {
      this.tone(150, 0.1, 'sine', 0.3, 110);
      this.tone(110, 0.14, 'triangle', 0.22, 85, 0.09);
    }
  },
  lunge() {
    if (!this.playFile('lunge', 0.8)) {
      this.noiseBurst(0.35, 2600, 0.16);
      this.tone(160, 0.4, 'sawtooth', 0.14, 620);
    }
  },
  bossRoar() {    // the boss's opening bellow: a low chesty growl over a sub thump, so the
    // player hears SIZE before they see it. Rough, not pretty — it's a threat.
    if (!this.playFile('lunge', 0.9)) {
      this.tone(55, 1.1, 'sawtooth', 0.3, 40);
      this.tone(82, 0.9, 'triangle', 0.24, 58, 0.05);
      this.noiseBurst(0.55, 180, 0.5, 0.08);
      this.noiseBurst(0.3, 1400, 0.2, 0.12); // the wet rasp
    }
  },
  bossStrike() {
    // strike whoosh: water parting + low thump. NOT the boost sound — the old
    // code reused boost() here so every boss attack sounded like the player.
    this.noiseBurst(0.35, 700, 0.35);
    this.tone(140, 0.3, 'sine', 0.3, 60);
  },
  boost() {
    if (!this.playFile('boost', 0.8, 900)) {
      this.noiseBurst(0.4, 900, 0.3);
      this.tone(300, 0.45, 'sine', 0.22, 980);
    }
  },
  boostEmpty() {
    if (!this.playFile('empty', 0.8)) this.tone(320, 0.16, 'sine', 0.2, 140);
  },
  ability() {
    this.tone(523, 0.14, 'triangle', 0.2);
    this.tone(784, 0.2, 'triangle', 0.2, null, 0.09);
    this.noiseBurst(0.2, 1800, 0.15, 0.02);
  },
  buy() {
    this.tone(880, 0.1, 'sine', 0.16);
    this.tone(1320, 0.16, 'sine', 0.14, null, 0.08);
  },
  trap() {
    if (!this.playFile('trap', 1.0, 1500)) {
      this.noiseBurst(0.2, 500, 0.45);
      this.tone(140, 0.5, 'sawtooth', 0.3, 55);
      this.tone(90, 0.7, 'triangle', 0.3, 45, 0.1);
    }
  },
  shieldBreak() {
    if (!this.playFile('shield', 0.9)) {
      this.noiseBurst(0.25, 2400, 0.35);
      this.tone(1200, 0.3, 'sine', 0.25, 300);
    }
  },
  bubble() {
    this.tone(rand(400, 900), 0.12, 'sine', 0.08, rand(900, 1600));
  },
  splash() {
    if (!this.playFile('splash', 0.8)) this.noiseBurst(0.35, 700, 0.35);
  },
  power() {
    if (!this.playFile('power', 0.9))
      [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.16, 'triangle', 0.2, null, i * 0.07));
  },
  win() {
    if (!this.playFile('win', 1.0, 2600)) {
      [523, 659, 784, 1046, 1318, 1568].forEach((f, i) =>
        this.tone(f, 0.28, 'triangle', 0.24, null, i * 0.1),
      );
      this.noiseBurst(0.6, 3000, 0.12, 0.2);
    }
  },
  lose() {
    if (!this.playFile('lose', 1.0, 3600))
      [400, 340, 280, 200, 140].forEach((f, i) =>
        this.tone(f, 0.3, 'sawtooth', 0.16, f * 0.8, i * 0.13),
      );
  },
  engulf() {
    if (!this.playFile('roar', 1.0, 1200)) {
      // 🦈 SWALLOWED WHOLE — deep lunge roar + gulp + horror sting + dread rumble
      this.tone(110, 0.7, 'sawtooth', 0.5, 35);
      this.tone(82, 0.8, 'square', 0.3, 30, 0.05);
      this.noiseBurst(0.25, 500, 0.5, 0.05);
      this.noiseBurst(0.3, 250, 0.6, 0.35);
      this.tone(160, 0.2, 'square', 0.35, 60, 0.35);
      [330, 311, 294, 262].forEach((f, i) =>
        this.tone(f, 0.35, 'sawtooth', 0.18, f * 0.94, 0.7 + i * 0.16),
      );
      this.tone(55, 1.4, 'sine', 0.4, 28, 0.4);
    }
  },
  heartbeat() {
    if (!this.playFile('heart', 0.9)) {
      this.tone(65, 0.12, 'sine', 0.5);
      this.tone(55, 0.14, 'sine', 0.4, null, 0.18);
    }
  },
  zap() {
    // jellyfish sting: electric crackle
    if (!this.playFile('zap', 0.9, 800)) {
      this.tone(1800, 0.12, 'square', 0.2, 300);
      this.noiseBurst(0.12, 3200, 0.25);
    }
  },
  snap() {
    // crab claw snap: hard woody pop
    if (!this.playFile('snap', 0.85)) this.noiseBurst(0.07, 1500, 0.35);
  },

  // ---------- new v3.0 cues: every event that used to happen in silence ----------
  // A runner is mostly read through sound: v2.8 landed a steel cage on the seabed
  // beside you with no noise at all, dropped hooks into the water silently, let
  // buffs expire without telling you, and played the CRAB CLAW sample when you
  // slammed into the sand. Each of these is generated, so none of them costs a
  // download and all of them survive offline.
  thud(vol) {
    // heavy object meeting the seabed: low body + damped sand slap
    const v = vol == null ? 1 : vol;
    this.tone(96, 0.26, 'sine', 0.3 * v, 44);
    this.noiseBurst(0.2, 210, 0.34 * v);
  },
  netLand() {
    // cage hitting the floor: the thud, then the mesh ringing
    this.thud(1);
    this.tone(420, 0.16, 'square', 0.05, 300, 0.05);
    this.noiseBurst(0.14, 2600, 0.07, 0.06);
  },
  slam() {
    // the FISH hitting the sand — softer and wetter than a cage, and clearly
    // not the crab-claw sample v2.8 used here
    this.noiseBurst(0.24, 320, 0.3);
    this.tone(120, 0.2, 'sine', 0.18, 60);
  },
  plink() {
    // hook + line breaking the surface far above: thin, wet, high
    this.tone(1750, 0.07, 'sine', 0.1, 2300);
    this.noiseBurst(0.16, 3400, 0.12, 0.02);
  },
  scrape(k) {
    // belly dragging over rock — filtered noise, pitch rising with how hard you
    // are pressed into it. Deliberately quiet: it repeats while you ride.
    this.noiseBurst(0.13, 520 + (k || 0) * 700, 0.12);
  },
  buffEnd() {
    // "your powerup is going": two falling notes, unmistakably a loss
    this.tone(880, 0.1, 'triangle', 0.12, 660);
    this.tone(660, 0.16, 'triangle', 0.1, 440, 0.09);
  },
  comboUp(n) {
    // combo milestone: a rising pentatonic arpeggio that climbs with the streak
    const base = 523.25 * Math.pow(1.06, Math.min(n, 12));
    for (let i = 0; i < 3; i++)
      this.tone(base * [1, 1.2, 1.5][i], 0.16, 'sine', 0.13, null, i * 0.055);
  },
  gate() {
    // the reef gate coming into view: a bright open fifth, calm not triumphant
    this.tone(587.33, 0.5, 'sine', 0.1, null, 0);
    this.tone(880, 0.55, 'sine', 0.08, null, 0.06);
  },
  boss() {
    // the boss rising out of the dark: a low brass-ish swell + a rising fifth,
    // set against a held low drum so it reads as "something big just woke up"
    if (!this.playFile('boss', 1.0, 2000)) {
      this.tone(82, 1.5, 'sawtooth', 0.3, 62);
      this.tone(123, 1.1, 'triangle', 0.22, 98, 0.03);
      this.tone(184, 0.7, 'sine', 0.16, 166, 0.7);
      this.noiseBurst(0.35, 220, 0.45, 0.05);
    }
  },
  bossDown() {
    // the boss defeated: a falling triumphant run that lands on a big open fifth
    if (!this.playFile('bossDown', 1.0, 2200)) {
      [220, 262, 330, 440, 523].forEach((f, i) =>
        this.tone(f, 0.26, 'triangle', 0.24, null, i * 0.11),
      );
      this.tone(660, 0.9, 'triangle', 0.26, 880, 0.55);
      this.noiseBurst(0.7, 3400, 0.14, 0.2);
    }
  },

  // ---------- procedural adaptive music ----------
  // v3.0 deletes assets/sfx/music.mp3 (a fixed island loop that repeated every
  // ~30s and knew nothing about the game) and generates the score instead:
  //   1. it REACTS — the mix rises as hunters close in and falls back when the
  //      water empties out, so the music is part of the danger read, and
  //   2. it never repeats, because the melody is walked rather than recorded, and
  //   3. it is free: nothing to download (the PWA works offline at every reef) and
  //      WebAudio oscillators run on the audio thread, so the render loop pays
  //      nothing. On a low-end phone this is cheaper than decoding an mp3.
  //
  // Musically: D natural minor. The melody is confined to the D minor PENTATONIC
  // (D F G A C), where no two notes can clash — so a walked line always sounds
  // deliberate. Chords cycle i-VI-III-VII (Dm-B♭-F-C), the standard "vast and a
  // bit sad" progression, which is what an ocean should sound like.
  // Four layers, each faded in by intensity, so the mix IS the difficulty meter:
  //   drone   always      two detuned oscillators a fifth apart — deep water
  //   pad     always      slow chord swells — the ocean breathing
  //   pluck   i > 0.16    the melody; its register climbs with danger
  //   pulse   i > 0.34    bass thump on the beat, plus a hat above 0.72 — the chase
  musicInit() {
    if (!this.ctx || this.mus) return;
    try {
      const c = this.ctx;
      const bus = c.createGain();
      bus.gain.value = 0.32; // was 0.44 — the generated score sat over everything
      // one lowpass over the whole score: underwater has no top end, and it also
      // stops the plucks from ever sounding shrill on phone speakers
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1900;
      lp.Q.value = 0.5;
      bus.connect(lp);
      lp.connect(this.musBus || this.master);
      const layer = (v) => {
        const g = c.createGain();
        g.gain.value = v;
        g.connect(bus);
        return g;
      };
      const droneG = layer(0.0001),
        padG = layer(0.0001),
        pluckG = layer(0.0001),
        pulseG = layer(0.0001);
      // drone: D1 + D2 + A2, slightly detuned against each other so it beats
      // slowly instead of sitting still. Three oscillators, started once, forever.
      const drones = [];
      for (const [f, d, ty] of [
        [36.71, 0, 'sine'],
        [73.42, 5, 'triangle'],
        [110.0, -4, 'sine'],
      ]) {
        const o = c.createOscillator();
        o.type = ty;
        o.frequency.value = f;
        o.detune.value = d;
        const g = c.createGain();
        g.gain.value = ty === 'triangle' ? 0.3 : 0.8;
        o.connect(g);
        g.connect(droneG);
        o.start();
        drones.push(o);
      }
      // one reusable noise buffer for the hat (allocating a buffer per hit would
      // be the only expensive thing in here)
      const nlen = (0.12 * c.sampleRate) | 0;
      const nbuf = c.createBuffer(1, nlen, c.sampleRate);
      const nd = nbuf.getChannelData(0);
      // fade the attack in (~5ms): hat hits every offbeat at high intensity and
      // a full-scale first sample reads as background cracking
      const hramp = Math.max(1, Math.floor(0.005 * c.sampleRate));
      for (let i = 0; i < nlen; i++)
        nd[i] = (Math.random() * 2 - 1) * (1 - i / nlen) * Math.min(1, i / hramp);
      this.mus = {
        bus,
        droneG,
        padG,
        pluckG,
        pulseG,
        drones,
        nbuf,
        i: 0.1, // smoothed intensity
        target: 0.1,
        boss: false, // boss fight: scheduler floors the intensity (musicBoss)
        next: c.currentTime + 0.15,
        step: 0,
        bar: 0,
        mel: 0, // index into the current melody pattern
        timer: null,
        duck: 0, // >0 = pull the score down (death, menus)
      };
      this.musicTick();
    } catch (e) {
      this.mus = null;
    }
  },
  // The game calls this every frame with 0..1. It only stores a number — all the
  // scheduling happens on the audio timer below, so the render loop is untouched.
  musicIntensity(v) {
    if (this.mus) this.mus.target = v < 0 ? 0 : v > 1 ? 1 : v;
  },
  musicDuck(sec) {
    if (this.mus) this.mus.duck = sec == null ? 2.2 : sec;
  },
  // "boss mode": pin the intensity floor high and add a low ostinato pulse so the
  // score has a distinct "something big" tension the moment a boss rises. Cheap:
  // toggles a flag; the scheduler reads it once per 90ms tick.
  musicBoss(on) {
    if (this.mus) this.mus.boss = !!on;
  },
  musicScale(freqs) {
    // per-biome melody scale (see BIOMES[x].scale): the engine is one loop, but
    // the notes it walks change with the water. Called by setActiveBiome().
    if (this.mus) this.mus.scale = freqs && freqs.length ? freqs : null;
  },
  // Look-ahead scheduler. Runs on a timer (NOT the animation frame): it wakes every
  // ~90ms and books every note due in the next 350ms against the audio clock, so
  // the groove is sample-accurate even when the render loop stutters or the phone
  // throttles the tab. This is the standard WebAudio two-clock pattern.
  musicTick() {
    const m = this.mus;
    if (!m) return;
    const c = this.ctx;
    m.timer = setTimeout(() => this.musicTick(), 90);
    let tgt = m.target;
    try {
      if (typeof state !== 'undefined' && state !== 'playing') tgt = 0.08; // menus: bed only
    } catch (e) {}
    try {
      // boss fight: the score is held at a high floor and the drone gains a slow
      // pulse, so the fight has a tension the reef never has. Floors, not a jump
      // — the player still drives it up with near-misses.
      if (m.boss) tgt = Math.max(tgt, 0.55);
    } catch (e) {}
    if (m.duck > 0) {
      m.duck -= 0.09;
      tgt = 0;
    }
    m.i += (tgt - m.i) * 0.07; // ~1.2s to cross the whole range: a swell, not a jump
    const i = m.i;
    const ct = c.currentTime;
    if (m.next < ct - 0.2) {
      // timer stalled (throttled tab / slow phone): drop the backlog, skip beats.
      // Without this every late note is re-booked "now" as one stacked blast.
      m.next = ct + 0.05;
    }
    m.droneG.gain.setTargetAtTime(0.15 + i * 0.05, ct, 0.6);
    m.padG.gain.setTargetAtTime(0.085 + i * 0.05, ct, 0.8);
    m.pluckG.gain.setTargetAtTime(Math.max(0, (i - 0.16) * 0.9) * 0.42, ct, 0.5);
    m.pulseG.gain.setTargetAtTime(Math.max(0, (i - 0.34) * 1.4) * 0.5, ct, 0.4);
    if (this.muted) {
      // keep the clock moving so the groove does not jump when sound comes back,
      // but create nothing: a muted game should cost zero audio work
      const spb0 = 60 / (82 + i * 22);
      while (m.next < ct + 0.35) {
        m.next += spb0 * 0.5;
        m.step++;
      }
      return;
    }
    const spb = 60 / (82 + i * 22); // 82 BPM adrift → 104 BPM hunted
    const eighth = spb * 0.5;
    while (m.next < ct + 0.35) {
      const t = Math.max(m.next, ct + 0.015);
      const step = m.step & 7;
      if (step === 0) {
        m.bar++;
        this.musicChord(t, spb * 4);
      }
      // melody: 8th-note pentatonic walk, rests included so it breathes
      if (i > 0.16) {
        const pat = MUS_PAT[(m.bar + (i > 0.6 ? 1 : 0)) % MUS_PAT.length];
        const deg = pat[m.step % pat.length];
        if (deg >= 0) {
          const oct = i > 0.55 && (m.step & 3) === 0 ? 2 : 1;
          const scale = m.scale || MUS_PENT; // per-biome mode (BIOMES[x].scale)
          this.musicPluck(scale[deg % scale.length] * oct, t, spb);
        }
      }
      // pulse: beats 1 and 3 of the bar (steps 0 and 4), hat on the offbeats
      if (i > 0.34 && (step === 0 || step === 4)) this.musicThump(t, i);
      if (i > 0.72 && step % 2 === 1) this.musicHat(t, i);
      m.next += eighth;
      m.step++;
    }
  },
  musicChord(t, dur) {
    const m = this.mus,
      c = this.ctx;
    const ch = MUS_CHORDS[m.bar % MUS_CHORDS.length];
    for (let k = 0; k < ch.length; k++) {
      const o = c.createOscillator();
      o.type = k === 0 ? 'triangle' : 'sine';
      o.frequency.value = ch[k];
      o.detune.value = (k - 1) * 4;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(k === 0 ? 0.5 : 0.32, t + dur * 0.42); // slow swell
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 1.05);
      o.connect(g);
      g.connect(m.padG);
      o.start(t);
      o.stop(t + dur * 1.1);
    }
  },
  musicPluck(f, t, spb) {
    const m = this.mus,
      c = this.ctx;
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.012); // hard attack = plucked
    g.gain.exponentialRampToValueAtTime(0.0001, t + spb * 0.9);
    o.connect(g);
    g.connect(m.pluckG);
    o.start(t);
    o.stop(t + spb);
  },
  musicThump(t, i) {
    const m = this.mus,
      c = this.ctx;
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(72, t);
    o.frequency.exponentialRampToValueAtTime(34, t + 0.16);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.6 + i * 0.3, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    o.connect(g);
    g.connect(m.pulseG);
    o.start(t);
    o.stop(t + 0.3);
  },
  musicHat(t, i) {
    const m = this.mus,
      c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = m.nbuf; // reused buffer: no per-hit allocation
    const f = c.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 5200;
    const g = c.createGain();
    g.gain.value = 0.1 + (i - 0.72) * 0.2;
    s.connect(f);
    f.connect(g);
    g.connect(m.pulseG);
    s.start(t);
  },
  startAmbient() {
    if (!this.ctx || this.ambientNodes) return;
    try {
      // underwater bed: low filtered brown-ish noise + slow LFO + sparse droplet blips
      const len = 2 * this.ctx.sampleRate;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.2;
      }
      // seamless loop: crossfade the last 0.25s into the head shape, so the
      // 2s wrap has no step (a step here ticks audibly, forever, underneath)
      const xf = Math.floor(0.25 * this.ctx.sampleRate);
      for (let j = 0; j < xf; j++) {
        const t = j / xf;
        d[len - xf + j] = d[len - xf + j] * (1 - t) + d[j] * t;
      }
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 320;
      lp.Q.value = 0.4;
      const g = this.ctx.createGain();
      g.gain.value = 0.16;
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 0.12;
      const lfoG = this.ctx.createGain();
      lfoG.gain.value = 0.06;
      lfo.connect(lfoG);
      lfoG.connect(g.gain);
      src.connect(lp);
      lp.connect(g);
      g.connect(this.musBus || this.master);
      src.start();
      lfo.start();
      this.ambientNodes = { src, lfo };
      const droplet = () => {
        if (!this.muted && state === 'playing' && Math.random() < 0.6) this.bubble();
        setTimeout(droplet, rand(900, 2600));
      };
      setTimeout(droplet, 1200);
    } catch (e) {}
  },
};
