/**
 * OrgStructureService — الهيكل التنظيمي الموحّد (0304/0306)
 *
 * ═════════════════════════════════════════════════════════════════════════
 * يحلّ محلّ الكتابة المباشرة في أعمدة departments الأربعة:
 *   manager_id · supervisor_id · direct_manager_id · procurement_manager_id
 *
 * assign_org_role يكتب في org_role_assignments (مصدر الحقيقة الجديد)
 * ويُزامن العمود القديم تلقائياً — فبوابتا HR والمشتريات تعملان بلا تغيير.
 * ═════════════════════════════════════════════════════════════════════════
 */
import { supabase } from '../supabase/supabase';

export type OrgRole = 'supervisor' | 'manager' | 'direct_manager' | 'unit_manager';

export const ORG_ROLE_LABELS: Record<OrgRole, string> = {
  supervisor: 'المشرف',
  manager: 'المدير',
  direct_manager: 'المدير المباشر',
  unit_manager: 'مدير وحدة',
};

/** ترتيب العرض — من الأدنى للأعلى في السلسلة */
export const ORG_ROLE_ORDER: OrgRole[] = [
  'supervisor',
  'manager',
  'direct_manager',
  'unit_manager',
];

export interface OrgStructureRow {
  departmentId: string;
  departmentName: string;
  parentId: string | null;
  orgRole: OrgRole | null;
  unitKey: string | null;
  userId: string | null;
  userName: string;
  employeeCount: number;
}

export interface OrgChainLink {
  orgRole: OrgRole;
  userId: string;
  sourceDepartmentId: string;
  inherited: boolean;
}

const ERROR_MESSAGES: Record<string, string> = {
  NOT_AUTHORIZED_TO_MANAGE_ORG: 'إدارة الهيكل التنظيمي تحتاج صلاحية إدارية.',
  UNIT_KEY_COHERENCE: 'مدير الوحدة يلزمه تحديد وحدة، والأدوار الهرمية لا تقبلها.',
  USER_NOT_IN_TENANT: 'المستخدم لا ينتمي لهذه الشركة.',
  DEPARTMENT_NOT_FOUND: 'القسم غير موجود.',
  INVALID_ORG_ROLE: 'دور تنظيمي غير صالح.',
  NO_AUTH: 'انتهت الجلسة — سجّل الدخول من جديد.',
  NO_TENANT: 'لا يوجد مستأجر مرتبط بحسابك.',
};

function translateError(message: string): string {
  for (const [code, text] of Object.entries(ERROR_MESSAGES)) {
    if (message.includes(code)) return text;
  }
  return message;
}

class OrgStructureService {
  /** الهيكل كاملاً: الأقسام وأدوارها وشاغلوها وعدد موظفيها */
  async findOverview(): Promise<OrgStructureRow[]> {
    const { data, error } = await supabase.rpc('org_structure_overview');
    if (error) throw new Error(translateError(error.message));

    return (data ?? []).map((r: Record<string, unknown>) => ({
      departmentId: String(r.out_department_id),
      departmentName: String(r.out_department_name ?? ''),
      parentId: r.out_parent_id ? String(r.out_parent_id) : null,
      orgRole: r.out_org_role ? (String(r.out_org_role) as OrgRole) : null,
      unitKey: r.out_unit_key ? String(r.out_unit_key) : null,
      userId: r.out_user_id ? String(r.out_user_id) : null,
      userName: String(r.out_user_name ?? '—'),
      employeeCount: Number(r.out_employee_count ?? 0),
    }));
  }

  /** سلسلة الاعتماد لقسم — مع بيان الموروث */
  async resolveChain(departmentId: string, unitKey?: string): Promise<OrgChainLink[]> {
    const { data, error } = await supabase.rpc('resolve_org_chain', {
      p_department_id: departmentId,
      p_unit_key: unitKey ?? null,
    });
    if (error) throw new Error(translateError(error.message));

    return (data ?? []).map((r: Record<string, unknown>) => ({
      orgRole: String(r.out_org_role) as OrgRole,
      userId: String(r.out_user_id),
      sourceDepartmentId: String(r.out_source_dept),
      inherited: r.out_inherited === true,
    }));
  }

  /**
   * إسناد أو نزع دور تنظيمي.
   * userId = null يعني النزع (تعطيل لا حذف).
   */
  async assignRole(
    departmentId: string,
    orgRole: OrgRole,
    userId: string | null,
    unitKey?: string | null,
  ): Promise<void> {
    const { error } = await supabase.rpc('assign_org_role', {
      p_department_id: departmentId,
      p_org_role: orgRole,
      p_user_id: userId,
      p_unit_key: unitKey ?? null,
    });
    if (error) throw new Error(translateError(error.message));
  }
}

export const orgStructureService = new OrgStructureService();
export default orgStructureService;
