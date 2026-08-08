/**
 * EmployeePlacementService — تنسيب الموظف: القسم · الفرع · الوردية
 *
 * ═════════════════════════════════════════════════════════════════════════
 * الفجوة التي تسدّها (مُثبَتة على قاعدة حقيقية):
 *
 *   ① مسار **تعديل** الموظف في AdminEmployeesPage كان يحفظ:
 *        full_name · department (نصّاً) · position · phone · status
 *        + custom_permissions.allowed_pages
 *      ولا يذكر branch_id ولا shift_code إطلاقاً ⇒ أي تغيير عليهما
 *      يُهمَل صامتاً.
 *
 *   ② القراءة كانت `emp.branch_id` — وهو عمود لم يكن موجوداً على
 *      profiles أصلاً (القيمة كانت محبوسة في custom_permissions JSONB)
 *      ⇒ الحقل يظهر فارغاً في كل مرة.
 *
 *   ③ قائمة الورديات كانت أربع قيم مكتوبة يدوياً في JSX، بينما
 *      structure_shifts جدول حقيقي صار مُستأجَراً في 0318.
 *
 *   0318 أضاف الأعمدة · 0319 أضاف الدوال · وهذه الطبقة تُعرّضها للواجهة.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ★ دلالة مهمة: `undefined` تعني «لا تغيير» لا «امسح».
 *   set_employee_placement تستعمل COALESCE، فتمرير حقل واحد لا يمحو
 *   البقية. لمسح الوردية يُمرَّر `''` صراحةً.
 *   هذا بعينه ما يمنع تكرار العطل الأصلي: تحديثٌ لا يخصّ الفرع
 *   لا يجوز أن يمحوه.
 * ═════════════════════════════════════════════════════════════════════════
 */
import { supabase } from '../supabase/supabase';

export interface ShiftOption {
  code: string;
  nameAr: string;
  startTime: string;
  endTime: string;
  /** قالب عام تراه كل الشركات (tenant_id IS NULL) */
  isGlobal: boolean;
}

export interface EmployeePlacement {
  departmentId: string | null;
  departmentName: string | null;
  branchId: string | null;
  branchName: string | null;
  shiftCode: string | null;
}

export interface PlacementInput {
  /** undefined = لا تغيير */
  departmentId?: string | null;
  /** undefined = لا تغيير */
  branchId?: string | null;
  /** undefined = لا تغيير · '' = مسح */
  shiftCode?: string | null;
}

const ERROR_MESSAGES: Record<string, string> = {
  NOT_AUTHORIZED_TO_PLACE_EMPLOYEE:
    'تنسيب الموظفين يحتاج صلاحية إدارية (مدير نظام أو موارد بشرية).',
  TARGET_USER_NOT_IN_TENANT: 'المستخدم لا ينتمي لهذه الشركة.',
  DEPARTMENT_NOT_IN_TENANT: 'القسم المحدَّد لا ينتمي لهذه الشركة.',
  BRANCH_NOT_IN_TENANT: 'الفرع المحدَّد لا ينتمي لهذه الشركة.',
  SHIFT_NOT_FOUND: 'الوردية المحدَّدة غير معرَّفة.',
  NO_AUTH: 'انتهت الجلسة — سجّل الدخول من جديد.',
  NO_TENANT: 'لا يوجد مستأجر مرتبط بحسابك.',
};

function translateError(message: string): string {
  for (const [code, text] of Object.entries(ERROR_MESSAGES)) {
    if (message.includes(code)) return text;
  }
  return message;
}

class EmployeePlacementService {
  /**
   * كتالوج الورديات — ورديات الشركة + القوالب العامة.
   * يحلّ محلّ القائمة الثابتة (morning/evening/night/flexible).
   */
  async findShifts(): Promise<ShiftOption[]> {
    const { data, error } = await supabase.rpc('shift_catalog');
    if (error) throw new Error(translateError(error.message));

    return (data ?? []).map((r: Record<string, unknown>) => ({
      code: String(r.out_code),
      nameAr: String(r.out_name_ar ?? r.out_code),
      startTime: String(r.out_start_time ?? ''),
      endTime: String(r.out_end_time ?? ''),
      isGlobal: r.out_is_global === true,
    }));
  }

  /** تنسيب موظف بعينه — لملء نموذج التعديل */
  async findPlacement(userId: string): Promise<EmployeePlacement | null> {
    if (!userId) return null;
    const { data, error } = await supabase.rpc('employee_placement', {
      p_user_id: userId,
    });
    if (error) throw new Error(translateError(error.message));

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;

    return {
      departmentId: row.out_department_id ? String(row.out_department_id) : null,
      departmentName: row.out_department_name ? String(row.out_department_name) : null,
      branchId: row.out_branch_id ? String(row.out_branch_id) : null,
      branchName: row.out_branch_name ? String(row.out_branch_name) : null,
      shiftCode: row.out_shift_code ? String(row.out_shift_code) : null,
    };
  }

  /**
   * حفظ التنسيب.
   * ★ الحقول غير الممرَّرة تبقى كما هي — لا تُمحى.
   */
  async savePlacement(userId: string, input: PlacementInput): Promise<string> {
    const { data, error } = await supabase.rpc('set_employee_placement', {
      p_user_id: userId,
      p_department_id: input.departmentId ?? null,
      p_branch_id: input.branchId ?? null,
      // '' يصل كما هو ليمسح · undefined يصير null أي «لا تغيير»
      p_shift_code: input.shiftCode === undefined ? null : input.shiftCode,
    });
    if (error) throw new Error(translateError(error.message));
    return String(data);
  }
}

export const employeePlacementService = new EmployeePlacementService();
export default employeePlacementService;
