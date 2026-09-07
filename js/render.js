//  RENDER — layered realistic underwater scene
// ============================================================
// Static layers (water, rays, shimmer bar, vignette) are baked once per resize
// into bgCache: one blit replaces ~8 fullscreen gradient fills. Big phone win.
let bgCache = null;
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
  const open = ['#0d4a6e', '#083a5c', '#052a44', '#031c2e'];
  const cave = ['#02090f', '#01070d', '#010509', '#000304'];
  return { stops: open.map((c, i) => hexLerp(c, cave[i], k)), k };
}
function bakeBackground() {
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
    b.globalAlpha = 0.1 * (1 - k) + 0.01; // god rays die out in the cave
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

  // 4) sandy floor with texture
  const sand = ctx.createLinearGradient(0, FLOOR_Y, 0, H);
  sand.addColorStop(0, '#8a6f4d');
  sand.addColorStop(0.25, '#6e5739');
  sand.addColorStop(1, '#2e2114');
  ctx.fillStyle = sand;
  ctx.fillRect(-20, FLOOR_Y, W + 40, H - FLOOR_Y + 20);
  ctx.fillStyle = 'rgba(255,235,190,0.25)';
  ctx.fillRect(-20, FLOOR_Y, W + 40, 3);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  for (let i = 0; i < 40; i++) {
    const sx = ((((i * 97 - scrollX * 0.9) % (W + 100)) + (W + 100)) % (W + 100)) - 50;
    ctx.beginPath();
    ctx.ellipse(sx, FLOOR_Y + 18 + ((i * 53) % 34), 14 + (i % 4) * 5, 3.5, 0, 0, TAU);
    ctx.fill();
  }
  // cave floor lies in shadow
  if (caveK() > 0.02) {
    ctx.fillStyle = 'rgba(0,2,8,' + (0.55 * caveK()).toFixed(2) + ')';
    ctx.fillRect(-20, FLOOR_Y, W + 40, H - FLOOR_Y + 20);
  }

  // 5) current bands (teal translucent)
  for (const c of currents) {
    const yy = c.y + Math.sin(time * 1.3 + c.ph) * 10;
    ctx.save();
    ctx.globalAlpha = 0.16 + 0.06 * Math.sin(time * 3 + c.ph);
    ctx.fillStyle = c.force > 0 ? '#2ee6a8' : '#4dc9ff';
    ctx.fillRect(0, yy - c.h / 2, W, c.h);
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = '#dfffff';
    ctx.lineWidth = 1.5;
    for (let k = 0; k < 6; k++) {
      const lx = ((((k * 220 + time * 160 * c.force) % (W + 120)) + (W + 120)) % (W + 120)) - 60;
      ctx.beginPath();
      for (let s = 0; s <= 20; s++) {
        const xx = lx + s * 6;
        const yyy =
          yy - c.h / 2 + 8 + ((c.h - 16) * s) / 20 + Math.sin(time * 4 + s * 0.5 + c.ph) * 6;
        s === 0 ? ctx.moveTo(xx, yyy) : ctx.lineTo(xx, yyy);
      }
      ctx.stroke();
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

  // 7) finish gate
  if (gate) drawGate(gate.x);

  // 8) pearls & powerups
  for (const pl of pearlsArr) drawPearl(pl);
  for (const pw of powers) drawPower(pw);

  // 9) hooks & nets (behind fish)
  for (const hk of hooks) drawHook(hk);
  for (const n of nets) drawNet(n);

  // 10) jellies & predators
  for (const j of jellies) drawJelly(j);
  for (const f of fries) drawFry(f, -1);
  for (const p of predators) {
    drawPredator(p);
    if (p.lunge > 0) drawStrikeAlert(p); // red "!" while it winds up — your cue to move
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
    ctx.save();
    ctx.globalAlpha = 0.05;
    ctx.strokeStyle = '#cfffff';
    ctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      for (let x = 0; x <= W; x += 24) {
        const y = FLOOR_Y + 8 + i * 6 + Math.sin(x * 0.05 + time * 2 + i) * 3;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
  if (!bgCache) {
    const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.85);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,5,12,0.55)');
    ctx.fillStyle = v;
    ctx.fillRect(-20, -20, W + 40, H + 40);
  }

  // status effects ring
  if (player.slow > 0) {
    ctx.strokeStyle = 'rgba(125,255,196,0.5)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(player.x, player.y, 34 + Math.sin(time * 6) * 3, 0, TAU);
    ctx.stroke();
  }
  if (player.magnet > 0) {
    ctx.strokeStyle = 'rgba(255,159,243,0.45)';
    ctx.setLineDash([8, 8]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(player.x, player.y, 60, time, time + TAU);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (state === 'menu') drawDemoFish(); // opening screen: meet your fish, see snacks swim by
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
}

// Golden tracking glow + "YOU" arrow so Nemo never blends in or gets "lost"
function drawPlayerMarker() {
  if ((state !== 'playing' && state !== 'paused') || player.dead) return;
  const y = clamp(player.y, 20, H - 20);
  ctx.save();
  const gl = ctx.createRadialGradient(player.x, y, 4, player.x, y, 44);
  gl.addColorStop(0, 'rgba(255,200,90,0.30)');
  gl.addColorStop(1, 'rgba(255,200,90,0)');
  ctx.fillStyle = gl;
  ctx.beginPath();
  ctx.arc(player.x, y, 44, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = '#ffd66e';
  ctx.font = '900 11px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('▼ YOU', player.x, y - 34 + Math.sin(time * 4) * 3);
  ctx.restore();
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
  const wag = Math.sin(f.ph) * 0.5;
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
  const swim = Math.sin(p.ph) * 6;
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
    ctx.rotate(Math.sin(p.ph) * 0.4);
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
    ctx.quadraticCurveTo(52, -46, 66, -30 + Math.sin(p.ph) * 4);
    ctx.stroke();
    ctx.fillStyle = '#cffff0';
    const lureImg = getLureSprite();
    const lureY = -30 + Math.sin(p.ph) * 4;
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
    ctx.rotate(Math.sin(p.ph) * 0.5);
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
    ctx.rotate(Math.sin(p.ph) * 0.45);
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
  ctx.translate(j.x, j.y + Math.sin(j.ph) * 4);
  const squash = 1 + Math.sin(j.ph) * 0.12;
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
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(i * j.r * 0.32, j.r * 0.1);
    ctx.quadraticCurveTo(
      i * j.r * 0.32 + Math.sin(j.ph + i) * 8,
      j.r * 0.9,
      i * j.r * 0.32 + Math.sin(j.ph * 1.3 + i) * 10,
      j.r * 1.5,
    );
    ctx.stroke();
  }
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
  ctx.fillText(pw.kind === 'shield' ? '🛡️' : pw.kind === 'magnet' ? '🧲' : '🌿', 0, 1);
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
  const g = ctx.createLinearGradient(0, 0, 0, roofH + 30);
  g.addColorStop(0, 'rgba(2,5,9,' + (0.55 + 0.45 * k).toFixed(2) + ')');
  g.addColorStop(1, 'rgba(8,14,22,' + (0.35 + 0.55 * k).toFixed(2) + ')');
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
  // glow
  const glow = ctx.createLinearGradient(0, 80, 0, H - 60);
  glow.addColorStop(0, 'rgba(61,245,166,0)');
  glow.addColorStop(1, 'rgba(61,245,166,0.35)');
  ctx.fillStyle = glow;
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
