/**
 * ════════════════════════════════════════════════════════════════
 *  TrainingManagementService — إدارة الدورات والشهادات (migration 0352)
 *
 *  ★★★ الأعطال التي يُصلحها — كلها مُثبتة تشغيلياً على Postgres محلي:
 *
 *  ① **إنشاء أو تعديل أيّ دورة يفشل دائماً.** الصفحة ترسل حقلين
 *     لا وجود لهما في `courses`:
 *       active: …            ⇒ ERROR: column "active" does not exist
 *       rich_content: …      ⇒ ERROR: column "rich_content" does not exist
 *     ⇒ زرّا «إضافة دورة» و«حفظ التغييرات» معطّلان تماماً.
 *
 *  ② أعمدة الشهادات كلها خاطئة: الصفحة تقرأ `title`/`issuer` والجدول
 *     فيه `certification_name`/`issued_by` ⇒ عمود «الشهادة» فارغ أبداً.
 *
 *  ③ `approved: true` قيمة مكتوبة يدوياً ⇒ بطاقة «معتمدة» تساوي عدد
 *     الشهادات كلها. ولا عمود اعتماد في الجدول أصلاً.
 *
 *  ④ `expiry_date` موجود ولا يُقرأ في أي موضع ⇒ شهادة سلامة منتهية
 *     تظهر سارية. خطرٌ تنظيميّ لا مجرّد عيب عرض.
 *
 *  ⑤ `employees.full_name_ar` و`employees.email` كلاهما NULL (مُقاس)
 *     ⇒ اسم الموظف وبريده فارغان في جدول الشهادات.
 *
 *  ⑥ الترتيب بـ`full_name_ar` وهو NULL للجميع ⇒ بلا معنى.
 *  ⑦ البحث بـ`toLowerCase()` لا أثر له على العربية.
 * ════════════════════════════════════════════════════════════════
 */
import { supabase } from '../supabase/supabase';
import { logger } from '../utils/logger';
import { SdkError } from './BaseService';

export type CourseStatus = 'active' | 'inactive' | 'archived';
export type CourseLevelAr = 'مبتدئ' | 'متوسط' | 'متقدم' | 'خبير';
export type CertValidity = 'سارية' | 'تنتهي قريباً' | 'منتهية' | 'بلا انتهاء';

export interface CourseUpsertInput {
  id?: string | null;
  title: string;
  titleEn?: string;
  description?: string;
  descriptionEn?: string;
  category?: string;
  level?: CourseLevelAr;
  duration?: string;
  points?: number;
  mandatory?: boolean;
  instructor?: string;
  tags?: string[];
  objectives?: string[];
  status?: CourseStatus;
  /** ★ 0353: محتوى الوسائط. `undefined` تعني «لا تُغيّر» لا «امسح». */
  richContent?: { blocks: unknown[]; [k: string]: unknown };
}

export interface CourseUpsertResult {
  id: string;
  title: string;
  status: string;
  created: boolean;
}

export interface CertificationRow {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  certificationName: string;
  issuedBy: string;
  issueDate: string | null;
  expiryDate: string | null;
  daysToExpiry: number | null;
  validity: CertValidity;
  certificationUrl: string | null;
}

export interface CertUpsertInput {
  id?: string | null;
  employeeId?: string;
  name: string;
  issuedBy?: string;
  issueDate?: string | null;
  expiryDate?: string | null;
  url?: string;
  notes?: string;
}

export interface TrainingMgmtSummary {
  totalCourses: number;
  activeCourses: number;
  archivedCourses: number;
  mandatory: number;
  totalCerts: number;
  validCerts: number;
  expiringCerts: number;
  expiredCerts: number;
}

export const EMPTY_SUMMARY: TrainingMgmtSummary = {
  totalCourses: 0, activeCourses: 0, archivedCourses: 0, mandatory: 0,
  totalCerts: 0, validCerts: 0, expiringCerts: 0, expiredCerts: 0,
};

const num = (v: unknown): number => Number(v ?? 0);
const nullableNum = (v: unknown): number | null =>
  v === null || v === undefined ? null : Number(v);

class TrainingManagementService {
  /**
   * إنشاء/تعديل دورة — بأعمدة موجودة فقط.
   *
   * ★ العطل ①: الشيفرة القديمة كانت ترسل `active` و`rich_content`
   *   وكلاهما معدوم ⇒ كل إنشاء وكل تعديل يفشل.
   */
  async upsertCourse(input: CourseUpsertInput): Promise<CourseUpsertResult> {
    const { data, error } = await supabase.rpc('training_course_upsert', {
      p_id:             input.id ?? null,
      p_title:          input.title,
      p_title_en:       input.titleEn ?? null,
      p_description:    input.description ?? null,
      p_description_en: input.descriptionEn ?? null,
      p_category:       input.category ?? null,
      p_level:          input.level ?? null,
      p_duration:       input.duration ?? null,
      p_points:         input.points ?? 0,
      p_mandatory:      input.mandatory ?? false,
      p_instructor:     input.instructor ?? null,
      p_tags:           input.tags ?? [],
      p_objectives:     input.objectives ?? [],
      p_status:         input.status ?? 'active',
      p_rich_content:   input.richContent ?? null,
    });
    if (error) throw SdkError.fromSupabaseError(error);
    type Raw = Record<string, unknown>;
    const rows = (data ?? []) as Raw[];
    if (rows.length === 0) throw SdkError.notFound('تعذّر حفظ الدورة');
    const r = rows[0];
    return {
      id:      String(r.out_id ?? ''),
      title:   String(r.out_title ?? ''),
      status:  String(r.out_status ?? ''),
      created: Boolean(r.out_created),
    };
  }

  /** الشهادات — بأسمائها الحقيقية وحالة صلاحية محسوبة. */
  async certifications(search?: string): Promise<CertificationRow[]> {
    const { data, error } = await supabase.rpc('training_certifications', {
      p_search: search && search.trim() ? search.trim() : null,
    });
    if (error) {
      logger.error('training_certifications فشل: ' + error.message, {
        component: 'TrainingManagementService', action: 'certifications',
      });
      return [];
    }
    type Raw = Record<string, unknown>;
    return ((data ?? []) as Raw[]).map((r) => ({
      id:                String(r.out_id ?? ''),
      employeeId:        String(r.out_employee_id ?? ''),
      employeeName:      String(r.out_employee_name ?? 'موظف غير معروف'),
      department:        String(r.out_department ?? '—'),
      certificationName: String(r.out_certification_name ?? '—'),
      issuedBy:          String(r.out_issued_by ?? '—'),
      issueDate:         r.out_issue_date ? String(r.out_issue_date) : null,
      expiryDate:        r.out_expiry_date ? String(r.out_expiry_date) : null,
      daysToExpiry:      nullableNum(r.out_days_to_expiry),
      validity:          String(r.out_validity ?? 'بلا انتهاء') as CertValidity,
      certificationUrl:  r.out_certification_url ? String(r.out_certification_url) : null,
    }));
  }

  /** إضافة/تعديل شهادة — بحراسة النطاق وانتماء الموظف. */
  async upsertCertification(input: CertUpsertInput):
      Promise<{ id: string; name: string; created: boolean }> {
    const { data, error } = await supabase.rpc('training_certification_upsert', {
      p_id:          input.id ?? null,
      p_employee_id: input.employeeId ?? null,
      p_name:        input.name,
      p_issued_by:   input.issuedBy ?? null,
      p_issue_date:  input.issueDate ?? null,
      p_expiry_date: input.expiryDate ?? null,
      p_url:         input.url ?? null,
      p_notes:       input.notes ?? null,
    });
    if (error) throw SdkError.fromSupabaseError(error);
    type Raw = Record<string, unknown>;
    const rows = (data ?? []) as Raw[];
    if (rows.length === 0) throw SdkError.notFound('تعذّر حفظ الشهادة');
    const r = rows[0];
    return {
      id:      String(r.out_id ?? ''),
      name:    String(r.out_name ?? ''),
      created: Boolean(r.out_created),
    };
  }

  /** مؤشّرات محسوبة — لا ثوابت. */
  async summary(): Promise<TrainingMgmtSummary> {
    const { data, error } = await supabase.rpc('training_management_summary');
    if (error) {
      logger.error('training_management_summary فشل: ' + error.message, {
        component: 'TrainingManagementService', action: 'summary',
      });
      return EMPTY_SUMMARY;
    }
    type Raw = Record<string, unknown>;
    const rows = (data ?? []) as Raw[];
    if (rows.length === 0) return EMPTY_SUMMARY;
    const r = rows[0];
    return {
      totalCourses:    num(r.out_total_courses),
      activeCourses:   num(r.out_active_courses),
      archivedCourses: num(r.out_archived_courses),
      mandatory:       num(r.out_mandatory),
      totalCerts:      num(r.out_total_certs),
      validCerts:      num(r.out_valid_certs),
      expiringCerts:   num(r.out_expiring_certs),
      expiredCerts:    num(r.out_expired_certs),
    };
  }
}

export const trainingManagementService = new TrainingManagementService();
