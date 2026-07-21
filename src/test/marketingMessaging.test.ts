/**
 * اختبارات وحدة الرسائل النصية والواتساب (التقرير 4) — الجوانب الخالصة.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../services/supabase/supabase', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn(), channel: vi.fn() },
}));

import { MARKETING_MODULES } from '../pages/marketingportal/marketingCatalog';
import { SMS_MAX_CHARS, SMS_TYPE_META, SMS_VS_WA, MESSAGING_KPI_TARGETS } from '../services/sdk';

describe('كتالوج بوابة التسويق — الوحدة 4 (الرسائل)', () => {
  const m = MARKETING_MODULES.find((x) => x.id === 'marketing-messaging');
  it('الوحدة متاحة بمسار صحيح', () => {
    expect(m?.status).toBe('available');
    expect(m?.path).toBe('/app/marketing/messaging');
    expect(m?.report).toBe(4);
  });
});

describe('الثوابت المرجعية من التقرير', () => {
  it('حد SMS = 160 حرفاً', () => {
    expect(SMS_MAX_CHARS).toBe(160);
  });
  it('أنواع SMS الأربعة موجودة', () => {
    const keys = Object.keys(SMS_TYPE_META).sort();
    expect(keys).toEqual(['promotional', 'reminder', 'survey', 'transactional'].sort());
  });
  it('مقارنة SMS/WhatsApp تتضمّن معدل الرد', () => {
    const reply = SMS_VS_WA.find((r) => r.metric.includes('الرد'));
    expect(reply?.wa).toContain('40-60%');
  });
  it('هدف Opt-out أقل من 2%', () => {
    expect(MESSAGING_KPI_TARGETS.optOutRate).toBe('< 2%');
  });
});
