/**
 * ════════════════════════════════════════════════════════════════
 *  RecruitmentPipelineService — التوظيف (migration 0362)
 *
 *  ★★★ الأعطال التي يُصلحها — كلها مُثبتة تشغيلياً على Postgres 17
 *      قبل كتابة سطر واحد (المسبار: tools/dev/_probe_0362.sql):
 *
 *  ① ★★★ **قائمة المتقدمين لا تعمل إطلاقاً — أربعة أعمدة معدومة.**
 *     الموجود فعلاً: posting_id · email · resume_url · submitted_at
 *     والمعدوم الذي تقرؤه الصفحة: job_id · applicant_email · cv_url
 *                                  · applied_at
 *     PROBE_2: column "job_id" does not exist
 *     PROBE_3: column "applied_at" does not exist
 *     ⇒ `findByJob` تفلتر بـ`job_id` وترتّب بـ`applied_at` — **عمودان
 *       معدومان في استعلامٍ واحد**. زرّ «المتقدمون» يرمي دائماً.
 *
 *  ② ★★★ **مفردتان لحالة الطلب لا تلتقيان.** DEFAULT في القاعدة
 *     `'submitted'` ومفردات الواجهة الثماني تبدأ بـ`'applied'`
 *     (PROBE_4: صفر قيد CHECK) ⇒ `<select>` بلا `<option>` مطابق.
 *  ③ `job_postings.status` بلا CHECK (PROBE_5: `'ThIsIsGaRbAgE'`).
 *  ④ `tenant_id` يقبل NULL (PROBE_6) ⑤ راتبٌ مقلوب (PROBE_7)
 *  ⑥ شواغر ≤ 0 (PROBE_8) ⑦ إغلاقٌ قبل النشر (PROBE_9)
 *  ⑧ `employment_type` نصٌّ حرّ (PROBE_10) — **وتعرضه الصفحة خاماً**
 *     (PROBE_11: `full_time` بالإنجليزية في البطاقة).
 *  ⑨ ★★★ متقدّمٌ في مستأجرك على إعلانٍ في مستأجرٍ آخر (PROBE_12).
 *  ⑩ ★★★ حذف الإعلان يُبيد كل متقدميه — `ON DELETE CASCADE`
 *     (PROBE_13: إعلانٌ بمتقدمَين ⇒ صفر).
 *  ⑪ لا فرادة (PROBE_14: البريد نفسه مرّتين) ⑫ بريدٌ حرّ (PROBE_15).
 *  ⑬ ★★★ **«تم التوظيف» لا يُنشئ موظفاً ولا يُغلق الإعلان** —
 *     PROBE_16: صفر دالة في المنظومة. الحلقة المفقودة بين التوظيف
 *     والتعريف (0359).
 *  ⑭ `applications_count` عمودٌ وهميّ والصفحة لا تعرض العدد إطلاقاً.
 *  ⑮ `created_by` لا يُكتب (PROBE_19) ولا FK على القسم (PROBE_20).
 *
 *  ★ الصفحة لا تلمس Supabase — كل شيء عبر هذه الطبقة.
 * ════════════════════════════════════════════════════════════════
 */
import { supabase } from '../supabase/supabase';
import { logger } from '../utils/logger';
import { SdkError } from './BaseService';

/** ★ حالات الإعلان الخمس — مطابِقة لـ`job_postings_status_chk` */
export const POSTING_STATUSES = [
  'draft', 'open', 'closed', 'filled', 'cancelled',
] as const;
export type PostingStatus = (typeof POSTING_STATUSES)[number];

/**
 * ★★★ حالات الطلب الثماني — مطابِقة لـ`job_applications_status_chk`.
 *   كان DEFAULT في القاعدة `'submitted'` وهي **ليست منها** (العطل ②).
 */
export const APPLICATION_STATUSES = [
  'applied', 'screening', 'interview', 'test', 'offer',
  'hired', 'rejected', 'withdrawn',
] as const;
export type ApplicationStage = (typeof APPLICATION_STATUSES)[number];

/** ★ أنواع التوظيف الأربعة — مطابِقة لـ`job_postings_employment_type_chk` */
export const EMPLOYMENT_TYPES = [
  'full_time', 'part_time', 'contract', 'temporary',
] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const POSTING_STATUS_AR: Record<PostingStatus, string> = {
  draft:     'مسودة',
  open:      'مفتوح',
  closed:    'مغلق',
  filled:    'تم شغله',
  cancelled: 'ملغى',
};

export const POSTING_STATUS_TONE: Record<PostingStatus, string> = {
  draft:     'bg-slate-100 text-slate-600 border-slate-200',
  open:      'bg-emerald-50 text-emerald-700 border-emerald-200',
  closed:    'bg-red-50 text-red-700 border-red-200',
  filled:    'bg-indigo-50 text-indigo-700 border-indigo-200',
  cancelled: 'bg-amber-50 text-amber-700 border-amber-200',
};

export const APPLICATION_STAGE_AR: Record<ApplicationStage, string> = {
  applied:   'تم التقديم',
  screening: 'فرز أولي',
  interview: 'مقابلة',
  test:      'اختبار',
  offer:     'عرض وظيفة',
  hired:     'تم التوظيف',
  rejected:  'مرفوض',
  withdrawn: 'منسحب',
};

export const APPLICATION_STAGE_TONE: Record<ApplicationStage, string> = {
  applied:   'bg-blue-50 text-blue-700 border-blue-200',
  screening: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  interview: 'bg-violet-50 text-violet-700 border-violet-200',
  test:      'bg-amber-50 text-amber-700 border-amber-200',
  offer:     'bg-teal-50 text-teal-700 border-teal-200',
  hired:     'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected:  'bg-red-50 text-red-700 border-red-200',
  withdrawn: 'bg-slate-100 text-slate-500 border-slate-200',
};

/**
 * ★★ العطل ⑧: الترجمة العربية — الصفحة كانت تعرض `full_time` خاماً
 *   في البطاقة بينما النموذج يعرض «دوام كامل».
 */
export const EMPLOYMENT_TYPE_AR: Record<EmploymentType, string> = {
  full_time: 'دوام كامل',
  part_time: 'دوام جزئي',
  contract:  'عقد',
  temporary: 'مؤقت',
};

/** ★ رتبة المرحلة — 1 = الأقرب للتوظيف. مطابِقة لترتيب القاعدة. */
export const STAGE_RANK: Record<ApplicationStage, number> = {
  hired: 1, offer: 2, test: 3, interview: 4,
  screening: 5, applied: 6, rejected: 7, withdrawn: 8,
};

/** ★★★ الحالة النهائية لا يُخرَج منها */
export const TERMINAL_STAGES: readonly ApplicationStage[] = ['hired'] as const;

export const postingStatusLabel = (s: string): string =>
  POSTING_STATUS_AR[s as PostingStatus] ?? s;
export const postingStatusTone = (s: string): string =>
  POSTING_STATUS_TONE[s as PostingStatus]
  ?? 'bg-slate-100 text-slate-600 border-slate-200';
export const stageLabel = (s: string): string =>
  APPLICATION_STAGE_AR[s as ApplicationStage] ?? s;
export const stageTone = (s: string): string =>
  APPLICATION_STAGE_TONE[s as ApplicationStage]
  ?? 'bg-slate-100 text-slate-600 border-slate-200';
export const employmentTypeLabel = (t: string): string =>
  EMPLOYMENT_TYPE_AR[t as EmploymentType] ?? t;

export interface PostingRow {
  id: string;
  title: string;
  position: string;
  department: string;
  employmentType: EmploymentType | string;
  status: PostingStatus | string;
  vacancies: number;
  salaryMin: number | null;
  salaryMax: number | null;
  description: string;
  requirements: string[];
  postedDate: string | null;
  closingDate: string | null;
  /** موجب = باقٍ · سالب = منقضٍ · `null` = بلا موعد إغلاق */
  daysLeft: number | null;
  isExpired: boolean;
  creatorName: string;
  /** ★ العطل ⑭: العدّادات التي لم تكن موجودة */
  appsTotal: number;
  appsNew: number;
  appsProgress: number;
  appsHired: number;
  createdAt: string | null;
}

export interface ApplicationRow {
  id: string;
  postingId: string;
  name: string;
  email: string;
  phone: string;
  resumeUrl: string;
  coverLetter: string | null;
  stage: ApplicationStage | string;
  rating: number | null;
  notes: string | null;
  rejectionReason: string | null;
  reviewerName: string;
  reviewedAt: string | null;
  hiredEmployeeId: string | null;
  submittedAt: string | null;
}

export interface RecruitmentSummary {
  open: number;
  draft: number;
  closed: number;
  vacancies: number;
  /** المفتوح الذي فات موعد إغلاقه — تناقضٌ يستحق الإبراز */
  expired: number;
  appsTotal: number;
  appsNew: number;
  appsHired: number;
  /** إعلانٌ مفتوحٌ بلا متقدّم واحد */
  noApps: number;
}

export interface PostingInput {
  id?: string | null;
  title: string;
  description: string;
  position?: string | null;
  departmentId?: string | null;
  employmentType: EmploymentType;
  salaryMin?: number | null;
  salaryMax?: number | null;
  vacancies: number;
  closingDate?: string | null;
  requirements?: string[] | null;
  status: PostingStatus;
}

export interface ApplicationInput {
  postingId: string;
  name: string;
  email: string;
  phone?: string | null;
  resumeUrl?: string | null;
  coverLetter?: string | null;
}

export interface HireResult {
  employeeId: string;
  postingStatus: PostingStatus | string;
  vacanciesLeft: number;
}

type Raw = Record<string, unknown>;

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
/** ★ يحفظ التمييز بين «صفر» و«غير مُقاس» (درس 0353) */
const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string => (v == null ? '' : String(v));
const strOrNull = (v: unknown): string | null =>
  v == null || String(v) === '' ? null : String(v);

class RecruitmentPipelineSdk {
  /** ملخّص التوظيف — محسوب في القاعدة (staff فقط) */
  async summary(): Promise<RecruitmentSummary> {
    const { data, error } = await supabase.rpc('recruitment_summary');
    if (error) {
      logger.error('recruitment_summary فشل: ' + error.message, {
        component: 'RecruitmentPipelineSdk', action: 'summary',
      });
      throw SdkError.fromSupabaseError(error);
    }
    const r = ((data ?? []) as Raw[])[0] ?? {};
    return {
      open:       num(r.out_open),
      draft:      num(r.out_draft),
      closed:     num(r.out_closed),
      vacancies:  num(r.out_vacancies),
      expired:    num(r.out_expired),
      appsTotal:  num(r.out_apps_total),
      appsNew:    num(r.out_apps_new),
      appsHired:  num(r.out_apps_hired),
      noApps:     num(r.out_no_apps),
    };
  }

  /**
   * لوح الإعلانات — مع عدّادات المتقدمين في استعلامٍ واحد.
   *
   * ★ العطل ⑭: الصفحة السابقة لم تعرض عدد المتقدمين إطلاقاً — لمعرفة
   *   إن كان لإعلانٍ متقدّمون كان يجب فتح النافذة التي ترمي (العطل ①).
   */
  async board(
    search?: string | null,
    status?: PostingStatus | null,
    limit = 200,
  ): Promise<PostingRow[]> {
    const { data, error } = await supabase.rpc('recruitment_board', {
      p_search: search ?? null,
      p_status: status ?? null,
      p_limit:  limit,
    });
    if (error) {
      logger.error('recruitment_board فشل: ' + error.message, {
        component: 'RecruitmentPipelineSdk', action: 'board',
      });
      throw SdkError.fromSupabaseError(error);
    }
    return ((data ?? []) as Raw[]).map((r) => ({
      id:             str(r.out_id),
      title:          str(r.out_title),
      position:       str(r.out_position),
      department:     str(r.out_department),
      employmentType: str(r.out_employment_type),
      status:         str(r.out_status),
      vacancies:      num(r.out_vacancies),
      salaryMin:      numOrNull(r.out_salary_min),
      salaryMax:      numOrNull(r.out_salary_max),
      description:    str(r.out_description),
      requirements:   Array.isArray(r.out_requirements)
        ? (r.out_requirements as unknown[]).map(str) : [],
      postedDate:     strOrNull(r.out_posted_date),
      closingDate:    strOrNull(r.out_closing_date),
      daysLeft:       numOrNull(r.out_days_left),
      isExpired:      Boolean(r.out_is_expired),
      creatorName:    str(r.out_creator_name),
      appsTotal:      num(r.out_apps_total),
      appsNew:        num(r.out_apps_new),
      appsProgress:   num(r.out_apps_progress),
      appsHired:      num(r.out_apps_hired),
      createdAt:      strOrNull(r.out_created_at),
    }));
  }

  /**
   * قائمة المتقدمين.
   *
   * ★★★ العطل ①: كانت `findByJob` تفلتر بـ`job_id` وترتّب بـ
   *   `applied_at` — **عمودان معدومان** ⇒ ترمي دائماً.
   * ★★ والترتيب هنا بالأجدر (`hired` ثم `offer` …) لا أبجدياً.
   */
  async applications(
    postingId: string | null,
    stage?: ApplicationStage | null,
  ): Promise<ApplicationRow[]> {
    const { data, error } = await supabase.rpc('recruitment_applications', {
      p_posting: postingId,
      p_status:  stage ?? null,
    });
    if (error) {
      logger.error('recruitment_applications فشل: ' + error.message, {
        component: 'RecruitmentPipelineSdk', action: 'applications',
      });
      throw SdkError.fromSupabaseError(error);
    }
    return ((data ?? []) as Raw[]).map((r) => ({
      id:              str(r.out_id),
      postingId:       str(r.out_posting_id),
      name:            str(r.out_name),
      email:           str(r.out_email),
      phone:           str(r.out_phone),
      resumeUrl:       str(r.out_resume_url),
      coverLetter:     strOrNull(r.out_cover_letter),
      stage:           str(r.out_status),
      rating:          numOrNull(r.out_rating),
      notes:           strOrNull(r.out_notes),
      rejectionReason: strOrNull(r.out_rejection_reason),
      reviewerName:    str(r.out_reviewer_name),
      reviewedAt:      strOrNull(r.out_reviewed_at),
      hiredEmployeeId: strOrNull(r.out_hired_employee_id),
      submittedAt:     strOrNull(r.out_submitted_at),
    }));
  }

  /**
   * إنشاء إعلانٍ أو تعديله.
   *
   * ★ الحرّاس في القاعدة: `RECRUITMENT_TITLE_REQUIRED` ·
   *   `_STATUS_INVALID` · `_TYPE_INVALID` · `_VACANCY_INVALID` ·
   *   `_SALARY_RANGE` · `_CLOSING_IN_PAST` · `_DEPARTMENT_NOT_FOUND`.
   * ★ والمنشئ وتاريخ النشر يُملآن في المحفّز (العطل ⑮).
   */
  async savePosting(input: PostingInput): Promise<string> {
    const { data, error } = await supabase.rpc('job_posting_upsert', {
      p_id:          input.id ?? null,
      p_title:       input.title,
      p_description: input.description,
      p_position:    input.position ?? null,
      p_department:  input.departmentId ?? null,
      p_type:        input.employmentType,
      p_salary_min:  input.salaryMin ?? null,
      p_salary_max:  input.salaryMax ?? null,
      p_vacancies:   input.vacancies,
      p_closing:     input.closingDate ?? null,
      p_requirements: input.requirements ?? null,
      p_status:      input.status,
    });
    if (error) throw SdkError.fromSupabaseError(error);
    return str(data);
  }

  /**
   * تسجيل متقدّم.
   *
   * ★ العطل ⑨: الإعلان من المستأجر نفسه — `RECRUITMENT_POSTING_NOT_FOUND`.
   * ★ العطل ⑪: التكرار مرفوض — `RECRUITMENT_DUPLICATE_APPLICATION`
   *   (والبريد يُطبَّع في المحفّز فلا التفافَ بحرفٍ كبير).
   */
  async submitApplication(input: ApplicationInput): Promise<string> {
    const { data, error } = await supabase.rpc('application_submit', {
      p_posting: input.postingId,
      p_name:    input.name,
      p_email:   input.email,
      p_phone:   input.phone ?? null,
      p_resume:  input.resumeUrl ?? null,
      p_cover:   input.coverLetter ?? null,
    });
    if (error) throw SdkError.fromSupabaseError(error);
    return str(data);
  }

  /**
   * نقل الطلب في المسار.
   *
   * ★★★ `hired` **لا يمرّ من هنا** — `RECRUITMENT_USE_HIRE_FUNCTION`.
   *   التوظيف له `hire()` التي تُنشئ الموظف فعلاً (العطل ⑬).
   * ★ والرفض يحتاج سبباً — `RECRUITMENT_REJECTION_REASON_REQUIRED`.
   */
  async setStage(
    applicationId: string,
    stage: Exclude<ApplicationStage, 'hired'>,
    reason?: string | null,
    rating?: number | null,
  ): Promise<string> {
    const { data, error } = await supabase.rpc('application_set_status', {
      p_id:     applicationId,
      p_status: stage,
      p_reason: reason ?? null,
      p_rating: rating ?? null,
    });
    if (error) throw SdkError.fromSupabaseError(error);
    return str(data);
  }

  /**
   * ★★★ التوظيف — الحلقة المفقودة.
   *
   *   يُنشئ صفّ `employees` بالبريد والهاتف والقسم، ويربطه بالطلب
   *   عبر `hired_employee_id`، ويُغلق الإعلان حين تمتلئ الشواغر —
   *   **كل ذلك في معاملةٍ واحدة**.
   *
   *   كان تغيير الحالة إلى `hired` لا يفعل شيئاً على الإطلاق
   *   (PROBE_16: صفر دالة في المنظومة).
   */
  async hire(
    applicationId: string,
    employeeCode?: string | null,
    departmentId?: string | null,
  ): Promise<HireResult> {
    const { data, error } = await supabase.rpc('application_hire', {
      p_id:         applicationId,
      p_code:       employeeCode ?? null,
      p_department: departmentId ?? null,
    });
    if (error) {
      logger.error('application_hire فشل: ' + error.message, {
        component: 'RecruitmentPipelineSdk', action: 'hire',
      });
      throw SdkError.fromSupabaseError(error);
    }
    const r = ((data ?? []) as Raw[])[0] ?? {};
    return {
      employeeId:    str(r.out_employee_id),
      postingStatus: str(r.out_posting_status),
      vacanciesLeft: num(r.out_left),
    };
  }
}

export const recruitmentSdk = new RecruitmentPipelineSdk();
export default recruitmentSdk;
