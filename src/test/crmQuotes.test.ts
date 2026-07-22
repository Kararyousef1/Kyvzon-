/**
 * حارس بوابة CRM — الوحدة 4: العروض والعقود CPQ (التقرير 04):
 *  - الخدمات مُصدَّرة وتعرّف دوال الوحدة (بنود/موافقة/إرسال/توقيع/تحليل/عقود).
 *  - منطق مستوى موافقة الخصم مطابق للتقرير (10/20/35/ممنوع).
 *  - وحدة crm-quotes أصبحت available + خرائط التسميات مكتملة (قيم CHECK).
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../services/supabase/supabase', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn(), channel: vi.fn() },
}));

import {
  crmProductService, crmQuoteService, crmApprovalService, crmContractService,
  PRODUCT_TYPE_LABEL, BILLING_CYCLE_LABEL, QUOTE_STATUS_LABEL, QUOTE_STATUS_COLOR,
  APPROVAL_LEVEL_LABEL, CONTRACT_STATUS_LABEL, CONTRACT_STATUS_COLOR, RENEWAL_ALERT_LABEL,
} from '../services/sdk';
import { CRM_MODULES } from '../pages/crmportal/crmCatalog';

describe('بوابة CRM — الوحدة 4: الخدمات ومنطق CPQ', () => {
  it('الخدمات مُصدَّرة كـ singletons', () => {
    expect(crmProductService).toBeDefined();
    expect(crmQuoteService).toBeDefined();
    expect(crmApprovalService).toBeDefined();
    expect(crmContractService).toBeDefined();
  });

  it('الخدمات تعرّف دوال الوحدة', () => {
    expect(typeof crmQuoteService.recalc).toBe('function');
    expect(typeof crmQuoteService.submit).toBe('function');
    expect(typeof crmQuoteService.send).toBe('function');
    expect(typeof crmQuoteService.sign).toBe('function');
    expect(typeof crmQuoteService.analytics).toBe('function');
    expect(typeof crmContractService.renewalAlerts).toBe('function');
  });

  it('مستوى موافقة الخصم مطابق للتقرير (10/20/35)', () => {
    expect(crmQuoteService.discountLevel(8)).toBe('none');
    expect(crmQuoteService.discountLevel(10)).toBe('none');
    expect(crmQuoteService.discountLevel(15)).toBe('sales_manager');
    expect(crmQuoteService.discountLevel(20)).toBe('sales_manager');
    expect(crmQuoteService.discountLevel(30)).toBe('commercial_ceo');
    expect(crmQuoteService.discountLevel(35)).toBe('commercial_ceo');
    expect(crmQuoteService.discountLevel(40)).toBe('forbidden');
  });
});

describe('بوابة CRM — الوحدة 4: الكتالوج والتسميات', () => {
  it('وحدة crm-quotes أصبحت available', () => {
    const m = CRM_MODULES.find((x) => x.id === 'crm-quotes');
    expect(m?.status).toBe('available');
  });

  it('خرائط المنتجات والفوترة مكتملة', () => {
    (['package', 'addon', 'service'] as const).forEach((t) => expect(PRODUCT_TYPE_LABEL[t]).toBeTruthy());
    (['monthly', 'annual', 'one_time', 'per_unit'] as const).forEach((b) => expect(BILLING_CYCLE_LABEL[b]).toBeTruthy());
  });

  it('حالات العرض والعقد مكتملة (قيم CHECK) + مستويات الموافقة + تنبيهات التجديد', () => {
    (['draft', 'pending_approval', 'approved', 'sent', 'viewed', 'signed', 'declined', 'expired'] as const).forEach((s) => {
      expect(QUOTE_STATUS_LABEL[s]).toBeTruthy();
      expect(QUOTE_STATUS_COLOR[s]).toBeTruthy();
    });
    (['draft', 'sent', 'under_review', 'signed', 'active', 'renewal', 'renewed', 'expired', 'cancelled'] as const).forEach((s) => {
      expect(CONTRACT_STATUS_LABEL[s]).toBeTruthy();
      expect(CONTRACT_STATUS_COLOR[s]).toBeTruthy();
    });
    (['none', 'sales_manager', 'commercial_ceo', 'forbidden'] as const).forEach((l) => expect(APPROVAL_LEVEL_LABEL[l]).toBeTruthy());
    (['expired', 'escalate', 'renewal', 'ok'] as const).forEach((a) => expect(RENEWAL_ALERT_LABEL[a]).toBeTruthy());
  });
});
