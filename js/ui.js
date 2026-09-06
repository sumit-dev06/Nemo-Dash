// ---------- input ----------
window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', ' '].includes(e.key)) e.preventDefault();
  if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') input.up = true;
  if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') input.down = true;
  if (e.key === 'm' || e.key === 'M') toggleMute();
  if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') togglePause();
  if (e.key === 'Enter' && state === 'menu') startLevel(1);
  if (e.key === 'Shift' || e.key === ' ') input.boostHeld = true;
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
function isTouchDevice() {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'playing') togglePause();
});
// landscape-only phones: portrait shows the turn overlay + pauses the run
function checkRotate() {
  const r = document.getElementById('rotate');
  if (!r) return;
  const portrait = window.innerHeight > window.innerWidth;
  if (isTouchDevice() && portrait) {
    r.classList.remove('hidden');
    if (state === 'playing') togglePause();
  } else r.classList.add('hidden');
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
document.getElementById('btnInstall').onclick = installClick;
document.getElementById('btnInstallTop').onclick = installClick;
document.getElementById('btnInstallX').onclick = () => {
  AudioSys.click();
  try {
    localStorage.setItem('nemoInstallX', '1');
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

// ---------- touch navigation buttons (phones) ----------
function setupTouchNav() {
  const nav = document.getElementById('touchNav');
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) nav.classList.add('show');
  const bind = (id, dir) => {
    const b = document.getElementById(id);
    const on = (e) => {
      e.preventDefault();
      AudioSys.ensure();
      input[dir] = true;
    };
    const off = (e) => {
      if (e) e.preventDefault();
      input[dir] = false;
    };
    b.addEventListener('pointerdown', on);
    b.addEventListener('pointerup', off);
    b.addEventListener('pointercancel', off);
    b.addEventListener('pointerleave', off);
    b.addEventListener('touchstart', on, { passive: false });
    b.addEventListener('touchend', off);
    b.addEventListener('touchcancel', off);
  };
  bind('navUp', 'up');
  bind('navDown', 'down');
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
// fullscreen + landscape on first touch: browsers only allow it after a gesture,
// so the very first tap/click goes fullscreen AND locks sideways (Android Chrome
// rotates the phone by itself). iPhone has no such API: the installed standalone app
// is already fullscreen, and the turn-sideways card guides browser play.
function lockLandscape() {
  try {
    if (screen.orientation && screen.orientation.lock)
      screen.orientation.lock('landscape').catch(() => {});
  } catch (e) {}
}
function goFullscreen() {
  // already there? stand down for good.
  if (document.fullscreenElement || document.webkitFullscreenElement) {
    window.removeEventListener('pointerdown', goFullscreen);
    window.removeEventListener('keydown', goFullscreen);
    return;
  }
  // not there yet: try on EVERY tap/keypress until it takes (the first attempt can
  // fail while the page is still settling — giving up after one try strands phones).
  try {
    const el = document.documentElement;
    if (el.requestFullscreen && !document.fullscreenElement)
      el.requestFullscreen({ navigationUI: 'hide' })
        .then(lockLandscape)
        .catch(() => {});
    else if (el.webkitRequestFullscreen && !document.webkitFullscreenElement)
      el.webkitRequestFullscreen();
    else lockLandscape();
  } catch (e) {}
}
window.addEventListener('pointerdown', goFullscreen);
window.addEventListener('keydown', goFullscreen);
window.addEventListener('fullscreenchange', () => {
  if (document.fullscreenElement) {
    lockLandscape();
    window.removeEventListener('pointerdown', goFullscreen);
    window.removeEventListener('keydown', goFullscreen);
  }
});
// PWA: offline cache when served over http(s); silent no-op on file://
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
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
function installDismissed() {
  try {
    return localStorage.getItem('nemoInstallX') === '1';
  } catch (e) {
    return false;
  }
}
function maybeShowInstall() {
  showInstallUI();
}
// install UI: top banner + menu button, on phones AND desktop.
// Auto prompt when the browser offers it (needs https + service worker);
// otherwise the manual guide. Banner × dismisses the banner for good.
function showInstallUI() {
  const b = document.getElementById('btnInstall');
  const bar = document.getElementById('installBanner');
  const stage = document.getElementById('stage');
  const canPrompt = !!deferredInstall;
  const manual = (isTouchDevice() || isIOS()) && !isStandalone();
  const showBar = (canPrompt || manual) && !installDismissed();
  if (bar) bar.classList.toggle('hidden', !showBar);
  if (stage) stage.classList.toggle('show-ib', !!showBar);
  if (!b) return;
  if (canPrompt) {
    b.classList.remove('hidden');
    b.textContent = '📲 INSTALL APP';
  } else if (manual) {
    b.classList.remove('hidden');
    b.textContent = '📲 GET THE APP';
  } else b.classList.add('hidden');
}
async function installClick() {
  AudioSys.ensure();
  if (deferredInstall) {
    AudioSys.click();
    deferredInstall.prompt();
    await deferredInstall.userChoice.catch(() => {});
    deferredInstall = null;
    showInstallUI();
  } else {
    AudioSys.click();
    hide('menu');
    show('iosGuide');
  }
}
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstall = e;
  maybeShowInstall();
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
