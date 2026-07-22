/**
 * حارس بوابة CRM — الوحدة 2: خط الأنابيب والصفقات (التقرير 02):
 *  - الخدمات مُصدَّرة وتعرّف دوال الوحدة (نقل/إغلاق/سرعة/ركود/تهيئة).
 *  - وحدة crm-pipeline أصبحت available في الكتالوج.
 *  - خرائط التسميات/الألوان مكتملة لكل قيم القيود (CHECK) في migration 0166.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../services/supabase/supabase', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn(), channel: vi.fn() },
}));

import {
  crmPipelineService, crmStageService, crmLossReasonService, crmDealService,
  PIPELINE_TYPE_LABEL, DEAL_VALUE_TYPE_LABEL, DEAL_STATUS_LABEL, DEAL_STATUS_COLOR,
  ALERT_TYPE_LABEL, ALERT_TYPE_COLOR, STAGE_TYPE_ACCENT,
} from '../services/sdk';
import { CRM_MODULES } from '../pages/crmportal/crmCatalog';

describe('بوابة CRM — الوحدة 2: الخدمات', () => {
  it('الخدمات مُصدَّرة كـ singletons', () => {
    expect(crmPipelineService).toBeDefined();
    expect(crmStageService).toBeDefined();
    expect(crmLossReasonService).toBeDefined();
    expect(crmDealService).toBeDefined();
  });

  it('خدمة الصفقات تعرّف دوال الوحدة', () => {
    expect(typeof crmDealService.moveStage).toBe('function');
    expect(typeof crmDealService.close).toBe('function');
    expect(typeof crmDealService.velocity).toBe('function');
    expect(typeof crmDealService.stagnationAlerts).toBe('function');
    expect(typeof crmPipelineService.seedDefault).toBe('function');
  });
});

describe('بوابة CRM — الوحدة 2: الكتالوج والتسميات', () => {
  it('وحدة crm-pipeline أصبحت available', () => {
    const m = CRM_MODULES.find((x) => x.id === 'crm-pipeline');
    expect(m?.status).toBe('available');
  });

  it('أنواع خطوط الأنابيب الأربعة لها تسميات', () => {
    (['new_business', 'renewals', 'expansion', 'partner'] as const).forEach((t) => {
      expect(PIPELINE_TYPE_LABEL[t]).toBeTruthy();
    });
  });

  it('حالات الصفقة وأنواع القيمة مكتملة', () => {
    (['open', 'won', 'lost'] as const).forEach((s) => {
      expect(DEAL_STATUS_LABEL[s]).toBeTruthy();
      expect(DEAL_STATUS_COLOR[s]).toBeTruthy();
      expect(STAGE_TYPE_ACCENT[s]).toBeTruthy();
    });
    (['annual', 'one_time', 'lifetime'] as const).forEach((v) => {
      expect(DEAL_VALUE_TYPE_LABEL[v]).toBeTruthy();
    });
  });

  it('أنواع تنبيهات الركود مكتملة', () => {
    (['stagnant', 'overdue_close', 'closing_soon', 'ok'] as const).forEach((a) => {
      expect(ALERT_TYPE_LABEL[a]).toBeTruthy();
      expect(ALERT_TYPE_COLOR[a]).toBeTruthy();
    });
  });
});
