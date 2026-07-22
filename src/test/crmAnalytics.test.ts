/**
 * حارس بوابة CRM — الوحدة 6: التحليلات والتنبؤ (التقرير 06):
 *  - الخدمات مُصدَّرة وتعرّف دوال التحليل (تنبؤ/قمع/سرعة/منافسين/MRR/KPIs).
 *  - أوزان صحة الحساب وعتباتها مطابقة للتقرير.
 *  - وحدة crm-analytics أصبحت available (وكل الوحدات الست available — البوابة كاملة).
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../services/supabase/supabase', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn(), channel: vi.fn() },
}));

import {
  crmTargetService, crmMrrService, crmAnalytics,
  FORECAST_CATEGORY_LABEL, HEALTH_WEIGHTS_REFERENCE, healthTier, CRM_KPI_TARGETS,
} from '../services/sdk';
import { CRM_MODULES } from '../pages/crmportal/crmCatalog';

describe('بوابة CRM — الوحدة 6: الخدمات', () => {
  it('الخدمات مُصدَّرة', () => {
    expect(crmTargetService).toBeDefined();
    expect(crmMrrService).toBeDefined();
    expect(crmAnalytics).toBeDefined();
  });

  it('محرك التحليلات يعرّف كل الدوال', () => {
    expect(typeof crmAnalytics.weightedForecast).toBe('function');
    expect(typeof crmAnalytics.conversionFunnel).toBe('function');
    expect(typeof crmAnalytics.pipelineVelocity).toBe('function');
    expect(typeof crmAnalytics.winLossByCompetitor).toBe('function');
    expect(typeof crmAnalytics.segmentation).toBe('function');
    expect(typeof crmAnalytics.accountHealth).toBe('function');
    expect(typeof crmAnalytics.mrrMovement).toBe('function');
    expect(typeof crmAnalytics.repPerformance).toBe('function');
    expect(typeof crmAnalytics.execKpis).toBe('function');
  });
});

describe('بوابة CRM — الوحدة 6: منطق التحليل', () => {
  it('أوزان صحة الحساب مطابقة للتقرير (المجموع 100)', () => {
    const w = HEALTH_WEIGHTS_REFERENCE;
    expect(w.login + w.usage + w.csat + w.tickets + w.payment + w.nps).toBe(100);
    expect(w.login).toBe(25);
    expect(w.csat).toBe(20);
  });

  it('عتبات تصنيف الصحة صحيحة', () => {
    expect(healthTier(85).label).toBe('صحي');
    expect(healthTier(70).label).toBe('يحتاج انتباهاً');
    expect(healthTier(50).label).toBe('في خطر');
    expect(healthTier(30).label).toBe('خطر مغادرة');
  });

  it('فئات التنبؤ ومؤشرات الأهداف مكتملة', () => {
    (['commit', 'best_case', 'pipeline', 'omitted'] as const).forEach((c) => expect(FORECAST_CATEGORY_LABEL[c]).toBeTruthy());
    expect(CRM_KPI_TARGETS.nrr).toBeTruthy();
    expect(CRM_KPI_TARGETS.churn).toBeTruthy();
  });
});

describe('بوابة CRM — اكتمال البوابة (6/6)', () => {
  it('وحدة crm-analytics أصبحت available', () => {
    expect(CRM_MODULES.find((x) => x.id === 'crm-analytics')?.status).toBe('available');
  });
  it('كل الوحدات الست أصبحت available (البوابة مكتملة)', () => {
    expect(CRM_MODULES.every((m) => m.status === 'available')).toBe(true);
    expect(CRM_MODULES.length).toBe(6);
  });
});
