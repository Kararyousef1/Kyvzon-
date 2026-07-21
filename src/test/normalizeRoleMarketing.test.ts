/**
 * حارس انحدار: normalizeRole يجب أن يحافظ على دور 'marketing' (وبقية الأدوار)
 * ولا يحوّله لـ 'employee'. هذا ما كان يمنع ظهور بوابة التسويق للموظف.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../services/supabase/supabase', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn(), channel: vi.fn() },
}));

import { normalizeRole } from '../utils/userUtils';

describe('normalizeRole — الحفاظ على كل أدوار النظام', () => {
  it('يحافظ على دور marketing (لا يحوّله لـ employee)', () => {
    expect(normalizeRole('marketing')).toBe('marketing');
  });

  it('يحافظ على كل الأدوار الصالحة', () => {
    const roles = ['employee', 'hr', 'admin', 'gatekeeper', 'developer', 'supervisor', 'manager', 'tech', 'finance', 'it_admin', 'marketing'];
    for (const r of roles) {
      expect(normalizeRole(r)).toBe(r);
    }
  });

  it('يرجع employee للأدوار غير المعروفة أو الفارغة', () => {
    expect(normalizeRole('unknown_role')).toBe('employee');
    expect(normalizeRole(null)).toBe('employee');
    expect(normalizeRole(undefined)).toBe('employee');
  });

  it('يطبّع الأسماء القديمة (system_admin → admin)', () => {
    expect(normalizeRole('system_admin')).toBe('admin');
    expect(normalizeRole('hr_manager')).toBe('hr');
  });
});
