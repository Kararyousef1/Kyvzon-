/**
 * اختبارات وحدة الاستبيانات والتغذية الراجعة (التقرير 6) — الجوانب الخالصة.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../services/supabase/supabase', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn(), channel: vi.fn() },
}));

import { MARKETING_MODULES } from '../pages/marketingportal/marketingCatalog';
import { SURVEY_TEMPLATES, NPS_INTERPRETATION, LOOP_PLAYBOOK, SURVEY_TYPE_LABEL } from '../services/sdk';

describe('كتالوج بوابة التسويق — الوحدة 6 (الاستبيانات)', () => {
  const m = MARKETING_MODULES.find((x) => x.id === 'marketing-surveys');
  it('الوحدة متاحة بمسار صحيح', () => {
    expect(m?.status).toBe('available');
    expect(m?.path).toBe('/app/marketing/surveys');
    expect(m?.report).toBe(6);
  });
});

describe('الثوابت المرجعية من التقرير', () => {
  it('القوالب تشمل NPS و CSAT و CES و Churn و Employee', () => {
    const keys = SURVEY_TEMPLATES.map((t) => t.key);
    ['nps', 'csat', 'ces', 'churn', 'employee'].forEach((k) => expect(keys).toContain(k));
  });
  it('قالب NPS يبدأ بسؤال من نوع nps', () => {
    const nps = SURVEY_TEMPLATES.find((t) => t.key === 'nps')!;
    expect(nps.questions[0].question_type).toBe('nps');
  });
  it('تفسير NPS يتضمّن 5 نطاقات', () => {
    expect(NPS_INTERPRETATION.length).toBe(5);
  });
  it('playbook إغلاق الحلقة يحدّد 48 ساعة للمنتقدين', () => {
    expect(LOOP_PLAYBOOK.detractor.window).toContain('48');
  });
  it('تسميات أنواع الاستبيانات تشمل quiz', () => {
    expect(SURVEY_TYPE_LABEL.quiz).toBe('اختبار');
  });
});
