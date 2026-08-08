/**
 * ApprovalRulesService — إدارة قواعد الاعتماد العامة (0308)
 *
 * ═════════════════════════════════════════════════════════════════════════
 * القواعد تحدّد **من يعتمد ماذا**: «مصروف فوق 50 ألفاً يحتاج المدير
 * المباشر». تُقرأ في resolve_approval_chain مع السلسلة التنظيمية.
 *
 * detectGaps هو الأهم: قاعدة اعتماد خاطئة أخطر من غيابها، لأن الطلب
 * يقع في فراغ صامت بلا معتمِد.
 * ═════════════════════════════════════════════════════════════════════════
 */
import { supabase } from '../supabase/supabase';
import type { PortalUnitKey } from '../../shared/constants/portalUnits';

/** الأدوار التي يمكن اشتراطها — تطابق قيد 0305 */
export type ApprovalRuleRole =
  | 'supervisor'
  | 'manager'
  | 'direct_manager'
  | 'unit_manager'
  | 'admin';

export const APPROVAL_RULE_ROLE_LABELS: Record<ApprovalRuleRole, string> = {
  supervisor: 'المشرف',
  manager: 'المدير',
  direct_manager: 'المدير المباشر',
  unit_manager: 'مدير الوحدة',
  admin: 'مدير النظام',
};

export interface ApprovalRuleRow {
  ruleId: string;
  unitKey: PortalUnitKey;
  ruleName: string;
  minAmount: number;
  maxAmount: number;
  departmentId: string | null;
  departmentName: string;
  level: number;
  requiredRole: ApprovalRuleRole;
  isActive: boolean;
  createdAt: string;
}

export type RuleGapSeverity = 'error' | 'warning' | 'info';

export interface ApprovalRuleGap {
  severity: RuleGapSeverity;
  unitKey: PortalUnitKey;
  issue: string;
  detail: string;
}

export interface UpsertRuleInput {
  unitKey: PortalUnitKey;
  ruleName: string;
  minAmount: number;
  maxAmount: number;
  level: number;
  requiredRole: ApprovalRuleRole;
  departmentId?: string | null;
  /** تمريره يعني تعديلاً لا إنشاءً */
  ruleId?: string | null;
}

const ERROR_MESSAGES: Record<string, string> = {
  NOT_AUTHORIZED_TO_MANAGE_RULES: 'تكوين قواعد الاعتماد يحتاج صلاحية إدارية.',
  INVALID_AMOUNT_RANGE: 'الحد الأعلى يجب أن يكون أكبر من الحد الأدنى أو مساوياً له.',
  NEGATIVE_AMOUNT: 'المبلغ لا يقبل قيمة سالبة.',
  RULE_NAME_REQUIRED: 'اسم القاعدة مطلوب.',
  DEPARTMENT_NOT_FOUND: 'القسم غير موجود.',
  RULE_NOT_FOUND: 'القاعدة غير موجودة.',
  approval_rules_level_check: 'المستوى يجب أن يكون بين 1 و 5.',
  approval_rules_unit_key_check: 'وحدة غير معروفة.',
  approval_rules_required_role_check: 'دور غير مسموح.',
  NO_AUTH: 'انتهت الجلسة — سجّل الدخول من جديد.',
  NO_TENANT: 'لا يوجد مستأجر مرتبط بحسابك.',
};

function translateError(message: string): string {
  for (const [code, text] of Object.entries(ERROR_MESSAGES)) {
    if (message.includes(code)) return text;
  }
  return message;
}

class ApprovalRulesService {
  /** لوحة القواعد — كلها أو لوحدة بعينها */
  async findRules(unitKey?: PortalUnitKey): Promise<ApprovalRuleRow[]> {
    const { data, error } = await supabase.rpc('approval_rules_board', {
      p_unit_key: unitKey ?? null,
    });
    if (error) throw new Error(translateError(error.message));

    return (data ?? []).map((r: Record<string, unknown>) => ({
      ruleId: String(r.out_rule_id),
      unitKey: String(r.out_unit_key) as PortalUnitKey,
      ruleName: String(r.out_rule_name ?? ''),
      minAmount: Number(r.out_min_amount ?? 0),
      maxAmount: Number(r.out_max_amount ?? 0),
      departmentId: r.out_department_id ? String(r.out_department_id) : null,
      departmentName: String(r.out_department ?? 'كل الأقسام'),
      level: Number(r.out_level ?? 1),
      requiredRole: String(r.out_required_role) as ApprovalRuleRole,
      isActive: r.out_is_active === true,
      createdAt: String(r.out_created_at ?? ''),
    }));
  }

  /** إنشاء أو تعديل */
  async upsert(input: UpsertRuleInput): Promise<string> {
    const { data, error } = await supabase.rpc('upsert_approval_rule', {
      p_unit_key: input.unitKey,
      p_rule_name: input.ruleName,
      p_min_amount: input.minAmount,
      p_max_amount: input.maxAmount,
      p_level: input.level,
      p_required_role: input.requiredRole,
      p_department_id: input.departmentId ?? null,
      p_rule_id: input.ruleId ?? null,
    });
    if (error) throw new Error(translateError(error.message));
    return String(data);
  }

  /** تفعيل/تعطيل — لا حذف */
  async setActive(ruleId: string, active: boolean): Promise<void> {
    const { error } = await supabase.rpc('set_approval_rule_active', {
      p_rule_id: ruleId,
      p_active: active,
    });
    if (error) throw new Error(translateError(error.message));
  }

  /**
   * كشف الفجوات والتعارضات.
   * error   = تداخل نطاقات أو دور بلا شاغل ⇒ طلبات ستقع في فراغ
   * warning = فجوة بين نطاقين
   * info    = وحدة بلا قواعد (تعتمد السلسلة التنظيمية وحدها)
   */
  async detectGaps(unitKey?: PortalUnitKey): Promise<ApprovalRuleGap[]> {
    const { data, error } = await supabase.rpc('detect_approval_rule_gaps', {
      p_unit_key: unitKey ?? null,
    });
    if (error) throw new Error(translateError(error.message));

    return (data ?? []).map((r: Record<string, unknown>) => ({
      severity: String(r.out_severity) as RuleGapSeverity,
      unitKey: String(r.out_unit_key) as PortalUnitKey,
      issue: String(r.out_issue ?? ''),
      detail: String(r.out_detail ?? ''),
    }));
  }
}

export const approvalRulesService = new ApprovalRulesService();
export default approvalRulesService;
