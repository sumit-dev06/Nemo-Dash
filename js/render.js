//  RENDER — layered realistic underwater scene
// ============================================================
// Static layers (water, rays, shimmer bar, vignette) are baked once per resize
// into bgCache: one blit replaces ~8 fullscreen gradient fills. Big phone win.
let bgCache = null;
// Current-band motion streaks: fixed table, so the drift is deterministic (no
// per-frame randomness = no flicker) and costs zero allocation.
//   o = start offset 0..1 across the wrap span   y = height 0..1 inside the band
//   len/w = streak size in px                    v = drift speed px/s
//   a = alpha. Long+faint reads as water; short+bright reads as spray, so mix both.
const CUR_STREAKS = [
  { o: 0.02, y: 0.14, len: 150, w: 2.2, v: 210, a: 0.5 },
  { o: 0.31, y: 0.33, len: 96, w: 1.6, v: 260, a: 0.34 },
  { o: 0.18, y: 0.52, len: 190, w: 2.6, v: 185, a: 0.55 },
  { o: 0.62, y: 0.68, len: 120, w: 1.8, v: 240, a: 0.4 },
  { o: 0.79, y: 0.86, len: 164, w: 2.2, v: 200, a: 0.46 },
  { o: 0.47, y: 0.97, len: 82, w: 1.4, v: 285, a: 0.28 },
];
// Jelly tentacle phase offsets, precomputed. The five tentacles are drawn at
// sin(ph + k) for k = -2..2; cos(k)/sin(k) are constants, so the per-frame work
// collapses to two multiplies and an add per tentacle (see drawJelly).
const TENT_C = [Math.cos(-2), Math.cos(-1), 1, Math.cos(1), Math.cos(2)];
const TENT_S = [Math.sin(-2), Math.sin(-1), 0, Math.sin(1), Math.sin(2)];
// lerp two hex colors (bake-time only, never per frame)
function hexLerp(a, b, t) {
  const pa = [1, 3, 5].map((i) => parseInt(a.substr(i, 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.substr(i, 2), 16));
  return (
    '#' +
    pa
      .map((v, i) =>
        Math.round(v + (pb[i] - v) * t)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}
// open-reef → deep-cave water palette, driven by cfg.cave
function waterStops() {
  let k = 0;
  try {
    k = caveK();
  } catch (e) {}
  // the palette is biome-owned now: open reef colours and the cave blend both
  // come from the current biome, so 'Deep Blue' and 'Jellyfish Bloom' stop
  // being the same water in a different shade of blue
  return biomeWaterStops(k);
}
function bakeBackground() {
  // every cache below is keyed on the viewport or the level palette, both of which
  // are exactly what a re-bake means has changed
  try {
    if (typeof _gradCache !== 'undefined') for (const k in _gradCache) delete _gradCache[k];
    if (typeof clearSprites === 'function') clearSprites();
  } catch (e) {}
  try {
    bgCache = document.createElement('canvas');
    bgCache.width = Math.round(W * DPR);
    bgCache.height = Math.round(H * DPR);
    const b = bgCache.getContext('2d');
    b.setTransform(DPR, 0, 0, DPR, 0, 0);
    const { stops, k } = waterStops();
    const g = b.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, stops[0]);
    g.addColorStop(0.35, stops[1]);
    g.addColorStop(0.7, stops[2]);
    g.addColorStop(1, stops[3]);
    b.fillStyle = g;
    b.fillRect(0, 0, W, H);
    b.save();
    // god-ray strength comes from the biome (the wreck and the abyss let almost
    // no light through) and still dies out as the cave closes in
    let lightA = 0.1;
    try { lightA = BIOMES[activeBiome] ? BIOMES[activeBiome].lightAlpha : 0.1; } catch (e) {}
    b.globalAlpha = lightA * (1 - k) + 0.01;
    b.fillStyle = '#bfefff';
    for (let i = 0; i < 4; i++) {
      const bx = 120 + i * 230;
      b.beginPath();
      b.moveTo(bx, 0);
      b.lineTo(bx + 90, 0);
      b.lineTo(bx + 190, H);
      b.lineTo(bx + 60, H);
      b.closePath();
      b.fill();
    }
    b.restore();
    b.fillStyle = 'rgba(140,220,255,0.10)';
    b.fillRect(0, 0, W, 10);
    const v = b.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.85);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,5,12,' + (0.55 + 0.3 * k).toFixed(2) + ')');
    b.fillStyle = v;
    b.fillRect(0, 0, W, H);
  } catch (e) {
    bgCache = null;
  }
}
// ---------- ?perf=1 — numbers instead of impressions ----------
// The whole point of this pass is "must not lag on a low-end phone", and that claim
// is only worth anything if it can be measured ON the phone. Add ?perf=1 to the URL
// (or set PERF.on = true in a console) for a corner panel with the real frame cost.
// ?perf=2 additionally counts canvas calls per frame — that is the number to watch
// when adding art, and it is how the 440-op seabed and the per-frame gradients were
// found. Counting wraps the 2D context, so ?perf=2 is a profiler, not a benchmark:
// read op counts from it and frame times from ?perf=1.
const PERF = {
  on: false,
  ops: false, // count canvas calls
  wrapped: false,
  ms: 0, // last frame's update+render cost
  msEMA: 0,
  msMax: 0,
  dtEMA: 0.016,
  n: 0, // canvas ops this frame
  nEMA: 0,
  g: 0, // gradients built this frame
  gEMA: 0,
  sample(ms, rawDt) {
    this.ms = ms;
    this.msEMA = this.msEMA * 0.9 + ms * 0.1;
    this.dtEMA = this.dtEMA * 0.92 + rawDt * 0.08;
    if (ms > this.msMax) this.msMax = ms;
    this.nEMA = this.nEMA * 0.9 + this.n * 0.1;
    this.gEMA = this.gEMA * 0.9 + this.g * 0.1;
    this.n = 0;
    this.g = 0;
  },
  // wrap the hot context methods so every draw call is counted. Only ever called
  // when ?perf=2 is on — the wrappers themselves cost more than what they measure.
  wrap() {
    this.wrapped = true;
    const COUNT = ['fill','stroke','fillRect','strokeRect','drawImage','beginPath','moveTo','lineTo','arc','ellipse','quadraticCurveTo','bezierCurveTo','closePath','rect','fillText','strokeText','clip','save','restore','translate','rotate','scale'];
    const GRAD = ['createLinearGradient', 'createRadialGradient'];
    const self = this;
    for (const k of COUNT) {
      const f = ctx[k];
      if (typeof f !== 'function') continue;
      ctx[k] = function () {
        self.n++;
        return f.apply(ctx, arguments);
      };
    }
    for (const k of GRAD) {
      const f = ctx[k];
      if (typeof f !== 'function') continue;
      ctx[k] = function () {
        self.g++;
        return f.apply(ctx, arguments);
      };
    }
  },
};
try {
  PERF.on = /[?&]perf=[12]/.test(location.search);
  PERF.ops = /[?&]perf=2/.test(location.search);
} catch (e) {}
function drawPerfOverlay() {
  if (PERF.ops && !PERF.wrapped) PERF.wrap();
  const fps = 1 / Math.max(0.0001, PERF.dtEMA);
  const live =
    predators.length + jellies.length + fries.length + pearlsArr.length +
    powers.length + hooks.length + nets.length + boulders.length;
  const sp = typeof spriteStats === 'function' ? spriteStats() : { count: 0, kb: 0 };
  const rows = [
    fps.toFixed(0) + ' fps   frame ' + PERF.msEMA.toFixed(1) + 'ms (pk ' + PERF.msMax.toFixed(0) + ')',
    'budget ' + ((PERF.msEMA / 16.7) * 100).toFixed(0) + '%   DPR ' + DPR.toFixed(1) + '   ' + W + 'x' + H,
    'live ' + live + '  pr' + predators.length + ' jl' + jellies.length + ' fr' + fries.length +
      ' pe' + pearlsArr.length + ' pw' + powers.length + ' hk' + hooks.length + ' nt' + nets.length + ' rk' + boulders.length,
    'fx ' + parts.length + ' part  ' + bubbles.length + ' bub  ' + currents.length + ' cur',
    'sprites ' + sp.count + ' (' + sp.kb + 'kb)',
  ];
  if (PERF.ops) rows.push('ops/frame ' + PERF.nEMA.toFixed(0) + '   grads ' + PERF.gEMA.toFixed(1));
  try {
    if (typeof Director !== 'undefined')
      rows.push('threat ' + Director.threat().toFixed(1) + '/' + Director.threatMax.toFixed(1));
  } catch (e) {}
  ctx.save();
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0); // immune to shake/translate
  ctx.font = '600 10px ui-monospace, Menlo, monospace';
  ctx.textAlign = 'left';
  let wmax = 0;
  for (const r of rows) wmax = Math.max(wmax, ctx.measureText(r).width);
  ctx.fillStyle = 'rgba(0,0,0,0.62)';
  ctx.fillRect(6, 6, wmax + 14, rows.length * 13 + 10);
  for (let i = 0; i < rows.length; i++) {
    // red once a frame costs more than a 60Hz budget — the only line that matters
    ctx.fillStyle = i === 0 && PERF.msEMA > 16.7 ? '#ff6b81' : i === 0 ? '#7dffc4' : '#cfe9ff';
    ctx.fillText(rows[i], 13, 20 + i * 13);
  }
  ctx.restore();
}

// ---------- the seabed, as ONE bitmap ----------
// v2.8 painted the floor every frame: a fresh linear gradient + 2 fillRects + 40
// ellipses (pebbles) + 8 caustic polylines of ~50 points each. That is ~440 path
// operations per frame for a band of sand nobody looks at directly, and it was the
// single largest fixed cost in the renderer.
// All of it is baked into one horizontally-tiling strip instead, blitted twice.
// Two things make this exact rather than approximate:
//   1. the sand gradient is vertical only, and a vertical gradient is unchanged by
//      horizontal translation — so scrolling the baked sand looks identical to
//      re-filling it in place;
//   2. the pebbles already scrolled as a rigid set on a (W+100) modulo, so the strip
//      IS their layout. Positions match the old code pixel for pixel.
// The caustic ripples pick a frequency that fits a whole number of cycles into the
// strip so the tiling seam is invisible; they now drift with the floor instead of
// animating in place, which at alpha 0.05 is indistinguishable and free.
function seabedSpan() {
  return W + 100;
}
function seabedStrip() {
  const span = seabedSpan();
  const top = FLOOR_Y - 4;
  const h = H - top + 20;
  const fb = BIOMES[activeBiome] || BIOMES.sunlit;
  return sprite('seabed|' + fb.name + '|' + (span | 0) + '|' + (h | 0), span, h, (b, w) => {
    const sand = b.createLinearGradient(0, 4, 0, h - 20);
    sand.addColorStop(0, fb.floorTop);
    sand.addColorStop(0.25, fb.floorMid);
    sand.addColorStop(1, fb.floorBot);
    b.fillStyle = sand;
    b.fillRect(0, 4, w, h - 4);
    b.fillStyle = fb.floorLip; // sunlit lip where sand meets water
    b.fillRect(0, 4, w, 3);
    // pebbles (same i*97 / i*53 layout as v2.8), with a wrapped copy of any pebble
    // that straddles the seam so the tile joins cleanly
    b.fillStyle = 'rgba(0,0,0,0.18)';
    for (let i = 0; i < 40; i++) {
      const px = (i * 97) % span;
      const py = 22 + ((i * 53) % 34); // = FLOOR_Y + 18 + ... in strip space
      const rx = 14 + (i % 4) * 5;
      b.beginPath();
      b.ellipse(px, py, rx, 3.5, 0, 0, TAU);
      b.fill();
      if (px + rx > span || px - rx < 0) {
        b.beginPath();
        b.ellipse(px + (px < rx ? span : -span), py, rx, 3.5, 0, 0, TAU);
        b.fill();
      }
    }
    // caustics: light ripples on the sand. k is snapped so the wave closes on itself
    const k = (Math.max(1, Math.round((span * 0.05) / TAU)) * TAU) / span;
    b.save();
    b.globalAlpha = 0.05;
    b.strokeStyle = '#cfffff';
    b.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      b.beginPath();
      for (let x = 0; x <= span; x += 24) {
        const y = 12 + i * 6 + Math.sin(x * k + i) * 3;
        x === 0 ? b.moveTo(x, y) : b.lineTo(x, y);
      }
      b.stroke();
    }
    b.restore();
  });
}
function drawSeabed() {
  const strip = seabedStrip();
  if (!strip) {
    // vector fallback — the game must still render with zero sprites
    const sand = grad('sandFall', () => {
      const g = ctx.createLinearGradient(0, FLOOR_Y, 0, H);
      g.addColorStop(0, '#8a6f4d');
      g.addColorStop(0.25, '#6e5739');
      g.addColorStop(1, '#2e2114');
      return g;
    });
    ctx.fillStyle = sand;
    ctx.fillRect(-20, FLOOR_Y, W + 40, H - FLOOR_Y + 20);
    ctx.fillStyle = 'rgba(255,235,190,0.25)';
    ctx.fillRect(-20, FLOOR_Y, W + 40, 3);
    return;
  }
  const span = seabedSpan();
  const off = -(((scrollX * 0.9) % span) + span) % span; // (-span, 0]
  const y = FLOOR_Y - 4;
  ctx.drawImage(strip, off - 50, y, span, strip._ch);
  ctx.drawImage(strip, off - 50 + span, y, span, strip._ch);
}
function render() {
  ctx.save();
  if (shake > 0) ctx.translate(rand(-shake, shake) * 0.5, rand(-shake, shake) * 0.5);

  // 1+2) water column + god rays (baked; fallback paints direct)
  if (bgCache) ctx.drawImage(bgCache, 0, 0);
  else {
    const { stops, k } = waterStops();
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, stops[0]);
    g.addColorStop(0.35, stops[1]);
    g.addColorStop(0.7, stops[2]);
    g.addColorStop(1, stops[3]);
    ctx.fillStyle = g;
    ctx.fillRect(-20, -20, W + 40, H + 40);
    ctx.save();
    ctx.globalAlpha = 0.1 * (1 - k) + 0.01;
    ctx.fillStyle = '#bfefff';
    for (let i = 0; i < 4; i++) {
      const bx = 120 + i * 230 + Math.sin(time * 0.3 + i) * 30;
      ctx.beginPath();
      ctx.moveTo(bx, 0);
      ctx.lineTo(bx + 90, 0);
      ctx.lineTo(bx + 190, H);
      ctx.lineTo(bx + 60, H);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // 3) distant rock silhouettes (parallax)
  ctx.fillStyle = 'rgba(4,26,40,0.85)';
  for (const r of rocksFar) {
    const sx = ((((r.x - scrollX * 0.15) % 2600) + 2600) % 2600) - 200;
    ctx.beginPath();
    ctx.ellipse(sx, FLOOR_Y + 30, r.w / 2, r.h, 0, Math.PI, TAU);
    ctx.fill();
  }
  // distant fish shadows
  ctx.fillStyle = 'rgba(2,14,24,0.5)';
  for (let i = 0; i < 5; i++) {
    const sx =
      ((((i * 480 + time * 22 - scrollX * 0.25) % (W + 300)) + (W + 300)) % (W + 300)) - 150;
    const sy = 80 + i * 55 + Math.sin(time * 0.8 + i * 2) * 14;
    ctx.beginPath();
    ctx.ellipse(sx, sy, 26, 9, -0.1, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(sx - 24, sy);
    ctx.lineTo(sx - 36, sy - 8);
    ctx.lineTo(sx - 36, sy + 8);
    ctx.closePath();
    ctx.fill();
  }

  // 3.5) cave roof closes in from the top (open reefs: invisible, zero cost)
  if (caveK() > 0.02) drawCaveRoof(caveK());

  // 4) sandy floor — sand + lip + pebbles + caustics, all in one baked strip
  drawSeabed();
  // cave floor lies in shadow
  if (caveK() > 0.02) {
    ctx.fillStyle = 'rgba(0,2,8,' + (0.55 * caveK()).toFixed(2) + ')';
    ctx.fillRect(-20, FLOOR_Y, W + 40, H - FLOOR_Y + 20);
  }

  // 5) current bands — a soft-edged flow lane, not a translucent green wall and NOT
  // drawn "wave signs". v2.8 filled the FULL band (70-130px tall x whole screen) at
  // alpha ~0.16-0.22 and drew six long wobbly squiggles descending across it: the
  // reef went green and the squiggles read as scribbles over the art.
  // Now: two soft edge glows mark where the lane starts and stops, and the water
  // inside is shown MOVING — tapered comet streaks that drift with the push, bright
  // at the leading tip and fading behind. Direction reads from the taper and the
  // motion, not from an arrow. Cost is one fillRect per streak (no paths, no trig).
  for (const c of currents) {
    const yy = c.y + Math.sin(time * 1.3 + c.ph) * 10;
    const half = c.h / 2;
    const warm = c.force > 0; // pushing down/right = green, up/left = blue
    ctx.save();
    ctx.translate(0, yy);
    ctx.globalAlpha = 0.62 + 0.18 * Math.sin(time * 3 + c.ph);
    // Edge glow straddles the boundary. Built in LOCAL coords after the translate,
    // so one memoised gradient paints every band at every height (see grad()).
    const edge = grad('curEdge' + (warm ? 'w' : 'c'), () => {
      const rgb = warm ? '46,230,168' : '77,201,255';
      const g = ctx.createLinearGradient(0, -15, 0, 15);
      g.addColorStop(0, 'rgba(' + rgb + ',0)');
      g.addColorStop(0.5, 'rgba(' + rgb + ',0.42)');
      g.addColorStop(1, 'rgba(' + rgb + ',0)');
      return g;
    });
    ctx.fillStyle = edge;
    ctx.save();
    ctx.translate(0, -half);
    ctx.fillRect(0, -15, W, 30);
    ctx.restore();
    ctx.save();
    ctx.translate(0, half);
    ctx.fillRect(0, -15, W, 30);
    ctx.restore();
    // drifting motion streaks. One memoised gradient (tail -> tip over 0..100 local
    // units) is stretched per streak, so length varies with no extra gradient builds.
    const tail = grad('curStreak', () => {
      const g = ctx.createLinearGradient(0, 0, 100, 0);
      g.addColorStop(0, 'rgba(223,255,255,0)');
      g.addColorStop(0.55, 'rgba(223,255,255,0.35)');
      g.addColorStop(1, 'rgba(235,255,255,0.9)');
      return g;
    });
    const span = W + 260;
    const inset = 16;
    for (let k = 0; k < CUR_STREAKS.length; k++) {
      const s = CUR_STREAKS[k];
      const lx = ((((s.o * span + time * s.v * c.force) % span) + span) % span) - 130;
      const ly = -half + inset + (c.h - inset * 2) * s.y;
      ctx.save();
      ctx.translate(lx, ly);
      ctx.globalAlpha = s.a;
      // mirror for a leftward push so the bright tip always leads
      ctx.scale((c.force > 0 ? 1 : -1) * (s.len / 100), 1);
      ctx.fillStyle = tail;
      ctx.fillRect(0, -s.w / 2, 100, s.w);
      ctx.restore();
    }
    ctx.restore();
  }

  // 6) corals + seaweed (mid parallax)
  for (const c of corals) {
    const sx = ((((c.x - scrollX * 0.85) % 2600) + 2600) % 2600) - 200;
    if (sx < -80 || sx > W + 80) continue;
    drawCoral(sx, FLOOR_Y, c.s, c.type, time + c.ph);
  }
  for (const s of seaweeds) {
    const sx = ((((s.x - scrollX * 0.9) % 2600) + 2600) % 2600) - 200;
    if (sx < -60 || sx > W + 60) continue;
    drawSeaweed(sx, FLOOR_Y, s);
  }
  // starfish beds on the seabed
  for (const st of starfish) {
    const sx = ((((st.x - scrollX * 0.9) % 2600) + 2600) % 2600) - 200;
    if (sx < -40 || sx > W + 40) continue;
    const sy = clamp(FLOOR_Y + 30 + st.dx * 0.4, FLOOR_Y + 12, H - 8);
    drawStarfish(sx, sy, st.s, st.color, time + st.ph);
  }
  drawCrabs();
  // 6b) seabed boulders — solid terrain, drawn in front of the seabed decor so
  // nothing pokes through the rock. One cached blit each (see sprites.js).
  for (const b of boulders) {
    if (b.x < -220 || b.x > W + 240) continue;
    drawBoulder(b);
  }
  // 6c) sea urchins (per-biome signature hazard) — drawn with the seabed so the
  // spiny cluster sits ON the floor, below the entities that swim over it
  for (const u of urchins) {
    if (u.x < -220 || u.x > W + 240) continue;
    drawUrchin(u);
  }

  // 7) finish gate
  if (gate) drawGate(gate.x);

  // 8-10) entities. Everything below is culled first: an object one screen to the
  // right of the viewport still costs a full gradient fill + 30 path ops if you hand
  // it to the rasteriser, and hazards spawn ~200px off-screen and linger ~100px past
  // the left edge, so on a phone a third of the live entities are off-camera. The
  // margins are per-type: a hook's line reaches up to the surface, a net is 110 tall,
  // a shark is up to 180 long.
  for (const pl of pearlsArr) if (pl.x > -30 && pl.x < W + 30) drawPearl(pl);
  for (const pw of powers) if (pw.x > -40 && pw.x < W + 40) drawPower(pw);

  // hooks & nets (behind fish)
  for (const hk of hooks) if (hk.x > -60 && hk.x < W + 60) drawHook(hk);
  for (const n of nets) if (n.x > -110 && n.x < W + 110) drawNet(n);

  // jellies & predators
  for (const j of jellies) if (j.x > -60 && j.x < W + 60) drawJelly(j);
  for (const f of fries) if (f.x > -30 && f.x < W + 30) drawFry(f, -1);
  for (const p of predators) {
    if (p.x < -200 || p.x > W + 220) continue;
    drawPredator(p);
    if (p.lunge > 0) drawStrikeAlert(p); // red "!" while it winds up — your cue to move
  }

  // boss (phase A): one boss, drawn with the entities so it sits behind Nemo but
  // above the seabed; its shots ride beneath the player too
  if (typeof Boss !== 'undefined' && Boss.active()) {
    drawBoss();
    for (const s of Boss.shots())
      if (s.x > -30 && s.x < W + 30) drawBossShot(s);
  }

  // 11) Nemo — ALWAYS drawn while a run is live so he can never "get lost"
  // (gold tracker glow is drawn topmost, after the vignette — see end of render)
  if (player.alive && !player.dead)
    drawPlayable(player.x, player.y, fish().size, player.tilt, player.tail);
  else if (player.dead && state === 'playing') {
    if (player.deadReason === 'bite' && player.eatenBy) {
      if (!player.snapDone) {
        // caught in the open jaws: full-size, thrashing — about to be snapped
        drawPlayable(
          player.catchX + rand(-2.5, 2.5),
          player.catchY + rand(-2.5, 2.5),
          fish().size,
          player.tilt + rand(-0.12, 0.12),
          player.tail,
        );
      }
      // snapped shut: swallowed whole — nothing left to draw, blood tells it
    } else {
      // other deaths: visibly shrinking + fading (trapped / exhausted)
      const k = clamp(player.deathT / 1.5, 0.15, 1);
      ctx.save();
      ctx.globalAlpha = k;
      drawPlayable(player.x, player.y, Math.max(0.2, fish().size * k), player.tilt, player.tail);
      ctx.restore();
    }
  } else if (state === 'gameOver' && player.deadReason === 'hp') {
    // exhausted but still visible behind the panel — never vanishes mysteriously
    ctx.save();
    ctx.globalAlpha = 0.5;
    drawPlayable(player.x, player.y, fish().size * 0.9, 0.4, player.tail);
    ctx.restore();
  }
  // (engulf game-over: Nemo is inside the predator — the panel explains)
  if (player.trappedIn && state === 'playing') {
    // rope mesh drawn OVER the victim: visibly caught inside the cage
    const bx = player.x,
      by = player.y,
      r = player.r + 10;
    ctx.save();
    ctx.strokeStyle = 'rgba(230,205,150,0.9)';
    ctx.lineWidth = 2;
    ctx.strokeRect(bx - r, by - r, r * 2, r * 2);
    ctx.beginPath();
    ctx.moveTo(bx - r, by - r);
    ctx.lineTo(bx + r, by + r);
    ctx.moveTo(bx + r, by - r);
    ctx.lineTo(bx - r, by + r);
    ctx.moveTo(bx, by - r);
    ctx.lineTo(bx, by + r);
    ctx.stroke();
    ctx.restore();
  }

  // 12) marine snow — squares, not arcs: identical at 1-2px, far cheaper per flake
  ctx.fillStyle = 'rgba(220,245,255,0.5)';
  for (const s of snow) {
    ctx.globalAlpha = 0.12 + s.z * 0.3;
    ctx.fillRect(s.x, s.y, s.s, s.s);
  }
  ctx.globalAlpha = 1;

  // 13) bubbles
  for (const b of bubbles) {
    ctx.strokeStyle = 'rgba(200,240,255,0.65)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.arc(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.35, 0, TAU);
    ctx.fill();
  }

  // 14) particles (blood renders as soft dissolving plumes, rest as sparks)
  for (const q of parts) {
    const a = clamp(q.life / q.max, 0, 1);
    if (q.kind === 'blood') {
      ctx.globalAlpha = a * 0.4;
      ctx.fillStyle = q.color;
      ctx.beginPath();
      ctx.arc(q.x, q.y, q.r, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = a * 0.75;
      ctx.beginPath();
      ctx.arc(q.x, q.y, q.r * 0.55, 0, TAU);
      ctx.fill();
    } else {
      ctx.globalAlpha = a;
      ctx.fillStyle = q.color;
      ctx.beginPath();
      ctx.arc(q.x, q.y, q.r, 0, TAU);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  // 15) surface shimmer + caustics-ish (+ vignette lives in the baked bg)
  {
    ctx.fillStyle = 'rgba(140,220,255,0.10)';
    ctx.fillRect(-20, 0, W + 40, 10 + Math.sin(time * 2) * 3);
    // (floor caustics moved into the baked seabed strip — see drawSeabed)
  }
  if (!bgCache) {
    const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.85);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,5,12,0.55)');
    ctx.fillStyle = v;
    ctx.fillRect(-20, -20, W + 40, H + 40);
  }

  // ONE status ring, segmented by buff. v2.8 drew a pulsing r34 ring for slow AND a
  // rotating dashed r60 ring for magnet AND the r44 tracker glow AND "▼ YOU" — four
  // overlapping circles around a 17px fish, so with both buffs up the player was the
  // least readable thing on screen. Now each live buff owns an arc of the same r34
  // circle (shield is excluded: it already has its own bubble on the body), and the
  // arc blinks over its last 1.6s so expiry is something you can see coming.
  {
    const ring = [];
    if (player.slow > 0) ring.push(['rgba(125,255,196,0.75)', player.slow]);
    if (player.magnet > 0) ring.push(['rgba(255,159,243,0.7)', player.magnet]);
    if (ring.length) {
      const r = 32 + Math.sin(time * 5) * 2;
      const seg = TAU / ring.length;
      const spin = time * 0.8;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      for (let i = 0; i < ring.length; i++) {
        const left = ring[i][1];
        // final 1.6s: blink at 6Hz. Skipping the stroke is the blink — no alpha maths.
        if (left < 1.6 && ((time * 6) | 0) % 2 === 0) continue;
        ctx.strokeStyle = ring[i][0];
        ctx.beginPath();
        ctx.arc(player.x, player.y, r, spin + i * seg + 0.16, spin + (i + 1) * seg - 0.16);
        ctx.stroke();
      }
      ctx.lineCap = 'butt';
    }
  }
  if (state === 'menu') drawDemoFish(); // opening screen: meet your fish, see snacks swim by
  if (typeof Boss !== 'undefined' && Boss.active()) drawBossCue(); // dodge tell, topmost
  drawPlayerMarker(); // topmost layer: nothing on canvas may ever cover Nemo's tracker

  ctx.restore();

  // DOM flash
  document.getElementById('vignetteFlash').style.opacity =
    flashA > 0 ? String(Math.min(1, flashA)) : 0;
  // canvas text floaters (small, plain words only)
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = '800 14px Segoe UI, Arial';
  for (const f of floaters) {
    ctx.globalAlpha = clamp(f.life, 0, 1);
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.strokeText(f.txt, f.x, f.y);
    ctx.fillStyle = f.color;
    ctx.fillText(f.txt, f.x, f.y);
  }
  ctx.restore();
  if (PERF.on) drawPerfOverlay();
}

// Golden tracking glow so Nemo never blends in or gets "lost". The "▼ YOU" label
// fades out after the first 6s of a run: it is orientation, and once you have found
// your fish it is just another thing floating over the play area.
function drawPlayerMarker() {
  if ((state !== 'playing' && state !== 'paused') || player.dead) return;
  const y = clamp(player.y, 20, H - 20);
  ctx.save();
  // was a per-frame createRadialGradient — now one cached bitmap (see sprites.js)
  const gl = glowSprite('255,200,90', 44, 0.3);
  if (!blit(gl, player.x, y)) {
    ctx.fillStyle = 'rgba(255,200,90,0.18)';
    ctx.beginPath();
    ctx.arc(player.x, y, 30, 0, TAU);
    ctx.fill();
  }
  const fade = clamp(7 - elapsed, 0, 1); // full until 6s, gone by 7s
  if (fade > 0.01) {
    ctx.globalAlpha = 0.9 * fade;
    ctx.fillStyle = '#ffd66e';
    ctx.font = '900 11px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('▼ YOU', player.x, y - 34 + Math.sin(time * 4) * 3);
  }
  ctx.restore();
}
// ---------- seabed boulders ----------
// The rock body is drawn from world.js `rockProfile()` — the SAME curve update.js
// collides against, so what you see is exactly what blocks you. It is baked once per
// size bucket into an offscreen sprite: rounding w/h to 8px buckets means a whole
// run reuses a handful of bitmaps instead of re-walking ~40 path points per rock
// per frame. On screen a boulder therefore costs one drawImage.
// Tints are deliberately LIGHTER than a literal rock: the water fog and the dark
// blue background already sink anything mid-grey toward black, and the first pass
// (#5c5f68 → #282b32) read as a hole cut in the screen. These sit between the sand
// (#8a6f4d) and the water so the rock belongs to the seabed.
const ROCK_TINT = [
  ['#96a0ad', '#697384', '#4b5164'], // grey granite
  ['#a89279', '#7b6450', '#574538'], // brown sandstone
  ['#82949b', '#57676f', '#3c4a50'], // wet basalt
];
function boulderSprite(b) {
  const w = Math.max(24, Math.round(b.w / 8) * 8);
  const h = Math.max(16, Math.round(b.h / 8) * 8);
  const pad = 6; // room for the rim light to sit inside the bitmap
  return sprite('rock' + b.type + b.tint + '|' + w + '|' + h, w + pad * 2, h + pad, (g, cw, ch) => {
    const col = ROCK_TINT[b.tint] || ROCK_TINT[0];
    const baseY = ch;
    const cx = cw / 2;
    // Silhouette = the collision curve, with a per-type deterministic erosion that
    // only ever CARVES INTO it (`1 - max(0, n)`), never bulges out of it — so the
    // drawn rock can never poke above the surface the fish is standing on.
    const bump = (t) => {
      const n =
        b.type === 0
          ? 0.07 * Math.sin(t * 6.3) + 0.045 * Math.sin(t * 11.1)
          : b.type === 1
            ? 0.06 * Math.sin(t * 4.4 + 1.1) - 0.055
            : 0.05 * Math.sin(t * 9.2 + 2.3) + 0.06 * Math.sin(t * 5.5) - 0.038;
      return rockProfile(t) * (1 - Math.max(0, n));
    };
    g.beginPath();
    g.moveTo(cx - w / 2 - pad * 0.4, baseY);
    for (let i = 0; i <= 40; i++) {
      const t = -1 + (2 * i) / 40;
      g.lineTo(cx + t * (w / 2), baseY - h * bump(t));
    }
    g.lineTo(cx + w / 2 + pad * 0.4, baseY);
    g.closePath();
    const lin = g.createLinearGradient(0, baseY - h, 0, baseY);
    lin.addColorStop(0, col[0]);
    lin.addColorStop(0.5, col[1]);
    lin.addColorStop(1, col[2]);
    g.fillStyle = lin;
    g.fill();
    g.save();
    g.clip();
    // rim light on the sunlit (upper-left) shoulder — this is what makes a flat
    // silhouette read as a three-dimensional rock
    g.strokeStyle = 'rgba(206,236,246,0.4)';
    g.lineWidth = 2;
    g.beginPath();
    for (let i = 0; i <= 20; i++) {
      const t = -0.96 + (i / 20) * 1.1;
      const yy = baseY - h * bump(t) + 1.2;
      i === 0 ? g.moveTo(cx + t * (w / 2), yy) : g.lineTo(cx + t * (w / 2), yy);
    }
    g.stroke();
    // a few darker pits + pale barnacles so the surface is not a flat wash
    for (let i = 0; i < 7; i++) {
      const t = -0.8 + (i / 6) * 1.6;
      const top = baseY - h * bump(t);
      const py = top + (baseY - top) * (0.25 + ((i * 37) % 60) / 100);
      g.fillStyle = i % 2 ? 'rgba(30,22,10,0.16)' : 'rgba(226,240,236,0.18)';
      g.beginPath();
      g.ellipse(cx + t * (w / 2), py, 3 + (i % 3) * 2.2, 2 + (i % 2) * 1.6, 0, 0, TAU);
      g.fill();
    }
    // sand skirt: the seabed has drifted up against the base, so the rock reads as
    // half-BURIED instead of pasted on top of the floor
    const skirt = Math.min(h * 0.4, 34);
    const sk = g.createLinearGradient(0, baseY - skirt, 0, baseY);
    sk.addColorStop(0, 'rgba(138,111,77,0)');
    sk.addColorStop(1, 'rgba(146,118,80,0.7)');
    g.fillStyle = sk;
    g.fillRect(0, baseY - skirt, cw, skirt);
    g.restore();
  });
}
function drawBoulder(b) {
  const img = boulderSprite(b);
  // contact shadow in the sand: sells the rock as sitting ON the seabed
  ctx.save();
  ctx.globalAlpha = 0.2;
  ctx.fillStyle = '#1a1208';
  ctx.beginPath();
  ctx.ellipse(b.x, FLOOR_Y + 4, b.w * 0.52, 7, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
  if (img) ctx.drawImage(img, b.x - img._cw / 2, FLOOR_Y + 6 - img._ch, img._cw, img._ch);
  else {
    ctx.fillStyle = '#697384';
    ctx.beginPath();
    ctx.ellipse(b.x, FLOOR_Y, b.w * 0.5, b.h, 0, Math.PI, TAU);
    ctx.fill();
  }
  // scrape puff while the player is riding the crown
  if (b.ride > 0) {
    ctx.save();
    ctx.globalAlpha = clamp(b.ride * 2, 0, 0.5);
    ctx.fillStyle = '#cfe9ee';
    ctx.beginPath();
    ctx.arc(player.x - 6, player.y + player.r * 0.7, 5 + (0.35 - b.ride) * 20, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

// ---------- sea urchins ----------
// A urchin reads as HARMFUL where a boulder reads as CLIMBABLE, and the look must
// say so at a glance. Three tells, all drawn into one baked bitmap so an on-screen
// cluster costs one drawImage the same as a boulder: (1) a low dark body (curved,
// unlike the rock's smooth mound, so a "ride over" read is suppressed), (2) radial
// needle spines poking upward like a paintbrush, (3) slightly reddish violet body —
// the palette the game reserves for "stings" (jelly bells, the end of a hook) so
// the colour by itself says don't touch. Spines are deterministic per-cluster
// (seeded by the tint+size bucket), so the bitmap caches and never stalls.
const URCH_TINT = [
  ['#2a2735', '#16131d', '#0c0a12'], // charcoal violet
  ['#35222e', '#1c1119', '#0f0a10'], // aubergine
  ['#262432', '#131019', '#0a080e'], // slate violet
];
function urchinSprite(u) {
  const w = Math.max(40, Math.round(u.w / 8) * 8);
  const h = Math.max(24, Math.round(u.h / 8) * 8);
  return sprite('urch' + u.tint + '|' + w + '|' + h, w, h + 8, (g, cw, ch) => {
    const col = URCH_TINT[u.tint] || URCH_TINT[0];
    const cx = cw / 2;
    const baseY = ch - 6; // the sand skirt sits at the very bottom
    // radial spines: a fan of thin tapered triangles from just under the crown
    g.strokeStyle = 'rgba(205,215,255,0.5)';
    g.lineCap = 'round';
    const spineN = 9;
    for (let i = 0; i < spineN; i++) {
      const a = -Math.PI * (0.08 + (0.84 * i) / (spineN - 1)); // left to right over the crown
      const len = h * (0.86 + ((i * 53) % 29) / 100);
      const x0 = cx - w * 0.4 + (w * 0.8 * i) / (spineN - 1);
      g.lineWidth = 2.2;
      g.beginPath();
      g.moveTo(x0, baseY - h * 0.18);
      g.lineTo(x0 + Math.cos(a) * len * 0.7, baseY - h * 0.18 + Math.sin(a) * -len);
      g.stroke();
    }
    // dark curved body (an arc, not a mound — see comment above)
    g.fillStyle = col[0];
    g.beginPath();
    g.ellipse(cx, baseY - h * 0.18, w * 0.36, h * 0.46, 0, Math.PI, TAU);
    g.fill();
    g.fillStyle = col[1];
    g.beginPath();
    g.ellipse(cx, baseY - h * 0.12, w * 0.3, h * 0.34, 0, Math.PI, TAU);
    g.fill();
    // top-highlight so the body does not read as a hole
    g.fillStyle = 'rgba(168,120,180,0.35)';
    g.beginPath();
    g.ellipse(cx - w * 0.08, baseY - h * 0.34, w * 0.14, h * 0.16, -0.4, 0, TAU);
    g.fill();
    // sand skirt at the base (half-buried like the rocks)
    const sk = g.createLinearGradient(0, baseY - 6, 0, baseY);
    sk.addColorStop(0, 'rgba(138,111,77,0)');
    sk.addColorStop(1, 'rgba(146,118,80,0.75)');
    g.fillStyle = sk;
    g.fillRect(0, baseY - 6, cw, 6);
  });
}
function drawUrchin(u) {
  const img = urchinSprite(u);
  if (img) {
    // a small red halo sells the "harm" at a glance — the same cue jellies use
    const halo = glowSprite('214,90,110', 30, 0.6);
    ctx.save();
    ctx.globalAlpha = 0.5 + Math.sin(u.ph + time * 2) * 0.18;
    blit(halo, u.x, FLOOR_Y + 2 - u.h * 0.5, 0.9);
    ctx.restore();
    ctx.drawImage(img, u.x - img._cw / 2, FLOOR_Y + 8 - img._ch, img._cw, img._ch);
  } else {
    ctx.fillStyle = '#16131d';
    ctx.beginPath();
    ctx.ellipse(u.x, FLOOR_Y, u.w * 0.36, u.h * 0.46, 0, Math.PI, TAU);
    ctx.fill();
  }
}

// ---------- procedural character art ----------
// gradient memo: body paints use local coords (set after translate), so one cached
// gradient paints identically every frame — zero GC churn, zero visual change.
const _gradCache = {};
function grad(key, maker) {
  let g = _gradCache[key];
  if (!g) {
    g = maker();
    _gradCache[key] = g;
  }
  return g;
}
function drawNemo(x, y, scale, tilt, tailPh) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  ctx.scale(scale, scale);
  if (player.invuln > 0 && ((time * 6) | 0) % 2 === 0) ctx.globalAlpha = 0.6;
  const wag = Math.sin(tailPh) * 0.35;
  // tail
  ctx.save();
  ctx.translate(-22, 0);
  ctx.rotate(wag * 0.9);
  const tg = grad('nemoTail', () => {
    const t = ctx.createLinearGradient(0, -12, 0, 12);
    t.addColorStop(0, '#ff9d2e');
    t.addColorStop(1, '#e2571b');
    return t;
  });
  ctx.fillStyle = tg;
  ctx.beginPath();
  ctx.moveTo(0, -3);
  ctx.quadraticCurveTo(-16, -16, -20, -14);
  ctx.quadraticCurveTo(-14, 0, -20, 14);
  ctx.quadraticCurveTo(-14, 12, 0, 4);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(120,30,0,0.5)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
  // body
  const bg = grad('nemoBody', () => {
    const b = ctx.createLinearGradient(0, -15, 0, 15);
    b.addColorStop(0, '#ffc25e');
    b.addColorStop(0.45, '#ff8c2e');
    b.addColorStop(1, '#d94f10');
    return b;
  });
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.ellipse(0, 0, 26, 14.5, 0, 0, TAU);
  ctx.fill();
  // belly light
  ctx.fillStyle = 'rgba(255,240,220,0.5)';
  ctx.beginPath();
  ctx.ellipse(2, 6, 17, 6, 0, 0, TAU);
  ctx.fill();
  // white stripes with black outline (clownfish!)
  const stripes = [
    { x: 8, w: 7 },
    { x: -8, w: 9 },
  ];
  for (const s of stripes) {
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.ellipse(s.x, 0, s.w + 2.4, 13.4, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(s.x, 0, s.w, 12, 0, 0, TAU);
    ctx.fill();
  }
  // dorsal fin
  ctx.fillStyle = '#c43d08';
  ctx.beginPath();
  ctx.moveTo(-12, -12);
  ctx.quadraticCurveTo(0, -24 + Math.sin(tailPh * 1.3) * 2, 12, -11);
  ctx.quadraticCurveTo(0, -15, -12, -12);
  ctx.fill();
  // pectoral fin (flapping)
  const flap = Math.sin(tailPh * 1.7) * 0.5;
  ctx.save();
  ctx.translate(2, 4);
  ctx.rotate(0.5 + flap * 0.4);
  ctx.fillStyle = 'rgba(255,170,80,0.95)';
  ctx.beginPath();
  ctx.ellipse(0, 8, 5, 10, 0.3, 0, TAU);
  ctx.fill();
  ctx.restore();
  // eye
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(15, -4, 6, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#101418';
  ctx.beginPath();
  ctx.arc(16.5, -4, 3.1, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(17.5, -5, 1.2, 0, TAU);
  ctx.fill();
  // smile
  ctx.strokeStyle = 'rgba(90,20,0,0.7)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(14, 4, 5, 0.2, 1.2);
  ctx.stroke();
  // gill line
  ctx.strokeStyle = 'rgba(150,40,0,0.4)';
  ctx.beginPath();
  ctx.arc(8, 0, 9, -1, 1);
  ctx.stroke();
  ctx.restore();
  // shield bubble
  if (player.shield > 0) {
    ctx.save();
    ctx.strokeStyle = 'rgba(125,233,255,0.9)';
    ctx.lineWidth = 2.5;
    ctx.fillStyle = 'rgba(125,233,255,0.12)';
    ctx.beginPath();
    ctx.arc(x, y, 30 + Math.sin(time * 5) * 2, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.arc(x - 10, y - 12, 4, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

// selected-fish dispatch: every owned fish swims the same water, looks its own self
function drawPlayable(x, y, scale, tilt, tailPh) {
  // gulp pulse: quick lunge + swell right after devouring prey (player.gulpT)
  try {
    if (player.gulpT > 0) {
      const gp = Math.sin(((0.32 - player.gulpT) / 0.32) * Math.PI);
      x += 7 * gp;
      scale *= 1 + 0.13 * gp;
    }
  } catch (e) {}
  // swim feel: whole body rocks gently + breathes (tails/fins already wag)
  tilt += Math.sin(tailPh * 0.85) * 0.05;
  scale *= 1 + Math.sin(tailPh * 0.8) * 0.02;
  if (selectedFish === 'damsel') drawTang(x, y, scale, tilt, tailPh);
  else if (selectedFish === 'puffer') drawPuffer(x, y, scale, tilt, tailPh);
  else if (selectedFish === 'shark') drawPlayShark(x, y, scale, tilt, tailPh);
  else drawNemo(x, y, scale, tilt, tailPh);
}
function drawTang(x, y, scale, tilt, tailPh) {
  // Azure — regal blue tang: royal body, yellow tail, dark palette mark
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  ctx.scale(scale, scale);
  if (player.invuln > 0 && ((time * 6) | 0) % 2 === 0) ctx.globalAlpha = 0.6;
  const wag = Math.sin(tailPh) * 0.35;
  ctx.save();
  ctx.translate(-22, 0);
  ctx.rotate(wag * 0.9);
  ctx.fillStyle = '#ffd83d';
  ctx.beginPath();
  ctx.moveTo(0, -3);
  ctx.quadraticCurveTo(-16, -15, -20, -13);
  ctx.quadraticCurveTo(-14, 0, -20, 13);
  ctx.quadraticCurveTo(-14, 11, 0, 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  const bg = grad('tangBody', () => {
    const b = ctx.createLinearGradient(0, -15, 0, 15);
    b.addColorStop(0, '#4d7cff');
    b.addColorStop(0.5, '#1e3fae');
    b.addColorStop(1, '#0d1f66');
    return b;
  });
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.ellipse(0, 0, 26, 14.5, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#0a0a0a';
  ctx.beginPath();
  ctx.ellipse(-2, -2, 18, 8, -0.15, 0, TAU);
  ctx.fill(); // palette mark
  ctx.fillStyle = '#27409b';
  ctx.beginPath();
  ctx.ellipse(-2, -1, 15, 6, -0.15, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#c43d08';
  ctx.beginPath();
  ctx.moveTo(-12, -12);
  ctx.quadraticCurveTo(0, -22, 12, -11);
  ctx.quadraticCurveTo(0, -15, -12, -12);
  ctx.fill();
  const flap = Math.sin(tailPh * 1.7) * 0.5;
  ctx.save();
  ctx.translate(2, 4);
  ctx.rotate(0.5 + flap * 0.4);
  ctx.fillStyle = '#ffd83d';
  ctx.beginPath();
  ctx.ellipse(0, 8, 5, 10, 0.3, 0, TAU);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(15, -4, 6, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#101418';
  ctx.beginPath();
  ctx.arc(16.5, -4, 3.1, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(17.5, -5, 1.2, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(10,10,40,0.7)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(14, 4, 5, 0.2, 1.2);
  ctx.stroke();
  ctx.restore();
  if (player.shield > 0) {
    ctx.save();
    ctx.strokeStyle = 'rgba(125,233,255,0.9)';
    ctx.lineWidth = 2.5;
    ctx.fillStyle = 'rgba(125,233,255,0.12)';
    ctx.beginPath();
    ctx.arc(x, y, 30 * scale + Math.sin(time * 5) * 2, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}
function drawPuffer(x, y, scale, tilt, tailPh) {
  // Puffy — round spiky pufferfish, gently breathing
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt * 0.6);
  ctx.scale(scale, scale);
  if (player.invuln > 0 && ((time * 6) | 0) % 2 === 0) ctx.globalAlpha = 0.6;
  const breathe = 1 + Math.sin(tailPh * 0.8) * 0.04;
  ctx.scale(breathe, 1 / breathe);
  ctx.fillStyle = '#8a7a2e'; // spikes
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU + 0.2;
    ctx.save();
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(17, 0);
    ctx.lineTo(26, 4);
    ctx.lineTo(26, -4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  const bg = grad('pufferBody', () => {
    const b = ctx.createRadialGradient(-6, -8, 3, 0, 0, 24);
    b.addColorStop(0, '#e8d96a');
    b.addColorStop(0.6, '#c2b13f');
    b.addColorStop(1, '#7a6f24');
    return b;
  });
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.arc(0, 0, 20, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,250,230,0.75)';
  ctx.beginPath();
  ctx.ellipse(2, 10, 12, 7, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#5c5318';
  for (const [sx, sy] of [
    [-8, -6],
    [4, -10],
    [10, 2],
    [-2, 4],
  ]) {
    ctx.beginPath();
    ctx.arc(sx, sy, 2.6, 0, TAU);
    ctx.fill();
  }
  const wag = Math.sin(tailPh) * 0.5;
  ctx.save();
  ctx.translate(-19, 0);
  ctx.rotate(wag * 0.5);
  ctx.fillStyle = '#a8933a';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-10, -7);
  ctx.lineTo(-10, 7);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // tiny side fins, fluttering fast
  ctx.fillStyle = '#a8933a';
  for (const s of [-1, 1]) {
    ctx.save();
    ctx.translate(-4, 8 + s * 4);
    ctx.rotate(s * 0.7 + Math.sin(tailPh * 2.2 + s) * 0.35);
    ctx.beginPath();
    ctx.ellipse(0, 0, 8, 3, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  for (const s of [-1, 1]) {
    // big googly eyes
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(9 + s * 6, -8, 5.5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#101418';
    ctx.beginPath();
    ctx.arc(10 + s * 6, -8, 2.8, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(11 + s * 6, -9, 1.1, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = '#5c3a10';
  ctx.beginPath();
  ctx.arc(16, 4, 3, 0, TAU);
  ctx.fill(); // little 'o' mouth
  ctx.restore();
  if (player.shield > 0) {
    ctx.save();
    ctx.strokeStyle = 'rgba(125,233,255,0.9)';
    ctx.lineWidth = 2.5;
    ctx.fillStyle = 'rgba(125,233,255,0.12)';
    ctx.beginPath();
    ctx.arc(x, y, 34 * scale + Math.sin(time * 5) * 2, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}
function drawPlayShark(x, y, scale, tilt, tailPh) {
  // Razor — baby reef shark, faces RIGHT (toward the gate)
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt * 0.7);
  ctx.scale(scale, scale);
  if (player.invuln > 0 && ((time * 6) | 0) % 2 === 0) ctx.globalAlpha = 0.6;
  const wag = Math.sin(tailPh) * 0.4;
  ctx.save();
  ctx.translate(-40, 0);
  ctx.rotate(-wag * 0.5);
  ctx.fillStyle = '#42586e';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-18, -13);
  ctx.lineTo(-12, 0);
  ctx.lineTo(-18, 13);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  const g = grad('psharkBody', () => {
    const gg = ctx.createLinearGradient(0, -14, 0, 14);
    gg.addColorStop(0, '#8fa8bd');
    gg.addColorStop(0.55, '#5a748c');
    gg.addColorStop(1, '#e6eef5');
    return gg;
  });
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 0, 42, 14, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#33475c';
  ctx.beginPath();
  ctx.moveTo(-4, -12);
  ctx.lineTo(6, -29);
  ctx.lineTo(13, -12);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#3a4f66';
  ctx.save();
  ctx.translate(4, 11);
  ctx.rotate(Math.sin(tailPh * 1.6) * 0.3); // pectoral paddles as it swims
  ctx.beginPath();
  ctx.ellipse(0, 0, 11, 4, 0.4, 0, TAU);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(25, -4, 4.4, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#0a0a0a';
  ctx.beginPath();
  ctx.arc(26, -4, 2.2, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#5c0a0a';
  ctx.beginPath();
  ctx.ellipse(25, 7, 13, 4.4, 0.05, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(15 + i * 5, 4.4, 2.4, 3);
  }
  ctx.restore();
  if (player.shield > 0) {
    ctx.save();
    ctx.strokeStyle = 'rgba(125,233,255,0.9)';
    ctx.lineWidth = 2.5;
    ctx.fillStyle = 'rgba(125,233,255,0.12)';
    ctx.beginPath();
    ctx.arc(x, y, 40 * scale + Math.sin(time * 5) * 2, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}
function drawFry(f, dir) {
  // small silver prey fish; dir: -1 swims left (game), +1 swims right (menu demo)
  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.scale(dir, 1);
  ctx.rotate(Math.sin(f.ph * 0.9) * 0.12); // fry wiggle their whole body
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.beginPath();
  ctx.ellipse(0, 5, 9, 2.5, 0, 0, TAU);
  ctx.fill();
  const sh = grad('fryBody', () => {
    const s2 = ctx.createLinearGradient(0, -5, 0, 5);
    s2.addColorStop(0, '#f2f7fb');
    s2.addColorStop(0.5, '#b9c9d8');
    s2.addColorStop(1, '#7d92a8');
    return s2;
  });
  ctx.fillStyle = sh;
  ctx.beginPath();
  ctx.ellipse(0, 0, 10, 4.5, 0, 0, TAU);
  ctx.fill();
  const wag = (f.s != null ? f.s : Math.sin(f.ph)) * 0.5;
  ctx.save();
  ctx.translate(-9, 0);
  ctx.rotate(wag * 0.6);
  ctx.fillStyle = '#93a7bb';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-7, -4.5);
  ctx.lineTo(-7, 4.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#0b0b0b';
  ctx.beginPath();
  ctx.arc(5, -1, 1.4, 0, TAU);
  ctx.fill();
  ctx.restore();
}
function drawDemoFish() {
  // opening screen: your selected fish parades by with a fry school behind the menu card
  const dx = ((time * 110) % (W + 240)) - 120,
    dy = 88 + Math.sin(time * 1.8) * 14;
  drawPlayable(dx, dy, fish().size * 0.9, Math.sin(time * 2.2) * 0.1, time * 9);
  ctx.save();
  ctx.fillStyle = 'rgba(234,247,255,0.85)';
  ctx.font = '800 13px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(fish().name.toUpperCase() + ' ✦ YOUR FISH', dx, dy - 34 * fish().size);
  ctx.restore();
  for (let i = 0; i < 3; i++) {
    const fx = ((time * 150 + i * 200) % (W + 160)) - 80,
      fy = 150 + i * 24 + Math.sin(time * 3 + i * 2) * 8;
    drawFry({ x: fx, y: fy, ph: time * 6 + i * 2 }, 1);
  }
}
// pulsing red "!" over a winding-up hunter — the universal DODGE cue
function drawStrikeAlert(p) {
  const y = p.y - p.size * 0.32 - 26 + Math.sin(time * 14) * 3;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = '900 22px Arial';
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(0,0,0,0.65)';
  ctx.strokeText('!', p.x, y);
  ctx.fillStyle = '#ff2e4d';
  ctx.fillText('!', p.x, y);
  ctx.restore();
}
// angler lure glow, pre-rendered once: identical pixels, ~10x cheaper than shadowBlur.
// (96px backing stays crisp past 3x DPR; drawn 30 logical px.)
let lureSprite = null;
function getLureSprite() {
  if (lureSprite) return lureSprite;
  try {
    const c = document.createElement('canvas');
    c.width = 96;
    c.height = 96;
    const b = c.getContext('2d');
    const g = b.createRadialGradient(48, 48, 2, 48, 48, 44);
    g.addColorStop(0, 'rgba(207,255,240,1)');
    g.addColorStop(0.35, 'rgba(157,255,239,0.55)');
    g.addColorStop(1, 'rgba(157,255,239,0)');
    b.fillStyle = g;
    b.beginPath();
    b.arc(48, 48, 44, 0, TAU);
    b.fill();
    b.fillStyle = '#eafffa';
    b.beginPath();
    b.arc(48, 48, 12, 0, TAU);
    b.fill();
    lureSprite = c;
    return c;
  } catch (e) {
    return null;
  }
}
function drawPredator(p) {
  ctx.save();
  ctx.translate(p.x, p.y);
  const dir = -1;
  ctx.scale(dir, 1);
  const s = p.size / 110; // normalize
  ctx.scale(s, s);
  // pitch (the body angles along its own velocity — update.js) + the swim roll, as
  // ONE rotate. Applied after the mirror flip, so +pitch is nose-down on screen.
  ctx.rotate((p.pitch || 0) + p.s * 0.045);
  const swim = p.s * 6;
  if (p.type === 'shark') {
    // body
    const g = grad('esharkBody', () => {
      const gg = ctx.createLinearGradient(0, -22, 0, 22);
      gg.addColorStop(0, '#8fa8bd');
      gg.addColorStop(0.5, '#5a748c');
      gg.addColorStop(1, '#2c3f52');
      return gg;
    });
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, 62, 22, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#dfe9f2';
    ctx.beginPath();
    ctx.ellipse(4, 10, 48, 10, 0, 0, Math.PI);
    ctx.fill();
    // tail
    ctx.save();
    ctx.translate(-58, 0);
    ctx.rotate(p.s * 0.4);
    ctx.fillStyle = '#42586e';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-26, -18);
    ctx.lineTo(-18, 0);
    ctx.lineTo(-26, 18);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // dorsal
    ctx.fillStyle = '#33475c';
    ctx.beginPath();
    ctx.moveTo(-6, -20);
    ctx.lineTo(8, -44);
    ctx.lineTo(18, -19);
    ctx.closePath();
    ctx.fill();
    // pectoral (rows with the swim)
    ctx.fillStyle = '#3a4f66';
    ctx.save();
    ctx.translate(6, 16);
    ctx.rotate(Math.sin(p.ph * 1.6) * 0.3);
    ctx.beginPath();
    ctx.ellipse(0, 0, 16, 6, 0.5, 0, TAU);
    ctx.fill();
    ctx.restore();
    // eye + gills + mouth teeth
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(38, -6, 6, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#0a0a0a';
    ctx.beginPath();
    ctx.arc(40, -6, 3, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(10 - i * 7, 0, 10, -1, 1);
      ctx.stroke();
    }
    ctx.fillStyle = '#5c0a0a';
    const sharkGape = 5 + (p.mouth || 0) * 9; // jaws swing open during a strike
    ctx.beginPath();
    ctx.ellipse(38, 10, 22, sharkGape, 0.08, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 6; i++) {
      const tx = 20 + i * 7;
      ctx.beginPath();
      ctx.moveTo(tx, 5);
      ctx.lineTo(tx + 3.5, 5);
      ctx.lineTo(tx + 1.7, 11 + (p.mouth || 0) * 7);
      ctx.closePath();
      ctx.fill();
    }
  } else if (p.type === 'angler') {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(0, 26, 50, 10, 0, 0, TAU);
    ctx.fill();
    const g = grad('anglerBody', () => {
      const gg = ctx.createLinearGradient(0, -26, 0, 26);
      gg.addColorStop(0, '#5a4a6b');
      gg.addColorStop(0.5, '#33263f');
      gg.addColorStop(1, '#170f1e');
      return gg;
    });
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, 52, 28, 0, 0, TAU);
    ctx.fill();
    // lure
    ctx.strokeStyle = '#8a7aa0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(30, -22);
    ctx.quadraticCurveTo(52, -46, 66, -30 + p.s * 4);
    ctx.stroke();
    ctx.fillStyle = '#cffff0';
    const lureImg = getLureSprite();
    const lureY = -30 + p.s * 4;
    if (lureImg) ctx.drawImage(lureImg, 66 - 15, lureY - 15, 30, 30);
    else {
      ctx.beginPath();
      ctx.arc(66, lureY, 5, 0, TAU);
      ctx.fill();
    }
    // tail + fins
    ctx.fillStyle = '#241a2e';
    ctx.save();
    ctx.translate(-50, 0);
    ctx.rotate(p.s * 0.5);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-22, -14);
    ctx.lineTo(-22, 14);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(30, -8, 7, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#0c0c0c';
    ctx.beginPath();
    ctx.arc(32, -8, 3.4, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#2b0d0d';
    ctx.beginPath();
    ctx.ellipse(34, 10, 20, 6 + (p.mouth || 0) * 8, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(20 + i * 7, 4);
      ctx.lineTo(23 + i * 7, 4);
      ctx.lineTo(21.5 + i * 7, 10 + (p.mouth || 0) * 6);
      ctx.closePath();
      ctx.fill();
    }
    // little leg-like fins, paddling slowly
    ctx.fillStyle = '#241a2e';
    for (const s of [-1, 1]) {
      ctx.save();
      ctx.translate(2 + s * 8, 20);
      ctx.rotate(s * 0.5 + Math.sin(p.ph * 1.2 + s) * 0.25);
      ctx.beginPath();
      ctx.ellipse(0, 0, 9, 3.5, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    // stripes glow
    ctx.strokeStyle = 'rgba(120,255,220,0.35)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(-6 - i * 12, 0, 20, -1, 1);
      ctx.stroke();
    }
  } else {
    // big blue hunter
    const g = grad('bigBody', () => {
      const gg = ctx.createLinearGradient(0, -20, 0, 20);
      gg.addColorStop(0, '#5fb8dd');
      gg.addColorStop(0.5, '#2b7ba8');
      gg.addColorStop(1, '#123c5c');
      return gg;
    });
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, swim * 0.3, 56, 20, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.ellipse(2, 8, 40, 8, 0, 0, Math.PI);
    ctx.fill();
    ctx.save();
    ctx.translate(-52, 0);
    ctx.rotate(p.s * 0.45);
    ctx.fillStyle = '#1d4e72';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-24, -15);
    ctx.lineTo(-24, 15);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#17405e';
    ctx.beginPath();
    ctx.moveTo(-4, -18);
    ctx.lineTo(10, -32);
    ctx.lineTo(18, -17);
    ctx.closePath();
    ctx.fill();
    // pectoral (rows with the swim)
    ctx.save();
    ctx.translate(8, 12);
    ctx.rotate(0.4 + Math.sin(p.ph * 1.6) * 0.3);
    ctx.beginPath();
    ctx.ellipse(0, 0, 14, 5, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(34, -5, 5.5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#0b0b0b';
    ctx.beginPath();
    ctx.arc(36, -5, 2.8, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#3d0d0d';
    ctx.beginPath();
    ctx.ellipse(36, 9, 18, 4 + (p.mouth || 0) * 8, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(24 + i * 7, 5, 3, 4 + (p.mouth || 0) * 5);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-30, -14);
    ctx.quadraticCurveTo(0, -8 + swim, 40, -10);
    ctx.stroke();
  }
  ctx.restore();
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.ellipse(p.x, FLOOR_Y + 8, p.size * 0.4, 6, 0, 0, TAU);
  ctx.fill();
}

function drawJelly(j) {
  ctx.save();
  // s/c/s3/c3 are cached by update.js. Everything below that used to be a Math.sin
  // is now an angle-sum identity over them: sin(ph+k) = s·cos(k) + c·sin(k), with
  // cos(k)/sin(k) constant per tentacle (TENT_C/TENT_S). 12 trig calls per jelly
  // per frame -> 0 in render, 4 in update.
  ctx.translate(j.x, j.y + j.s * 4);
  const squash = 1 + j.s * 0.12;
  ctx.scale(1, squash);
  const jr = Math.round(j.r);
  const g = grad('jelly' + jr, () => {
    const gg = ctx.createLinearGradient(0, -jr, 0, jr);
    gg.addColorStop(0, 'rgba(255,180,220,0.9)');
    gg.addColorStop(1, 'rgba(180,80,160,0.75)');
    return gg;
  });
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, j.r, Math.PI, TAU);
  ctx.quadraticCurveTo(j.r, j.r * 0.3, j.r * 0.5, j.r * 0.15);
  ctx.quadraticCurveTo(0, j.r * 0.35, -j.r * 0.5, j.r * 0.15);
  ctx.quadraticCurveTo(-j.r, j.r * 0.3, -j.r, 0);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,160,210,0.7)';
  ctx.beginPath(); // all five tentacles in ONE path = one stroke, not five
  for (let i = 0; i < 5; i++) {
    const off = (i - 2) * j.r * 0.32;
    ctx.moveTo(off, j.r * 0.1);
    ctx.quadraticCurveTo(
      off + (j.s * TENT_C[i] + j.c * TENT_S[i]) * 8,
      j.r * 0.9,
      off + (j.s3 * TENT_C[i] + j.c3 * TENT_S[i]) * 10,
      j.r * 1.5,
    );
  }
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.beginPath();
  ctx.arc(-j.r * 0.3, -j.r * 0.4, 3, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawNet(n) {
  const alpha = n.warn > 0 ? 0.35 + 0.3 * Math.abs(Math.sin(time * 8)) : 1;
  ctx.save();
  ctx.globalAlpha = alpha;
  // warning shadow on water + splash ring while falling warning
  if (n.warn > 0) {
    // warning is visual only: shadow below + flashing ring above (no words)
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(n.x, FLOOR_Y + 6, n.w * 0.7, 10, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = Math.sin(time * 10) > 0 ? 'rgba(255,90,90,0.9)' : 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(n.x, 20 + Math.sin(time * 10) * 3, n.w * 0.5, 10, 0, 0, TAU);
    ctx.stroke();
  }
  // ropes from top (boat)
  ctx.strokeStyle = '#c9a06a';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(n.x - n.w / 2, n.y);
  ctx.lineTo(n.x - n.w / 2, -10);
  ctx.moveTo(n.x + n.w / 2, n.y);
  ctx.lineTo(n.x + n.w / 2, -10);
  ctx.stroke();
  // boat silhouette
  ctx.fillStyle = 'rgba(5,15,25,0.9)';
  ctx.fillRect(n.x - n.w / 2 - 26, -26, n.w + 52, 16);
  ctx.fillStyle = 'rgba(5,15,25,0.9)';
  ctx.beginPath();
  ctx.moveTo(n.x - 14, -26);
  ctx.lineTo(n.x - 14, -52);
  ctx.lineTo(n.x - 10, -52);
  ctx.lineTo(n.x - 10, -26);
  ctx.fill();
  ctx.fillStyle = '#ff8c42';
  ctx.beginPath();
  ctx.arc(n.x + 18, -18, 4, 0, TAU);
  ctx.fill(); // sailor lamp
  // mesh
  const top = n.y;
  ctx.fillStyle = 'rgba(210,180,130,0.28)';
  ctx.fillRect(n.x - n.w / 2, top, n.w, n.h);
  ctx.strokeStyle = 'rgba(230,205,150,0.85)';
  ctx.lineWidth = 1.2;
  const step = 11;
  ctx.beginPath();
  for (let yy = top; yy <= top + n.h; yy += step) {
    ctx.moveTo(n.x - n.w / 2, yy);
    ctx.lineTo(n.x + n.w / 2, yy);
  }
  for (let xx = n.x - n.w / 2; xx <= n.x + n.w / 2; xx += step) {
    ctx.moveTo(xx, top);
    ctx.lineTo(xx, top + n.h);
  }
  ctx.stroke();
  // weights
  ctx.fillStyle = '#444';
  for (let xx = n.x - n.w / 2; xx <= n.x + n.w / 2; xx += step * 2) {
    ctx.beginPath();
    ctx.arc(xx, top + n.h, 3, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function drawHook(h) {
  const hx = h.hx ?? h.x,
    hy = h.hy ?? 200;
  ctx.save();
  ctx.strokeStyle = 'rgba(20,20,20,0.8)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(h.x, -10);
  ctx.quadraticCurveTo(h.x + Math.sin(h.sway) * 20, hy * 0.5, hx, hy - 20);
  ctx.stroke();
  // hook curve
  ctx.strokeStyle = '#c8ccd2';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(hx, hy - 24);
  ctx.lineTo(hx, hy - 4);
  ctx.arc(hx - 6, hy - 4, 7, 0, Math.PI * 0.9);
  ctx.stroke();
  // bait
  ctx.fillStyle = '#ff5e62';
  ctx.beginPath();
  ctx.arc(hx - 8, hy - 6, 5 + Math.sin(time * 6) * 1, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.beginPath();
  ctx.arc(hx - 9.5, hy - 7.5, 1.6, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawPearl(pl) {
  const bobY = Math.sin(pl.ph) * 3;
  ctx.save();
  ctx.translate(pl.x, pl.y + bobY);
  // clam glow
  ctx.fillStyle = 'rgba(255,233,168,0.18)';
  ctx.beginPath();
  ctx.arc(0, 0, 18, 0, TAU);
  ctx.fill();
  // shell
  ctx.fillStyle = '#8d6a9e';
  ctx.beginPath();
  ctx.ellipse(0, 5, 12, 7, 0, 0, Math.PI);
  ctx.fill();
  ctx.fillStyle = '#b79ac7';
  ctx.beginPath();
  ctx.ellipse(0, 3, 12, 6, 0, Math.PI, TAU);
  ctx.fill();
  // pearl
  const g = grad('pearlOrb', () => {
    const gg = ctx.createRadialGradient(-3, -6, 1, 0, -2, 9);
    gg.addColorStop(0, '#ffffff');
    gg.addColorStop(0.6, '#ffe9c9');
    gg.addColorStop(1, '#c9a06a');
    return gg;
  });
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, -3, 7, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.arc(-2.5, -5.5, 2, 0, TAU);
  ctx.fill();
  ctx.restore();
}
function drawPower(pw) {
  const y = pw.y + Math.sin(pw.ph) * 5;
  ctx.save();
  ctx.translate(pw.x, y);
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.beginPath();
  ctx.arc(0, 0, 20, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, 19, 0, TAU);
  ctx.stroke();
  ctx.font = '16px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(pw.kind === 'shield' ? '🛡️' : pw.kind === 'magnet' ? '🧲' : pw.kind === 'heart' ? '❤️' : '🌿', 0, 1);
  ctx.restore();
}
function drawSeaweed(x, base, s) {
  ctx.save();
  ctx.translate(x, base);
  const segs = 7,
    h = s.h;
  ctx.lineCap = 'round';
  for (let b = -1; b <= 1; b++) {
    ctx.strokeStyle = `hsla(${s.hue},55%,${28 + b * 4}%,0.95)`;
    ctx.lineWidth = s.w + b * 2;
    ctx.beginPath();
    for (let i = 0; i <= segs; i++) {
      const t = i / segs,
        yy = -h * t;
      const xx = Math.sin(time * s.sp + s.ph + t * 3 + b) * 14 * t + b * 8;
      i === 0 ? ctx.moveTo(xx, yy) : ctx.quadraticCurveTo(xx + 6, yy - 8, xx, yy - 10);
    }
    ctx.stroke();
    // leaves
    ctx.fillStyle = `hsla(${s.hue},60%,32%,0.9)`;
    for (let i = 2; i <= segs; i += 2) {
      const t = i / segs,
        yy = -h * t,
        xx = Math.sin(time * s.sp + s.ph + t * 3 + b) * 14 * t + b * 8;
      ctx.beginPath();
      ctx.ellipse(xx + 8, yy, 7, 3.5, 0.5, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}
function drawCoral(x, base, sc, type, ph) {
  ctx.save();
  ctx.translate(x, base);
  ctx.scale(sc, sc);
  if (type === 0) {
    // branching pink
    ctx.strokeStyle = '#ff7d9c';
    ctx.lineCap = 'round';
    ctx.lineWidth = 7;
    const branches = [
      [-18, -40, 0, -70],
      [0, -50, 6, -86],
      [18, -38, 30, -64],
    ];
    for (const [x1, y1, x2, y2] of branches) {
      ctx.beginPath();
      ctx.moveTo(x1, 0);
      ctx.quadraticCurveTo(x1 * 0.6, y1, x2 + Math.sin(ph) * 3, y2);
      ctx.stroke();
    }
    ctx.fillStyle = '#ffb3c6';
    for (const [, , x2, y2] of branches) {
      ctx.beginPath();
      ctx.arc(x2 + Math.sin(ph) * 3, y2, 7, 0, TAU);
      ctx.fill();
    }
  } else if (type === 1) {
    // tube sponge
    for (let i = -1; i <= 1; i++) {
      const hh = 44 + (i + 1) * 10;
      ctx.fillStyle = i === 0 ? '#b78bff' : '#8a5fd6';
      ctx.beginPath();
      ctx.ellipse(i * 14, -hh / 2, 10, hh / 2, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#3d2358';
      ctx.beginPath();
      ctx.ellipse(i * 14, -hh, 7, 4, 0, 0, TAU);
      ctx.fill();
    }
  } else {
    // fan
    ctx.fillStyle = 'rgba(255,140,66,0.9)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-40, -50, -24, -72);
    ctx.quadraticCurveTo(0, -60, 24, -72);
    ctx.quadraticCurveTo(40, -50, 0, 0);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,220,180,0.5)';
    ctx.lineWidth = 1.5;
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(i * 9, -64 + Math.abs(i) * -3);
      ctx.stroke();
    }
  }
  ctx.restore();
}
const crabT = [];
function drawStarfish(x, y, s, color, ph) {
  // cheap 5-arm star: shadow + arms + core, no gradients (phone-safe)
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(0, 2, s, s * 0.4, 0, 0, TAU);
  ctx.fill();
  const wob = Math.sin(ph * 0.7) * 0.06;
  ctx.fillStyle = color;
  for (let a = 0; a < 5; a++) {
    const ang = wob + (a * TAU) / 5 - Math.PI / 2;
    ctx.save();
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.ellipse(0, -s * 0.62, s * 0.3, s * 0.62, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.32, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.16, 0, TAU);
  ctx.fill();
  ctx.restore();
}
function drawCaveRoof(k) {
  // dark rock band closing in from the top + stalactite teeth + glowworm dots.
  // Alpha scales with caveK so open reefs are untouched. Parallax 0.9.
  const roofH = 46 + 78 * k;
  ctx.save();
  // memoised on a 0.05 bucket of k: the roof darkens as you descend, but rebuilding
  // the gradient every frame for a change the eye cannot see is pure waste
  const kb = Math.round(k * 20) / 20;
  const g = grad('caveRoof' + kb, () => {
    const gg = ctx.createLinearGradient(0, 0, 0, 46 + 78 * kb + 30);
    gg.addColorStop(0, 'rgba(2,5,9,' + (0.55 + 0.45 * kb).toFixed(2) + ')');
    gg.addColorStop(1, 'rgba(8,14,22,' + (0.35 + 0.55 * kb).toFixed(2) + ')');
    return gg;
  });
  ctx.fillStyle = g;
  ctx.fillRect(-20, -10, W + 40, roofH + 10);
  for (const t of caveTeeth) {
    const sx = ((((t.x - scrollX * 0.9) % 2600) + 2600) % 2600) - 200;
    if (sx < -80 || sx > W + 80) continue;
    const len = (20 + t.len * k) * (0.9 + 0.1 * Math.sin(time * 0.8 + t.ph));
    ctx.fillStyle = 'rgba(6,10,17,' + (0.5 + 0.5 * k).toFixed(2) + ')';
    ctx.beginPath();
    ctx.moveTo(sx - t.w / 2, roofH - 8);
    ctx.lineTo(sx + t.w / 2, roofH - 8);
    ctx.lineTo(sx + Math.sin(time * 0.6 + t.ph) * 4, roofH - 8 + len);
    ctx.closePath();
    ctx.fill();
  }
  // glowworms: a few cyan specks on the roof that read as cave light
  ctx.fillStyle = 'rgba(125,255,220,' + (0.5 * k).toFixed(2) + ')';
  for (let i = 0; i < 12; i++) {
    const gx = ((((i * 397 + 130 - scrollX * 0.9) % (W + 120)) + (W + 120)) % (W + 120)) - 60;
    const gy = 12 + ((i * 61) % Math.max(20, roofH - 20));
    const tw = 1 + Math.sin(time * 2.4 + i * 1.7) * 0.8;
    ctx.beginPath();
    ctx.arc(gx, gy, Math.max(0.6, tw), 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}
function drawCrabs() {
  // 3 crabs patrolling the floor
  for (let i = 0; i < 3; i++) {
    const cx = ((((i * 420 + 300 - scrollX * 0.95) % (W + 400)) + (W + 400)) % (W + 400)) - 200;
    if (cx < -60 || cx > W + 60) continue;
    const cy = FLOOR_Y + 16 + Math.sin(time * 2 + i * 2) * 2;
    const snap = Math.sin(time * 5 + i * 2) > 0.6 ? 0.5 : 0;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = '#c0392b';
    ctx.beginPath();
    ctx.ellipse(0, 0, 18, 11, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#e74c3c';
    ctx.beginPath();
    ctx.ellipse(0, -4, 14, 7, 0, Math.PI, TAU);
    ctx.fill();
    // eyes
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(-5, -10, 3.5, 0, TAU);
    ctx.arc(5, -10, 3.5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(-5, -10, 1.6, 0, TAU);
    ctx.arc(5, -10, 1.6, 0, TAU);
    ctx.fill();
    // claws snapping
    for (const s of [-1, 1]) {
      ctx.save();
      ctx.translate(s * 20, -2);
      ctx.rotate(s * (0.4 + snap * s));
      ctx.fillStyle = '#e74c3c';
      ctx.beginPath();
      ctx.ellipse(s * 6, 0, 10, 7, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#922b21';
      ctx.beginPath();
      ctx.moveTo(s * 12, -4);
      ctx.lineTo(s * (20 - snap * 8), 0);
      ctx.lineTo(s * 12, 4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    // legs
    ctx.strokeStyle = '#922b21';
    ctx.lineWidth = 2.5;
    for (let l = -1; l <= 1; l++) {
      ctx.beginPath();
      ctx.moveTo(l * 8, 8);
      ctx.lineTo(l * 11, 16);
      ctx.stroke();
    }
    // danger zone hint: red glow under the claws (no words)
    if (Math.abs(player.x - cx) < 90 && player.y > FLOOR_Y - 90) {
      ctx.fillStyle = 'rgba(255,60,60,0.25)';
      ctx.beginPath();
      ctx.ellipse(0, 14, 30, 8, 0, 0, TAU);
      ctx.fill();
    }
    // claw collision
    if (
      state === 'playing' &&
      player.invuln <= 0 &&
      Math.abs(player.x - cx) < 30 &&
      player.y > FLOOR_Y - 70
    )
      damage('crab', cx, cy - 10);
    ctx.restore();
  }
}
// rounded-rect path (compat-safe: NOT ctx.roundRect, missing on older phones)
function rrPath(x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function drawGate(x) {
  const gy = H / 2 - 20;
  ctx.save();
  ctx.translate(x, 0);
  // glow — memoised: built in gate-local coords after the translate, so one cached
  // gradient paints the gate wherever it is on screen (the last per-frame gradient
  // in the renderer; ?perf=2 now reports grads 0)
  ctx.fillStyle = grad('gateGlow', () => {
    const g = ctx.createLinearGradient(0, 80, 0, H - 60);
    g.addColorStop(0, 'rgba(61,245,166,0)');
    g.addColorStop(1, 'rgba(61,245,166,0.35)');
    return g;
  });
  ctx.fillRect(-70, 80, 140, H);
  // two coral pillars
  drawCoral(-52, FLOOR_Y, 1.6, 0, time);
  drawCoral(52, FLOOR_Y, 1.6, 2, time + 2);
  // arch banner
  ctx.fillStyle = 'rgba(3,30,45,0.85)';
  ctx.strokeStyle = '#3df5a6';
  ctx.lineWidth = 3;
  ctx.beginPath();
  rrPath(-72, 84, 144, 44, 12);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#7dffc4';
  ctx.font = '900 17px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('🏁 FINISH', 0, 112);
  // shimmering curtain
  ctx.save();
  ctx.globalAlpha = 0.35 + 0.15 * Math.sin(time * 6);
  ctx.fillStyle = '#7dffc4';
  for (let yy = 140; yy < FLOOR_Y; yy += 16)
    ctx.fillRect(-46 + Math.sin(time * 4 + yy * 0.1) * 4, yy, 92, 3);
  ctx.restore();
  ctx.restore();
}
