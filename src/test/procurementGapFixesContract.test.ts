/**
 * عقد معالجة النواقص المسجَّلة لبوابة المشتريات
 *
 * يغطي:
 *  0265 — جسر المرتجعات العكسي (RTV → خصم المخزون)
 *  0266 — الإشعارات المجدولة (تجديد العقود · تذكير الموافقات · الوثائق)
 *  0267 — Lookups الربط + View صحة التكامل
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const RTV = read('supabase/migrations/0265_procurement_rtv_inventory_bridge.sql');
const NOTIF = read('supabase/migrations/0266_procurement_scheduled_notifications.sql');
const LOOKUPS = read('supabase/migrations/0267_procurement_integration_lookups.sql');
const SDK = read('src/services/sdk/Procurement/ProcurementIntegrationService.ts');
const PAGE = read('src/pages/app/procurement/foundation/IntegrationHealthPage.tsx');
const NAV = read('src/pages/app/procurement/shared/ProcurementUnitNav.tsx');
const ROUTER = read('src/router/AppRouter.tsx');
const SIDEBAR = read('src/shared/components/dashboard/Sidebar.tsx');
const HYBRID = read('src/pages/hybridportal/hybridPagesCatalog.ts');
const ADMIN = read('src/pages/admin/AdminEmployeesPage.tsx');
const REDIRECT = read('src/router/legacyRedirect.ts');

describe('النواقص — جسر المرتجعات العكسي (0265)', () => {
  it('يكتب حركة خروج في المخزون الحقيقي', () => {
    expect(RTV).toContain('INSERT INTO public.inventory_stock_movements');
    expect(RTV).toContain("'return_out'");
    expect(RTV).toContain('SET on_hand_qty = on_hand_qty - v_rtv.quantity');
  });

  it('يمنع الخصم المزدوج', () => {
    expect(RTV).toContain('RTV_ALREADY_POSTED_TO_INVENTORY');
  });

  it('يمنع الخصم إذا كان الرصيد غير كافٍ', () => {
    expect(RTV).toContain('INSUFFICIENT_STOCK_FOR_RTV');
    expect(RTV).toContain('COALESCE(v_available, 0) < v_rtv.quantity');
  });

  it('يرفض الكمية غير الموجبة', () => {
    expect(RTV).toContain('RTV_QUANTITY_MUST_BE_POSITIVE');
  });

  it('create_rtv تستدعي الجسر ولا تسقط عند الفشل', () => {
    const create = RTV.slice(RTV.indexOf('CREATE OR REPLACE FUNCTION public.create_rtv'));
    expect(create).toContain('PERFORM public.post_rtv_to_inventory');
    expect(create).toContain('EXCEPTION WHEN OTHERS THEN');
    expect(create).toContain('SET inventory_post_error = v_err');
  });

  it('View حالة المرتجعات بـ security_invoker', () => {
    expect(RTV).toContain('CREATE OR REPLACE VIEW public.procurement_rtv_inventory_status');
    expect(RTV).toContain('security_invoker = true');
    expect(RTV).toContain('is_deducted_from_inventory');
  });
});

describe('النواقص — الإشعارات المجدولة (0266)', () => {
  it('جدول منع التكرار موجود بقيد فريد يومي', () => {
    expect(NOTIF).toContain('CREATE TABLE IF NOT EXISTS public.procurement_notification_log');
    expect(NOTIF).toContain('UNIQUE (tenant_id, notification_kind, entity_id, alert_level, sent_on)');
  });

  it('يغطي الأنواع الثلاثة المطلوبة', () => {
    expect(NOTIF).toContain('dispatch_contract_renewal_notifications');
    expect(NOTIF).toContain('dispatch_pr_approval_reminders');
    expect(NOTIF).toContain('dispatch_supplier_document_expiry_notifications');
  });

  it('يكتب في جدول الإشعارات الفعلي', () => {
    expect(NOTIF).toContain('INSERT INTO public.notifications');
  });

  it('يمنع تكرار الإشعار في نفس اليوم', () => {
    expect(NOTIF).toContain('AND sent_on = CURRENT_DATE');
    expect(NOTIF).toContain('THEN CONTINUE; END IF;');
  });

  it('مُشغِّل موحّد موجود', () => {
    expect(NOTIF).toContain('CREATE OR REPLACE FUNCTION public.run_procurement_daily_notifications');
  });

  it('محمي بالأدوار و RLS', () => {
    expect(NOTIF).toContain('procurement_require_roles');
    expect(NOTIF).toContain('ENABLE ROW LEVEL SECURITY');
  });
});

describe('النواقص — Lookups وصحة التكامل (0267)', () => {
  it('ثلاثة Lookups بديلة عن نسخ UUID', () => {
    for (const v of [
      'procurement_inventory_item_lookup',
      'procurement_warehouse_lookup',
      'procurement_expense_account_lookup',
    ]) {
      expect(LOOKUPS).toContain(`CREATE OR REPLACE VIEW public.${v}`);
    }
  });

  it('حسابات المصروف مفلترة بشكل صحيح', () => {
    expect(LOOKUPS).toContain("a.account_type = 'Expense'");
    expect(LOOKUPS).toContain('NOT COALESCE(a.is_control_account, false)');
  });

  it('دوال الربط تتحقق من المستأجر', () => {
    expect(LOOKUPS).toContain('INVENTORY_ITEM_NOT_IN_TENANT');
    expect(LOOKUPS).toContain('EXPENSE_ACCOUNT_INVALID');
    expect(LOOKUPS).toContain('WAREHOUSE_NOT_IN_TENANT');
  });

  it('يمنع تغيير مستودع استلام مُرحَّل', () => {
    expect(LOOKUPS).toContain('GR_ALREADY_POSTED_CANNOT_CHANGE_WAREHOUSE');
  });

  it('View صحة التكامل يغطي كل الجسور', () => {
    expect(LOOKUPS).toContain('gr_not_posted_to_inventory');
    expect(LOOKUPS).toContain('invoices_not_posted_to_ap');
    expect(LOOKUPS).toContain('rtv_not_deducted');
    expect(LOOKUPS).toContain('po_lines_without_inventory_item');
  });

  it('كل الدوال مُدقَّقة', () => {
    expect(LOOKUPS).toContain('log_procurement_audit_event');
  });
});

describe('النواقص — SDK والواجهة', () => {
  it('SDK يصدّر الخدمات الثلاث', () => {
    for (const s of ['procurementLookupService', 'procurementIntegrationService', 'procurementNotificationService']) {
      expect(SDK).toContain(`export const ${s}`);
    }
  });

  it('SDK يستدعي RPCs الصحيحة', () => {
    for (const rpc of [
      'link_po_line_integration',
      'set_goods_receipt_warehouse',
      'post_goods_receipt_to_inventory',
      'post_rtv_to_inventory',
      'post_supplier_invoice_to_ap',
      'run_procurement_daily_notifications',
    ]) {
      expect(SDK).toContain(`rpc('${rpc}'`);
    }
  });

  it('SDK خالٍ من as any', () => {
    expect(SDK).not.toMatch(/as any/);
  });

  it('الصفحة خالية من الأنماط الممنوعة', () => {
    expect(PAGE).not.toMatch(/\bprompt\(/);
    expect(PAGE).not.toMatch(/\bconfirm\(/);
    expect(PAGE).not.toMatch(/as any/);
  });

  it('الصفحة تتيح إعادة المحاولة للجسور الثلاثة', () => {
    expect(PAGE).toContain('retryReceipt');
    expect(PAGE).toContain('retryReturn');
    expect(PAGE).toContain('retryInvoice');
  });

  it('الصفحة تعرض أخطاء الترحيل للمعالجة', () => {
    expect(PAGE).toContain('inventory_post_error');
    expect(PAGE).toContain('ap_post_error');
  });

  it('الصفحة مسجّلة في كل المواضع المطلوبة', () => {
    expect(ROUTER).toContain('path="foundation/integration"');
    expect(NAV).toContain('/app/procurement/foundation/integration');
    expect(SIDEBAR).toContain("id: 'procurement-integration'");
    expect(HYBRID).toContain("id: 'procurement-integration'");
    expect(ADMIN).toContain("id: 'procurement-integration'");
    expect(REDIRECT).toContain("'procurement-integration'");
  });

  it('التوافق الخلفي يشمل الصفحة الجديدة', () => {
    const fallback = SIDEBAR.slice(SIDEBAR.indexOf('PROCUREMENT_UNIT_FALLBACK'));
    expect(fallback).toContain('procurement-integration');
  });
});
