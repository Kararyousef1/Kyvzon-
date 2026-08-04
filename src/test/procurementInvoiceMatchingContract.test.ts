/**
 * عقد الوحدة 05 لبوابة المشتريات — الفواتير والمطابقة الثلاثية
 *
 * يغطي:
 *  - إصلاح 0261 (تعارض status في match_invoice) الذي كان يُعطّل المطابقة كلياً.
 *  - جسر 0262 (المشتريات ← المالية AP) الذي يحل الفجوة الثانية.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const FIX_MATCH = read('supabase/migrations/0261_fix_match_invoice_ambiguous_status.sql');
const AP_BRIDGE = read('supabase/migrations/0262_procurement_finance_ap_bridge.sql');
const INVOICES = read('supabase/migrations/0186_procurement_invoices_matching.sql');
const COMPLETION = read('supabase/migrations/0200_procurement_invoices_completion.sql');
const NAV = read('src/pages/app/procurement/shared/ProcurementUnitNav.tsx');
const MATCHING = read('src/pages/app/procurement/invoices/MatchingDetailPage.tsx');
const LIST = read('src/pages/app/procurement/invoices/InvoicesPage.tsx');
const TOLERANCE = read('src/pages/app/procurement/invoices/ToleranceRulesPage.tsx');
const LAYOUT = read('src/pages/app/procurement/invoices/InvoicesLayout.tsx');

describe('المشتريات 05 — إصلاح المطابقة الثلاثية (0261)', () => {
  it('يعيد تعريف match_invoice بنفس نوع الإرجاع', () => {
    expect(FIX_MATCH).toContain('CREATE OR REPLACE FUNCTION public.match_invoice');
    expect(FIX_MATCH).toContain('RETURNS TABLE (line_id UUID, status TEXT, price_var NUMERIC, qty_var NUMERIC, tolerance_applied BOOLEAN, auto_approved BOOLEAN, exception_reason TEXT)');
  });

  it('يؤهّل مراجع العمود لتفادي التعارض مع معامل الإخراج', () => {
    expect(FIX_MATCH).toContain('mr.status');
    expect(FIX_MATCH).toContain('goods_receipts.status');
    expect(FIX_MATCH).toContain('v_has_exception');
    expect(FIX_MATCH).toContain('v_has_tolerance');
  });

  it('لا يبقى استعلام بمرجع status غير مؤهَّل', () => {
    const code = FIX_MATCH.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
    expect(code).not.toMatch(/WHERE invoice_id=p_invoice_id AND status='exception'/);
    expect(code).not.toMatch(/WHERE invoice_id=p_invoice_id AND status='tolerance'/);
  });

  it('يحدّث حالة الفاتورة بأسماء مستعارة آمنة', () => {
    expect(FIX_MATCH).toContain('UPDATE public.supplier_invoices si SET');
  });
});

describe('المشتريات 05 — جسر المالية AP (0262)', () => {
  it('يضيف أعمدة الربط بالمالية', () => {
    expect(AP_BRIDGE).toContain('ADD COLUMN IF NOT EXISTS finance_vendor_id');
    expect(AP_BRIDGE).toContain('ADD COLUMN IF NOT EXISTS ap_invoice_id');
    expect(AP_BRIDGE).toContain('ADD COLUMN IF NOT EXISTS ap_post_error');
    expect(AP_BRIDGE).toContain('ADD COLUMN IF NOT EXISTS expense_account_id');
  });

  it('يستدعي دالة المالية المعتمدة لإنشاء فاتورة AP', () => {
    expect(AP_BRIDGE).toContain('public.create_ap_invoice_with_lines');
  });

  it('يحل حساب المورد المالي وينشئه عند الحاجة', () => {
    expect(AP_BRIDGE).toContain('resolve_finance_vendor_for_supplier');
    expect(AP_BRIDGE).toContain('INSERT INTO public.vendors');
    expect(AP_BRIDGE).toContain('ON CONFLICT (legal_entity_id, vendor_code)');
  });

  it('يمنع الترحيل المزدوج', () => {
    expect(AP_BRIDGE).toContain('INVOICE_ALREADY_POSTED_TO_AP');
  });

  it('الاعتماد لا يسقط إذا فشل الترحيل بل يسجّل السبب', () => {
    expect(AP_BRIDGE).toContain('EXCEPTION WHEN OTHERS THEN');
    expect(AP_BRIDGE).toContain('SET ap_post_error = v_err');
  });

  it('الاعتماد يستدعي الجسر تلقائياً', () => {
    const approve = AP_BRIDGE.slice(AP_BRIDGE.indexOf('CREATE OR REPLACE FUNCTION public.approve_invoice_for_payment'));
    expect(approve).toContain('PERFORM public.post_supplier_invoice_to_ap');
  });

  it('يحافظ على حماية التكرار وحالة الفاتورة', () => {
    expect(AP_BRIDGE).toContain('DUPLICATE_INVOICE_REVIEW_REQUIRED');
    expect(AP_BRIDGE).toContain('INVOICE_NOT_READY_FOR_APPROVAL');
  });

  it('View حالة الترحيل موجود بـ security_invoker', () => {
    expect(AP_BRIDGE).toContain('CREATE OR REPLACE VIEW public.procurement_invoice_ap_status');
    expect(AP_BRIDGE).toContain('security_invoker = true');
  });
});

describe('المشتريات 05 — بنية الفواتير', () => {
  it('جداول الفواتير والمطابقة موجودة', () => {
    for (const t of ['supplier_invoices', 'invoice_line_items', 'procurement_matching_results', 'procurement_tolerance_rules']) {
      expect(INVOICES).toContain(`CREATE TABLE IF NOT EXISTS public.${t}`);
    }
  });

  it('كشف التكرار وخصم الدفع المبكر موجودان', () => {
    const all = INVOICES + COMPLETION;
    expect(all).toContain('detect_duplicate_invoice');
    expect(all).toContain('invoice_dynamic_discount_options');
  });

  it('الدفع يتطلب فاتورة معتمدة', () => {
    expect(COMPLETION).toContain('INVOICE_MUST_BE_APPROVED');
  });
});

describe('المشتريات 05 — الواجهات', () => {
  it('كل صفحات الفواتير خالية من الأنماط الممنوعة', () => {
    for (const [name, src] of [
      ['matching', MATCHING], ['list', LIST], ['tolerance', TOLERANCE],
    ] as const) {
      expect(src, `${name} يحوي prompt`).not.toMatch(/\bprompt\(/);
      expect(src, `${name} يحوي confirm`).not.toMatch(/\bconfirm\(/);
      expect(src, `${name} يحوي as any`).not.toMatch(/as any/);
    }
  });

  it('معالجة الاستثناء عبر نافذة بملاحظات إلزامية', () => {
    expect(MATCHING).toContain('openExceptionDialog');
    expect(MATCHING).toContain('submitException');
    expect(MATCHING).toContain('ملاحظات الإجراء مطلوبة');
    expect(MATCHING).toContain('type ExceptionAction');
  });

  it('تسجيل الدفع عبر نافذة بمرجع إلزامي', () => {
    expect(MATCHING).toContain('مرجع الدفع مطلوب');
    expect(LIST).toContain('مرجع الدفع مطلوب');
  });

  it('التخطيط يحوي شريط الوحدة', () => {
    expect(LAYOUT).toContain('ProcurementUnitNav');
    expect(LAYOUT).toContain('unit="invoices"');
  });

  it('وحدة الفواتير معرّفة في شريط التنقل', () => {
    expect(NAV).toContain('invoices: { title:');
    expect(NAV).toContain('/app/procurement/invoices/tolerance-rules');
  });
});
