/**
 * حارس بوابة CRM — الوحدة 1: جهات الاتصال والحسابات (التقرير 01):
 *  - الخدمات مُصدَّرة وترث سلوك BaseService (جدول crm_*).
 *  - وحدة crm-contacts أصبحت available في الكتالوج.
 *  - خرائط التسميات/الألوان مكتملة لكل قيم القيود (CHECK) في migration 0165.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../services/supabase/supabase', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn(), channel: vi.fn() },
}));

import {
  crmAccountService, crmContactService, crmActivityService, crmAuditService,
  ACCOUNT_TYPE_LABEL, ACCOUNT_TYPE_COLOR, ACCOUNT_TIER_LABEL,
  DECISION_ROLE_LABEL, DECISION_ROLE_COLOR, TEMPERATURE_LABEL, TEMPERATURE_COLOR,
  ACTIVITY_TYPE_LABEL, ACTIVITY_TYPE_ICON,
} from '../services/sdk';
import { CRM_MODULES } from '../pages/crmportal/crmCatalog';

describe('بوابة CRM — الوحدة 1: الخدمات', () => {
  it('الخدمات مُصدَّرة كـ singletons', () => {
    expect(crmAccountService).toBeDefined();
    expect(crmContactService).toBeDefined();
    expect(crmActivityService).toBeDefined();
    expect(crmAuditService).toBeDefined();
  });

  it('خدمات CRM تعرّف دوال الوحدة الأساسية', () => {
    expect(typeof crmAccountService.account360).toBe('function');
    expect(typeof crmAccountService.enrich).toBe('function');
    expect(typeof crmContactService.findDuplicates).toBe('function');
    expect(typeof crmContactService.merge).toBe('function');
    expect(typeof crmContactService.convertLead).toBe('function');
    expect(typeof crmContactService.gdprErase).toBe('function');
    expect(typeof crmActivityService.timelineForContact).toBe('function');
  });
});

describe('بوابة CRM — الوحدة 1: الكتالوج والتسميات', () => {
  it('وحدة crm-contacts أصبحت available', () => {
    const m = CRM_MODULES.find((x) => x.id === 'crm-contacts');
    expect(m).toBeDefined();
    expect(m?.status).toBe('available');
  });

  it('خرائط تصنيف الحساب مكتملة (5 قيم CHECK)', () => {
    const types = ['prospect', 'customer', 'partner', 'vendor', 'competitor'] as const;
    types.forEach((t) => {
      expect(ACCOUNT_TYPE_LABEL[t]).toBeTruthy();
      expect(ACCOUNT_TYPE_COLOR[t]).toBeTruthy();
    });
    expect(Object.keys(ACCOUNT_TIER_LABEL)).toHaveLength(4);
  });

  it('خرائط سلطة القرار والحرارة مكتملة', () => {
    (['decision_maker', 'influencer', 'user', 'gatekeeper'] as const).forEach((r) => {
      expect(DECISION_ROLE_LABEL[r]).toBeTruthy();
      expect(DECISION_ROLE_COLOR[r]).toBeTruthy();
    });
    (['cold', 'warm', 'hot'] as const).forEach((t) => {
      expect(TEMPERATURE_LABEL[t]).toBeTruthy();
      expect(TEMPERATURE_COLOR[t]).toBeTruthy();
    });
  });

  it('كل أنواع النشاط في الجدول الزمني لها تسمية وأيقونة', () => {
    const types = ['email', 'call', 'meeting', 'note', 'task', 'marketing_email', 'web_visit', 'support_ticket', 'deal', 'system'] as const;
    types.forEach((t) => {
      expect(ACTIVITY_TYPE_LABEL[t]).toBeTruthy();
      expect(ACTIVITY_TYPE_ICON[t]).toBeTruthy();
    });
  });
});
