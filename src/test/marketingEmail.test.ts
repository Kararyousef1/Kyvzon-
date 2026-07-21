/**
 * اختبارات وحدة البريد الإلكتروني (التقرير 2) — الجوانب الخالصة.
 *  - الكتالوج: الوحدة 2 أصبحت available بمسار صحيح.
 *  - الثوابت المرجعية من التقرير (أوقات الإرسال، جدول المصادقة، أهداف KPIs).
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../services/supabase/supabase', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn(), channel: vi.fn() },
}));

import { MARKETING_MODULES } from '../pages/marketingportal/marketingCatalog';
import { BEST_SEND_TIMES, AUTH_DELIVERABILITY, KPI_TARGETS } from '../services/sdk';

describe('كتالوج بوابة التسويق — الوحدة 2 (البريد)', () => {
  const email = MARKETING_MODULES.find((m) => m.id === 'marketing-email');
  it('الوحدة متاحة بمسار صحيح', () => {
    expect(email?.status).toBe('available');
    expect(email?.path).toBe('/app/marketing/email');
    expect(email?.report).toBe(2);
  });
});

describe('الثوابت المرجعية من التقرير', () => {
  it('الثلاثاء هو أفضل يوم للإرسال (المرتبة 1)', () => {
    const top = BEST_SEND_TIMES.days.find((d) => d.rank === 1);
    expect(top?.day).toContain('الثلاثاء');
  });

  it('جدول المصادقة يتضمّن سيناريو SPF+DKIM+DMARC بأعلى وصول', () => {
    const best = AUTH_DELIVERABILITY[AUTH_DELIVERABILITY.length - 1];
    expect(best.rate).toContain('98');
  });

  it('أهداف KPIs مطابقة للتقرير', () => {
    expect(KPI_TARGETS.spamRate).toBe('< 0.1%');
    expect(KPI_TARGETS.bounceRate).toBe('< 2%');
    expect(KPI_TARGETS.openRate).toBe('20-35%');
  });
});
