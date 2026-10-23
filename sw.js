// Service Worker：把整個 app 存在裝置上，離線也能開啟。
// 只快取自己的檔案，不轉送任何資料。部署時 deploy-web.sh 會把 VERSION 換成檔案內容的雜湊，
// 檔案有變動時瀏覽器才會安裝新版，app 內出現「有新版本」提示。

const VERSION = '3eb545749db0';
const CACHE = `bedsideink-${VERSION}`;

const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/app.js',
  'js/db.js',
  'js/ink.js',
  'js/model.js',
  'js/state.js',
  'js/surface.js',
  'js/ui.js',
  'js/screens/history.js',
  'js/screens/list.js',
  'js/screens/newpatient.js',
  'js/screens/overview.js',
  'js/screens/scan.js',
  'js/screens/start.js',
  'js/screens/write.js',
  'vendor/jsQR-1.4.0.js',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k.startsWith('bedsideink-') && k !== CACHE).map(k => caches.delete(k)))));
});

// 使用者按下「有新版本」提示列才換版，避免寫到一半被重新載入
self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true })
      ?? (req.mode === 'navigate' ? await cache.match('./') : undefined);
    return hit ?? fetch(req);
  })());
});
