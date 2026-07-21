/**
 * اختبارات نظام المناعة العلائقية (التقرير 7) — الجوانب الخالصة.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../services/supabase/supabase', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn(), channel: vi.fn() },
}));

import { MARKETING_MODULES } from '../pages/marketingportal/marketingCatalog';
import { statusFromBalance, customerFacingStatus, POINTS_TABLE, CULTURAL_RULES } from '../services/sdk';

describe('كتالوج بوابة التسويق — الوحدة 7 (المناعة العلائقية)', () => {
  const m = MARKETING_MODULES.find((x) => x.id === 'marketing-immune');
  it('الوحدة متاحة بمسار صحيح', () => {
    expect(m?.status).toBe('available');
    expect(m?.path).toBe('/app/marketing/immune-system');
    expect(m?.report).toBe(7);
  });
  it('كل الوحدات السبع أصبحت متاحة (البوابة مكتملة)', () => {
    expect(MARKETING_MODULES.every((mod) => mod.status === 'available')).toBe(true);
    expect(MARKETING_MODULES.length).toBe(7);
  });
});

describe('عتبات الرصيد (من التقرير)', () => {
  it('التصنيف حسب النطاقات صحيح', () => {
    expect(statusFromBalance(1000)).toBe('healthy');
    expect(statusFromBalance(800)).toBe('healthy');
    expect(statusFromBalance(650)).toBe('good');
    expect(statusFromBalance(400)).toBe('warning');
    expect(statusFromBalance(200)).toBe('danger');
    expect(statusFromBalance(100)).toBe('critical');
  });
  it('الحالة المبسّطة للعميل صحيحة', () => {
    expect(customerFacingStatus(800).label).toBe('ممتازة');
    expect(customerFacingStatus(500).label).toBe('متوازنة');
    expect(customerFacingStatus(100).label).toBe('هادئة');
  });
});

describe('جداول النقاط والقواعد الثقافية', () => {
  it('شكوى الإسبام تخصم 300 نقطة', () => {
    const spam = POINTS_TABLE.debits.find((d) => d.key === 'spam_complaint');
    expect(spam?.pts).toBe(300);
  });
  it('NPS إيجابي يشحن 80 نقطة', () => {
    const nps = POINTS_TABLE.credits.find((c) => c.key === 'nps_positive');
    expect(nps?.pts).toBe(80);
  });
  it('القواعد الثقافية تشمل رمضان وأوقات الصلاة', () => {
    const joined = CULTURAL_RULES.map((r) => r.trigger).join(' ');
    expect(joined).toContain('رمضان');
    expect(joined).toContain('الصلوات');
  });
});
