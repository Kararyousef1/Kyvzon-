/**
 * اختبارات وحدة أتمتة التسويق (التقرير 1) — الجوانب الخالصة (بلا شبكة).
 *  - كتالوج بوابة التسويق: الوحدة 1 أصبحت available بمسار صحيح.
 *  - قوالب الحملات الخمس: مكتملة ومتوافقة مع التقرير.
 */

import { describe, it, expect, vi } from 'vitest';

// نحاكي عميل supabase لتفادي اشتراط متغيّرات البيئة عند استيراد طبقة SDK.
vi.mock('../services/supabase/supabase', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn(), channel: vi.fn() },
}));

import { MARKETING_MODULES } from '../pages/marketingportal/marketingCatalog';
import { CAMPAIGN_TEMPLATES } from '../services/sdk';

describe('كتالوج بوابة التسويق — الوحدة 1 (أتمتة)', () => {
  const automation = MARKETING_MODULES.find((m) => m.id === 'marketing-automation');

  it('الوحدة موجودة ومتاحة', () => {
    expect(automation).toBeDefined();
    expect(automation?.status).toBe('available');
  });

  it('مسار الوحدة صحيح', () => {
    expect(automation?.path).toBe('/app/marketing/automation');
    expect(automation?.report).toBe(1);
  });
});

describe('قوالب الحملات (5 قوالب من التقرير)', () => {
  it('تتضمّن القوالب الخمسة المطلوبة', () => {
    const types = CAMPAIGN_TEMPLATES.map((c) => c.type).sort();
    expect(types).toEqual(
      ['abandoned_cart', 'nurturing', 'post_purchase', 're_engagement', 'welcome'].sort(),
    );
  });

  it('لكل قالب خطوة واحدة على الأقل ونوع محفّز صالح', () => {
    const validTriggers = ['time_based', 'behavioral', 'data_based', 'negative'];
    for (const c of CAMPAIGN_TEMPLATES) {
      expect(c.steps.length).toBeGreaterThan(0);
      expect(validTriggers).toContain(c.triggerType);
      expect(c.triggerEvent).toBeTruthy();
      // كل خطوة لها ترتيب ونوع صالح
      for (const s of c.steps) {
        expect(['action', 'wait', 'condition', 'branch']).toContain(s.step_type);
        expect(typeof s.step_order).toBe('number');
      }
    }
  });

  it('قالب الترحيب يبدأ بإرسال بريد فوري (اليوم 0)', () => {
    const welcome = CAMPAIGN_TEMPLATES.find((c) => c.type === 'welcome')!;
    const first = welcome.steps[0];
    expect(first.step_type).toBe('action');
    expect(first.action_type).toBe('send_email');
    expect(first.wait_hours).toBe(0);
  });
});
