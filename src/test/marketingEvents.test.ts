/**
 * اختبارات وحدة إدارة الفعاليات (التقرير 5) — الجوانب الخالصة.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../services/supabase/supabase', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn(), channel: vi.fn() },
}));

import { MARKETING_MODULES } from '../pages/marketingportal/marketingCatalog';
import { TICKET_TIER_LABEL, EVENT_TYPE_LABEL, PRE_EVENT_SEQUENCE, eventRegistrationService } from '../services/sdk';

describe('كتالوج بوابة التسويق — الوحدة 5 (الفعاليات)', () => {
  const m = MARKETING_MODULES.find((x) => x.id === 'marketing-events');
  it('الوحدة متاحة بمسار صحيح', () => {
    expect(m?.status).toBe('available');
    expect(m?.path).toBe('/app/marketing/events');
    expect(m?.report).toBe(5);
  });
});

describe('الثوابت المرجعية من التقرير', () => {
  it('أنواع التذاكر تشمل Early Bird و VIP و Group و Press', () => {
    const keys = Object.keys(TICKET_TIER_LABEL);
    ['early_bird', 'general', 'vip', 'group', 'press', 'free'].forEach((k) => expect(keys).toContain(k));
  });
  it('أنواع الفعاليات الثلاثة موجودة', () => {
    expect(Object.keys(EVENT_TYPE_LABEL).sort()).toEqual(['hybrid', 'in_person', 'virtual'].sort());
  });
  it('تسلسل التواصل قبل الحدث يتضمّن 4 مراحل', () => {
    expect(PRE_EVENT_SEQUENCE.length).toBe(4);
  });
});

describe('توليد QR', () => {
  it('يُنتج data-URI صالحاً لصورة SVG', () => {
    const uri = eventRegistrationService.qrDataUri('abc-123-token');
    expect(uri.startsWith('data:image/svg+xml')).toBe(true);
  });
  it('حتمي: نفس الرمز يعطي نفس الصورة', () => {
    expect(eventRegistrationService.qrDataUri('same')).toBe(eventRegistrationService.qrDataUri('same'));
  });
});
