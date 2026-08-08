/**
 * ════════════════════════════════════════════════════════════════
 *  MyTrainingService — تدريب الموظف نفسه (يبني على migration 0353)
 *
 *  ★★★ الأعطال التي يُصلحها — مُثبتة تشغيلياً على Postgres محلي:
 *
 *  ① `TrainingPage.tsx:96` يقرأ عمودين معدومين في سلسلة واحدة:
 *       Number(progress?.progress_percent ?? raw.progress ?? 0)
 *     · `course_progress.progress_percent` ⇒ **غير موجود** (الموجود
 *       `progress`)
 *     · `courses.progress`                 ⇒ **غير موجود** أصلاً
 *     ⇒ السلسلة تسقط إلى `0` دائماً.
 *
 *  ② `:97` يقرأ `progress?.status` و`course_progress.status`
 *     **غير موجود** (الموجود `completed BOOLEAN`).
 *     و`raw.status` هو `courses.status` = `'active'` — حالة الدورة
 *     لا حالة الموظف فيها.
 *
 *     الأثر المُقاس (موظف أتمّ الدورة: `progress=100 · completed=true`):
 *       progressPercent ⇒ 0
 *       status          ⇒ 'not_started'
 *     ⇒ **من أتمّ الدورة يظهر «لم يبدأ» بشريط 0%.**
 *
 *  ③ لا شيء يكتب `time_spent` ولا `last_access_at` — العمودان
 *     المُضافان في 0353 يبقيان صفراً بلا كاتب.
 *
 *  ④ لا مسار لتسليم اختبار من الموظف ⇒ `quiz_attempts` يبقى فارغاً
 *     و`quizAiService` بلا غذاء.
 * ════════════════════════════════════════════════════════════════
 */
import { supabase } from '../supabase/supabase';
import { logger } from '../utils/logger';
import { SdkError } from './BaseService';

export interface MyCourseProgress {
  courseId: string;
  progress: number;
  completed: boolean;
  approved: boolean;
  score: number | null;
  timeSpent: number;
  startedAt: string | null;
  completedAt: string | null;
  lastAccessAt: string | null;
}

export interface TouchResult {
  progress: number;
  timeSpent: number;
  completed: boolean;
}

export interface QuizSubmitResult {
  attemptId: string;
  attemptNumber: number;
  score: number;
  passed: boolean;
  bestScore: number;
}

export interface MyQuizAttempt {
  id: string;
  quizId: string;
  attemptNumber: number;
  score: number | null;
  passed: boolean | null;
  durationSecs: number;
  submittedAt: string | null;
}

const num = (v: unknown): number => Number(v ?? 0);
/** ★ يحفظ NULL: «لم يُختبَر» ≠ «حصل صفراً» (مبدأ 0353). */
const nullableNum = (v: unknown): number | null =>
  v === null || v === undefined ? null : Number(v);

class MyTrainingService {
  /**
   * تقدّم الموظف الحالي في دوراته.
   *
   * ★ يُرجع الأعمدة الحقيقية: `progress` و`completed` — لا
   *   `progress_percent` ولا `status` المعدومين.
   */
  async myProgress(employeeId: string): Promise<MyCourseProgress[]> {
    const { data, error } = await supabase
      .from('course_progress')
      .select('course_id, progress, completed, approved, score, time_spent,'
              + ' started_at, completed_at, last_access_at')
      .eq('employee_id', employeeId);

    if (error) {
      logger.error('قراءة تقدّم التدريب فشلت: ' + error.message, {
        component: 'MyTrainingService', action: 'myProgress',
      });
      return [];
    }
    type Raw = Record<string, unknown>;
    return ((data ?? []) as unknown as Raw[]).map((r) => ({
      courseId:     String(r.course_id ?? ''),
      progress:     num(r.progress),
      completed:    Boolean(r.completed),
      approved:     Boolean(r.approved),
      score:        nullableNum(r.score),
      timeSpent:    num(r.time_spent),
      startedAt:    r.started_at ? String(r.started_at) : null,
      completedAt:  r.completed_at ? String(r.completed_at) : null,
      lastAccessAt: r.last_access_at ? String(r.last_access_at) : null,
    }));
  }

  /**
   * نبضة مشاهدة — الكاتب الوحيد لـ`time_spent` و`last_access_at`.
   *
   * ★ الوقت يتراكم في القاعدة ولا يُستبدل، والتقدّم لا يتراجع
   *   (`GREATEST`) فلا تمحو نبضةٌ متأخّرة إنجازاً سابقاً.
   * ★ حدّ النبضة 3600 ثانية — نُرسل دفعات قصيرة لا رقماً متراكماً.
   */
  async touch(courseId: string, seconds: number, progress?: number):
      Promise<TouchResult | null> {
    // ★ لا نُرسل نبضة صفرية: تُحدّث last_access_at بلا فائدة وتُثقل الشبكة
    if (seconds <= 0 && progress === undefined) return null;

    const { data, error } = await supabase.rpc('training_progress_touch', {
      p_course_id: courseId,
      p_seconds: Math.min(Math.max(Math.round(seconds), 0), 3600),
      p_progress: progress ?? null,
    });
    if (error) {
      // ★ النبضة لا تُوقف المشاهدة — نُسجّل ولا نرمي
      logger.warn('نبضة التدريب فشلت: ' + error.message, {
        component: 'MyTrainingService', action: 'touch',
      });
      return null;
    }
    type Raw = Record<string, unknown>;
    const rows = (data ?? []) as Raw[];
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      progress:  num(r.out_progress),
      timeSpent: num(r.out_time_spent),
      completed: Boolean(r.out_completed),
    };
  }

  /**
   * تسليم محاولة اختبار.
   *
   * ★ الدرجة تُقيَّم بـ`passing_score` في القاعدة، ورقم المحاولة
   *   يُحسب هناك أيضاً (سباق التزامن)، و`course_progress.score`
   *   يأخذ **أفضل** درجة لا آخرها.
   */
  async submitQuiz(
    quizId: string,
    score: number,
    answers: unknown[] = [],
    durationSecs = 0,
  ): Promise<QuizSubmitResult> {
    const { data, error } = await supabase.rpc('training_quiz_submit', {
      p_quiz_id: quizId,
      p_score: score,
      p_answers: answers,
      p_duration: Math.max(Math.round(durationSecs), 0),
    });
    if (error) throw SdkError.fromSupabaseError(error);
    type Raw = Record<string, unknown>;
    const rows = (data ?? []) as Raw[];
    if (rows.length === 0) throw SdkError.notFound('تعذّر تسجيل المحاولة');
    const r = rows[0];
    return {
      attemptId:     String(r.out_attempt_id ?? ''),
      attemptNumber: num(r.out_attempt_number),
      score:         num(r.out_score),
      passed:        Boolean(r.out_passed),
      bestScore:     num(r.out_best_score),
    };
  }

  /** محاولات الموظف الحالي — يراها وحده (تحرسها القاعدة). */
  async myAttempts(quizId?: string): Promise<MyQuizAttempt[]> {
    const { data, error } = await supabase.rpc('training_quiz_attempts', {
      p_quiz_id: quizId ?? null,
      p_employee_id: null,
    });
    if (error) {
      logger.error('قراءة المحاولات فشلت: ' + error.message, {
        component: 'MyTrainingService', action: 'myAttempts',
      });
      return [];
    }
    type Raw = Record<string, unknown>;
    return ((data ?? []) as Raw[]).map((r) => ({
      id:            String(r.out_id ?? ''),
      quizId:        String(r.out_quiz_id ?? ''),
      attemptNumber: num(r.out_attempt_number),
      score:         nullableNum(r.out_score),
      passed:        r.out_passed === null || r.out_passed === undefined
                       ? null : Boolean(r.out_passed),
      durationSecs:  num(r.out_duration_secs),
      submittedAt:   r.out_submitted_at ? String(r.out_submitted_at) : null,
    }));
  }
}

export const myTrainingService = new MyTrainingService();
