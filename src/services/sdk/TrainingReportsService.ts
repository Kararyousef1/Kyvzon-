/**
 * ════════════════════════════════════════════════════════════════
 *  TrainingReportsService — تقارير التدريب (migration 0351)
 *
 *  ★★★ الأعطال التي يُصلحها — كلها مُثبتة تشغيلياً على Postgres محلي:
 *
 *  ① **خمسة أعمدة وهمية.** الصفحة تقرأ حقولاً لا وجود لها في المخطط:
 *       progress_percent · score · time_spent · last_access_at
 *       · courses.active
 *     الموجود فعلاً: `progress NUMERIC` و`courses.status`.
 *     مُقاس (موظفان بـ progress = 100 و45): المتوسط الحقيقي 72.5
 *     بينما الصفحة تعرض 0% لكل مشارك — ومن أتمّ الدورة يظهر عند الصفر
 *     بشريط **أحمر**. و«الدورات النشطة» صفر أبداً.
 *
 *  ② `handleExport` يعرض «تم تحميل التقرير بصيغة PDF» ولا يُولّد ملفاً.
 *
 *  ③ `timeRange` يُضبَط في الحالة ولا يُقرأ في أي حساب — مُرشِّح زينة.
 *
 *  ④ `TrainingService.toggleActive` يكتب `active` المعدوم:
 *       ERROR: column "active" of relation "courses" does not exist
 *
 *  ⑤ `deleteCourse` حذف نهائي، و`course_progress.course_id` عليه
 *     `ON DELETE CASCADE` ⇒ يمحو سجلّات تقدّم الموظفين بلا رجعة.
 *
 *  ⑥ «تحليل AI» سلسلة `if` على `score` و`time_spent` المعدومين
 *     ⇒ كل الفروع تسقط ويبقى سطر واحد.
 *
 *  ⑦ عدّ الأقسام يطابق نصّاً حرّاً، والقسم بلا موظفين يختفي.
 * ════════════════════════════════════════════════════════════════
 */
import { supabase } from '../supabase/supabase';
import { logger } from '../utils/logger';
import { SdkError } from './BaseService';

export interface TrainingCourseStat {
  id: string;
  title: string;
  category: string;
  level: string;
  status: string;
  mandatory: boolean;
  enrolled: number;
  completed: number;
  inProgress: number;
  notStarted: number;
  avgProgress: number;
  completionRate: number;
  approved: number;
  /** ★ 0353: متوسط الدرجة على **المُختبَرين وحدهم**. null = لا عيّنة. */
  avgScore: number | null;
  /** عدد من له درجة فعلية — يُميّز «لا قياس» عن «القياس صفر». */
  scoredCount: number;
  /** إجمالي وقت الدراسة بالثواني. */
  totalTime: number;
}

export interface TrainingMonthPoint {
  monthStart: string;
  enrollments: number;
  completions: number;
  avgProgress: number;
}

export interface TrainingDeptStat {
  departmentId: string;
  departmentName: string;
  employees: number;
  enrolled: number;
  trained: number;
  pending: number;
  completionRate: number;
  avgProgress: number;
}

export interface TrainingParticipant {
  employeeId: string;
  employeeName: string;
  department: string;
  courseId: string | null;
  courseTitle: string;
  progress: number;
  completed: boolean;
  approved: boolean;
  startedAt: string | null;
  completedAt: string | null;
  statusLabel: string;
  /** ★ 0353: null = «لم يُختبَر» — لا صفر. */
  score: number | null;
  timeSpent: number;
  lastAccessAt: string | null;
}

const num = (v: unknown): number => Number(v ?? 0);
/** ★ يحفظ NULL كما هي — تحويلها صفراً يُعيد عطل «متوسط مضلِّل». */
const nullableNum = (v: unknown): number | null =>
  v === null || v === undefined ? null : Number(v);

class TrainingReportsService {
  /** إحصاءات الدورات — `progress` و`status` الحقيقيان. */
  async courseStats(from?: string, to?: string): Promise<TrainingCourseStat[]> {
    const { data, error } = await supabase.rpc('training_course_stats', {
      p_from: from ?? null,
      p_to: to ?? null,
    });
    if (error) {
      logger.error('training_course_stats فشل: ' + error.message, {
        component: 'TrainingReportsService', action: 'courseStats',
      });
      return [];
    }
    type Raw = Record<string, unknown>;
    return ((data ?? []) as Raw[]).map((r) => ({
      id:             String(r.out_id ?? ''),
      title:          String(r.out_title ?? '—'),
      category:       String(r.out_category ?? '—'),
      level:          String(r.out_level ?? '—'),
      status:         String(r.out_status ?? '—'),
      mandatory:      Boolean(r.out_mandatory),
      enrolled:       num(r.out_enrolled),
      completed:      num(r.out_completed),
      inProgress:     num(r.out_in_progress),
      notStarted:     num(r.out_not_started),
      avgProgress:    num(r.out_avg_progress),
      completionRate: num(r.out_completion_rate),
      approved:       num(r.out_approved),
      avgScore:       nullableNum(r.out_avg_score),
      scoredCount:    num(r.out_scored_count),
      totalTime:      num(r.out_total_time),
    }));
  }

  /** الاتجاه الشهري — الأشهر الخالية تظهر ولا تُطوى. */
  async monthlyTrend(months = 12): Promise<TrainingMonthPoint[]> {
    const { data, error } = await supabase.rpc('training_monthly_trend', {
      p_months: months,
    });
    if (error) {
      logger.error('training_monthly_trend فشل: ' + error.message, {
        component: 'TrainingReportsService', action: 'monthlyTrend',
      });
      return [];
    }
    type Raw = Record<string, unknown>;
    return ((data ?? []) as Raw[]).map((r) => ({
      monthStart:  String(r.out_month_start ?? ''),
      enrollments: num(r.out_enrollments),
      completions: num(r.out_completions),
      avgProgress: num(r.out_avg_progress),
    }));
  }

  /** إحصاءات الأقسام — من `departments` لا من نصّ حرّ. */
  async departmentStats(from?: string, to?: string): Promise<TrainingDeptStat[]> {
    const { data, error } = await supabase.rpc('training_department_stats', {
      p_from: from ?? null,
      p_to: to ?? null,
    });
    if (error) {
      logger.error('training_department_stats فشل: ' + error.message, {
        component: 'TrainingReportsService', action: 'departmentStats',
      });
      return [];
    }
    type Raw = Record<string, unknown>;
    return ((data ?? []) as Raw[]).map((r) => ({
      departmentId:   String(r.out_department_id ?? ''),
      departmentName: String(r.out_department_name ?? '—'),
      employees:      num(r.out_employees),
      enrolled:       num(r.out_enrolled),
      trained:        num(r.out_trained),
      pending:        num(r.out_pending),
      completionRate: num(r.out_completion_rate),
      avgProgress:    num(r.out_avg_progress),
    }));
  }

  /** المشاركون — ومن لم يلتحق بأي دورة يظهر أيضاً (LEFT JOIN). */
  async participants(courseId?: string | null, search?: string):
      Promise<TrainingParticipant[]> {
    const { data, error } = await supabase.rpc('training_participants', {
      p_course_id: courseId && courseId !== 'all' ? courseId : null,
      p_search: search && search.trim() ? search.trim() : null,
    });
    if (error) {
      logger.error('training_participants فشل: ' + error.message, {
        component: 'TrainingReportsService', action: 'participants',
      });
      return [];
    }
    type Raw = Record<string, unknown>;
    return ((data ?? []) as Raw[]).map((r) => ({
      employeeId:   String(r.out_employee_id ?? ''),
      employeeName: String(r.out_employee_name ?? 'موظف بلا اسم'),
      department:   String(r.out_department ?? '—'),
      courseId:     r.out_course_id ? String(r.out_course_id) : null,
      courseTitle:  String(r.out_course_title ?? '—'),
      progress:     num(r.out_progress),
      completed:    Boolean(r.out_completed),
      approved:     Boolean(r.out_approved),
      startedAt:    r.out_started_at ? String(r.out_started_at) : null,
      completedAt:  r.out_completed_at ? String(r.out_completed_at) : null,
      statusLabel:  String(r.out_status_label ?? '—'),
      score:        nullableNum(r.out_score),
      timeSpent:    num(r.out_time_spent),
      lastAccessAt: r.out_last_access_at ? String(r.out_last_access_at) : null,
    }));
  }

  /**
   * أرشفة/تعطيل الدورة — **بديل الحذف النهائي**.
   *
   * ★ `deleteCourse` القديم كان `DELETE`، و`course_progress` عليه
   *   `ON DELETE CASCADE` ⇒ يمحو سجلّات تقدّم الموظفين كلها.
   *   هذه الدالة تُبقيها وتغيّر `status` فقط.
   */
  async setCourseStatus(
    courseId: string,
    status: 'active' | 'inactive' | 'archived',
  ): Promise<{ id: string; title: string; status: string; enrolled: number }> {
    const { data, error } = await supabase.rpc('training_course_set_status', {
      p_course_id: courseId,
      p_status: status,
    });
    if (error) throw SdkError.fromSupabaseError(error);
    type Raw = Record<string, unknown>;
    const rows = (data ?? []) as Raw[];
    if (rows.length === 0) throw SdkError.notFound('الدورة غير موجودة');
    const r = rows[0];
    return {
      id:       String(r.out_id ?? ''),
      title:    String(r.out_title ?? ''),
      status:   String(r.out_status ?? ''),
      enrolled: num(r.out_enrolled),
    };
  }
}

export const trainingReportsService = new TrainingReportsService();
