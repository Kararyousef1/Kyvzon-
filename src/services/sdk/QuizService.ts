/**
 * ════════════════════════════════════════════════════════════════
 *  QuizService — اختبارات التدريب
 *
 *  ═══ الفجوة التي تسدّها (المرحلة 1) ═══════════════════════════
 *
 *  `TrainingManagementPage.tsx` كانت تستورد Supabase ديناميكياً
 *  داخل معالج الحفظ وتكتب في الجدول مباشرةً:
 *
 *      const { supabase } = await import('.../supabase');
 *      const tenant_id = localStorage.getItem('tenant_id');
 *      await supabase.from('quizzes').upsert({
 *        id: (quiz as any).id || undefined,
 *        course_id: (quiz as any).course_id,
 *        …
 *      } as any);
 *
 *  ثلاث مخالفات في كتلة واحدة:
 *    ① الصفحات لا تلمس Supabase مباشرة — هذه قاعدة المشروع
 *    ② خمسة مواضع `as any` رغم وجود نوع `Quiz` كامل في types/quiz.ts
 *    ③ `tenant_id` من `localStorage` — قيمة يتحكّم بها المتصفح.
 *       RLS يحرسها فعلياً (`quizzes_tenant_isolation`)، لكن إرسالها
 *       من العميل عبثٌ في أحسن الأحوال ومصدر لبس في أسوئها.
 *
 *  ★ أعمدة الجدول مُحقَّقة من `0143_training_quizzes.sql`:
 *      id · tenant_id · course_id · title · description · questions JSONB
 *      passing_score (0–100) · time_limit_minutes · is_active
 *      created_by · created_at · updated_at
 *      UNIQUE (tenant_id, course_id, title)
 *
 *  ★ الفروق عن نوع `Quiz` في الواجهة — مقصودة لا سهو:
 *      Quiz.passingScore     ↔  passing_score
 *      Quiz.timeLimit        ↔  time_limit_minutes
 *      Quiz.status           ↔  is_active   (draft/archived ⇒ false)
 *      Quiz.type/difficulty/attemptsAllowed  — لا عمود لها في القاعدة
 * ════════════════════════════════════════════════════════════════
 */
import { BaseService } from './BaseService';
import { logger } from '../utils/logger';
import type { QuizQuestion } from '../../shared/types/quiz';

/** صفّ الاختبار كما هو في القاعدة (0143) */
export interface QuizRecord {
  id: string;
  tenant_id: string;
  course_id: string;
  title: string;
  description?: string | null;
  questions: QuizQuestion[];
  passing_score: number;
  time_limit_minutes?: number | null;
  is_active: boolean;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

/** حمولة الحفظ من الواجهة — `id` اختياري (إنشاء أو تحديث) */
export interface QuizUpsertInput {
  id?: string;
  course_id: string;
  title?: string;
  description?: string | null;
  questions?: QuizQuestion[];
  passing_score?: number;
  time_limit_minutes?: number | null;
  is_active?: boolean;
}

class QuizService extends BaseService<QuizRecord> {
  constructor() {
    super('quizzes');
  }

  /** اختبارات دورة بعينها */
  async findByCourse(courseId: string): Promise<QuizRecord[]> {
    if (!courseId) {
      logger.warn('findByCourse استُدعيت بمعرّف دورة فارغ', {
        component: 'QuizService',
        action: 'findByCourse',
      });
      return [];
    }
    return this.findAll({
      filters: { course_id: courseId },
      orderBy: 'created_at',
      ascending: false,
    });
  }

  /** كل اختبارات الشركة النشطة */
  async findActive(): Promise<QuizRecord[]> {
    return this.findAll({
      filters: { is_active: true },
      orderBy: 'created_at',
      ascending: false,
    });
  }

  /**
   * حفظ اختبار — إنشاء أو تحديث.
   *
   * ★ `tenant_id` **لا يُرسَل من العميل**: القاعدة تملأه عبر السياق
   *   وسياسة `quizzes_tenant_isolation` تحرسه. النسخة السابقة كانت
   *   تقرؤه من `localStorage`.
   *
   * ★ `passing_score` مقصوص إلى 0–100 لأن القاعدة تحمل
   *   `CHECK (passing_score BETWEEN 0 AND 100)` — نمنع دورة
   *   ذهاب/إياب تفشل بقيد.
   */
  async saveQuiz(input: QuizUpsertInput): Promise<QuizRecord> {
    const payload: Partial<QuizRecord> = {
      course_id: input.course_id,
      title: input.title?.trim() || 'اختبار',
      description: input.description ?? null,
      questions: input.questions ?? [],
      passing_score: Math.min(100, Math.max(0, input.passing_score ?? 70)),
      time_limit_minutes: input.time_limit_minutes ?? 30,
      is_active: input.is_active ?? true,
      updated_at: new Date().toISOString(),
    };

    if (input.id) {
      logger.debug('QuizService.saveQuiz — تحديث', {
        component: 'QuizService',
        action: 'saveQuiz',
        quizId: input.id,
      });
      return this.update(input.id, payload);
    }

    logger.debug('QuizService.saveQuiz — إنشاء', {
      component: 'QuizService',
      action: 'saveQuiz',
      courseId: input.course_id,
    });
    return this.create(payload);
  }

  /**
   * تعطيل اختبار.
   *
   * ★ تعطيل لا حذف: محاولات الموظفين تشير إليه، والحذف يُيتّمها.
   *   (قاعدة المشروع: archive/cancel/void/deactivate لا DELETE)
   */
  async deactivate(quizId: string): Promise<QuizRecord> {
    return this.update(quizId, {
      is_active: false,
      updated_at: new Date().toISOString(),
    });
  }
}

export const quizService = new QuizService();
export default quizService;
