/**
 * عقد الوحدة 01 لبوابة المشتريات — طلبات الشراء وسير الموافقات
 *
 * يغطي أيضاً إصلاح 0257 (خطأ b.name في check_pr_budget_extended)
 * الذي كان يمنع إنشاء أي طلب شراء في وقت التشغيل.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const FIX_0257 = read('supabase/migrations/0257_fix_check_pr_budget_extended_column.sql');
const CORE = read('supabase/migrations/0182_procurement_core.sql');
const PR_COMPLETION = read('supabase/migrations/0196_procurement_pr_completion.sql');
const NAV = read('src/pages/app/procurement/shared/ProcurementUnitNav.tsx');
const DETAIL = read('src/pages/app/procurement/requisitions/RequisitionDetailPage.tsx');
const LIST = read('src/pages/app/procurement/requisitions/RequisitionListPage.tsx');
const DASHBOARD = read('src/pages/app/procurement/ProcurementDashboard.tsx');

const LAYOUTS = [
  ['src/pages/app/procurement/requisitions/RequisitionsLayout.tsx', 'requisitions'],
  ['src/pages/app/procurement/suppliers/SuppliersLayout.tsx', 'suppliers'],
  ['src/pages/app/procurement/sourcing/SourcingLayout.tsx', 'sourcing'],
  ['src/pages/app/procurement/orders/OrdersLayout.tsx', 'orders'],
  ['src/pages/app/procurement/invoices/InvoicesLayout.tsx', 'invoices'],
  ['src/pages/app/procurement/contracts/ContractsLayout.tsx', 'contracts'],
  ['src/pages/app/procurement/analytics/AnalyticsLayout.tsx', 'analytics'],
] as const;

describe('المشتريات 01 — إصلاح فحص الميزانية (0257)', () => {
  it('المايجريشن موجود ويعيد تعريف الدالة', () => {
    expect(existsSync(join(ROOT, 'supabase/migrations/0257_fix_check_pr_budget_extended_column.sql'))).toBe(true);
    expect(FIX_0257).toContain('CREATE OR REPLACE FUNCTION public.check_pr_budget_extended');
  });

  it('لا يفترض وجود عمود b.name في الكود الفعلي (خارج التعليقات)', () => {
    // نستبعد أسطر التعليقات لأن الشرح يذكر النمط القديم عمداً
    const code = FIX_0257
      .split('\n')
      .filter(line => !line.trim().startsWith('--'))
      .join('\n');
    expect(code).not.toContain('COALESCE(b.budget_name, b.name');
    expect(code).toContain("column_name='budget_name'");
    expect(code).toContain('quote_ident(v_name_col)');
  });

  it('يحافظ على نفس نوع الإرجاع الأصلي (لا يكسر العقد)', () => {
    expect(FIX_0257).toContain('is_ok BOOLEAN');
    expect(FIX_0257).toContain('remaining_before NUMERIC');
    expect(FIX_0257).toContain('remaining_after NUMERIC');
    expect(FIX_0257).toContain('budget_name TEXT');
    expect(FIX_0257).toContain('spent_breakdown JSONB');
  });

  it('يستخدم تحويلاً صريحاً للأنواع', () => {
    expect(FIX_0257).toContain('::NUMERIC');
    expect(FIX_0257).toContain('::TEXT');
  });
});

describe('المشتريات 01 — قاعدة البيانات', () => {
  it('جداول الطلبات موجودة', () => {
    for (const t of ['purchase_requisitions', 'pr_line_items', 'pr_attachments']) {
      expect(CORE).toContain(`CREATE TABLE IF NOT EXISTS public.${t}`);
    }
  });

  it('حالات الطلب مضبوطة بـ CHECK', () => {
    expect(CORE).toContain("status IN ('draft','pending_approval','approved','rejected','converted_to_po','cancelled')");
  });

  it('الأولوية ونوع الطلب مضبوطان', () => {
    expect(CORE).toContain("priority IN ('normal','urgent','emergency')");
    expect(CORE).toContain("request_type IN ('raw_material','service','asset','consumable','other')");
  });

  it('RPCs دورة الحياة موجودة', () => {
    const all = CORE + PR_COMPLETION;
    for (const fn of ['create_purchase_requisition_full', 'cancel_pr', 'request_pr_revision']) {
      expect(all).toContain(fn);
    }
  });
});

describe('المشتريات 01 — الواجهات', () => {
  it('صفحة التفاصيل خالية من prompt و as any', () => {
    expect(DETAIL).not.toMatch(/window\.prompt\(|\bprompt\(/);
    expect(DETAIL).not.toMatch(/as any/);
  });

  it('الإلغاء يتم عبر نافذة بسبب إلزامي', () => {
    expect(DETAIL).toContain('cancelOpen');
    expect(DETAIL).toContain('cancelReason');
    expect(DETAIL).toContain('سبب الإلغاء مطلوب');
  });

  it('صفحة القائمة خالية من as any وتستخدم أنواعاً صريحة', () => {
    expect(LIST).not.toMatch(/as any/);
    expect(LIST).toContain('type RequestType');
    expect(LIST).toContain('type BudgetScope');
    expect(LIST).toContain('type Priority');
  });

  it('اللوحة تعرض بيانات حقيقية لا خارطة طريق ثابتة', () => {
    expect(DASHBOARD).toContain('procurementFoundationService');
    expect(DASHBOARD).not.toContain('Wave1');
    expect(DASHBOARD).not.toContain('خارطة طريق');
    expect(DASHBOARD).not.toMatch(/as any/);
  });
});

describe('المشتريات 01 — التنقل', () => {
  it('كل تخطيطات الوحدات تحوي شريط الوحدة الصحيح', () => {
    for (const [path, unit] of LAYOUTS) {
      const src = read(path);
      expect(src, `${path} بلا ProcurementUnitNav`).toContain('ProcurementUnitNav');
      expect(src, `${path} وحدة خاطئة`).toContain(`unit="${unit}"`);
    }
  });

  it('اللوحة الرئيسية تعرض شريط الوحدات', () => {
    expect(DASHBOARD).toContain('unit="main"');
  });

  it('وحدة الطلبات معرّفة في شريط التنقل', () => {
    expect(NAV).toContain('requisitions: { title:');
    expect(NAV).toContain('/app/procurement/requisitions');
  });
});
