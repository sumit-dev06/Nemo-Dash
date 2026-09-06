/* Nemo Dash service worker — offline-first cache. Bump on release. */
const CACHE = 'nemo-dash-v2.4';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/utils.js',
  './js/audio.js',
  './js/data.js',
  './js/state.js',
  './js/world.js',
  './js/flow.js',
  './js/update.js',
  './js/render.js',
  './js/ui.js',
  './assets/logo.svg',
  './assets/favicon.svg',
  './assets/favicon-32x32.png',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/sfx/click.mp3',
  './assets/sfx/coin.mp3',
  './assets/sfx/near.mp3',
  './assets/sfx/hurt.mp3',
  './assets/sfx/chomp.mp3',
  './assets/sfx/gulp.mp3',
  './assets/sfx/locked.mp3',
  './assets/sfx/lunge.mp3',
  './assets/sfx/boost.mp3',
  './assets/sfx/empty.mp3',
  './assets/sfx/trap.mp3',
  './assets/sfx/shield.mp3',
  './assets/sfx/splash.mp3',
  './assets/sfx/power.mp3',
  './assets/sfx/win.mp3',
  './assets/sfx/lose.mp3',
  './assets/sfx/roar.mp3',
  './assets/sfx/heart.mp3',
  './assets/sfx/zap.mp3',
  './assets/sfx/snap.mp3',
  './assets/sfx/music.mp3',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(
      (hit) =>
        hit ||
        fetch(e.request).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
          return res;
        }),
    ),
  );
});
