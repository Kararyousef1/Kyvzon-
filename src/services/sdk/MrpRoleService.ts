/**
 * MrpRoleService — أدوار التصنيع الدقيقة (0312/0314)
 *
 * ═════════════════════════════════════════════════════════════════════════
 * لماذا هذه الطبقة؟
 *
 *   جدول mrp_user_roles أُنشئ في 0218 ويقبل تسعة أدوار دقيقة، لكنه بقي
 *   **يتيماً**: صفر دالة تقرأه وصفر سياسة تذكره. و mrp_require_roles كان
 *   يقرأ profiles.role وحده، فكل الأدوار التسعة كانت أسماءً في 388
 *   استدعاءً لا تُنفَّذ أبداً — أبرزها production_manager في 99 موضعاً.
 *
 *   0312 أحيا الجدول · 0314 أكمل دورة الحياة (سحب · قراءة · كتالوج).
 *   هذه الطبقة تُعرّض ذلك للواجهة دون أن تلمس الصفحاتُ Supabase مباشرة.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * الأمان: هذه الطبقة للعرض. الحماية الحقيقية في:
 *   • can_manage_mrp_roles()  — امتياز مركزي واحد (SECURITY DEFINER)
 *   • RLS على mrp_user_roles
 *   • قيد CHECK يرفض أي دور خارج التسعة
 *
 * ★ الكتالوج يُقرأ من القاعدة لا من ثابت في TypeScript.
 *   السبب: mrp_role_catalog() تشتقّه من قيد CHECK نفسه، فيستحيل الانحراف.
 *   (الدرس المتكرر في هذا المشروع: TARGET_ROLES انحرف عبر أربع نسخ يدوية.)
 * ═════════════════════════════════════════════════════════════════════════
 */
import { supabase } from '../supabase/supabase';

/** مفاتيح أدوار التصنيع — للاستعمال في الأنواع فقط، لا كمصدر حقيقة */
export type MrpRoleKey =
  | 'mrp_planner'
  | 'production_manager'
  | 'production_supervisor'
  | 'shop_floor_operator'
  | 'bom_engineer'
  | 'quality_inspector'
  | 'maintenance_technician'
  | 'maintenance_manager'
  | 'cost_accountant';

export interface MrpRoleCatalogEntry {
  roleKey: string;
  labelAr: string;
  /**
   * إرشاد لا قيد: هل يُنصح بتنطيق هذا الدور بمصنع بعينه؟
   * الأدوار الميدانية (مشرف الإنتاج · مشغّل الأرضية · مفتّش الجودة …)
   * مرتبطة بموقع فيزيائي، بينما مخطّط الإنتاج ومحاسب التكاليف يعملان
   * على مستوى الشركة. القاعدة تقبل أي تركيبة — الشاشة تُرشد فقط.
   */
  plantScoped: boolean;
}

/** مصنع في قائمة اختيار النطاق (0315) */
export interface MrpPlantOption {
  plantId: string;
  plantCode: string;
  nameAr: string;
}

export interface MrpRoleAssignment {
  userId: string;
  fullName: string;
  baseRole: string;
  mrpRole: string;
  plantId: string | null;
  plantName: string | null;
  isActive: boolean;
}

const ERROR_MESSAGES: Record<string, string> = {
  NOT_AUTHORIZED_TO_ASSIGN_MRP_ROLE:
    'إدارة أدوار التصنيع تحتاج صلاحية إدارية، أو إسناد وحدة «التصنيع» لحسابك كمدير.',
  TARGET_USER_NOT_IN_TENANT: 'المستخدم لا ينتمي لهذه الشركة.',
  PLANT_NOT_IN_TENANT: 'المصنع المحدَّد لا ينتمي لهذه الشركة.',
  NO_AUTH: 'انتهت الجلسة — سجّل الدخول من جديد.',
  NO_TENANT: 'لا يوجد مستأجر مرتبط بحسابك.',
  // قيد CHECK على manufacturing_role
  mrp_user_roles_manufacturing_role_check: 'دور تصنيع غير معروف.',
};

function translateError(message: string): string {
  for (const [code, text] of Object.entries(ERROR_MESSAGES)) {
    if (message.includes(code)) return text;
  }
  return message;
}

class MrpRoleService {
  /**
   * كتالوج الأدوار التسعة — مُشتقّ من قيد CHECK في القاعدة.
   * لا نُثبّته في TypeScript كي لا ينحرف مصدرا حقيقة.
   */
  async findCatalog(): Promise<MrpRoleCatalogEntry[]> {
    const { data, error } = await supabase.rpc('mrp_role_catalog');
    if (error) throw new Error(translateError(error.message));

    return (data ?? []).map((r: Record<string, unknown>) => ({
      roleKey: String(r.out_role_key),
      labelAr: String(r.out_label_ar ?? r.out_role_key),
      plantScoped: r.out_plant_scoped === true,
    }));
  }

  /**
   * مصانع المستأجر النشطة — لاختيار نطاق الإسناد (0315).
   *
   * تُقرأ عبر RPC مخصّصة لا عبر جدول manufacturing_plants مباشرةً:
   * سياسة RLS عليه تشترط profiles.role ∈ (manufacturing, manager, …)
   * بينما can_manage_mrp_roles() تمنح الامتياز أيضاً لحامل وحدة mrp
   * ولو كان دوره 'employee'. فالقراءة المباشرة كانت تُظهر قائمة فارغة
   * لمستخدم يرى الشاشة — عدم اتساق أُصلح في 0315.
   */
  async findPlants(): Promise<MrpPlantOption[]> {
    const { data, error } = await supabase.rpc('mrp_plants_for_role_scope');
    if (error) throw new Error(translateError(error.message));

    return (data ?? []).map((r: Record<string, unknown>) => ({
      plantId: String(r.out_plant_id),
      plantCode: String(r.out_plant_code ?? ''),
      nameAr: String(r.out_name_ar ?? ''),
    }));
  }

  /** هل للمستخدم الحالي حق إدارة أدوار التصنيع؟ */
  async canManage(): Promise<boolean> {
    const { data, error } = await supabase.rpc('can_manage_mrp_roles');
    if (error) return false;
    return data === true;
  }

  /** أدوار التصنيع الخاصة بالمستخدم الحالي */
  async findMyRoles(): Promise<string[]> {
    const { data, error } = await supabase.rpc('current_user_mrp_roles');
    if (error) throw new Error(translateError(error.message));
    return Array.isArray(data) ? data.map(String) : [];
  }

  /**
   * كل الإسنادات في المستأجر — لشاشة الإدارة.
   * غير المخوَّل يحصل على مصفوفة فارغة (لا خطأ يكشف الوجود).
   */
  async findOverview(): Promise<MrpRoleAssignment[]> {
    const { data, error } = await supabase.rpc('mrp_role_assignments_overview');
    if (error) throw new Error(translateError(error.message));

    return (data ?? []).map((r: Record<string, unknown>) => ({
      userId: String(r.out_user_id),
      fullName: String(r.out_full_name ?? '—'),
      baseRole: String(r.out_base_role ?? ''),
      mrpRole: String(r.out_mrp_role),
      plantId: r.out_plant_id ? String(r.out_plant_id) : null,
      plantName: r.out_plant_name ? String(r.out_plant_name) : null,
      isActive: r.out_is_active === true,
    }));
  }

  /**
   * إسناد دور تصنيع.
   * plantId = null يعني نطاق الشركة كاملةً.
   * الإسناد المكرّر يُعيد تفعيل الصف نفسه ولا يُنشئ ثانياً.
   */
  async assign(
    userId: string,
    roleKey: string,
    plantId: string | null = null,
  ): Promise<string> {
    const { data, error } = await supabase.rpc('assign_mrp_role', {
      p_user_id: userId,
      p_role: roleKey,
      p_plant_id: plantId,
    });
    if (error) throw new Error(translateError(error.message));
    return String(data);
  }

  /**
   * سحب دور تصنيع — تعطيل لا حذف (سياسة archive/cancel/void).
   * يعيد عدد الصفوف المتأثرة؛ صفر يعني أن الدور لم يكن نشطاً.
   */
  async revoke(
    userId: string,
    roleKey: string,
    plantId: string | null = null,
  ): Promise<number> {
    const { data, error } = await supabase.rpc('revoke_mrp_role', {
      p_user_id: userId,
      p_role: roleKey,
      p_plant_id: plantId,
    });
    if (error) throw new Error(translateError(error.message));
    return Number(data ?? 0);
  }
}

export const mrpRoleService = new MrpRoleService();
export default mrpRoleService;
