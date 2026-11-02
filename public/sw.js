// Daily Planner 서비스 워커: 앱 화면을 기기에 저장해 두고, 인터넷이 없어도 열리게 함.
// 일정 데이터는 Firebase가 따로 기기에 저장·동기화하므로 여기서는 화면 파일만 다룬다.
const CACHE = 'planner-shell-v1';
const SHELL = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/apple-touch-icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // 로그인·Firebase 요청은 건드리지 않음
  if (url.origin !== self.location.origin || url.pathname.startsWith('/__/')) return;

  // 페이지 이동: 최신 화면 우선, 오프라인이면 저장된 화면
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/', copy));
          return res;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }

  // 빌드된 파일(/assets/…)은 이름이 바뀌므로 한 번 받으면 저장해 두고 재사용
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      }))
    );
  }
});
