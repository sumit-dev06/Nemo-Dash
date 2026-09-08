// ---------- input ----------
window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', ' '].includes(e.key)) e.preventDefault();
  if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') input.up = true;
  if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') input.down = true;
  if (e.key === 'm' || e.key === 'M') toggleMute();
  if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') togglePause();
  if (e.key === 'Enter' && state === 'menu') startLevel(1);
  if (e.key === 'Shift' || e.key === ' ') {
    // an empty tank must SAY it is empty on the keyboard too, not just on the pad
    if (state === 'playing' && !player.dead && player.boost <= 1 && !input.boostHeld)
      AudioSys.boostEmpty();
    input.boostHeld = true;
  }
});
window.addEventListener('keyup', (e) => {
  if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') input.up = false;
  if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') input.down = false;
  if (e.key === 'Shift' || e.key === ' ') input.boostHeld = false;
});
function pointerPos(e) {
  const r = canvas.getBoundingClientRect();
  if (!r.height || !isFinite(r.height)) return player.y;
  const cy = e.touches ? e.touches[0].clientY : e.clientY;
  const v = ((cy - r.top) / r.height) * H;
  return isFinite(v) ? clamp(v, 0, H) : player.y;
}
function isTouchDevice() {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}
// Desktop mouse-drag steering ONLY. On phones this used to run alongside the
// joystick: any stray thumb, palm or second finger on the play area set
// pointerActive and yanked the fish to that height, fighting the stick. One
// device, one control scheme.
if (!isTouchDevice()) {
  canvas.addEventListener('pointerdown', (e) => {
    AudioSys.ensure();
    input.pointerActive = true;
    input.pointerY = pointerPos(e);
    canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (input.pointerActive) input.pointerY = pointerPos(e);
  });
  window.addEventListener('pointerup', () => {
    input.pointerActive = false;
  });
  window.addEventListener('pointercancel', () => {
    input.pointerActive = false;
  });
}
document.addEventListener('visibilitychange', () => {
  // never come back from a tab switch with the stick still latched
  if (typeof window.joyReset === 'function') window.joyReset();
  input.pointerActive = false;
  if (document.hidden && state === 'playing') togglePause();
});
window.addEventListener('blur', () => {
  if (typeof window.joyReset === 'function') window.joyReset();
  input.pointerActive = false;
});
// landscape-only phones: portrait shows the rotate animation + install.
// Menu stays hidden behind it in mobile browsers so there is no scrollable
// menu in portrait — just "rotate to play" + native install when ready.
function checkRotate() {
  const r = document.getElementById('rotate');
  if (!r) return;
  const portrait = window.innerHeight > window.innerWidth;
  const mobile = isTouchDevice();
  if (mobile && portrait) {
    r.classList.remove('hidden');
    document.body.classList.add('portrait-block');
    // portrait install CTA: native-only — visible only when Chrome says installable
    const pb = document.getElementById('btnInstallPortrait');
    const canNative = !!deferredInstall && !isStandalone();
    if (pb) pb.style.display = canNative ? '' : 'none';
    const note = r.querySelector('.rotate-note');
    if (note) note.style.display = canNative ? '' : 'none';
    if (state === 'playing') togglePause();
  } else {
    r.classList.add('hidden');
    document.body.classList.remove('portrait-block');
  }
}
window.addEventListener('resize', checkRotate);
window.addEventListener('orientationchange', () => setTimeout(checkRotate, 250));
canvas.addEventListener(
  'touchstart',
  (e) => {
    AudioSys.ensure();
  },
  { passive: true },
);

// ---------- buttons ----------
function toggleMute() {
  AudioSys.ensure();
  AudioSys.setMuted(!AudioSys.muted);
  document.getElementById('btnMute').textContent = AudioSys.muted ? '🔇' : '🔊';
}
function togglePause() {
  if (state === 'playing') {
    state = 'paused';
    // let go of the stick: the overlay swallows the pointerup, so without this
    // the fish resumes still steering wherever the thumb happened to be
    if (typeof window.joyReset === 'function') window.joyReset();
    input.pointerActive = false;
    refreshPauseCard();
    show('paused');
  } else if (state === 'paused') {
    state = 'playing';
    hide('paused');
    lastT = performance.now();
  }
}
function refreshPauseCard() {
  const b = document.getElementById('pauseBests');
  if (b)
    b.textContent =
      '⭐ Best reef: ' + best + ' • Endless: ' + bestEndless + ' (' + bestEndlessDist + 'm)';
  updateSoundBtn();
}
function updateSoundBtn() {
  const b = document.getElementById('btnSound2');
  if (b) b.textContent = AudioSys.muted ? '🔇 Sound: off' : '🔊 Sound: on';
}
document.getElementById('btnMute').onclick = () => {
  toggleMute();
};
document.getElementById('btnPause').onclick = () => {
  AudioSys.click();
  togglePause();
};
document.getElementById('btnPlay').onclick = () => {
  AudioSys.ensure();
  AudioSys.click();
  goFullscreen();
  if (lastEndless && endlessUnlocked) startEndless();
  else startLevel(clamp(lastLevel, 1, Math.min(MAX_LEVEL, maxLevel)));
};
document.getElementById('btnHow').onclick = () => {
  AudioSys.ensure();
  AudioSys.click();
  goFullscreen();
  hide('menu');
  show('how');
};
document.getElementById('btnHowBack').onclick = () => {
  AudioSys.click();
  hide('how');
  startLevel(1);
};
const _btnMenuInstall = document.getElementById('btnInstall');
if (_btnMenuInstall) _btnMenuInstall.onclick = installClick;
document.getElementById('btnInstallTop').onclick = installClick;
const _btnPortrait = document.getElementById('btnInstallPortrait');
if (_btnPortrait) _btnPortrait.onclick = installClick;
document.getElementById('btnInstallX').onclick = () => {
  AudioSys.click();
  try {
    localStorage.setItem('nemoInstallX_v2', '1');
  } catch (e) {}
  showInstallUI();
};
document.getElementById('btnIosBack').onclick = () => {
  AudioSys.click();
  hide('iosGuide');
  show('menu');
};
document.getElementById('btnLevels').onclick = () => {
  AudioSys.ensure();
  AudioSys.click();
  goFullscreen();
  hide('menu');
  renderLevels();
  show('levels');
};
document.getElementById('btnLevelsBack').onclick = () => {
  AudioSys.click();
  hide('levels');
  renderRoster();
  updateEndlessBtn();
  updatePlayBtn();
  show('menu');
};
document.getElementById('btnNext').onclick = () => {
  AudioSys.click();
  if (level >= MAX_LEVEL) startEndless();
  else startLevel(level + 1);
};
function updateEndlessBtn() {
  const b = document.getElementById('btnEndless');
  const l = document.getElementById('endlessLock');
  if (!b) return;
  if (endlessUnlocked) {
    b.textContent = '∞ ENDLESS';
    b.style.opacity = '1';
    if (l) l.textContent = '🌊 Endless Reef open — chase your best: ' + bestEndlessDist + 'm';
  } else {
    b.textContent = '🔒 ENDLESS';
    b.style.opacity = '0.55';
    if (l) l.textContent = '🏆 Clear Level ' + ENDLESS_AT + ' to unlock Endless Reef';
  }
  const lv = document.getElementById('btnLevels');
  if (lv) lv.textContent = '🌊 ' + Math.min(maxLevel, MAX_LEVEL) + '/' + MAX_LEVEL;
}
document.getElementById('btnEndless').onclick = () => {
  AudioSys.ensure();
  if (!endlessUnlocked) {
    AudioSys.hurt();
    return;
  }
  AudioSys.click();
  goFullscreen();
  startEndless();
};
document.getElementById('btnReplay').onclick = () => {
  AudioSys.click();
  startLevel(level);
};
document.getElementById('btnRetry').onclick = () => {
  AudioSys.click();
  if (endless) startEndless();
  else startLevel(level);
};
document.getElementById('btnMenu').onclick = () => {
  AudioSys.click();
  state = 'menu';
  showHud(false);
  hideAllOverlays();
  renderRoster();
  updateEndlessBtn();
  updatePlayBtn();
  show('menu');
};
document.getElementById('btnResume').onclick = () => {
  AudioSys.click();
  togglePause();
};
document.getElementById('btnRestart2').onclick = () => {
  AudioSys.click();
  hide('paused');
  if (endless) startEndless();
  else startLevel(level);
};
document.getElementById('btnSound2').onclick = () => {
  toggleMute();
  updateSoundBtn();
};
document.getElementById('btnQuit').onclick = () => {
  AudioSys.click();
  state = 'menu';
  hide('paused');
  showHud(false);
  renderRoster();
  updateEndlessBtn();
  updatePlayBtn();
  show('menu');
};

// ---------- touch joystick (phones, left side) ----------
// Floating-origin stick: wherever your thumb lands becomes the centre, so the
// knob never teleports to full deflection when you press near the rim.
// Drag: up/down steers, right surges forward.
// Left half is ignored on purpose — the fish never swims backwards.
function setupTouchNav() {
  const nav = document.getElementById('touchNav');
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) nav.classList.add('show');
  const jz = document.getElementById('joyZone');
  const knob = document.getElementById('joyKnob');
  const R = 48; // thumb travel for full deflection, px (was 34 — only ~5mm, near-binary)
  let KR = 34; // knob travel inside the pad; re-measured per touch (pad shrinks on small screens)
  const DEAD = 0.06; // tiny — the floating origin removes the need for a big dead zone
  let joyId = null; // pointerId that owns the stick; stray fingers are ignored
  let ox = 0,
    oy = 0; // floating origin — set wherever the thumb first lands
  let kx = 0,
    ky = 0; // last knob offset written (skip redundant style writes)
  const setKnob = (dx, dy) => {
    if (!knob) return;
    const nx = Math.round(dx * KR),
      ny = Math.round(dy * KR);
    if (nx === kx && ny === ky) return; // no-op writes still cost a style recalc
    kx = nx;
    ky = ny;
    knob.style.transform =
      'translate3d(calc(-50% + ' + nx + 'px), calc(-50% + ' + ny + 'px), 0)';
  };
  const reset = (e) => {
    // only the finger that owns the stick may release it
    if (e && joyId !== null && e.pointerId !== undefined && e.pointerId !== joyId) return;
    joyId = null;
    input.joyTX = 0;
    input.joyTY = 0;
    setKnob(0, 0);
  };
  window.joyReset = reset; // pause / blur / state changes must be able to let go
  if (jz) {
    const move = (e) => {
      if (joyId === null || e.pointerId !== joyId) return;
      if (e.cancelable) e.preventDefault();
      let dx = (e.clientX - ox) / R;
      let dy = (e.clientY - oy) / R;
      const m = Math.hypot(dx, dy);
      if (m > 1) {
        dx /= m;
        dy /= m;
      }
      if (Math.hypot(dx, dy) < DEAD) {
        dx = 0;
        dy = 0; // fish rests when the thumb does
      }
      input.joyTX = Math.max(0, dx); // right only — never backwards
      input.joyTY = dy;
      setKnob(dx, dy);
    };
    jz.addEventListener('pointerdown', (e) => {
      if (joyId !== null) return; // already owned — ignore extra fingers
      AudioSys.ensure();
      joyId = e.pointerId;
      // one layout read per touch (never per move): keeps the knob inside the pad
      // at whatever size the current breakpoint gave us
      if (knob) KR = Math.max(12, (jz.clientWidth - knob.offsetWidth) / 2 - 2);
      // floating origin: this touch point IS the centre, so the stick reads 0
      ox = e.clientX;
      oy = e.clientY;
      input.joyTX = 0;
      input.joyTY = 0;
      setKnob(0, 0);
      try {
        jz.setPointerCapture(e.pointerId);
      } catch (err) {}
      if (e.cancelable) e.preventDefault();
    });
    jz.addEventListener('pointermove', move);
    jz.addEventListener('pointerup', reset);
    jz.addEventListener('pointercancel', reset);
    // capture can be revoked by the browser (gesture, tab switch, system UI).
    // Without this the stick stayed latched at its last value and the fish kept
    // swimming into a wall until the next touch.
    jz.addEventListener('lostpointercapture', reset);
  }
  // boost button: tap toggles the burst. Pointer events ONLY — binding touchstart
  // too would fire twice per tap (toggle on, then straight back off).
  const bb = document.getElementById('boostBtn');
  const bw = document.getElementById('boostWrap');
  if (bw) bw.classList.add('show');
  bb.addEventListener('pointerdown', toggleBoost);
  bb.addEventListener('pointerup', (e) => {
    if (e) e.preventDefault();
  });
}
function toggleBoost(e) {
  if (e) e.preventDefault();
  AudioSys.ensure();
  if (player.boostToggle || input.boostHeld) {
    player.boostToggle = false;
    input.boostHeld = false;
  } else if (player.boost > 1 && state === 'playing' && !player.dead) {
    player.boostToggle = true;
    AudioSys.click();
  } else AudioSys.boostEmpty();
}
setupTouchNav();

// ---------- boot ----------
// on-device error trap: if anything ever breaks, the player sees it (screenshot-able)
window.addEventListener('error', (e) => {
  const b = document.getElementById('errBox');
  if (b) {
    b.style.display = 'block';
    b.textContent =
      '⚠ ' +
      (e.message || 'error') +
      ' @line ' +
      (e.lineno || '?') +
      ' — screenshot & send us this!';
  }
});
document.getElementById('stage').addEventListener('contextmenu', (e) => e.preventDefault());
// Fullscreen happens ONLY on game-start taps (SWIM / reef / retry), never on
// every tap — so Chrome's system "to exit full screen..." toast appears at
// most once per game start, not repeatedly. Installed PWA needs no API at
// all (standalone = fullscreen, zero toast).
function lockLandscape() {
  try {
    if (screen.orientation && screen.orientation.lock)
      screen.orientation.lock('landscape').catch(() => {});
  } catch (e) {}
}
function goFullscreen() {
  try {
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      lockLandscape();
      return;
    }
    const el = document.documentElement;
    if (el.requestFullscreen && !document.fullscreenElement)
      el.requestFullscreen({ navigationUI: 'hide' })
        .then(lockLandscape)
        .catch(() => lockLandscape());
    else if (el.webkitRequestFullscreen && !document.webkitFullscreenElement)
      el.webkitRequestFullscreen();
    else lockLandscape();
  } catch (e) {}
}
// PWA: offline cache when served over http(s); silent no-op on file://
// ?nosw=1 skips registration and tears down any existing worker — the offline
// cache is keyed on the release name and serves cache-first with ignoreSearch,
// so during local development it happily hands back the previous build's JS.
let _noSW = false;
try {
  _noSW = new URLSearchParams(location.search).get('nosw') === '1';
} catch (e) {}
if ('serviceWorker' in navigator) {
  if (_noSW) {
    navigator.serviceWorker
      .getRegistrations()
      .then((rs) => rs.forEach((r) => r.unregister()))
      .catch(() => {});
    if (window.caches) caches.keys().then((ks) => ks.forEach((k) => caches.delete(k)));
  } else {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
}
// install prompt → reveal the INSTALL APP button (Android/Chrome; iOS uses Share → Add to Home Screen)
let deferredInstall = null;
function isIOS() {
  try {
    return (
      /iphone|ipad|ipod/i.test(navigator.userAgent || '') ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    );
  } catch (e) {
    return false;
  }
}
function isStandalone() {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  } catch (e) {
    return false;
  }
}
// install UI: top toggle ALWAYS visible (unless installed/dismissed),
// native dialog when Chrome says installable. Toggle never disappears just
// because the prompt is not ready yet (e.g. LAN http test) — clicking it
// fires the real "Install app / Nemo Dash / Cancel / Install" sheet when
// available, otherwise a small note (never a shortcut flow, never a modal).
function installDismissed() {
  try {
    return localStorage.getItem('nemoInstallX_v2') === '1';
  } catch (e) {
    return false;
  }
}
function maybeShowInstall() {
  showInstallUI();
}
function showInstallUI() {
  const b = document.getElementById('btnInstall');
  const bar = document.getElementById('installBanner');
  const stage = document.getElementById('stage');
  const pb = document.getElementById('btnInstallPortrait');
  const showBar = !isStandalone() && !installDismissed();
  if (bar) bar.classList.toggle('hidden', !showBar);
  if (stage) stage.classList.toggle('show-ib', !!showBar);
  if (b) b.classList.toggle('hidden', true); // menu install removed (top banner only)
  if (pb) pb.style.display = showBar ? '' : 'none';
  checkRotate();
}
function showInstallToast(html) {
  const t = document.getElementById('installToast');
  if (!t) return;
  t.innerHTML = html + '<br><span class="toast-x">GOT IT</span>';
  t.classList.remove('hidden');
  const x = t.querySelector('.toast-x');
  if (x)
    x.onclick = () => {
      try {
        AudioSys.click();
      } catch (e) {}
      t.classList.add('hidden');
    };
  clearTimeout(showInstallToast._t);
  showInstallToast._t = setTimeout(() => t.classList.add('hidden'), 9000);
}
async function installClick() {
  AudioSys.ensure();
  // Real native sheet first: "Install app / Nemo Dash / Cancel / Install".
  if (deferredInstall) {
    AudioSys.click();
    try {
      deferredInstall.prompt();
      await deferredInstall.userChoice.catch(() => {});
    } catch (e) {}
    deferredInstall = null;
    showInstallUI();
    return;
  }
  // Toggle is visible but browser has no native prompt yet (LAN http test,
  // no SW yet, iOS). Small note only — no shortcut flow, no fullscreen modal.
  AudioSys.click();
  const secure = window.isSecureContext;
  showInstallToast(
    secure
      ? '<b>Install is getting ready…</b> open this site in <b>Chrome Android over https</b> (your github.io link). Chrome then shows the system <b>Install app</b> sheet.'
      : '<b>Heads up:</b> this test link is <b>http LAN</b> — browsers block real app install here. Open your <b>https github.io link in Chrome Android</b> to get the system <b>Install app</b> sheet.',
  );
}
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstall = e;
  maybeShowInstall();
});
window.addEventListener('appinstalled', () => {
  deferredInstall = null;
  showInstallUI();
  checkRotate();
});
fitScreen();
seedDecor();
cacheHud();
document.getElementById('hudBest').textContent = best;
document.getElementById('verNum').textContent = VERSION;
renderRoster();
updateEndlessBtn();
updatePlayBtn();
maybeShowInstall();
checkRotate();
showHud(false);
// boot splash fades once the first frame is up (fast everywhere, failsafe 2.5s
// so it can never trap the menu if something stalls).
function hideBoot() {
  const b = document.getElementById('boot');
  if (!b || b.classList.contains('hide')) return;
  b.classList.add('hide');
  setTimeout(() => b.classList.add('gone'), 500);
}
requestAnimationFrame(() => setTimeout(hideBoot, 450));
setTimeout(hideBoot, 2500);
// shareable/test links: ?play=3 starts reef 3, ?play=endless starts Endless Reef
try {
  const q = new URLSearchParams(location.search).get('play');
  if (q === 'endless' && endlessUnlocked) startEndless();
  else if (q && +q >= 1 && +q <= Math.min(MAX_LEVEL, maxLevel)) startLevel(+q);
} catch (e) {}
requestAnimationFrame((t) => {
  lastT = t;
  requestAnimationFrame(loop);
});
