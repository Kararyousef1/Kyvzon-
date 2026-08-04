/**
 * عقد الوحدة 04 لبوابة المشتريات — أوامر الشراء واستلام البضائع
 *
 * الأهم: التحقق من جسر المخزون (0260) الذي يحل الفجوة الأخطر —
 * كان استلام البضاعة لا يزيد رصيد المستودع إطلاقاً.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const BRIDGE = read('supabase/migrations/0260_procurement_inventory_receipt_bridge.sql');
const ORDERS = read('supabase/migrations/0185_procurement_orders_gr.sql');
const COMPLETION = read('supabase/migrations/0199_procurement_po_gr_completion.sql');
const NAV = read('src/pages/app/procurement/shared/ProcurementUnitNav.tsx');
const PO_DETAIL = read('src/pages/app/procurement/orders/PoDetailPage.tsx');
const GR_PAGE = read('src/pages/app/procurement/orders/GoodsReceiptPage.tsx');
const RELEASES = read('src/pages/app/procurement/orders/PoReleasesPage.tsx');
const PO_LIST = read('src/pages/app/procurement/orders/PurchaseOrdersPage.tsx');
const LAYOUT = read('src/pages/app/procurement/orders/OrdersLayout.tsx');

describe('المشتريات 04 — جسر المخزون (0260)', () => {
  it('يضيف أعمدة الربط بين المشتريات والمخزون', () => {
    expect(BRIDGE).toContain('ADD COLUMN IF NOT EXISTS inventory_item_id');
    expect(BRIDGE).toContain('ADD COLUMN IF NOT EXISTS warehouse_id');
    expect(BRIDGE).toContain('ADD COLUMN IF NOT EXISTS inventory_posted_at');
  });

  it('يكتب في جداول المخزون الحقيقية لا الجدول الموازي', () => {
    expect(BRIDGE).toContain('INSERT INTO public.inventory_stock_movements');
    expect(BRIDGE).toContain('public.inventory_stock_balances');
    expect(BRIDGE).toContain("'receipt'");
  });

  it('يمنع الترحيل المزدوج', () => {
    expect(BRIDGE).toContain('GR_ALREADY_POSTED_TO_INVENTORY');
  });

  it('يتحقق من المستودع ضمن نفس المستأجر', () => {
    expect(BRIDGE).toContain('WAREHOUSE_NOT_IN_TENANT');
    expect(BRIDGE).toContain('NO_WAREHOUSE_AVAILABLE');
  });

  it('يتخطّى السطر غير المرتبط بدل إسقاط العملية', () => {
    expect(BRIDGE).toContain('v_skipped := v_skipped + 1');
    expect(BRIDGE).toContain('CONTINUE;');
  });

  it('يحل الصنف بالربط المباشر أو بمطابقة الكود', () => {
    expect(BRIDGE).toContain('resolve_inventory_item_for_po_line');
    expect(BRIDGE).toContain('upper(btrim(item_code))');
  });

  it('post_goods_receipt تستدعي الجسر', () => {
    expect(BRIDGE).toContain('CREATE OR REPLACE FUNCTION public.post_goods_receipt(p_gr_id UUID)');
    expect(BRIDGE).toContain('PERFORM public.post_goods_receipt_to_inventory');
  });

  it('يصلح بُغ updated_at غير الموجود في goods_receipts', () => {
    // الأصل في 0199 كان يحدّث عموداً غير موجود فيفشل وقت التنفيذ
    expect(COMPLETION).toContain("UPDATE public.goods_receipts SET status='posted', updated_at=NOW()");
    const fixed = BRIDGE.slice(BRIDGE.indexOf('CREATE OR REPLACE FUNCTION public.post_goods_receipt(p_gr_id UUID)'));
    expect(fixed).toContain("UPDATE public.goods_receipts SET status = 'posted'");
    expect(fixed).not.toMatch(/SET status = 'posted', updated_at/);
  });

  it('View حالة الترحيل موجود بـ security_invoker', () => {
    expect(BRIDGE).toContain('CREATE OR REPLACE VIEW public.procurement_gr_inventory_status');
    expect(BRIDGE).toContain('security_invoker = true');
    expect(BRIDGE).toContain('unlinked_line_count');
  });

  it('كل شيء مُدقَّق', () => {
    expect(BRIDGE).toContain('log_procurement_audit_event');
    expect(BRIDGE).toContain('gr_posted_to_inventory');
  });
});

describe('المشتريات 04 — بنية أوامر الشراء', () => {
  it('جداول الأوامر والاستلام موجودة', () => {
    for (const t of ['purchase_orders', 'po_line_items', 'po_releases', 'goods_receipts', 'gr_line_items', 'return_to_vendor']) {
      expect(ORDERS).toContain(`CREATE TABLE IF NOT EXISTS public.${t}`);
    }
  });

  it('الاستلام يمر بفحص الجودة قبل الترحيل', () => {
    expect(BRIDGE).toContain('GR_MUST_BE_QUALITY_HOLD');
    expect(BRIDGE).toContain('IQC_REJECTED_CANNOT_POST');
  });

  it('أسباب الإرجاع مقيّدة', () => {
    expect(COMPLETION).toContain('INVALID_RTV_REASON');
  });
});

describe('المشتريات 04 — الواجهات', () => {
  it('كل صفحات الأوامر خالية من الأنماط الممنوعة', () => {
    for (const [name, src] of [
      ['po-detail', PO_DETAIL], ['gr', GR_PAGE], ['releases', RELEASES], ['po-list', PO_LIST],
    ] as const) {
      expect(src, `${name} يحوي prompt`).not.toMatch(/\bprompt\(/);
      expect(src, `${name} يحوي confirm`).not.toMatch(/\bconfirm\(/);
      expect(src, `${name} يحوي as any`).not.toMatch(/as any/);
    }
  });

  it('RTV عبر نموذج لا سلسلة prompt', () => {
    expect(PO_DETAIL).toContain('openRtvDialog');
    expect(PO_DETAIL).toContain('submitRtv');
    expect(PO_DETAIL).toContain('تفاصيل الإعادة مطلوبة');
    expect(PO_DETAIL).toContain('type RtvReason');
  });

  it('تحديث حالة PO عبر نافذة', () => {
    expect(PO_DETAIL).toContain('openStatusDialog');
    expect(PO_DETAIL).toContain('confirmStatus');
  });

  it('قرار الجودة عبر نافذة ويلزم الملاحظات عند الرفض', () => {
    expect(GR_PAGE).toContain('openIqcDialog');
    expect(GR_PAGE).toContain('submitIqc');
    expect(GR_PAGE).toContain('الملاحظات مطلوبة عند الرفض');
  });

  it('التخطيط يحوي شريط الوحدة', () => {
    expect(LAYOUT).toContain('ProcurementUnitNav');
    expect(LAYOUT).toContain('unit="orders"');
  });

  it('وحدة الأوامر معرّفة في شريط التنقل', () => {
    expect(NAV).toContain('orders: { title:');
    expect(NAV).toContain('/app/procurement/orders/goods-receipts');
  });
});
