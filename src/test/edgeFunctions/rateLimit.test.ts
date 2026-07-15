/**
 * ═════════════════════════════════════════════════════════════════════════
 *  rateLimit.test.ts — اختبار وحدة لـ Edge Functions rate limiter
 *
 *  الكود يعيش في supabase/functions/_shared/rateLimit.ts (يستخدمه Deno)،
 *  لكن المنطق pure ولا يعتمد على Deno APIs — نستطيع اختباره في Vitest.
 *
 *  نستنسخ الكود هنا (نسخة مطابقة) لأن استيراد من supabase/functions/
 *  يفشل في Vitest بسبب TypeScript config مختلف.
 *
 *  ملاحظة: إن تغيّر الأصل، شغّل diff دورياً للتأكد من التطابق:
 *    diff <(cat src/test/edgeFunctions/_rateLimit.inline.ts) \
 *         <(cat supabase/functions/_shared/rateLimit.ts | sed 's/interval //')
 * ═════════════════════════════════════════════════════════════════════════
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ─── نسخة inline من rateLimit.ts (نفس المنطق) ────────────────────────────
interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const store = new Map<string, RateLimitEntry>();

function checkRateLimit(
  identifier: string,
  functionName: string,
  config: { max: number; windowMs: number },
): { allowed: boolean; remaining: number; retryAfterMs: number; resetAtMs: number; limit: number } {
  const key = `${functionName}:${identifier}`;
  const now = Date.now();
  const existing = store.get(key);

  if (!existing || now - existing.windowStart >= config.windowMs) {
    store.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: config.max - 1, retryAfterMs: 0, resetAtMs: config.windowMs, limit: config.max };
  }

  if (existing.count >= config.max) {
    const retryAfterMs = config.windowMs - (now - existing.windowStart);
    return { allowed: false, remaining: 0, retryAfterMs, resetAtMs: retryAfterMs, limit: config.max };
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

function rateLimitHeaders(result: ReturnType<typeof checkRateLimit>): Record<string, string> {
  const h: Record<string, string> = {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetAtMs / 1000)),
  };
  if (!result.allowed) h['Retry-After'] = String(Math.ceil(result.retryAfterMs / 1000));
  return h;
}

// ─── الاختبارات ─────────────────────────────────────────────────────────────
describe('Edge Functions rate limiter', () => {
  beforeEach(() => {
    store.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('checkRateLimit — نافذة جديدة', () => {
    it('يسمح بأول طلب ويعيد remaining = max - 1', () => {
      const r = checkRateLimit('user-1', 'test-fn', { max: 5, windowMs: 60_000 });
      expect(r.allowed).toBe(true);
      expect(r.remaining).toBe(4);
      expect(r.retryAfterMs).toBe(0);
      expect(r.limit).toBe(5);
    });

    it('عدّاد مستقل لكل identifier', () => {
      const r1 = checkRateLimit('user-1', 'fn', { max: 2, windowMs: 60_000 });
      const r2 = checkRateLimit('user-2', 'fn', { max: 2, windowMs: 60_000 });
      expect(r1.remaining).toBe(1);
      expect(r2.remaining).toBe(1);
    });

    it('عدّاد مستقل لكل functionName', () => {
      const r1 = checkRateLimit('user-1', 'fn-a', { max: 2, windowMs: 60_000 });
      const r2 = checkRateLimit('user-1', 'fn-b', { max: 2, windowMs: 60_000 });
      expect(r1.remaining).toBe(1);
      expect(r2.remaining).toBe(1);
    });
  });

  describe('checkRateLimit — استنزاف الحد', () => {
    it('يمنع الطلب رقم max+1 داخل النافذة', () => {
      const config = { max: 3, windowMs: 60_000 };
      const r1 = checkRateLimit('u', 'fn', config);
      const r2 = checkRateLimit('u', 'fn', config);
      const r3 = checkRateLimit('u', 'fn', config);
      const r4 = checkRateLimit('u', 'fn', config);

      expect(r1.allowed).toBe(true);
      expect(r2.allowed).toBe(true);
      expect(r3.allowed).toBe(true);
      expect(r3.remaining).toBe(0);
      expect(r4.allowed).toBe(false);
      expect(r4.remaining).toBe(0);
      expect(r4.retryAfterMs).toBeGreaterThan(0);
    });

    it('retryAfterMs يعكس الوقت المتبقي بدقة', () => {
      const config = { max: 1, windowMs: 60_000 };
      checkRateLimit('u', 'fn', config);
      vi.advanceTimersByTime(15_000);
      const r = checkRateLimit('u', 'fn', config);
      expect(r.allowed).toBe(false);
      expect(r.retryAfterMs).toBe(45_000);
    });
  });

  describe('checkRateLimit — تجديد النافذة', () => {
    it('يُصفَّر بعد windowMs', () => {
      const config = { max: 2, windowMs: 60_000 };
      checkRateLimit('u', 'fn', config);
      checkRateLimit('u', 'fn', config);
      const blocked = checkRateLimit('u', 'fn', config);
      expect(blocked.allowed).toBe(false);

      // نتقدم بالوقت خارج النافذة
      vi.advanceTimersByTime(61_000);
      const renewed = checkRateLimit('u', 'fn', config);
      expect(renewed.allowed).toBe(true);
      expect(renewed.remaining).toBe(1);
    });

    it('لا يُصفَّر داخل النافذة (حتى بعد ملي ثانية واحدة)', () => {
      const config = { max: 1, windowMs: 60_000 };
      checkRateLimit('u', 'fn', config);
      vi.advanceTimersByTime(59_999);
      const r = checkRateLimit('u', 'fn', config);
      expect(r.allowed).toBe(false);
    });
  });

  describe('rateLimitHeaders', () => {
    it('يبني headers قياسية للحالة المسموحة', () => {
      const result = { allowed: true, remaining: 4, retryAfterMs: 0, resetAtMs: 45_000, limit: 5 };
      const h = rateLimitHeaders(result);
      expect(h['X-RateLimit-Limit']).toBe('5');
      expect(h['X-RateLimit-Remaining']).toBe('4');
      expect(h['X-RateLimit-Reset']).toBe('45');
      expect(h['Retry-After']).toBeUndefined();
    });

    it('يضيف Retry-After عند التجاوز', () => {
      const result = { allowed: false, remaining: 0, retryAfterMs: 12_500, resetAtMs: 12_500, limit: 5 };
      const h = rateLimitHeaders(result);
      expect(h['Retry-After']).toBe('13'); // ceil(12.5) = 13
      expect(h['X-RateLimit-Remaining']).toBe('0');
    });

    it('X-RateLimit-Reset يستخدم ceil (أفضل UX)', () => {
      const result = { allowed: true, remaining: 3, retryAfterMs: 0, resetAtMs: 15_100, limit: 5 };
      const h = rateLimitHeaders(result);
      expect(h['X-RateLimit-Reset']).toBe('16'); // ceil(15.1) = 16
    });
  });

  describe('سيناريو حياة كامل', () => {
    it('user يحاول استنزاف الحد ثم ينتظر', () => {
      const config = { max: 3, windowMs: 10_000 };

      // 3 طلبات ناجحة
      for (let i = 0; i < 3; i++) {
        expect(checkRateLimit('attacker', 'ai-chat', config).allowed).toBe(true);
      }

      // 10 محاولات متتالية = كلها ترفض
      for (let i = 0; i < 10; i++) {
        expect(checkRateLimit('attacker', 'ai-chat', config).allowed).toBe(false);
      }

      // ينتظر النافذة تنتهي
      vi.advanceTimersByTime(11_000);

      // نافذة جديدة، 3 طلبات مسموحة مجدداً
      for (let i = 0; i < 3; i++) {
        expect(checkRateLimit('attacker', 'ai-chat', config).allowed).toBe(true);
      }
    });
  });
});
