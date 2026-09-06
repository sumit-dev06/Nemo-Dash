// ---------- audio: real SFX files + procedural bed ----------
// Recordings: assets/sfx/*.mp3 (Mixkit, royalty-free — credit in docs/AUDIO.md).
// Water ambience + bubbles stay procedural (owner-approved). Every file SFX keeps a
// synth fallback, so a missing/blocked file degrades to beeps, never silence.
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
  muted: false,
  ambientNodes: null,
  pools: null, // name -> [{el, ok}] x3, each routed through master (mute-safe)
  musicEl: null, // looping background tune (single element, low volume)
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
      this.startAmbient();
      this.ensureMedia();
      this.ensureMusic();
    } catch (e) {
      /* no audio */
    }
  },
  ensureMusic() {
    // background tune: soft island loop under everything (owner request)
    if (!this.ctx || this.musicEl) return;
    try {
      const el = new Audio('assets/sfx/music.mp3');
      el.preload = 'auto';
      el.loop = true;
      el.volume = 0.3;
      this.ctx.createMediaElementSource(el).connect(this.master);
      const pr = el.play();
      if (pr && pr.catch) pr.catch(() => {});
      this.musicEl = el;
    } catch (e) {}
  },
  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.55;
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
          this.ctx.createMediaElementSource(el).connect(this.master);
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
  // play a file; returns false when unavailable (caller falls back to synth)
  playFile(name, vol = 0.8, cut = 0, rate = 1) {
    if (!this.ctx || this.muted || !this.pools || !this.pools[name]) return false;
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
          try {
            ch.el.pause();
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
    g.connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  },
  noiseBurst(dur = 0.2, filterFreq = 1200, vol = 0.3, delay = 0) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.max(1, (dur * this.ctx.sampleRate) | 0);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
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
    g.connect(this.master);
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
  boost() {
    if (!this.playFile('boost', 0.8, 900)) {
      this.noiseBurst(0.4, 900, 0.3);
      this.tone(300, 0.45, 'sine', 0.22, 980);
    }
  },
  boostEmpty() {
    if (!this.playFile('empty', 0.8)) this.tone(320, 0.16, 'sine', 0.2, 140);
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
      g.connect(this.master);
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
