/**
 * ════════════════════════════════════════════════════════════════
 *  PerformanceReviewService — تقييم الأداء (migration 0356)
 *
 *  ★★★ الأعطال التي يُصلحها — كلها مُثبتة تشغيلياً على Postgres 17
 *      قبل كتابة سطر واحد (المسبار: tools/dev/_probe_0356.sql):
 *
 *  ① **إنشاء أيّ تقييم يفشل دائماً.** الصفحة ترسل ستّة أعمدة معدومة:
 *       overall_score · strengths · improvements
 *       completed_at  · updated_at · goals_summary
 *     PROBE_1B:
 *       ERROR: column "overall_score" of relation
 *              "performance_reviews" does not exist
 *
 *  ② **وأيُّ تعديل يفشل أيضاً — حتى بلا أعمدة وهمية.**
 *     محفّز `update_performance_reviews_updated_at` (من 0003) يكتب
 *     `NEW.updated_at` والعمود غير موجود.
 *     PROBE_2A — تعديل `comments` وهو عمود **موجود**:
 *       ERROR: record "new" has no field "updated_at"
 *     ⇒ الجدول للكتابة مرّة واحدة فقط. عطلٌ نائمٌ منذ بداية المشروع.
 *
 *  ③ **سُلَّمان متناقضان.** القاعدة `rating INTEGER CHECK (1..5)`
 *     والصفحة `overall_score` من 0 إلى 100.
 *     PROBE_2B: الصفّ يحمل `rating = 4` والصفحة تعرض «undefined%»
 *     وتحسب اللون من `undefined >= 85` = false ⇒ **أحمر دائماً**.
 *     موظفٌ بأعلى تقدير يظهر أحمر.
 *
 *  ④ `status` نصٌّ حرّ بلا CHECK — PROBE_3: «حالة مخترعة تماماً» نجحت
 *     ⇒ `REVIEW_STATUS_LABELS[status]` = undefined ⇒ شارة فارغة.
 *
 *  ⑤ `performance_cycles` بلا أيّ قيد — PROBE_4: دورة نهايتها
 *     2026-01-01 وبدايتها 2026-06-01 بفترة «كل ثانية» نجحت.
 *
 *  ⑥ لا فرادة — PROBE_5: تقييمان لنفس الموظف في نفس الدورة (3 و 5).
 *  ⑦ الموظف يُقيّم نفسه — PROBE_6: نجح بدرجة 5/5.
 *  ⑧ `cycle_id` بلا FK — PROBE_7: تقييم في دورة غير موجودة نجح.
 *  ⑨ الحذف النهائي متاح لأي staff بلا حارس.
 *  ⑩ ثلاثة استعلامات بلا حدّ + ربط بـMap في المتصفّح.
 *
 *  ★ الصفحة لا تلمس Supabase — كل شيء عبر هذه الطبقة.
 * ════════════════════════════════════════════════════════════════
 */
import { supabase } from '../supabase/supabase';
import { logger } from '../utils/logger';
import { SdkError } from './BaseService';

/**
 * ★ مفردات حالة التقييم الخمس — مطابِقة نصّاً لـ
 *   `performance_reviews_status_chk` كما فُرض في 0356.
 *   قبلها كان العمود نصّاً حرّاً يقبل أيّ شيء.
 */
export const REVIEW_STATUSES = [
  'draft', 'submitted', 'under_review', 'completed', 'cancelled',
] as const;
export type ReviewDbStatus = (typeof REVIEW_STATUSES)[number];

/** مفردات حالة الدورة الأربع — `performance_cycles_status_chk` */
export const CYCLE_STATUSES = [
  'draft', 'active', 'closed', 'cancelled',
] as const;
export type CycleDbStatus = (typeof CYCLE_STATUSES)[number];

/** فترات التقييم — `performance_cycles_period_chk` */
export const CYCLE_PERIODS = [
  'monthly', 'quarterly', 'semi_annual', 'annual',
] as const;
export type CyclePeriod = (typeof CYCLE_PERIODS)[number];

export const REVIEW_STATUS_AR: Record<ReviewDbStatus, string> = {
  draft:        'مسودة',
  submitted:    'مُرسَلة',
  under_review: 'قيد المراجعة',
  completed:    'مكتملة',
  cancelled:    'ملغاة',
};

export const REVIEW_STATUS_TONE: Record<ReviewDbStatus, string> = {
  draft:        'bg-slate-50 text-slate-600 border-slate-200',
  submitted:    'bg-amber-50 text-amber-700 border-amber-200',
  under_review: 'bg-blue-50 text-blue-700 border-blue-200',
  completed:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled:    'bg-red-50 text-red-600 border-red-200',
};

export const CYCLE_STATUS_AR: Record<CycleDbStatus, string> = {
  draft:     'مسودة',
  active:    'نشطة',
  closed:    'مغلقة',
  cancelled: 'ملغاة',
};

export const CYCLE_STATUS_TONE: Record<CycleDbStatus, string> = {
  draft:     'bg-slate-50 text-slate-600 border-slate-200',
  active:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  closed:    'bg-blue-50 text-blue-700 border-blue-200',
  cancelled: 'bg-red-50 text-red-600 border-red-200',
};

export const CYCLE_PERIOD_AR: Record<CyclePeriod, string> = {
  monthly:     'شهريّة',
  quarterly:   'ربعيّة',
  semi_annual: 'نصف سنويّة',
  annual:      'سنويّة',
};

/**
 * ★★ الانتقالات المسموحة — **نسخة من جدول القاعدة** في
 *    `performance_review_set_status`. الواجهة تعرض ما تسمح به
 *    القاعدة، والقاعدة هي الحارس.
 */
export const REVIEW_TRANSITIONS: Record<ReviewDbStatus, ReviewDbStatus[]> = {
  draft:        ['submitted', 'cancelled'],
  submitted:    ['under_review', 'completed', 'cancelled'],
  under_review: ['completed', 'cancelled'],
  completed:    [],
  cancelled:    [],
};

export const CYCLE_TRANSITIONS: Record<CycleDbStatus, CycleDbStatus[]> = {
  draft:     ['active', 'cancelled'],
  active:    ['closed', 'cancelled'],
  closed:    [],
  cancelled: [],
};

export interface PerformanceSummary {
  cycles: number;
  active: number;
  reviews: number;
  draft: number;
  submitted: number;
  completed: number;
  cancelled: number;
  /** ★ `null` تعني «لم يُقيَّم أحد» — لا صفر (درس 0353) */
  avgScore: number | null;
  topScore: number | null;
  lowScore: number | null;
  /** نسبة الموظفين النشطين الذين لهم تقييم — `null` بلا موظفين */
  coverage: number | null;
}

export interface CycleRow {
  id: string;
  name: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  period: CyclePeriod | string;
  status: CycleDbStatus;
  reviews: number;
  completed: number;
  avgScore: number | null;
  archived: boolean;
  createdAt: string | null;
}

export interface ReviewRow {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  department: string;
  reviewerId: string | null;
  reviewerName: string;
  cycleId: string | null;
  cycleName: string;
  /** الدرجة 0..100 — المرجع */
  score: number | null;
  /** 1..5 مشتقّ آلياً في القاعدة من `score` */
  rating: number | null;
  status: ReviewDbStatus;
  strengths: string | null;
  improvements: string | null;
  comments: string | null;
  submittedAt: string | null;
  completedAt: string | null;
  archived: boolean;
  createdAt: string | null;
}

export interface CycleCreateInput {
  name: string;
  description?: string | null;
  startDate: string;
  endDate: string;
  period: CyclePeriod;
}

export interface ReviewCreateInput {
  employeeId: string;
  cycleId?: string | null;
  reviewerId?: string | null;
  /** 0..100 — القاعدة تحرسه وتشتقّ منه rating */
  score: number;
  strengths?: string | null;
  improvements?: string | null;
  comments?: string | null;
}

type Raw = Record<string, unknown>;

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
/** ★ يحفظ التمييز بين «صفر» و«غير مُقاس» — لا يُحوّل NULL إلى 0 */
const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string => (v == null ? '' : String(v));
const strOrNull = (v: unknown): string | null =>
  v == null || String(v) === '' ? null : String(v);

class PerformanceReviewSdk {
  /**
   * الملخّص — محسوب في القاعدة.
   *
   * ★ `avgScore = null` تعني «لا تقييم محتسَب»، لا «متوسّط صفر».
   *   الملغاة والمؤرشفة خارج الحساب: درجةٌ أُلغيت ليست أداءً.
   */
  async summary(cycleId?: string | null): Promise<PerformanceSummary> {
    const { data, error } = await supabase.rpc('performance_summary', {
      p_cycle_id: cycleId ?? null,
    });
    if (error) {
      logger.error('performance_summary فشل: ' + error.message, {
        component: 'PerformanceReviewSdk', action: 'summary',
      });
      throw SdkError.fromSupabaseError(error);
    }
    const r = ((data ?? []) as Raw[])[0] ?? {};
    return {
      cycles:    num(r.out_cycles),
      active:    num(r.out_active),
      reviews:   num(r.out_reviews),
      draft:     num(r.out_draft),
      submitted: num(r.out_submitted),
      completed: num(r.out_completed),
      cancelled: num(r.out_cancelled),
      avgScore:  numOrNull(r.out_avg_score),
      topScore:  numOrNull(r.out_top_score),
      lowScore:  numOrNull(r.out_low_score),
      coverage:  numOrNull(r.out_coverage),
    };
  }

  /** دورات التقييم مع عدّ تقييماتها ومتوسّطها */
  async cycles(includeArchived = false, limit = 100): Promise<CycleRow[]> {
    const { data, error } = await supabase.rpc('performance_cycles_board', {
      p_include_archived: includeArchived,
      p_limit: limit,
    });
    if (error) {
      logger.error('performance_cycles_board فشل: ' + error.message, {
        component: 'PerformanceReviewSdk', action: 'cycles',
      });
      throw SdkError.fromSupabaseError(error);
    }
    return ((data ?? []) as Raw[]).map((r) => ({
      id:          str(r.out_id),
      name:        str(r.out_name),
      description: strOrNull(r.out_description),
      startDate:   strOrNull(r.out_start_date),
      endDate:     strOrNull(r.out_end_date),
      period:      str(r.out_review_period),
      status:      str(r.out_status) as CycleDbStatus,
      reviews:     num(r.out_reviews),
      completed:   num(r.out_completed),
      avgScore:    numOrNull(r.out_avg_score),
      archived:    Boolean(r.out_archived),
      createdAt:   strOrNull(r.out_created_at),
    }));
  }

  /**
   * التقييمات — الاسم والقسم والمقيّم والدورة في استعلام واحد.
   *
   * ★ العطل ⑩: النسخة السابقة نفّذت ثلاثة استعلامات بلا حدّ
   *   (الدورات + التقييمات + **كل الموظفين**) وبنت خريطتين في
   *   المتصفّح لتربطها.
   */
  async reviews(opts?: {
    cycleId?: string | null;
    status?: ReviewDbStatus | null;
    search?: string | null;
    includeArchived?: boolean;
    limit?: number;
  }): Promise<ReviewRow[]> {
    const { data, error } = await supabase.rpc('performance_reviews_board', {
      p_cycle_id:         opts?.cycleId ?? null,
      p_status:           opts?.status ?? null,
      p_search:           opts?.search ?? null,
      p_include_archived: opts?.includeArchived ?? false,
      p_limit:            opts?.limit ?? 200,
    });
    if (error) {
      logger.error('performance_reviews_board فشل: ' + error.message, {
        component: 'PerformanceReviewSdk', action: 'reviews',
      });
      throw SdkError.fromSupabaseError(error);
    }
    return ((data ?? []) as Raw[]).map((r) => ({
      id:           str(r.out_id),
      employeeId:   str(r.out_employee_id),
      employeeName: str(r.out_employee_name),
      employeeCode: str(r.out_employee_code),
      department:   str(r.out_department),
      reviewerId:   strOrNull(r.out_reviewer_id),
      reviewerName: str(r.out_reviewer_name),
      cycleId:      strOrNull(r.out_cycle_id),
      cycleName:    str(r.out_cycle_name),
      score:        numOrNull(r.out_score),
      rating:       numOrNull(r.out_rating),
      status:       str(r.out_status) as ReviewDbStatus,
      strengths:    strOrNull(r.out_strengths),
      improvements: strOrNull(r.out_improvements),
      comments:     strOrNull(r.out_comments),
      submittedAt:  strOrNull(r.out_submitted_at),
      completedAt:  strOrNull(r.out_completed_at),
      archived:     Boolean(r.out_archived),
      createdAt:    strOrNull(r.out_created_at),
    }));
  }

  /**
   * إنشاء دورة.
   *
   * ★ القاعدة تحرس: الاسم · التاريخين · **النهاية بعد البداية** ·
   *   الفترة من المفردات الأربع. كلّها كانت تمرّ بلا فحص.
   */
  async createCycle(input: CycleCreateInput): Promise<string> {
    const { data, error } = await supabase.rpc('performance_cycle_create', {
      p_name:        input.name,
      p_description: input.description ?? null,
      p_start_date:  input.startDate,
      p_end_date:    input.endDate,
      p_period:      input.period,
    });
    if (error) throw SdkError.fromSupabaseError(error);
    return String(data ?? '');
  }

  /**
   * انتقال حالة الدورة.
   *
   * ★ إغلاق الدورة يُلغي تقييماتها المعلَّقة في القاعدة — فلا تبقى
   *   مسوّدة معلَّقة إلى الأبد.
   */
  async setCycleStatus(cycleId: string, status: CycleDbStatus): Promise<CycleDbStatus> {
    const { data, error } = await supabase.rpc('performance_cycle_set_status', {
      p_cycle_id: cycleId,
      p_status:   status,
    });
    if (error) throw SdkError.fromSupabaseError(error);
    return String(data ?? status) as CycleDbStatus;
  }

  /**
   * إنشاء تقييم.
   *
   * ★★★ العطل ①: النسخة السابقة كانت ترسل `overall_score` وأخواته
   *   وهي أعمدة معدومة، فيرمي Postgres والزرّ معطَّل تماماً.
   * ★ القاعدة تحرس: الدرجة 0..100 · الفرادة · الدورة المفتوحة ·
   *   المستأجر · التقييم الذاتيّ.
   */
  async createReview(input: ReviewCreateInput): Promise<string> {
    const { data, error } = await supabase.rpc('performance_review_create', {
      p_employee_id:  input.employeeId,
      p_cycle_id:     input.cycleId ?? null,
      p_reviewer_id:  input.reviewerId ?? null,
      p_score:        input.score,
      p_strengths:    input.strengths ?? null,
      p_improvements: input.improvements ?? null,
      p_comments:     input.comments ?? null,
    });
    if (error) throw SdkError.fromSupabaseError(error);
    return String(data ?? '');
  }

  /**
   * انتقال حالة التقييم.
   *
   * ★★★ العطل ②: `updateReviewStatus` السابقة كانت تكتب
   *   `completed_at` وهو عمود معدوم — ومحفّز `updated_at` كان
   *   يُسقط أيّ `UPDATE` أصلاً قبل أن تصل الكتابة.
   */
  async setReviewStatus(
    reviewId: string,
    status: ReviewDbStatus,
  ): Promise<ReviewDbStatus> {
    const { data, error } = await supabase.rpc('performance_review_set_status', {
      p_review_id: reviewId,
      p_status:    status,
    });
    if (error) throw SdkError.fromSupabaseError(error);
    return String(data ?? status) as ReviewDbStatus;
  }

  /** أرشفة بدل حذف — السبب إلزاميّ في القاعدة */
  async archiveReview(reviewId: string, reason: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('performance_review_archive', {
      p_review_id: reviewId,
      p_reason:    reason,
    });
    if (error) throw SdkError.fromSupabaseError(error);
    return Boolean(data);
  }
}

export const performanceReviewSdk = new PerformanceReviewSdk();
