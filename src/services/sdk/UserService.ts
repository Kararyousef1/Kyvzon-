/**
 * ════════════════════════════════════════════════════════════════
 *  UserService - خدمة إدارة المستخدمين (نسخة SDK جديدة)
 *  مسؤولة عن: CRUD للمستخدمين, Profile, Roles, Permissions
 *  لا تحتوي أي منطق للمصادقة
 * ════════════════════════════════════════════════════════════════
 */

import { BaseService, SdkError } from './BaseService';
import { supabase } from '../supabase/supabase';
import { logger } from '../utils/logger';

export interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  role: string;
  rank?: string;
  department?: string;
  position?: string;
  phone?: string;
  location?: string;
  profile_image?: string;
  employee_id?: string;
  manager_id?: string;
  supervisor_id?: string;
  status?: string;
  permissions?: string[];
  gatekeeper_type?: string;
  gatekeeper_pin?: string;
  salary?: number;
  salary_currency?: string;
  created_at?: string;
  updated_at?: string;
  tenant_id: string;
}

export interface UserUpdateInput {
  full_name?: string;
  email?: string;
  role?: string;
  rank?: string;
  department?: string;
  position?: string;
  phone?: string;
  location?: string;
  profile_image?: string;
  manager_id?: string;
  supervisor_id?: string;
  status?: string;
  permissions?: string[];
  gatekeeper_type?: string;
  gatekeeper_pin?: string;
  salary?: number;
  salary_currency?: string;
  cv_data?: Record<string, unknown>;
}

/** معلومات أرشيف السيرة الذاتية (0336) */
export interface CvArchiveInfo {
  hasArchive: boolean;
  archivedAt: string | null;
  skillCount: number;
}

/** سطر في سجل المؤهلات — من `hr_talent_profiles` (0333) */
export interface TalentProfileRecord {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  department: string;
  position: string;
  profile_image: string;
  /** هل للملف سيرة ذاتية فعلاً — يُحسب في القاعدة */
  hasCv: boolean;
  skillCount: number;
  /**
   * ★★★ 0354: أسماء المهارات فقط — لا `cv_data`.
   *   القائمة كانت تحمل السيرة الكاملة (ملخّص · توقّعات راتب) لكل صفّ
   *   وبلا حارس دور ⇒ أيّ موظف يقرأ سِيَر زملائه. التفاصيل الآن عبر
   *   `talentProfileDetail` بطلب صريح وحارس منفصل.
   */
  skills: string[];
  /** العدد الكلّي قبل الترقيم — يُحسب في القاعدة */
  totalCount: number;
}

class UserService extends BaseService<UserProfile> {
  constructor() {
    super('profiles');
  }

  /**
   * جلب جميع المستخدمين في الشركة الحالية
   */
  async findAllUsers(options?: {
    role?: string;
    status?: string;
    department?: string;
  }): Promise<UserProfile[]> {
    const filters: Record<string, unknown> = {};
    if (options?.role) filters.role = options.role;
    if (options?.status) filters.status = options.status;
    if (options?.department) filters.department = options.department;

    return this.findAll({
      filters: Object.keys(filters).length > 0 ? filters : undefined,
      orderBy: 'full_name',
      ascending: true,
    });
  }

  /**
   * جلب مستخدم واحد (بدون فلتر tenant_id لأن جدول profiles لا يحتوي على العمود)
   */
  async findUserById(id: string): Promise<UserProfile | null> {
    return this.findById(id, true);
  }

  /**
   * تحديث بيانات مستخدم
   */
  async updateUser(id: string, data: UserUpdateInput): Promise<UserProfile> {
    return this.update(id, data as unknown as Partial<UserProfile>);
  }

  /**
   * جلب قائمة المديرين والمشرفين
   */
  async findManagers(): Promise<UserProfile[]> {
    return this.findAll({
      filters: { rank: 'manager' },
      orderBy: 'full_name',
      ascending: true,
    });
  }

  /**
   * جلب قائمة الأدوار الفريدة
   */
  async findDistinctRoles(): Promise<string[]> {
    const users = await this.findAll();
    return [...new Set(users.map(u => u.role).filter((r): r is string => !!r))];
  }

  /**
   * جلب قائمة الأقسام الفريدة
   */
  async findDistinctDepartments(): Promise<string[]> {
    const users = await this.findAll();
    return [...new Set(users.map(u => u.department).filter((d): d is string => !!d))];
  }

  /**
   * عدد المستخدمين النشطين
   */
  async countActive(): Promise<number> {
    return this.count({ status: 'active' });
  }

  /**
   * عدد المستخدمين حسب الدور
   */
  async countByRole(role: string): Promise<number> {
    return this.count({ role });
  }

  /**
   * أرشفة السيرة الذاتية للمستخدم الحالي (migration 0336).
   *
   * ★ العطل: `handleDeleteCv` كانت تكتب `cv_data = {}` مباشرةً من زرّ
   *   سلّة مهملات **بلا أي تأكيد** — نقرة واحدة تمسح ساعات عمل بلا
   *   رجعة. قاعدة المشروع: archive لا delete.
   *
   * @returns `false` إن لا سيرة تُؤرشف (لا يُتلف أرشيفاً قائماً)
   */
  async archiveMyCv(): Promise<boolean> {
    const { data, error } = await supabase.rpc('archive_my_cv');
    if (error) {
      logger.error('archiveMyCv فشل: ' + error.message, {
        component: 'UserService', action: 'archiveMyCv',
      });
      return false;
    }
    return data === true;
  }

  /** استرجاع السيرة المؤرشفة — `false` إن لا أرشيف */
  async restoreMyCv(): Promise<boolean> {
    const { data, error } = await supabase.rpc('restore_my_cv');
    if (error) {
      logger.error('restoreMyCv فشل: ' + error.message, {
        component: 'UserService', action: 'restoreMyCv',
      });
      return false;
    }
    return data === true;
  }

  /** معلومات الأرشيف — لعرض زرّ الاسترجاع */
  async myCvArchiveInfo(): Promise<CvArchiveInfo> {
    const { data, error } = await supabase.rpc('my_cv_archive_info');
    if (error) {
      logger.error('myCvArchiveInfo فشل: ' + error.message, {
        component: 'UserService', action: 'myCvArchiveInfo',
      });
      return { hasArchive: false, archivedAt: null, skillCount: 0 };
    }
    type Raw = {
      out_has_archive: boolean;
      out_archived_at: string | null;
      out_skill_count: number;
    };
    const rows = (data ?? []) as Raw[];
    if (rows.length === 0) return { hasArchive: false, archivedAt: null, skillCount: 0 };
    return {
      hasArchive: Boolean(rows[0].out_has_archive),
      archivedAt: rows[0].out_archived_at,
      skillCount: Number(rows[0].out_skill_count ?? 0),
    };
  }

  /**
   * سجل المؤهلات: ملفات الشركة مع سيرها الذاتية (migration 0333).
   *
   * ★ `TalentMarketPage` كانت تستعلم عن `profiles` مباشرة بـ
   *   `.select('…, cv_data')` — مخالفةً لقاعدة «الصفحات لا تلمس
   *   Supabase مباشرة». والأسوأ أن العمود `cv_data` لم يكن موجوداً
   *   أصلاً فردّت القاعدة 400 بنصّ:
   *     [42703] column profiles.cv_data does not exist
   *   العمود أُضيف في 0333 والاستعلام صار عبر دالة تحترم RLS.
   */
  /**
   * قائمة المواهب — **بلا `cv_data`**.
   *
   * ★★★ إصلاح 0354: كانت الدالة تُرجع `cv_data` كاملاً لكل صفّ وبلا
   *   حارس دور ⇒ أيّ موظف يقرأ سِيَر زملائه (مُثبَت بدور
   *   `authenticated`: موظف عادي قرأ «توقّعات الراتب» للمدير التنفيذي).
   *   الآن: حارس `current_user_is_staff()` في القاعدة، وأسماء المهارات
   *   فقط. التفاصيل عبر `talentProfileDetail`.
   */
  async talentProfiles(opts?: {
    skill?: string | null;
    /** بحث نصّي بالاسم/المنصب — مستقلّ عن `skill` عمداً */
    text?: string | null;
    limit?: number;
    offset?: number;
  }): Promise<TalentProfileRecord[]> {
    const { data, error } = await supabase.rpc('hr_talent_profiles', {
      p_skill: opts?.skill ?? null,
      p_limit: opts?.limit ?? 200,
      p_offset: opts?.offset ?? 0,
      p_text: opts?.text ?? null,
    });
    if (error) {
      logger.error('talentProfiles فشل: ' + error.message, {
        component: 'UserService',
        action: 'talentProfiles',
      });
      return [];
    }
    type Raw = {
      out_id: string; out_full_name: string; out_email: string;
      out_phone: string; out_department: string; out_position: string;
      out_profile_image: string; out_has_cv: boolean;
      out_skill_count: number; out_skills: string[]; out_total_count: number;
    };
    return ((data ?? []) as Raw[]).map((r) => ({
      id: r.out_id,
      full_name: r.out_full_name,
      email: r.out_email,
      phone: r.out_phone,
      department: r.out_department,
      position: r.out_position,
      profile_image: r.out_profile_image,
      hasCv: Boolean(r.out_has_cv),
      skillCount: Number(r.out_skill_count ?? 0),
      skills: Array.isArray(r.out_skills) ? r.out_skills : [],
      totalCount: Number(r.out_total_count ?? 0),
    }));
  }

  /**
   * السيرة الكاملة لشخص واحد — بطلب صريح.
   * ★ الموظف يرى سيرته هو فقط؛ غيرها يحتاج صلاحية (تحرسها القاعدة).
   */
  async talentProfileDetail(profileId: string): Promise<{
    id: string; full_name: string; email: string; phone: string;
    department: string; position: string; cv_data: Record<string, unknown>;
  } | null> {
    const { data, error } = await supabase.rpc('hr_talent_profile_detail', {
      p_profile_id: profileId,
    });
    if (error) throw SdkError.fromSupabaseError(error);
    type Raw = {
      out_id: string; out_full_name: string; out_email: string;
      out_phone: string; out_department: string; out_position: string;
      out_cv_data: Record<string, unknown>;
    };
    const rows = (data ?? []) as Raw[];
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: r.out_id,
      full_name: r.out_full_name,
      email: r.out_email,
      phone: r.out_phone,
      department: r.out_department,
      position: r.out_position,
      cv_data: r.out_cv_data ?? {},
    };
  }

  /** إحصاءات المؤهلات — تُحسب في القاعدة لا بتحميل 500 سيرة. */
  async talentSkillStats(top = 5): Promise<
    { kind: string; label: string; count: number }[]
  > {
    const { data, error } = await supabase.rpc('hr_talent_skill_stats', {
      p_top: top,
    });
    if (error) {
      logger.error('talentSkillStats فشل: ' + error.message, {
        component: 'UserService', action: 'talentSkillStats',
      });
      return [];
    }
    type Raw = { out_kind: string; out_label: string; out_count: number };
    return ((data ?? []) as Raw[]).map((r) => ({
      kind: String(r.out_kind ?? ''),
      label: String(r.out_label ?? ''),
      count: Number(r.out_count ?? 0),
    }));
  }
}

export const userService = new UserService();