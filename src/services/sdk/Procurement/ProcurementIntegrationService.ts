/**
 * ════════════════════════════════════════════════════════════════
 *  ProcurementIntegrationService — جسور تكامل المشتريات
 *
 *  يغطي:
 *   - ربط سطر أمر الشراء بصنف المخزون وحساب المصروف
 *   - تحديد مستودع الاستلام
 *   - حالة ترحيل الاستلامات والمرتجعات والفواتير
 *   - صحة الربط (كشف الفجوات قبل الترحيل)
 *   - الإشعارات المجدولة
 *
 *  كل عمليات الكتابة عبر RPC مع تحقق وتسجيل تدقيق.
 * ════════════════════════════════════════════════════════════════
 */

import { supabase } from '../../supabase/supabase';

// ─── الأنواع ────────────────────────────────────────────────────

export interface InventoryItemLookupRecord {
  id: string;
  tenant_id: string;
  item_code: string;
  name_ar: string;
  category_name?: string | null;
  status?: string | null;
}

export interface WarehouseLookupRecord {
  id: string;
  tenant_id: string;
  warehouse_code: string;
  name_ar: string;
  warehouse_type?: string | null;
  status?: string | null;
}

export interface ExpenseAccountLookupRecord {
  id: string;
  tenant_id: string;
  legal_entity_id: string;
  code: string;
  account_name: string;
  account_type: string;
  entity_code?: string | null;
}

export interface GrInventoryStatusRecord {
  gr_id: string;
  tenant_id: string;
  gr_number: string;
  po_id?: string | null;
  po_number?: string | null;
  gr_status: string;
  warehouse_id?: string | null;
  warehouse_code?: string | null;
  warehouse_name?: string | null;
  inventory_posted_at?: string | null;
  is_posted_to_inventory: boolean;
  line_count: number;
  unlinked_line_count: number;
  accepted_quantity: number;
  created_at: string;
}

export interface RtvInventoryStatusRecord {
  rtv_id: string;
  tenant_id: string;
  rtv_number: string;
  po_id?: string | null;
  po_number?: string | null;
  gr_id?: string | null;
  gr_number?: string | null;
  quantity: number;
  reason: string;
  warehouse_id?: string | null;
  warehouse_code?: string | null;
  inventory_posted_at?: string | null;
  is_deducted_from_inventory: boolean;
  inventory_post_error?: string | null;
  created_at: string;
}

export interface InvoiceApStatusRecord {
  invoice_id: string;
  tenant_id: string;
  invoice_number: string;
  supplier_id?: string | null;
  supplier_name?: string | null;
  invoice_status: string;
  total_amount: number;
  currency_code?: string | null;
  ap_invoice_id?: string | null;
  ap_invoice_number?: string | null;
  ap_status?: string | null;
  ap_posted_at?: string | null;
  is_posted_to_ap: boolean;
  ap_post_error?: string | null;
  invoice_date?: string | null;
  payment_due_date?: string | null;
}

export interface IntegrationHealthRecord {
  check_code: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
  affected_count: number;
}

export interface NotificationJobResult {
  job: string;
  entities: number;
  notifications: number;
}

/**
 * حالة تشغيل الإشعارات المجدولة (من procurement_notification_dispatch_status).
 * تكشف ما إذا كانت وظيفة cron تعمل فعلاً أم توقفت بصمت.
 */
export interface NotificationDispatchStatusRecord {
  notification_kind: string;
  last_dispatch_date: string | null;
  days_since_last: number | null;
  dispatched_today: number;
  recipients_today: number | null;
  total_dispatched: number;
  dispatch_health: 'healthy' | 'stale' | 'not_running';
}

export interface PostResult {
  posted_lines: number;
  skipped_lines: number;
  total_quantity: number;
  target_warehouse_id?: string | null;
}

// ─── Lookups ────────────────────────────────────────────────────

class ProcurementLookupService {
  async findInventoryItems(search?: string): Promise<InventoryItemLookupRecord[]> {
    let query = supabase.from('procurement_inventory_item_lookup').select('*').limit(300);
    if (search?.trim()) {
      query = query.or(`item_code.ilike.%${search.trim()}%,name_ar.ilike.%${search.trim()}%`);
    }
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data || []) as InventoryItemLookupRecord[];
  }

  async findWarehouses(): Promise<WarehouseLookupRecord[]> {
    const { data, error } = await supabase.from('procurement_warehouse_lookup').select('*');
    if (error) throw new Error(error.message);
    return (data || []) as WarehouseLookupRecord[];
  }

  async findExpenseAccounts(): Promise<ExpenseAccountLookupRecord[]> {
    const { data, error } = await supabase.from('procurement_expense_account_lookup').select('*');
    if (error) throw new Error(error.message);
    return (data || []) as ExpenseAccountLookupRecord[];
  }
}

// ─── الربط والترحيل ─────────────────────────────────────────────

class ProcurementIntegrationService {
  /** ربط سطر أمر الشراء بصنف المخزون و/أو حساب المصروف */
  async linkPoLine(input: {
    poLineId: string;
    inventoryItemId?: string | null;
    expenseAccountId?: string | null;
  }): Promise<void> {
    const { error } = await supabase.rpc('link_po_line_integration', {
      p_po_line_id: input.poLineId,
      p_inventory_item_id: input.inventoryItemId ?? null,
      p_expense_account_id: input.expenseAccountId ?? null,
    });
    if (error) throw new Error(error.message);
  }

  /** تحديد مستودع الاستلام قبل الترحيل */
  async setGoodsReceiptWarehouse(grId: string, warehouseId: string): Promise<void> {
    const { error } = await supabase.rpc('set_goods_receipt_warehouse', {
      p_gr_id: grId,
      p_warehouse_id: warehouseId,
    });
    if (error) throw new Error(error.message);
  }

  /** ترحيل استلام إلى المخزون يدوياً */
  async postGoodsReceiptToInventory(grId: string, warehouseId?: string | null): Promise<PostResult[]> {
    const { data, error } = await supabase.rpc('post_goods_receipt_to_inventory', {
      p_gr_id: grId,
      p_warehouse_id: warehouseId ?? null,
    });
    if (error) throw new Error(error.message);
    return (data || []) as PostResult[];
  }

  /** خصم مرتجع من المخزون يدوياً (لمعالجة الفشل السابق) */
  async postRtvToInventory(rtvId: string, warehouseId?: string | null): Promise<PostResult[]> {
    const { data, error } = await supabase.rpc('post_rtv_to_inventory', {
      p_rtv_id: rtvId,
      p_warehouse_id: warehouseId ?? null,
    });
    if (error) throw new Error(error.message);
    return (data || []) as PostResult[];
  }

  /** ترحيل فاتورة إلى الذمم الدائنة يدوياً */
  async postInvoiceToAp(input: {
    invoiceId: string;
    legalEntityId?: string | null;
    expenseAccountId?: string | null;
  }): Promise<string> {
    const { data, error } = await supabase.rpc('post_supplier_invoice_to_ap', {
      p_invoice_id: input.invoiceId,
      p_legal_entity_id: input.legalEntityId ?? null,
      p_expense_account_id: input.expenseAccountId ?? null,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }

  // ─── لوحات الحالة ──────────────────────────────────────────

  async findGrInventoryStatus(): Promise<GrInventoryStatusRecord[]> {
    const { data, error } = await supabase.from('procurement_gr_inventory_status').select('*').limit(200);
    if (error) throw new Error(error.message);
    return (data || []) as GrInventoryStatusRecord[];
  }

  async findRtvInventoryStatus(): Promise<RtvInventoryStatusRecord[]> {
    const { data, error } = await supabase.from('procurement_rtv_inventory_status').select('*').limit(200);
    if (error) throw new Error(error.message);
    return (data || []) as RtvInventoryStatusRecord[];
  }

  async findInvoiceApStatus(): Promise<InvoiceApStatusRecord[]> {
    const { data, error } = await supabase.from('procurement_invoice_ap_status').select('*').limit(200);
    if (error) throw new Error(error.message);
    return (data || []) as InvoiceApStatusRecord[];
  }

  /** صحة الربط — يكشف الفجوات قبل الترحيل */
  async checkHealth(): Promise<IntegrationHealthRecord[]> {
    const { data, error } = await supabase.from('procurement_integration_health').select('*');
    if (error) throw new Error(error.message);
    return (data || []) as IntegrationHealthRecord[];
  }
}

// ─── الإشعارات المجدولة ─────────────────────────────────────────

class ProcurementNotificationService {
  /** تشغيل كل الإشعارات اليومية */
  async runDaily(): Promise<NotificationJobResult[]> {
    const { data, error } = await supabase.rpc('run_procurement_daily_notifications');
    if (error) throw new Error(error.message);
    return (data || []) as NotificationJobResult[];
  }

  async dispatchContractRenewals(): Promise<{ contracts_notified: number; notifications_created: number }[]> {
    const { data, error } = await supabase.rpc('dispatch_contract_renewal_notifications');
    if (error) throw new Error(error.message);
    return (data || []) as { contracts_notified: number; notifications_created: number }[];
  }

  async dispatchPrReminders(hoursThreshold = 48): Promise<{ requests_notified: number; notifications_created: number }[]> {
    const { data, error } = await supabase.rpc('dispatch_pr_approval_reminders', {
      p_hours_threshold: hoursThreshold,
    });
    if (error) throw new Error(error.message);
    return (data || []) as { requests_notified: number; notifications_created: number }[];
  }

  async dispatchDocumentExpiry(days = 30): Promise<{ documents_notified: number; notifications_created: number }[]> {
    const { data, error } = await supabase.rpc('dispatch_supplier_document_expiry_notifications', {
      p_days: days,
    });
    if (error) throw new Error(error.message);
    return (data || []) as { documents_notified: number; notifications_created: number }[];
  }

  /**
   * حالة الجدولة التلقائية لكل نوع إشعار.
   *
   * ملاحظة معمارية مهمة:
   *   الدوال أعلاه (runDaily / dispatch*) تعمل بسياق المستخدم الحالي
   *   وتخدم مستأجره فقط — للتشغيل اليدوي من الواجهة.
   *   الجدولة التلقائية لكل المستأجرين تتم عبر Edge Function
   *   `procurement-daily-notifications` التي تستدعي
   *   `run_procurement_daily_notifications_cron()` بصلاحية service_role.
   *   هذه الدالة تقرأ أثر ذلك التشغيل لعرضه في لوحة صحة التكامل.
   */
  async findDispatchStatus(): Promise<NotificationDispatchStatusRecord[]> {
    const { data, error } = await supabase
      .from('procurement_notification_dispatch_status')
      .select('*');
    if (error) throw new Error(error.message);
    return (data || []) as NotificationDispatchStatusRecord[];
  }
}

export const procurementLookupService = new ProcurementLookupService();
export const procurementIntegrationService = new ProcurementIntegrationService();
export const procurementNotificationService = new ProcurementNotificationService();
