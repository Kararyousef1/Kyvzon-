/**
 * ═════════════════════════════════════════════════════════════════════════
 *  rateLimit.ts — In-memory Rate Limiter لـ Edge Functions
 *
 *  التصميم: Fixed Window Counter
 *  ────────────────────────────────────────────────────────────
 *  - يخزن العدادات في Map داخل ذاكرة Deno instance
 *  - كل مفتاح = `${functionName}:${userId}` أو `${functionName}:${ip}`
 *  - بعد windowMs، يُصفَّر تلقائياً عند الطلب التالي
 *  - نظيف من نفسه — يحذف مفاتيح منتهية الصلاحية أثناء البحث
 *
 *  ⚠️ القيود:
 *   - كل Deno instance له عدّاد مستقل. Supabase قد يشغّل عدة instances.
 *   - في production عالي الحمل → استبدل بـ Upstash Redis أو مكافئ.
 *
 *  المستوى الحالي كافٍ لـ:
 *   - منع hammer attacks (100+ req/ثانية)
 *   - منع loops عرضية في الواجهة
 *   - حماية موارد AI/DB من الاستنزاف
 * ═════════════════════════════════════════════════════════════════════════
 */

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const store = new Map<string, RateLimitEntry>();

// تنظيف دوري كل 5 دقائق لمنع نمو الذاكرة اللانهائي
setInterval(() => {
  const now = Date.now();
  const staleAfter = 10 * 60 * 1000; // 10 دقائق
  for (const [key, entry] of store.entries()) {
    if (now - entry.windowStart > staleAfter) {
      store.delete(key);
    }
  }
}, 5 * 60 * 1000);

export interface RateLimitConfig {
  /** أقصى عدد طلبات في النافذة */
  max: number;
  /** حجم النافذة بالميلي ثانية */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** عدد الطلبات المتبقية في النافذة الحالية */
  remaining: number;
  /** الميلي ثانية حتى إعادة تعيين العداد */
  retryAfterMs: number;
  /** الميلي ثانية بين الآن ونهاية النافذة */
  resetAtMs: number;
  /** إجمالي الحد */
  limit: number;
}

/**
 * فحص الحد المسموح لمستخدم/عميل على دالة معينة.
 * يزيد العداد إذا كان الطلب مسموحاً.
 */
export function checkRateLimit(
  identifier: string,
  functionName: string,
  config: RateLimitConfig,
): RateLimitResult {
  const key = `${functionName}:${identifier}`;
  const now = Date.now();
  const existing = store.get(key);

  // نافذة جديدة
  if (!existing || now - existing.windowStart >= config.windowMs) {
    store.set(key, { count: 1, windowStart: now });
    return {
      allowed: true,
      remaining: config.max - 1,
      retryAfterMs: 0,
      resetAtMs: config.windowMs,
      limit: config.max,
    };
  }

  // النافذة الحالية — نفحص العدّاد
  if (existing.count >= config.max) {
    const retryAfterMs = config.windowMs - (now - existing.windowStart);
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs,
      resetAtMs: retryAfterMs,
      limit: config.max,
    };
  }

  existing.count += 1;
  return {
    allowed: true,
    remaining: config.max - existing.count,
    retryAfterMs: 0,
    resetAtMs: config.windowMs - (now - existing.windowStart),
    limit: config.max,
  };
}

/**
 * بناء response headers قياسية لـ RateLimit
 * (تُتبع RFC 6585 + IETF draft-ietf-httpapi-ratelimit-headers).
 */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetAtMs / 1000)),
  };
  if (!result.allowed) {
    headers['Retry-After'] = String(Math.ceil(result.retryAfterMs / 1000));
  }
  return headers;
}

/** حدود شائعة معدّة مسبقاً */
export const RATE_LIMITS = {
  ADMIN_CREATE:       { max: 5,  windowMs: 60_000 },   // 5/دقيقة
  ADMIN_DELETE:       { max: 3,  windowMs: 60_000 },   // 3/دقيقة
  ADMIN_UPDATE_ROLE:  { max: 10, windowMs: 60_000 },   // 10/دقيقة
  ADMIN_TOGGLE:       { max: 10, windowMs: 60_000 },   // 10/دقيقة
  ADMIN_RESET_PW:     { max: 3,  windowMs: 60_000 },   // 3/دقيقة
  AI_CHAT:            { max: 20, windowMs: 60_000 },   // 20/دقيقة/user
} as const;
