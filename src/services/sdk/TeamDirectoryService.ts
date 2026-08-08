/**
 * ════════════════════════════════════════════════════════════════
 *  TeamDirectoryService — دليل فريق العمل (migration 0357)
 *
 *  ★★★ الأعطال التي يُصلحها — كلها مُثبتة تشغيلياً على Postgres 17
 *      قبل كتابة سطر واحد (المسبار: tools/dev/_probe_0357.sql):
 *
 *  ① **عمود `mood_score` لا وجود له** ⇒ «صحة 0%» لكل موظف أبداً.
 *     الصفحة: `a + (b.mood_score ?? 0)` — والعمود الحقيقيّ `score`.
 *     PROBE_2B: صفّان بـ82 و68 ⇒ المتوسّط 75 والشاشة تعرض **0**.
 *     و`?? 0` هو ما يُخفي العطل: لولاه لظهر `NaN` وانكشف فوراً.
 *
 *  ② **الربط بالمفتاح الخطأ** ⇒ «0 مشاكل» لكل موظف أبداً.
 *     `i.reported_by === profile.id` و`profile.id` هو `employees.id`،
 *     بينما `incidents_reported_by_profiles_fkey → profiles(id)`.
 *     PROBE_3: match_by_employee_id = 0 · match_by_profile_id = 1
 *     PROBE_3B: `employees.id = profiles.id` ⇒ **false**
 *
 *  ③ **أربعة أعمدة فارغة**: PROBE_1B على الجدول كلّه ⇒
 *     `with_name_ar = 0` · `with_email = 0` · `with_phone = 0` ·
 *     `with_position = 0`. والبيانات في `profiles` و`auth.users`.
 *     ⇒ «بدون اسم» · الحرف الأول **U** للجميع · بحث بالبريد بلا معنى.
 *
 *  ④ **الدور من الجدول الخطأ**: `employees.role` غير مُدار (المحفّز
 *     لا يكتبه) — الحقيقيّ في `profiles.role`. مديرٌ يبقى «موظف» أبداً.
 *
 *  ⑤ **`on_leave` لا تُنتَج أبداً**: الصفحة تحسب `is_active ? … : …`
 *     فقط. PROBE_5: لا عمود `status` في `employees`.
 *     ★ المصدر الحقيقيّ: `leaves` بحالة `'موافق'` تغطّي اليوم.
 *
 *  ⑥ خمسة جداول كاملة إلى المتصفّح + `filter` داخل `map` ⇒ O(n×m).
 *  ⑦ سياسة `employees` بلا تمييز دور — الحماية يجب أن تكون في القاعدة.
 *  ⑧ البلاغ المؤرشف يُعدّ مفتوحاً.
 *
 *  ★ الصفحة لا تلمس Supabase — كل شيء عبر هذه الطبقة.
 * ════════════════════════════════════════════════════════════════
 */
import { supabase } from '../supabase/supabase';
import { logger } from '../utils/logger';
import { SdkError } from './BaseService';

/** الحالات الثلاث — مطابِقة لحارس `team_directory` في القاعدة */
export const TEAM_STATUSES = ['active', 'on_leave', 'inactive'] as const;
export type TeamStatus = (typeof TEAM_STATUSES)[number];

export const TEAM_STATUS_AR: Record<TeamStatus, string> = {
  active:   'نشط',
  on_leave: 'في إجازة',
  inactive: 'غير نشط',
};

export const TEAM_STATUS_TONE: Record<TeamStatus, string> = {
  active:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  on_leave: 'bg-amber-50 text-amber-700 border-amber-200',
  inactive: 'bg-slate-100 text-slate-500 border-slate-200',
};

/**
 * ★ الأدوار المعروفة — مطابِقة لما تُنتجه إدارة المستخدمين.
 *   أيّ دور خارجها يُعرض بنصّه الخام لا بـ«موظف» (كانت الصفحة
 *   تسلسل `? :` طويلاً ينتهي بـ«موظف» فيبتلع كل دور غير معروف).
 */
export const ROLE_AR: Record<string, string> = {
  admin:      'مدير نظام',
  hr:         'موارد بشرية',
  developer:  'مطوّر',
  it_admin:   'مسؤول تقني',
  manager:    'مدير قسم',
  supervisor: 'مشرف',
  gatekeeper: 'حارس أمن',
  driver:     'سائق',
  employee:   'موظف',
};

export const ROLE_TONE: Record<string, string> = {
  admin:      'bg-red-50 text-red-700 border-red-200',
  hr:         'bg-emerald-50 text-emerald-700 border-emerald-200',
  developer:  'bg-amber-50 text-amber-700 border-amber-200',
  it_admin:   'bg-amber-50 text-amber-700 border-amber-200',
  manager:    'bg-indigo-50 text-indigo-700 border-indigo-200',
  supervisor: 'bg-blue-50 text-blue-700 border-blue-200',
  gatekeeper: 'bg-violet-50 text-violet-700 border-violet-200',
  driver:     'bg-cyan-50 text-cyan-700 border-cyan-200',
  employee:   'bg-slate-100 text-slate-600 border-slate-200',
};

export const roleLabel = (r: string): string => ROLE_AR[r] ?? r;
export const roleTone  = (r: string): string =>
  ROLE_TONE[r] ?? 'bg-slate-100 text-slate-600 border-slate-200';

export interface TeamMember {
  id: string;
  userId: string | null;
  employeeCode: string;
  fullName: string;
  email: string;
  phone: string;
  position: string;
  departmentId: string | null;
  department: string;
  role: string;
  status: TeamStatus;
  /** ★ `null` تعني «لا سجلّ صحة» — لا «صحة صفر» (درس 0353) */
  wellness: number | null;
  wellnessCount: number;
  openIssues: number;
  certs: number;
  certsValid: number;
  hireDate: string | null;
}

export interface TeamSummary {
  total: number;
  active: number;
  onLeave: number;
  inactive: number;
  departments: number;
  /** ★ متوسّط متوسّطات الموظفين — لا متوسّط الصفوف. `null` بلا قياس */
  avgWellness: number | null;
  measured: number;
  openIssues: number;
  certs: number;
  expiring: number;
}

export interface TeamDepartment {
  id: string;
  name: string;
  members: number;
}

type Raw = Record<string, unknown>;

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
/** ★ يحفظ التمييز بين «صفر» و«غير مُقاس» */
const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string => (v == null ? '' : String(v));
const strOrNull = (v: unknown): string | null =>
  v == null || String(v) === '' ? null : String(v);

class TeamDirectoryService {
  /**
   * دليل الفريق — كل الترشيح والبحث في القاعدة.
   *
   * ★ العطل ⑥: النسخة السابقة جلبت خمسة جداول كاملة ثم رشّحت في
   *   المتصفّح بأربع حلقات `filter` **داخل** حلقة `map`.
   */
  async members(opts?: {
    search?: string | null;
    departmentId?: string | null;
    status?: TeamStatus | null;
    includeInactive?: boolean;
    limit?: number;
  }): Promise<TeamMember[]> {
    const { data, error } = await supabase.rpc('team_directory', {
      p_search:           opts?.search ?? null,
      p_department_id:    opts?.departmentId ?? null,
      p_status:           opts?.status ?? null,
      p_include_inactive: opts?.includeInactive ?? true,
      p_limit:            opts?.limit ?? 300,
    });
    if (error) {
      logger.error('team_directory فشل: ' + error.message, {
        component: 'TeamDirectoryService', action: 'members',
      });
      throw SdkError.fromSupabaseError(error);
    }
    return ((data ?? []) as Raw[]).map((r) => ({
      id:            str(r.out_id),
      userId:        strOrNull(r.out_user_id),
      employeeCode:  str(r.out_employee_code),
      fullName:      str(r.out_full_name),
      email:         str(r.out_email),
      phone:         str(r.out_phone),
      position:      str(r.out_position),
      departmentId:  strOrNull(r.out_department_id),
      department:    str(r.out_department),
      role:          str(r.out_role),
      status:        str(r.out_status) as TeamStatus,
      wellness:      numOrNull(r.out_wellness),
      wellnessCount: num(r.out_wellness_n),
      openIssues:    num(r.out_open_issues),
      certs:         num(r.out_certs),
      certsValid:    num(r.out_certs_valid),
      hireDate:      strOrNull(r.out_hire_date),
    }));
  }

  /** بطاقات الرأس — محسوبة في القاعدة */
  async summary(): Promise<TeamSummary> {
    const { data, error } = await supabase.rpc('team_summary');
    if (error) {
      logger.error('team_summary فشل: ' + error.message, {
        component: 'TeamDirectoryService', action: 'summary',
      });
      throw SdkError.fromSupabaseError(error);
    }
    const r = ((data ?? []) as Raw[])[0] ?? {};
    return {
      total:       num(r.out_total),
      active:      num(r.out_active),
      onLeave:     num(r.out_on_leave),
      inactive:    num(r.out_inactive),
      departments: num(r.out_departments),
      avgWellness: numOrNull(r.out_avg_wellness),
      measured:    num(r.out_measured),
      openIssues:  num(r.out_open_issues),
      certs:       num(r.out_certs),
      expiring:    num(r.out_expiring),
    };
  }

  /**
   * أقسام المستأجر بعدد أعضائها.
   *
   * ★ الصفحة كانت تشتقّ القائمة من أسماء الأقسام **الظاهرة** فقط،
   *   فقسمٌ بلا موظفين لا يظهر، والترشيح بالاسم النصّي لا بالمعرّف.
   */
  async departments(): Promise<TeamDepartment[]> {
    const { data, error } = await supabase.rpc('team_departments');
    if (error) {
      logger.error('team_departments فشل: ' + error.message, {
        component: 'TeamDirectoryService', action: 'departments',
      });
      throw SdkError.fromSupabaseError(error);
    }
    return ((data ?? []) as Raw[]).map((r) => ({
      id:      str(r.out_id),
      name:    str(r.out_name),
      members: num(r.out_members),
    }));
  }
}

export const teamDirectoryService = new TeamDirectoryService();
