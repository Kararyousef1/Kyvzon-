/**
 * ════════════════════════════════════════════════════════════════
 *  Service Worker - Kyvzon Platform (Enhanced Phase 3 Pre-caching)
 * ════════════════════════════════════════════════════════════════
 *
 *  استراتيجية التخزين المؤقت المتقدمة:
 *  ─────────────────────────────────────────────────────────────────
 *  1) التنقّل (HTML): Network-first مع fallback للكاش (صفحة offline)
 *  2) الأصول الثابتة (JS/CSS/خطوط/صور): Stale-while-revalidate (سريع)
 *  3) Supabase API + Auth: BYPASS (لا تخزين — بيانات حيّة + مصادقة)
 *  4) Realtime (WebSocket): BYPASS تلقائياً (SW لا يعترض ws://)
 *  5) Web Push Notifications: استقبال وعرض الإشعارات الفورية
 *  6) Pre-caching للأصول الحرجة لضمان التحميل الفوري دون اتصال
 *  ════════════════════════════════════════════════════════════════
 */

const SW_VERSION = 'kyvzon-platform-v2';
const STATIC_CACHE = `${SW_VERSION}-static`;
const RUNTIME_CACHE = `${SW_VERSION}-runtime`;

// قائمة الأصول الأساسية للتخزين عند التثبيت (Precache)
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  '/offline.html',
];

// أنماط الـ URLs التي يجب تجاوزها (عدم التخزين)
const BYPASS_PATTERNS = [
  /supabase\.co/i,          // طلبات Supabase (REST, Auth, Storage)
  /googleapis\.com/i,       // Gemini API
  /generativelanguage/i,    // AI APIs
  /\/auth\//i,              // مصادقة
  /\/realtime\//i,          // Realtime WebSocket fallback
];

// أنماط الأصول الثابتة
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

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (BYPASS_PATTERNS.some((pattern) => pattern.test(url.href))) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  event.respondWith(networkFirst(request));
});

// ════════════════════════════════════════════════════════════════
//  الاستراتيجيات
// ════════════════════════════════════════════════════════════════

async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    const cache = await caches.open(RUNTIME_CACHE);
    cache.put(request, networkResponse.clone());
    return networkResponse;
  } catch (err) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) return cachedResponse;

    if (request.mode === 'navigate') {
      const offlinePage = await caches.match('/offline.html');
      if (offlinePage) return offlinePage;
    }
    throw err;
  }
}

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
    .catch(() => cachedResponse);

  return cachedResponse || fetchPromise;
}

// ════════════════════════════════════════════════════════════════
//  Push Notifications: استقبال وعرض الإشعارات الفورية
// ════════════════════════════════════════════════════════════════
self.addEventListener('push', (event) => {
  let data = { title: 'إشعار جديد من Kyvzon', body: 'لديك إشعار جديد في النظام', url: '/' };
  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch {
    if (event.data) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: data.url || '/' },
    dir: 'rtl',
    lang: 'ar',
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

// ════════════════════════════════════════════════════════════════
//  Message: تحديث فوري من التطبيق
// ════════════════════════════════════════════════════════════════
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
