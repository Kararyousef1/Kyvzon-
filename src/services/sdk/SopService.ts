/**
 * ════════════════════════════════════════════════════════════════
 *  SopService — إجراءات التشغيل القياسية (migration 0343)
 *
 *  ═══ ما تُصلحه هذه الخدمة ══════════════════════════════════════
 *
 *  ★★★ كل تتبّع القراءة كان في ذاكرة المتصفح ولا يُحفظ إطلاقاً.
 *    `SOPsPage.tsx` (869 سطراً) تُدير `readings` بـ`useState`، و
 *    `grep 'sop_readings'` في الملف يُعطي **0 مطابقة**. مُقاس بعد
 *    اعتماد كامل: صفوف `sop_readings` = **0**.
 *    والجدول مبنيّ منذ 0003 بالأعمدة نفسها التي تحفظها الصفحة في
 *    الذاكرة — ولم يُكتب فيه صفّ واحد.
 *
 *  ★★★ ولو كتبت الصفحة لفشلت: `kyvzon_sop_readings_update` تشترط
 *    `current_user_is_staff()` وحدها. مُقاس بعدّ الصفوف المتأثّرة
 *    بدور موظف: تحديث `time_spent` ⇒ **0** · الاعتماد ⇒ **0**.
 *
 *  ★★ والوقت كان يُحسب بـ`setInterval` في المتصفح — قابل للتلاعب
 *    ويضيع عند إغلاق التبويب. الآن من فارق `last_read_at` بسقف
 *    15 دقيقة للنبضة.
 *
 *  ★★ والترشيح كان مطابقةً نصّية بين `sops.department` و
 *    `profiles.department`. مُقاس أنهما يتباعدان فتختفي إجراءات
 *    القسم عن موظفيه صامتاً.
 * ════════════════════════════════════════════════════════════════
 */
import { supabase } from '../supabase/supabase';
import { logger } from '../utils/logger';

/** إجراء في كتالوج الموظف مع تقدّم قراءته */
export interface MySop {
  id: string;
  code: string;
  title: string;
  titleEn: string | null;
  description: string;
  descriptionEn: string | null;
  /** من `departments` الحيّ لا من العمود النصّي المتجمّد */
  department: string;
  /** المدّة التقديرية بالدقائق */
  duration: number | null;
  category: string;
  version: string;
  isMandatory: boolean;
  effectiveDate: string | null;
  reviewDate: string | null;
  fileUrl: string | null;
  tags: string[];
  readCount: number;
  /** ثوانٍ — محسوبة في القاعدة من فارق الطوابع */
  timeSpent: number;
  completed: boolean;
  approved: boolean;
  approvedAt: string | null;
  lastReadAt: string | null;
}

export interface MySopPage {
  rows: MySop[];
  /** الإجمالي **بعد** الترشيح وقبل الحدّ */
  total: number;
}

/** نتيجة لمسة قراءة */
export interface SopTouchResult {
  id: string;
  readCount: number;
  timeSpent: number;
  approved: boolean;
}

/** صفّ امتثال لإجراء واحد */
export interface SopCompliance {
  sopId: string;
  code: string;
  title: string;
  department: string;
  isMandatory: boolean;
  /** الجمهور المستهدَف: موظفو القسم، أو الكل للإجراء العام */
  targetCount: number;
  readCount: number;
  approvedCount: number;
  compliancePct: number;
  avgSeconds: number;
}

export type SopStatusFilter = 'all' | 'completed' | 'in_progress' | 'not_started';

const ERROR_LABELS: Record<string, string> = {
  SOP_NO_TENANT: 'لا سياق شركة لحسابك — راجع مدير النظام',
  SOP_NO_EMPLOYEE: 'لا يوجد سجلّ موظف مرتبط بحسابك — راجع الموارد البشرية',
  SOP_NOT_FOUND: 'الإجراء غير موجود',
  SOP_NOT_STARTED: 'ابدأ القراءة قبل الاعتماد',
  SOP_APPROVAL_FINAL: 'لا يمكن التراجع عن اعتماد قراءة',
  SOP_TIME_MONOTONIC: 'الوقت المستغرق لا ينقص',
  SOP_READING_IMMUTABLE_LINK: 'لا يمكن تغيير انتماء سجلّ القراءة',
};

/** يستخرج رسالة عربية مفهومة من خطأ القاعدة */
export function sopErrorMessage(raw: string): string {
  const code = Object.keys(ERROR_LABELS).find((k) => raw.includes(k));
  if (!code) return raw;
  const detail = raw.split(`${code}:`)[1]?.trim();
  return detail && detail.length > 0 ? detail : ERROR_LABELS[code];
}

interface RawMySop {
  out_id: string;
  out_code: string;
  out_title: string;
  out_title_en: string | null;
  out_description: string | null;
  out_description_en: string | null;
  out_department: string | null;
  out_duration: number | null;
  out_category: string | null;
  out_version: string | null;
  out_is_mandatory: boolean;
  out_effective_date: string | null;
  out_review_date: string | null;
  out_file_url: string | null;
  out_tags: string[] | null;
  out_read_count: number;
  out_time_spent: number;
  out_completed: boolean;
  out_approved: boolean;
  out_approved_at: string | null;
  out_last_read_at: string | null;
  out_total: number;
}

class SopService {
  /**
   * كتالوج إجراءات الموظف مع تقدّم قراءته.
   *
   * ★ الانتماء بـ`department_id` مع احتياط نصّي للسجلات غير المربوطة.
   * ★ الترشيح والبحث والترقيم كلها في القاعدة — كانت في المتصفح.
   */
  async myCatalog(opts?: {
    search?: string | null;
    category?: string | null;
    status?: SopStatusFilter | null;
    limit?: number;
    offset?: number;
  }): Promise<MySopPage> {
    const { data, error } = await supabase.rpc('my_sops', {
      p_search: opts?.search ?? null,
      p_category: opts?.category ?? null,
      p_status: opts?.status && opts.status !== 'all' ? opts.status : null,
      p_limit: opts?.limit ?? 50,
      p_offset: opts?.offset ?? 0,
    });
    if (error) {
      logger.error('my_sops فشل: ' + error.message, {
        component: 'SopService', action: 'myCatalog',
      });
      throw new Error(sopErrorMessage(error.message));
    }
    const raw = (data ?? []) as RawMySop[];
    return {
      rows: raw.map((r) => ({
        id: r.out_id,
        code: r.out_code,
        title: r.out_title,
        titleEn: r.out_title_en,
        description: r.out_description ?? '',
        descriptionEn: r.out_description_en,
        department: r.out_department ?? '—',
        duration: r.out_duration,
        category: r.out_category ?? 'other',
        version: r.out_version ?? '1.0',
        isMandatory: Boolean(r.out_is_mandatory),
        effectiveDate: r.out_effective_date,
        reviewDate: r.out_review_date,
        fileUrl: r.out_file_url,
        tags: r.out_tags ?? [],
        readCount: Number(r.out_read_count ?? 0),
        timeSpent: Number(r.out_time_spent ?? 0),
        completed: Boolean(r.out_completed),
        approved: Boolean(r.out_approved),
        approvedAt: r.out_approved_at,
        lastReadAt: r.out_last_read_at,
      })),
      total: raw.length > 0 ? Number(raw[0].out_total ?? 0) : 0,
    };
  }

  /**
   * نبضة قراءة: تُنشئ السجلّ عند أول لمسة وتُراكم الوقت بعدها.
   *
   * ★★ الوقت من فارق `last_read_at` في القاعدة بسقف 15 دقيقة للنبضة —
   *   تبويب مفتوح ليلةً كاملة ليس قراءة. و`elapsedSecs` تلميح من
   *   الواجهة يُؤخذ منه **الأصغر** لا الأكبر: لا يُصدَّق التضخيم.
   */
  async touch(sopId: string, elapsedSecs?: number): Promise<SopTouchResult> {
    const { data, error } = await supabase.rpc('sop_reading_touch', {
      p_sop_id: sopId,
      p_elapsed_secs: elapsedSecs ?? null,
    });
    if (error) {
      logger.error('sop_reading_touch فشل: ' + error.message, {
        component: 'SopService', action: 'touch',
      });
      throw new Error(sopErrorMessage(error.message));
    }
    type Raw = {
      out_id: string; out_read_count: number;
      out_time_spent: number; out_approved: boolean;
    };
    const rows = (data ?? []) as Raw[];
    if (rows.length === 0) throw new Error('لم تُعِد القاعدة نتيجة للقراءة');
    return {
      id: rows[0].out_id,
      readCount: Number(rows[0].out_read_count ?? 0),
      timeSpent: Number(rows[0].out_time_spent ?? 0),
      approved: Boolean(rows[0].out_approved),
    };
  }

  /**
   * اعتماد القراءة — إقرار الموظف بفهمه، وهو **دليل الامتثال**.
   * يُعيد `false` إن كان معتمَداً سلفاً (ليس خطأً).
   */
  async approve(sopId: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('sop_reading_approve', {
      p_sop_id: sopId,
    });
    if (error) {
      logger.error('sop_reading_approve فشل: ' + error.message, {
        component: 'SopService', action: 'approve',
      });
      throw new Error(sopErrorMessage(error.message));
    }
    return data === true;
  }

  /**
   * امتثال الأقسام — للموارد البشرية.
   * يُجيب: كم موظفاً من المستهدَفين اعتمد كل إجراء؟
   */
  async compliance(departmentId?: string | null): Promise<SopCompliance[]> {
    const { data, error } = await supabase.rpc('sop_compliance_overview', {
      p_department_id: departmentId ?? null,
    });
    if (error) {
      logger.error('sop_compliance_overview فشل: ' + error.message, {
        component: 'SopService', action: 'compliance',
      });
      return [];
    }
    type Raw = {
      out_sop_id: string; out_code: string; out_title: string;
      out_department: string | null; out_is_mandatory: boolean;
      out_target_count: number; out_read_count: number;
      out_approved_count: number; out_compliance_pct: number;
      out_avg_seconds: number;
    };
    return ((data ?? []) as Raw[]).map((r) => ({
      sopId: r.out_sop_id,
      code: r.out_code,
      title: r.out_title,
      department: r.out_department ?? '—',
      isMandatory: Boolean(r.out_is_mandatory),
      targetCount: Number(r.out_target_count ?? 0),
      readCount: Number(r.out_read_count ?? 0),
      approvedCount: Number(r.out_approved_count ?? 0),
      compliancePct: Number(r.out_compliance_pct ?? 0),
      avgSeconds: Number(r.out_avg_seconds ?? 0),
    }));
  }
}

export const sopService = new SopService();
