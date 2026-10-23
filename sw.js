// 오프라인 실행용 서비스 워커: 네트워크 우선(항상 최신), 실패 시 캐시 사본
'use strict';
const CACHE = 'block-chain-rpg-v2';
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'src/ui/style.css', 'vendor/phaser.min.js',
  'src/core.js', 'src/config.js', 'src/rules.js', 'src/data.js',
  'src/battle/StatusEffectSystem.js', 'src/battle/DamageCalculator.js', 'src/battle/Unit.js',
  'src/battle/ChainResolver.js', 'src/battle/BlockManager.js', 'src/battle/SkillExecutor.js',
  'src/battle/BattleManager.js', 'src/meta/Progression.js', 'src/meta/SaveManager.js',
  'src/ui/SpriteData.js', 'src/ui/PixelArt.js', 'src/ui/BattleView.js', 'src/ui/Sound.js', 'src/ui/Screens.js', 'src/main.js',
  'assets/icon-192.png', 'assets/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(fetch(req)
    .then(res => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
      }
      return res;
    })
    .catch(() => caches.match(req, { ignoreSearch: true })));
});
