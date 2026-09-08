'use strict';
/* ============================================================
   NEMO DASH — offscreen sprite cache
   ------------------------------------------------------------
   Generalises the getLureSprite() trick (render.js) into one
   helper. Art that is static — or animates so slowly the eye
   cannot tell — is drawn ONCE into an offscreen canvas and
   blitted every frame after that.

   Why this exists: a radial gradient costs a full gradient
   build + a rasterised fill EVERY frame. A drawImage of the
   same pixels is a single blit the GPU/compositor already
   knows how to do. On a low-end phone that difference is the
   whole frame budget once there are half a dozen glows on
   screen.

   Rules for callers:
   - key must be unique per LOOK, not per instance. Two anglers
     share one lure sprite; a red starfish and an orange one are
     two keys.
   - never key on something continuous (player.y, time). That
     would grow the cache without bound. Bucket it first.
   - drawFn gets a 2D context whose origin is the top-left of
     the sprite, already scaled by DPR, so draw in CSS pixels.
   - cache is cleared on DPR change so sprites stay crisp when
     the dynamic-resolution stepper moves (see loop() in
     update.js).
   ============================================================ */

const _sprites = {};
let _spriteDPR = 0;
let _spriteBytes = 0; // rough resident-memory tally, surfaced by ?perf=1

// sprite(key, w, h, drawFn) -> HTMLCanvasElement | null
// w/h are CSS pixels. Returns null if canvas creation fails, so every call site
// must keep a vector fallback (the game is still playable with zero sprites).
function sprite(key, w, h, drawFn) {
  const dpr = typeof DPR !== 'undefined' ? DPR : 1;
  if (dpr !== _spriteDPR) {
    // resolution changed: every cached bitmap is now the wrong pixel density
    for (const k in _sprites) delete _sprites[k];
    _spriteBytes = 0;
    _spriteDPR = dpr;
  }
  const hit = _sprites[key];
  if (hit) return hit;
  try {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w * dpr));
    c.height = Math.max(1, Math.ceil(h * dpr));
    const b = c.getContext('2d');
    b.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawFn(b, w, h);
    // stash the CSS size so callers can blit without recomputing it
    c._cw = w;
    c._ch = h;
    _sprites[key] = c;
    _spriteBytes += c.width * c.height * 4;
    return c;
  } catch (e) {
    return null;
  }
}

// blit a sprite CENTRED on (x, y) at CSS size. No-op when the sprite failed.
function blit(img, x, y, scale) {
  if (!img) return false;
  const s = scale || 1;
  const w = img._cw * s,
    h = img._ch * s;
  ctx.drawImage(img, x - w / 2, y - h / 2, w, h);
  return true;
}

// A soft radial glow — by far the most-reused sprite shape in the game.
// rgb is 'r,g,b'; a0 is the alpha at the centre. Radius is in CSS pixels.
function glowSprite(rgb, r, a0) {
  const a = a0 == null ? 0.3 : a0;
  return sprite('glow' + rgb + '|' + r + '|' + a, r * 2, r * 2, (b) => {
    const g = b.createRadialGradient(r, r, Math.max(1, r * 0.08), r, r, r);
    g.addColorStop(0, 'rgba(' + rgb + ',' + a + ')');
    g.addColorStop(0.55, 'rgba(' + rgb + ',' + a * 0.45 + ')');
    g.addColorStop(1, 'rgba(' + rgb + ',0)');
    b.fillStyle = g;
    b.beginPath();
    b.arc(r, r, r, 0, TAU);
    b.fill();
  });
}

// Drop every cached bitmap. Called from bakeBackground() — i.e. on resize, on DPR
// change and at level start — because sprites keyed on the viewport (the seabed
// strip) would otherwise pile up one stale ~1MB bitmap per resize step.
function clearSprites() {
  for (const k in _sprites) delete _sprites[k];
  _spriteBytes = 0;
}

function spriteStats() {
  let n = 0;
  for (const k in _sprites) n++;
  return { count: n, kb: Math.round(_spriteBytes / 1024) };
}
