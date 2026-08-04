/**
 * عقد الوحدة 00 لبوابة المشتريات — الأساس ولوحة التحكم
 *
 * يتحقق ثابتاً من أن:
 *  - المايجريشن يحوي كل الكائنات الموثّقة (جداول/دوال/Views).
 *  - SDK يستدعي RPCs الصحيحة ولا يكتب مباشرة على الجداول.
 *  - الواجهات خالية من الأنماط الممنوعة (prompt/confirm/as any).
 *  - الصفحات مسجّلة في الراوتر والشريط الجانبي والكتالوجات.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const MIGRATION = read('supabase/migrations/0256_procurement_foundation_control_plane.sql');
const SDK = read('src/services/sdk/Procurement/ProcurementFoundationService.ts');
const NAV = read('src/pages/app/procurement/shared/ProcurementUnitNav.tsx');
const ROUTER = read('src/router/AppRouter.tsx');
const SIDEBAR = read('src/shared/components/dashboard/Sidebar.tsx');
const HYBRID = read('src/pages/hybridportal/hybridPagesCatalog.ts');
const ADMIN = read('src/pages/admin/AdminEmployeesPage.tsx');
const REDIRECT = read('src/router/legacyRedirect.ts');

const PAGES = [
  'src/pages/app/procurement/foundation/FoundationDashboardPage.tsx',
  'src/pages/app/procurement/foundation/SpendCategoriesPage.tsx',
  'src/pages/app/procurement/foundation/ApprovalRulesPage.tsx',
  'src/pages/app/procurement/foundation/ProcurementPoliciesPage.tsx',
  'src/pages/app/procurement/foundation/ProcurementAuditPage.tsx',
];

describe('المشتريات 00 — قاعدة البيانات', () => {
  it('ينشئ جداول الأساس', () => {
    for (const t of ['procurement_audit_events', 'procurement_policies']) {
      expect(MIGRATION).toContain(`CREATE TABLE IF NOT EXISTS public.${t}`);
    }
  });

  it('ينشئ كل RPCs الموثّقة', () => {
    for (const fn of [
      'log_procurement_audit_event',
      'upsert_spend_category',
      'set_spend_category_status',
      'upsert_procurement_approval_rule',
      'set_procurement_approval_rule_status',
      'upsert_procurement_policy',
      'validate_procurement_foundation',
    ]) {
      expect(MIGRATION).toContain(`CREATE OR REPLACE FUNCTION public.${fn}`);
    }
  });

  it('ينشئ كل Views بـ security_invoker', () => {
    for (const v of [
      'procurement_category_tree',
      'procurement_category_lookup',
      'procurement_approval_rule_board',
      'procurement_audit_board',
      'procurement_policy_board',
      'procurement_foundation_dashboard',
    ]) {
      expect(MIGRATION).toContain(`CREATE OR REPLACE VIEW public.${v}`);
    }
    const views = MIGRATION.match(/CREATE OR REPLACE VIEW/g) || [];
    const invoker = MIGRATION.match(/security_invoker = true/g) || [];
    expect(invoker.length).toBe(views.length);
  });

  it('يفرض سبباً نصياً على كل تغيير حالة', () => {
    expect(MIGRATION).toContain('CATEGORY_STATUS_REASON_REQUIRED');
    expect(MIGRATION).toContain('RULE_STATUS_REASON_REQUIRED');
  });

  it('يمنع التسلسل الهرمي غير الصحيح للفئات', () => {
    expect(MIGRATION).toContain('PARENT_LEVEL_MUST_BE_ONE_ABOVE_CHILD');
    expect(MIGRATION).toContain('NON_ROOT_CATEGORY_REQUIRES_PARENT');
    expect(MIGRATION).toContain('CATEGORY_CANNOT_BE_ITS_OWN_PARENT');
    expect(MIGRATION).toContain('CATEGORY_HAS_ACTIVE_CHILDREN');
  });

  it('يتحقق من صحة نطاقات قواعد الموافقة', () => {
    expect(MIGRATION).toContain('MAX_AMOUNT_MUST_EXCEED_MIN_AMOUNT');
    expect(MIGRATION).toContain('INVALID_REQUIRED_ROLE');
    expect(MIGRATION).toContain('RULE_LEVEL_MUST_BE_1_TO_5');
  });

  it('يستخدم تحويلاً صريحاً للأنواع في RETURNS TABLE (درس get_ap_aging)', () => {
    const block = MIGRATION.slice(MIGRATION.indexOf('validate_procurement_foundation'));
    expect(block).toContain('::TEXT');
    expect(block).toContain('::BIGINT');
  });

  it('لا يحذف نهائياً — تعطيل فقط', () => {
    expect(MIGRATION).not.toMatch(/DELETE\s+FROM\s+public\.(spend_categories|procurement_approval_rules)/i);
  });
});

describe('المشتريات 00 — SDK', () => {
  it('يصدّر كل الخدمات', () => {
    for (const s of [
      'spendCategoryService',
      'procurementApprovalRuleService',
      'procurementPolicyService',
      'procurementAuditService',
      'procurementFoundationService',
    ]) {
      expect(SDK).toContain(`export const ${s}`);
    }
  });

  it('يستدعي RPCs للكتابة لا الجداول مباشرة', () => {
    for (const rpc of [
      'upsert_spend_category',
      'set_spend_category_status',
      'upsert_procurement_approval_rule',
      'set_procurement_approval_rule_status',
      'upsert_procurement_policy',
      'validate_procurement_foundation',
    ]) {
      expect(SDK).toContain(`rpc('${rpc}'`);
    }
    expect(SDK).not.toMatch(/\.from\('spend_categories'\)/);
    expect(SDK).not.toMatch(/\.from\('procurement_approval_rules'\)/);
    expect(SDK).not.toMatch(/\.insert\(|\.update\(|\.delete\(/);
  });

  it('خالٍ من as any', () => {
    expect(SDK).not.toMatch(/as any/);
  });
});

describe('المشتريات 00 — الواجهات', () => {
  it('كل الصفحات موجودة وتحوي شريط الوحدة', () => {
    for (const p of PAGES) {
      const src = read(p);
      expect(src).toContain('ProcurementUnitNav');
      expect(src).toContain('unit="foundation"');
    }
  });

  it('خالية من الأنماط الممنوعة', () => {
    for (const p of PAGES) {
      const src = read(p);
      expect(src, `${p} يحوي prompt`).not.toMatch(/\bprompt\(/);
      expect(src, `${p} يحوي confirm`).not.toMatch(/\bconfirm\(/);
      expect(src, `${p} يحوي as any`).not.toMatch(/as any/);
    }
  });

  it('تغيير الحالة يتطلب سبباً في الواجهة', () => {
    for (const p of [PAGES[1], PAGES[2]]) {
      const src = read(p);
      expect(src).toContain('statusReason');
      expect(src).toContain('السبب مطلوب');
    }
  });
});

describe('المشتريات 00 — التنقل', () => {
  it('ProcurementUnitNav يعرّف كل الوحدات', () => {
    for (const u of [
      'main', 'foundation', 'requisitions', 'suppliers',
      'sourcing', 'orders', 'invoices', 'contracts', 'analytics',
    ]) {
      expect(NAV).toContain(`${u}: { title:`);
    }
  });

  it('وحدة الأساس تعرض صفحاتها الخمس', () => {
    const block = NAV.slice(NAV.indexOf('foundation: {'), NAV.indexOf('requisitions: {'));
    for (const path of [
      '/app/procurement/foundation',
      '/app/procurement/foundation/categories',
      '/app/procurement/foundation/approval-rules',
      '/app/procurement/foundation/policies',
      '/app/procurement/foundation/audit',
    ]) {
      expect(block).toContain(path);
    }
  });

  it('المسارات مسجّلة في الراوتر', () => {
    for (const p of [
      'path="foundation"',
      'path="foundation/categories"',
      'path="foundation/approval-rules"',
      'path="foundation/policies"',
      'path="foundation/audit"',
    ]) {
      expect(ROUTER).toContain(p);
    }
  });

  it('الشريط الجانبي يعرض الوحدات فقط', () => {
    expect(SIDEBAR).toContain("section.key === 'procurement-main'");
    expect(SIDEBAR).toContain('PROCUREMENT_UNIT_FALLBACK');
    expect(SIDEBAR).toContain("id: 'procurement-foundation'");
  });

  it('الصفحات مسجّلة في الكتالوجين', () => {
    for (const id of [
      'procurement-foundation',
      'procurement-categories',
      'procurement-approval-rules',
      'procurement-policies',
      'procurement-audit',
    ]) {
      expect(HYBRID, `${id} مفقود من hybridPagesCatalog`).toContain(`id: '${id}'`);
      expect(ADMIN, `${id} مفقود من شاشة الصلاحيات`).toContain(`id: '${id}'`);
      expect(REDIRECT, `${id} مفقود من legacyRedirect`).toContain(`'${id}'`);
    }
  });
});
