/**
 * UnifiedApprovalService — محرك الموافقات الموحّد (0305)
 *
 * ═════════════════════════════════════════════════════════════════════════
 * المشكلة التي يحلّها:
 *   تسعة أنظمة موافقات منفصلة، والمدير يفتح ثلاث بوابات ليوافق على
 *   ثلاثة طلبات. و ManagerApprovalsPage كان يقرأ approval_requests
 *   وحده — وهو جدول لا أحد يكتب فيه، فالصفحة فارغة أبداً.
 *
 * الحل: عرض موحّد + دالة قرار توجّه للجدول الصحيح. بلا لمس أي جدول.
 *
 * الأمان: الفلترة بالوحدة والفريق تجري في القاعدة
 *   (has_portal_unit + is_in_my_team) لا هنا.
 * ═════════════════════════════════════════════════════════════════════════
 */
import { supabase } from '../supabase/supabase';
import { logger } from '../utils/logger';
import type { PortalUnitKey } from '../../shared/constants/portalUnits';

/** وحدات المصدر التي يعيدها صندوق الاعتمادات (بما فيها مالية الموظف). */
export type ApprovalSourceModule =
  | 'hr'
  | 'employee_finance'
  | 'procurement'
  | 'finance'
  | 'contracts'
  | 'movement'
  | 'inventory'
  | 'mrp'
  | 'crm'
  | 'general';

export interface UnifiedApprovalItem {
  sourceModule: ApprovalSourceModule;
  sourceId: string;
  requestType: string;
  title: string;
  requesterId: string | null;
  requesterName: string;
  amount: number | null;
  unitKey: PortalUnitKey;
  createdAt: string;
  /** المستوى الحالي في سلسلة الاعتماد (1 حين لا خطوات) */
  stepOrder: number;
  /** إجمالي المستويات (1 حين لا خطوات) */
  totalSteps: number;
}

/** خطوة في مسار الاعتماد متعدد المستويات (0309) */
export interface ApprovalStep {
  stepOrder: number;
  requiredRole: string;
  approverId: string | null;
  approverName: string;
  status: 'pending' | 'active' | 'approved' | 'rejected' | 'skipped';
  /**
   * نصّ التعليق — أو null إن كان محجوباً عن هذا المستخدم (0316).
   * الحجب لا يعني الغياب: قد يكون المعتمِد كتب تعليقاً لا يخصّك.
   */
  comments: string | null;
  decidedAt: string | null;
  ruleName: string | null;
  /** هل هذه خطوتي أنا؟ (0316) — لإبرازها في الواجهة */
  isMine: boolean;
  /** هل هذه الخطوة النشطة الآن؟ أول خطوة معلّقة في السلسلة (0316) */
  isCurrent: boolean;
}

export type ApprovalDecision = 'approved' | 'rejected';

/** تسميات عربية للبوابات المصدر */
export const SOURCE_MODULE_LABELS: Record<ApprovalSourceModule, string> = {
  hr: 'الموارد البشرية',
  employee_finance: 'طلبات الموظف المالية',
  procurement: 'المشتريات',
  finance: 'المالية',
  contracts: 'العقود',
  movement: 'الحركة واللوجستيات',
  inventory: 'المخزون',
  mrp: 'التصنيع',
  crm: 'المبيعات',
  general: 'عام',
};

/** ألوان تمييز البوابة في الواجهة */
export const SOURCE_MODULE_TONES: Record<ApprovalSourceModule, string> = {
  hr: 'bg-emerald-100 text-emerald-700',
  employee_finance: 'bg-fuchsia-100 text-fuchsia-700',
  procurement: 'bg-amber-100 text-amber-700',
  finance: 'bg-violet-100 text-violet-700',
  contracts: 'bg-slate-200 text-slate-700',
  movement: 'bg-sky-100 text-sky-700',
  inventory: 'bg-indigo-100 text-indigo-700',
  mrp: 'bg-orange-100 text-orange-700',
  crm: 'bg-cyan-100 text-cyan-700',
  general: 'bg-slate-100 text-slate-600',
};

const ERROR_MESSAGES: Record<string, string> = {
  NOT_ASSIGNED_TO_UNIT: 'لم تُسنَد إليك هذه الوحدة في بوابة المدير.',
  REQUESTER_NOT_IN_MY_TEAM: 'مقدّم الطلب ليس ضمن فريقك — لا يمكنك البتّ فيه.',
  APPROVAL_NOT_FOUND_OR_DECIDED: 'الطلب غير موجود أو بُتَّ فيه بالفعل.',
  UNKNOWN_SOURCE_MODULE: 'مصدر الطلب غير معروف.',
  INVALID_DECISION: 'قرار غير صالح.',
  NOT_YOUR_STEP: 'هذه الخطوة مُسنَدة لمعتمِد آخر — انتظر دورك في السلسلة.',
  NO_ACTIVE_STEP: 'لا خطوة نشطة في هذا الطلب.',
  NO_AUTH: 'انتهت الجلسة — سجّل الدخول من جديد.',
  NO_TENANT: 'لا يوجد مستأجر مرتبط بحسابك.',
};

function translateError(message: string): string {
  for (const [code, text] of Object.entries(ERROR_MESSAGES)) {
    if (message.includes(code)) return text;
  }
  return message;
}

class UnifiedApprovalService {
  /**
   * صندوق وارد الموافقات — كل ما يخصّ وحدات المستخدم وفريقه.
   * @param unitKey تصفية بوحدة بعينها (اختياري)
   */
  async findMyInbox(unitKey?: PortalUnitKey): Promise<UnifiedApprovalItem[]> {
    const { data, error } = await supabase.rpc('my_approval_inbox', {
      p_unit_key: unitKey ?? null,
    });
    if (error) throw new Error(translateError(error.message));

    return (data ?? []).map((r: Record<string, unknown>) => ({
      sourceModule: String(r.out_source_module) as ApprovalSourceModule,
      sourceId: String(r.out_source_id),
      requestType: String(r.out_request_type ?? ''),
      title: String(r.out_title ?? ''),
      requesterId: r.out_requester_id ? String(r.out_requester_id) : null,
      requesterName: String(r.out_requester_name ?? '—'),
      amount: r.out_amount === null || r.out_amount === undefined
        ? null
        : Number(r.out_amount),
      unitKey: String(r.out_unit_key) as PortalUnitKey,
      createdAt: String(r.out_created_at ?? ''),
      stepOrder: Number(r.out_step_order ?? 1),
      totalSteps: Number(r.out_total_steps ?? 1),
    }));
  }

  /**
   * قرار موحّد — يوجّه للجدول الصحيح.
   *
   * يُرجع الحالة النهائية: 'approved' | 'rejected' | 'pending'.
   * 'pending' تعني أن الطلب انتقل لمستوى اعتماد تالٍ (0309).
   */
  async decide(
    sourceModule: ApprovalSourceModule,
    sourceId: string,
    decision: ApprovalDecision,
    comments?: string,
  ): Promise<'approved' | 'rejected' | 'pending'> {
    const { data, error } = await supabase.rpc('unified_approval_decide', {
      p_source_module: sourceModule,
      p_source_id: sourceId,
      p_decision: decision,
      p_comments: comments ?? null,
    });
    if (error) throw new Error(translateError(error.message));
    return (String(data ?? decision) as 'approved' | 'rejected' | 'pending');
  }

  /** مسار الاعتماد لطلب — لعرض المستويات وحالة كل منها */
  async findSteps(
    sourceModule: ApprovalSourceModule,
    sourceId: string,
  ): Promise<ApprovalStep[]> {
    const { data, error } = await supabase.rpc('approval_steps_for', {
      p_source_module: sourceModule,
      p_source_id: sourceId,
    });
    if (error) throw new Error(translateError(error.message));

    return (data ?? []).map((r: Record<string, unknown>) => ({
      stepOrder: Number(r.out_step_order ?? 0),
      requiredRole: String(r.out_required_role ?? ''),
      approverId: r.out_approver_id ? String(r.out_approver_id) : null,
      approverName: String(r.out_approver_name ?? '—'),
      status: String(r.out_status) as ApprovalStep['status'],
      comments: r.out_comments ? String(r.out_comments) : null,
      decidedAt: r.out_decided_at ? String(r.out_decided_at) : null,
      ruleName: r.out_rule_name ? String(r.out_rule_name) : null,
      isMine: r.out_is_mine === true,
      isCurrent: r.out_is_current === true,
    }));
  }

  /**
   * بتّ في طلب موارد بشرية بمعرّف الطلب **أو** معرّف مصدره
   * (إجازة · استئذان · مصروف · سلفة) — migration 0334.
   *
   * ★ العطل الذي تُصلحه: `unified_approval_decide('hr', <leave_id>, …)`
   *   كانت تردّ `APPROVAL_NOT_FOUND_OR_DECIDED` لأن `source_id`
   *   المتوقَّع هو `hr_approval_requests.id` لا `leaves.id`. الواجهة
   *   تملك أحياناً هذا وأحياناً ذاك.
   *
   * تُوجّه إلى `decide_hr_approval_step` (مصدر الحقيقة لخطوات HR)
   * ثم تعكس المرآة النتيجة إلى المحرّك الموحّد تلقائياً.
   */
  async decideHrAny(
    anyId: string,
    decision: 'approved' | 'rejected',
    comments?: string,
  ): Promise<'approved' | 'rejected' | 'pending'> {
    const { data, error } = await supabase.rpc('hr_approval_decide_any', {
      p_any_id: anyId,
      p_decision: decision,
      p_comments: comments ?? null,
    });
    if (error) throw new Error(translateError(error.message));
    return String(data ?? decision) as 'approved' | 'rejected' | 'pending';
  }

  /**
   * يترجم معرّف إجازة/استئذان/مصروف/سلفة إلى معرّف طلب الاعتماد.
   * يُرجع null إن لم يوجد طلب مطابق أو لم يكن للمستخدم حقّ رؤيته.
   */
  async resolveHrSource(anyId: string): Promise<{
    requestId: string;
    module: string;
    kind: 'request' | 'source';
  } | null> {
    const { data, error } = await supabase.rpc('resolve_hr_approval_source', {
      p_any_id: anyId,
    });
    if (error) {
      logger.error('resolveHrSource فشل: ' + error.message, {
        component: 'UnifiedApprovalService',
        action: 'resolveHrSource',
      });
      return null;
    }
    const rows = (data ?? []) as Array<{
      out_request_id: string; out_module: string; out_kind: string;
    }>;
    if (rows.length === 0) return null;
    return {
      requestId: rows[0].out_request_id,
      module: rows[0].out_module,
      kind: rows[0].out_kind === 'request' ? 'request' : 'source',
    };
  }

  /**
   * يبني سلسلة الخطوات لطلب من approval_rules.
   * تُستدعى بعد إنشاء الطلب. آمنة للتكرار.
   */
  async buildSteps(
    sourceModule: ApprovalSourceModule,
    sourceId: string,
    unitKey: PortalUnitKey,
    departmentId: string,
    amount = 0,
  ): Promise<number> {
    const { data, error } = await supabase.rpc('build_approval_steps', {
      p_source_module: sourceModule,
      p_source_id: sourceId,
      p_unit_key: unitKey,
      p_department_id: departmentId,
      p_amount: amount,
    });
    if (error) throw new Error(translateError(error.message));
    return Number(data ?? 0);
  }

  /** سلسلة الاعتماد المتوقعة لطلب (قواعد المبلغ × الهيكل التنظيمي) */
  async resolveChain(
    unitKey: PortalUnitKey,
    departmentId: string,
    amount = 0,
  ): Promise<Array<{
    level: number;
    requiredRole: string;
    approverId: string | null;
    ruleName: string;
  }>> {
    const { data, error } = await supabase.rpc('resolve_approval_chain', {
      p_unit_key: unitKey,
      p_department_id: departmentId,
      p_amount: amount,
    });
    if (error) throw new Error(translateError(error.message));

    return (data ?? []).map((r: Record<string, unknown>) => ({
      level: Number(r.out_level ?? 0),
      requiredRole: String(r.out_required_role ?? ''),
      approverId: r.out_approver_id ? String(r.out_approver_id) : null,
      ruleName: String(r.out_rule_name ?? ''),
    }));
  }
}

export const unifiedApprovalService = new UnifiedApprovalService();
export default unifiedApprovalService;
