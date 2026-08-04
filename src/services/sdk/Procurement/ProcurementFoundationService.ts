/**
 * ════════════════════════════════════════════════════════════════
 *  ProcurementFoundationService — الوحدة 00: الأساس ولوحة التحكم
 *
 *  يغطي:
 *   - فئات الإنفاق (UNSPSC) — شجرة + Lookup
 *   - قواعد الموافقة
 *   - سياسات المشتريات
 *   - سجل التدقيق
 *   - لوحة مؤشرات الأساس + فحص صحة الإعداد
 *
 *  كل عمليات الكتابة تمر عبر RPC (لا كتابة مباشرة على الجداول)
 *  لضمان التحقق وتسجيل التدقيق.
 * ════════════════════════════════════════════════════════════════
 */

import { supabase } from '../../supabase/supabase';

// ─── الأنواع ────────────────────────────────────────────────────

export interface SpendCategoryRecord {
  id: string;
  tenant_id: string;
  code: string;
  name_ar: string;
  name_en?: string | null;
  parent_id?: string | null;
  level: number;
  is_active: boolean;
  deactivated_reason?: string | null;
  created_at: string;
}

export interface SpendCategoryTreeRecord extends SpendCategoryRecord {
  path_ar: string;
  child_count: number;
  transaction_count: number;
}

export interface SpendCategoryLookupRecord {
  id: string;
  tenant_id: string;
  code: string;
  name_ar: string;
  name_en?: string | null;
  level: number;
  parent_id?: string | null;
  path_ar: string;
}

export type ApprovalRequiredRole =
  | 'supervisor' | 'manager' | 'direct_manager' | 'finance' | 'admin' | 'procurement';

export interface ProcurementApprovalRuleRecord {
  id: string;
  tenant_id: string;
  rule_name: string;
  min_amount: number;
  max_amount: number;
  department_id?: string | null;
  level: number;
  required_role: ApprovalRequiredRole;
  is_active: boolean;
  deactivated_reason?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at?: string | null;
}

export interface ProcurementApprovalRuleBoardRecord extends ProcurementApprovalRuleRecord {
  department_name?: string | null;
  created_by_name?: string | null;
}

export interface ProcurementPolicyRecord {
  id: string;
  tenant_id: string;
  policy_key: string;
  policy_value: Record<string, unknown>;
  description?: string | null;
  is_active: boolean;
  updated_by_name?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProcurementAuditEventRecord {
  id: string;
  tenant_id: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id?: string | null;
  actor_id?: string | null;
  actor_name?: string | null;
  reason?: string | null;
  before_data?: Record<string, unknown> | null;
  after_data?: Record<string, unknown> | null;
  created_at: string;
}

export interface ProcurementFoundationDashboardRecord {
  tenant_id: string;
  active_suppliers: number;
  total_suppliers: number;
  total_requisitions: number;
  pending_requisitions: number;
  approved_requisitions: number;
  active_categories: number;
  active_approval_rules: number;
  active_policies: number;
  audit_events_30d: number;
}

export interface ProcurementFoundationCheckRecord {
  severity: 'error' | 'warning' | 'info';
  check_code: string;
  message: string;
  affected_count: number;
}

// ─── فئات الإنفاق ───────────────────────────────────────────────

class SpendCategoryService {
  /** الشجرة الكاملة مع المسار وعدد الأبناء والمعاملات */
  async findTree(): Promise<SpendCategoryTreeRecord[]> {
    const { data, error } = await supabase
      .from('procurement_category_tree')
      .select('*');
    if (error) throw new Error(error.message);
    return (data || []) as SpendCategoryTreeRecord[];
  }

  /** قائمة الفئات النشطة للاختيار (بديل نسخ UUID) */
  async findLookup(): Promise<SpendCategoryLookupRecord[]> {
    const { data, error } = await supabase
      .from('procurement_category_lookup')
      .select('*');
    if (error) throw new Error(error.message);
    return (data || []) as SpendCategoryLookupRecord[];
  }

  async upsert(input: {
    code: string;
    nameAr: string;
    level: number;
    categoryId?: string | null;
    nameEn?: string | null;
    parentId?: string | null;
  }): Promise<SpendCategoryRecord> {
    const { data, error } = await supabase.rpc('upsert_spend_category', {
      p_code: input.code,
      p_name_ar: input.nameAr,
      p_level: input.level,
      p_category_id: input.categoryId ?? null,
      p_name_en: input.nameEn ?? null,
      p_parent_id: input.parentId ?? null,
    });
    if (error) throw new Error(error.message);
    return data as SpendCategoryRecord;
  }

  /** تعطيل/تفعيل — لا حذف نهائي. السبب إلزامي. */
  async setStatus(categoryId: string, isActive: boolean, reason: string): Promise<SpendCategoryRecord> {
    const { data, error } = await supabase.rpc('set_spend_category_status', {
      p_category_id: categoryId,
      p_is_active: isActive,
      p_reason: reason,
    });
    if (error) throw new Error(error.message);
    return data as SpendCategoryRecord;
  }
}

// ─── قواعد الموافقة ─────────────────────────────────────────────

class ProcurementApprovalRuleService {
  async findBoard(): Promise<ProcurementApprovalRuleBoardRecord[]> {
    const { data, error } = await supabase
      .from('procurement_approval_rule_board')
      .select('*');
    if (error) throw new Error(error.message);
    return (data || []) as ProcurementApprovalRuleBoardRecord[];
  }

  async upsert(input: {
    ruleName: string;
    minAmount: number;
    maxAmount: number;
    level: number;
    requiredRole: ApprovalRequiredRole;
    ruleId?: string | null;
    departmentId?: string | null;
    notes?: string | null;
  }): Promise<ProcurementApprovalRuleRecord> {
    const { data, error } = await supabase.rpc('upsert_procurement_approval_rule', {
      p_rule_name: input.ruleName,
      p_min_amount: input.minAmount,
      p_max_amount: input.maxAmount,
      p_level: input.level,
      p_required_role: input.requiredRole,
      p_rule_id: input.ruleId ?? null,
      p_department_id: input.departmentId ?? null,
      p_notes: input.notes ?? null,
    });
    if (error) throw new Error(error.message);
    return data as ProcurementApprovalRuleRecord;
  }

  async setStatus(ruleId: string, isActive: boolean, reason: string): Promise<ProcurementApprovalRuleRecord> {
    const { data, error } = await supabase.rpc('set_procurement_approval_rule_status', {
      p_rule_id: ruleId,
      p_is_active: isActive,
      p_reason: reason,
    });
    if (error) throw new Error(error.message);
    return data as ProcurementApprovalRuleRecord;
  }
}

// ─── سياسات المشتريات ───────────────────────────────────────────

class ProcurementPolicyService {
  async findAll(): Promise<ProcurementPolicyRecord[]> {
    const { data, error } = await supabase
      .from('procurement_policy_board')
      .select('*');
    if (error) throw new Error(error.message);
    return (data || []) as ProcurementPolicyRecord[];
  }

  async upsert(input: {
    policyKey: string;
    policyValue: Record<string, unknown>;
    description?: string | null;
  }): Promise<ProcurementPolicyRecord> {
    const { data, error } = await supabase.rpc('upsert_procurement_policy', {
      p_policy_key: input.policyKey,
      p_policy_value: input.policyValue,
      p_description: input.description ?? null,
    });
    if (error) throw new Error(error.message);
    return data as ProcurementPolicyRecord;
  }
}

// ─── سجل التدقيق ────────────────────────────────────────────────

class ProcurementAuditService {
  async findRecent(limit = 100, aggregateType?: string): Promise<ProcurementAuditEventRecord[]> {
    let query = supabase.from('procurement_audit_board').select('*').limit(limit);
    if (aggregateType) query = query.eq('aggregate_type', aggregateType);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data || []) as ProcurementAuditEventRecord[];
  }
}

// ─── لوحة الأساس ────────────────────────────────────────────────

class ProcurementFoundationService {
  async getDashboard(): Promise<ProcurementFoundationDashboardRecord | null> {
    const { data, error } = await supabase
      .from('procurement_foundation_dashboard')
      .select('*')
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as ProcurementFoundationDashboardRecord) ?? null;
  }

  /** فحص صحة إعداد المشتريات — يكشف الفجوات قبل التشغيل */
  async validate(): Promise<ProcurementFoundationCheckRecord[]> {
    const { data, error } = await supabase.rpc('validate_procurement_foundation');
    if (error) throw new Error(error.message);
    return (data || []) as ProcurementFoundationCheckRecord[];
  }
}

export const spendCategoryService = new SpendCategoryService();
export const procurementApprovalRuleService = new ProcurementApprovalRuleService();
export const procurementPolicyService = new ProcurementPolicyService();
export const procurementAuditService = new ProcurementAuditService();
export const procurementFoundationService = new ProcurementFoundationService();
