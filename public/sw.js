/**
 * ════════════════════════════════════════════════════════════════
 *  Service Worker - Kyvzon Platform
 * ════════════════════════════════════════════════════════════════
 *
 *  استراتيجية التخزين المؤقت:
 *  ─────────────────────────────────────────────────────────────────
 *  1) التنقّل (HTML): Network-first مع fallback للكاش (صفحة offline)
 *  2) الأصول الثابتة (JS/CSS/خطوط/صور): Stale-while-revalidate (سريع)
 *  3) Supabase API + Auth: BYPASS (لا تخزين — بيانات حيّة + مصادقة)
 *  4) Realtime (WebSocket): BYPASS تلقائياً (SW لا يعترض ws://)
 *  ════════════════════════════════════════════════════════════════
 */

const SW_VERSION = 'kyvzon-platform-v1';
const STATIC_CACHE = `${SW_VERSION}-static`;
const RUNTIME_CACHE = `${SW_VERSION}-runtime`;

// قائمة الأصول الأساسية للتخزين عند التثبيت (precache)
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  '/offline.html',
];

// أنماط الـ URLs التي يجب تجاوزها (عدم التخزين)
const BYPASS_PATTERNS = [
  /supabase\.co/i,          // كل طلبات Supabase (REST, Auth, Storage)
  /googleapis\.com/i,       // Gemini API
  /generativelanguage/i,    // AI APIs
  /\/auth\//i,              // مصادقة
  /\/realtime\//i,          // Realtime WebSocket fallback
];

// أنماط الأصول الثابتة (نفس النطاق فقط)
const isStaticAsset = (url) => {
  const sameOrigin = url.origin === self.location.origin;
  return sameOrigin && /\.(?:js|css|woff2?|ttf|png|jpg|jpeg|svg|gif|webp|ico)$/i.test(url.pathname);
};

// ════════════════════════════════════════════════════════════════
//  Install: Precache الأصول الأساسية
// ════════════════════════════════════════════════════════════════
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      // نضيف واحداً تلو الآخر لتجنّب فشل الكل إذا كان أحدها غائباً
      return Promise.allSettled(
        PRECACHE_URLS.map((url) => cache.add(url))
      );
    }).then(() => self.skipWaiting())
  );
});

// ════════════════════════════════════════════════════════════════
//  Activate: تنظيف الكاش القديم
// ════════════════════════════════════════════════════════════════
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => !key.startsWith(SW_VERSION))
          .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// ════════════════════════════════════════════════════════════════
//  Fetch: التوجيه حسب نوع الطلب
// ════════════════════════════════════════════════════════════════
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // فقط GET (تجاهل POST/PUT/DELETE — تذهب للشبكة دائماً)
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // ─── BYPASS: Supabase + APIs خارجية ───
  if (BYPASS_PATTERNS.some((pattern) => pattern.test(url.href))) {
    return; // دع الطلب يذهب للشبكة مباشرةً
  }

  // ─── التنقّل (HTML pages): Network-first ───
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  // ─── الأصول الثابتة: Stale-while-revalidate ───
  if (isStaticAsset(url)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // ─── افتراضي: حاول الشبكة ثم الكاش ───
  event.respondWith(networkFirst(request));
});

// ════════════════════════════════════════════════════════════════
//  الاستراتيجيات
// ════════════════════════════════════════════════════════════════

// Network-first: الشبكة أولاً، عند الفشل الكاش، عند فشلهما صفحة offline
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    // تخزين النسخة الناجحة في runtime cache
    const cache = await caches.open(RUNTIME_CACHE);
    cache.put(request, networkResponse.clone());
    return networkResponse;
  } catch (err) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) return cachedResponse;

    // للتنقّل: اعرض صفحة offline
    if (request.mode === 'navigate') {
      const offlinePage = await caches.match('/offline.html');
      if (offlinePage) return offlinePage;
    }
    throw err;
  }
}

// Stale-while-revalidate: الكاش فوراً + تحديث بالخلفية
async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cachedResponse = await cache.match(request);

  const fetchPromise = fetch(request)
    .then((networkResponse) => {
      if (networkResponse && networkResponse.ok) {
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    })
    .catch(() => cachedResponse); // تجاهل فشل الشبكة

  return cachedResponse || fetchPromise;
}

// ════════════════════════════════════════════════════════════════
//  Message: تحديث فوري من التطبيق
// ════════════════════════════════════════════════════════════════
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
