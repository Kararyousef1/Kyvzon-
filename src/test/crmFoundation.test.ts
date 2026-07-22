/**
 * حارس أساس بوابة CRM:
 *  - الوحدة crm مسجّلة في الكتالوج ومسموحة في الخطة professional.
 *  - الدور sales لا يُبتلع في normalizeRole (نفس درس بوابة التسويق).
 *  - كتالوج CRM يحوي 6 وحدات + اللوحة.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../services/supabase/supabase', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn(), channel: vi.fn() },
}));

import { normalizeRole } from '../utils/userUtils';
import { MODULE_CATALOG, PLAN_ALLOWED_MODULES } from '../services/sdk';
import { CRM_MODULES, CRM_NAV } from '../pages/crmportal/crmCatalog';

describe('أساس بوابة CRM — الوحدة والدور', () => {
  it('الوحدة crm مسجّلة في الكتالوج', () => {
    const crm = MODULE_CATALOG.find((m) => m.key === 'crm');
    expect(crm).toBeDefined();
    expect(crm?.minPlan).toBe('professional');
  });

  it('الوحدة crm مسموحة في خطة professional', () => {
    expect(PLAN_ALLOWED_MODULES.professional).toContain('crm');
  });

  it('normalizeRole يحافظ على دور sales (لا يبتلعه)', () => {
    expect(normalizeRole('sales')).toBe('sales');
  });
});

describe('كتالوج CRM', () => {
  it('يحوي 6 وحدات فرعية', () => {
    expect(CRM_MODULES.length).toBe(6);
  });
  it('يشمل جهات الاتصال وخط الأنابيب والتحليلات', () => {
    const ids = CRM_MODULES.map((m) => m.id);
    expect(ids).toContain('crm-contacts');
    expect(ids).toContain('crm-pipeline');
    expect(ids).toContain('crm-analytics');
  });
  it('التنقّل يبدأ باللوحة (7 عناصر: لوحة + 6 وحدات)', () => {
    expect(CRM_NAV.length).toBe(7);
    expect(CRM_NAV[0].id).toBe('crm-dashboard');
  });
});
