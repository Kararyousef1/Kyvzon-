/**
 * ════════════════════════════════════════════════════════════════
 *  OccupationalSafetyService — الصحة والسلامة المهنية (migration 0369)
 *
 *  ★★★★ **العطل الأول: أربعةٌ من خمسة تصنيفاتٍ مرفوضةٌ من القاعدة.**
 *
 *     `incidents_category_check` كان يقبل سبعاً:
 *        technical · hr · management · workplace · salary · safety · other
 *     والصفحة تعرض في `<select>`:
 *        safety · work_injury · near_miss · security_incident
 *
 *     PROBE_2 — إدراجٌ فعليٌّ بكلٍّ منها:
 *        safety            ⇒ مقبول
 *        work_injury       ⇒ ★ مرفوض
 *        near_miss         ⇒ ★ مرفوض
 *        security_incident ⇒ ★ مرفوض
 *        health_safety     ⇒ ★ مرفوض (وهو في المُرشِّح لا في القائمة)
 *
 *     ⇒ **ثلاثةٌ من أربعة خياراتٍ تُخرج خطأ عند الحفظ.** المستخدم
 *       يختار «إصابة عمل» فيفشل التسجيل. عولج بتوسيع CHECK.
 *
 *  ★ إنصافاً: `incidents` محميٌّ جيداً منذ 0338. الأعطال الباقية في
 *    `corrective_actions` — جدولٌ عارٍ إلّا من CHECK اثنين:
 *
 *  ② **`owner_id` بلا FK** — إجراءٌ مُسنَدٌ إلى `ffffffff-…` قُبِل.
 *  ③ ★★★★ **إجراءٌ مربوطٌ بحادثٍ في مستأجرٍ آخر** ⇒ قُبِل.
 *  ④ **`created_by`/`completed_by` بلا FK.**
 *  ⑤ **`title` من مسافات** — `NOT NULL` لا يمنعها.
 *  ⑥ ★★★ **«مكتمل» بلا مُنجِزٍ ولا لحظة** — وسجلُّ CAPA **وثيقةٌ
 *     تدقيقية** في نظم السلامة.
 *  ⑦ ★★★ **«ملغى» بلا سبب — ولا عمود أصلاً**، ولا زرٌّ في الصفحة.
 *  ⑧ **استحقاقٌ في 2018** ⇒ قُبِل.
 *  ⑨ ★★★★ **حادثٌ حرجٌ بلا إجراءٍ تصحيحيّ — ولا شيء يكشفه.**
 *     جوهرُ CAPA أن كل حادثٍ جسيمٍ يُقابله إجراء. دوالُ المنظومة
 *     التي تلمس الجدول = **صفر**.
 *  ⑩ ★★★ **الإجراء المتأخّر لا يُرصد** — دوالُ التأخّر = صفر.
 *  ⑪ **الحذف النهائيّ مسموح** — بينما `incidents` محميٌّ بمحفّزٍ
 *     منذ 0338. تناقضٌ في مستوى الحماية.
 *  ⑫ **حذفُ الحادث يُيتّم إجراءاته** (`ON DELETE SET NULL`).
 *  ⑬ ★★★ **البوّابة على وحدة `admin` لا `hr`** ⇒ مستأجرٌ مشتركٌ في
 *     الموارد البشرية دون الإدارة يرى الحوادث ولا يرى إجراءاتها:
 *     **الصفحة تنكسر نصفين**.
 *  ⑭ ★★★ **الموظف لا يرى الإجراء المُسنَد إليه** — سياسة SELECT
 *     تشترط `current_user_is_staff()` وحدها.
 *
 *  ★ الصفحة لا تلمس Supabase — كل شيء عبر هذه الطبقة.
 * ════════════════════════════════════════════════════════════════
 */
import { supabase } from '../supabase/supabase';
import { logger } from '../utils/logger';
import { SdkError } from './BaseService';

/**
 * ★★★★ تصنيفات السلامة الأربعة — مطابِقة لـ`incidents_category_check`
 *   بعد توسيعه في 0369. ثلاثةٌ منها كانت الصفحة تعرضها والقاعدة ترفضها.
 */
export const SAFETY_CATEGORIES = [
  'safety', 'work_injury', 'near_miss', 'security_incident',
] as const;
export type SafetyCategory = (typeof SAFETY_CATEGORIES)[number];

/** ★ درجات الخطورة الأربع — مطابِقة لـ`incidents_severity_check` */
export const SAFETY_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
export type SafetySeverity = (typeof SAFETY_SEVERITIES)[number];

/** ★ حالات الحادث الأربع — مطابِقة لـ`incidents_status_check` */
export const SAFETY_STATES = ['pending', 'in_progress', 'resolved', 'closed'] as const;
export type SafetyState = (typeof SAFETY_STATES)[number];

/** ★ حالات CAPA الأربع — مطابِقة لـ`corrective_actions_status_check` */
export const CAPA_STATES = ['open', 'in_progress', 'completed', 'cancelled'] as const;
export type CapaState = (typeof CAPA_STATES)[number];

/** ★ الأولويات الأربع — مطابِقة لـ`corrective_actions_priority_check` */
export const CAPA_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;
export type CapaPriority = (typeof CAPA_PRIORITIES)[number];

export const SAFETY_CATEGORY_AR: Record<SafetyCategory, string> = {
  safety:            'سلامة عامّة',
  work_injury:       'إصابة عمل',
  near_miss:         'خطرٌ محتمل',
  security_incident: 'حادثٌ أمنيّ',
};

export const SAFETY_SEVERITY_AR: Record<SafetySeverity, string> = {
  low: 'منخفضة', medium: 'متوسطة', high: 'عالية', critical: 'حرجة',
};

export const SAFETY_STATE_AR: Record<SafetyState, string> = {
  pending: 'قيد الانتظار', in_progress: 'قيد المعالجة',
  resolved: 'مُعالَج', closed: 'مغلق',
};

export const CAPA_STATE_AR: Record<CapaState, string> = {
  open: 'مفتوح', in_progress: 'قيد التنفيذ',
  completed: 'مُنجَز', cancelled: 'ملغى',
};

export const CAPA_PRIORITY_AR: Record<CapaPriority, string> = {
  low: 'منخفضة', medium: 'متوسطة', high: 'عالية', critical: 'حرجة',
};

export const SAFETY_SEVERITY_TONE: Record<SafetySeverity, string> = {
  low:      'bg-slate-100 text-slate-600 border-slate-200',
  medium:   'bg-amber-50 text-amber-700 border-amber-200',
  high:     'bg-orange-50 text-orange-700 border-orange-200',
  critical: 'bg-red-50 text-red-700 border-red-200',
};

export const SAFETY_STATE_TONE: Record<SafetyState, string> = {
  pending:     'bg-blue-50 text-blue-700 border-blue-200',
  in_progress: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  resolved:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  closed:      'bg-slate-100 text-slate-600 border-slate-200',
};

export const CAPA_STATE_TONE: Record<CapaState, string> = {
  open:        'bg-blue-50 text-blue-700 border-blue-200',
  in_progress: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  completed:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled:   'bg-slate-100 text-slate-500 border-slate-200',
};

export const CAPA_PRIORITY_TONE: Record<CapaPriority, string> = {
  low:      'bg-slate-100 text-slate-600 border-slate-200',
  medium:   'bg-sky-50 text-sky-700 border-sky-200',
  high:     'bg-orange-50 text-orange-700 border-orange-200',
  critical: 'bg-red-50 text-red-700 border-red-200',
};

const NEUTRAL_TONE = 'bg-slate-100 text-slate-600 border-slate-200';

/** ★★ تُعيد النصّ الخامّ لا `undefined` عند مفردةٍ مجهولة */
export const safetyCategoryLabel = (v: string): string =>
  SAFETY_CATEGORY_AR[v as SafetyCategory] ?? v;
export const safetySeverityLabel = (v: string): string =>
  SAFETY_SEVERITY_AR[v as SafetySeverity] ?? v;
export const safetyStateLabel = (v: string): string =>
  SAFETY_STATE_AR[v as SafetyState] ?? v;
export const capaStateLabel = (v: string): string =>
  CAPA_STATE_AR[v as CapaState] ?? v;
export const capaPriorityLabel = (v: string): string =>
  CAPA_PRIORITY_AR[v as CapaPriority] ?? v;

export const safetySeverityTone = (v: string): string =>
  SAFETY_SEVERITY_TONE[v as SafetySeverity] ?? NEUTRAL_TONE;
export const safetyStateTone = (v: string): string =>
  SAFETY_STATE_TONE[v as SafetyState] ?? NEUTRAL_TONE;
export const capaStateTone = (v: string): string =>
  CAPA_STATE_TONE[v as CapaState] ?? NEUTRAL_TONE;
export const capaPriorityTone = (v: string): string =>
  CAPA_PRIORITY_TONE[v as CapaPriority] ?? NEUTRAL_TONE;

export const isCapaFinal = (v: string): boolean =>
  v === 'completed' || v === 'cancelled';
export const isIncidentClosed = (v: string): boolean =>
  v === 'resolved' || v === 'closed';

export interface SafetyIncidentRow {
  id: string;
  title: string;
  description: string;
  category: SafetyCategory | string;
  severity: SafetySeverity | string;
  status: SafetyState | string;
  employeeId: string | null;
  /** ★★★ «مُبلِّغ مجهول» للبلاغات المجهولة — درس 0338 */
  employeeName: string;
  reportedAt: string | null;
  isAnonymous: boolean;
  actionsTotal: number;
  actionsOpen: number;
  /** ★★★★ العطل ⑨: حادثٌ جسيمٌ مفتوحٌ بلا إجراءٍ فعّال */
  needsCapa: boolean;
  ageDays: number;
}

export interface CapaRow {
  id: string;
  incidentId: string | null;
  incidentTitle: string | null;
  title: string;
  description: string | null;
  priority: CapaPriority | string;
  status: CapaState | string;
  ownerId: string | null;
  ownerName: string | null;
  dueDate: string | null;
  daysToDue: number | null;
  /** ★★★ العطل ⑩: متأخّرٌ ولمّا يُنجَز */
  isOverdue: boolean;
  startedAt: string | null;
  completedAt: string | null;
  completerName: string | null;
  verificationNote: string | null;
  cancelReason: string | null;
  creatorName: string | null;
  createdAt: string | null;
}

export interface HealthSafetySummary {
  incidentsTotal: number;
  incidentsOpen: number;
  incidentsSevere: number;
  /** ★★★★ فجوة CAPA: حوادثُ جسيمةٌ مفتوحةٌ بلا إجراء */
  incidentsNoCapa: number;
  capaTotal: number;
  capaOpen: number;
  capaOverdue: number;
  capaCompleted: number;
  capaCancelled: number;
  capaUnassigned: number;
}

export interface CapaInput {
  incidentId?: string | null;
  title: string;
  description?: string | null;
  priority?: CapaPriority;
  ownerId?: string | null;
  dueDate?: string | null;
}

type Raw = Record<string, unknown>;

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
/** ★ يحفظ التمييز بين «صفر يوم» و«بلا موعد» (درس 0353) */
const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string => (v == null ? '' : String(v));
const strOrNull = (v: unknown): string | null =>
  v == null || String(v) === '' ? null : String(v);
const bool = (v: unknown): boolean => v === true || v === 'true' || v === 't';

class OccupationalSafetySdk {
  /**
   * لوح حوادث السلامة — استعلامٌ واحد مُرشَّحٌ في القاعدة.
   *
   * ★ العطل ⑰ في الصفحة القديمة: جلبت **كل** الحوادث ثم رشّحتها
   *   في المتصفّح بـ`.filter((i: any) => safetyCategories.includes(...))`.
   * ★★★★ `needsCapa` هو جوهر CAPA — لم يكن يُحسب في أيّ مكان.
   */
  async incidents(
    search?: string | null,
    status?: SafetyState | null,
    severity?: SafetySeverity | null,
    limit = 200,
  ): Promise<SafetyIncidentRow[]> {
    const { data, error } = await supabase.rpc('safety_incident_board', {
      p_search: search ?? null,
      p_status: status ?? null,
      p_severity: severity ?? null,
      p_limit: limit,
    });
    if (error) {
      logger.error('safety_incident_board فشل: ' + error.message, {
        component: 'OccupationalSafetySdk', action: 'incidents',
      });
      throw SdkError.fromSupabaseError(error);
    }
    return ((data ?? []) as Raw[]).map((r) => ({
      id:           str(r.id),
      title:        str(r.title),
      description:  str(r.description),
      category:     str(r.category),
      severity:     str(r.severity),
      status:       str(r.status),
      employeeId:   strOrNull(r.employee_id),
      employeeName: str(r.employee_name),
      reportedAt:   strOrNull(r.reported_at),
      isAnonymous:  bool(r.is_anonymous),
      actionsTotal: num(r.actions_total),
      actionsOpen:  num(r.actions_open),
      needsCapa:    bool(r.needs_capa),
      ageDays:      num(r.age_days),
    }));
  }

  /** لوح الإجراءات التصحيحية */
  async actions(
    search?: string | null,
    status?: CapaState | null,
    incidentId?: string | null,
    limit = 200,
  ): Promise<CapaRow[]> {
    const { data, error } = await supabase.rpc('capa_board', {
      p_search: search ?? null,
      p_status: status ?? null,
      p_incident: incidentId ?? null,
      p_limit: limit,
    });
    if (error) {
      logger.error('capa_board فشل: ' + error.message, {
        component: 'OccupationalSafetySdk', action: 'actions',
      });
      throw SdkError.fromSupabaseError(error);
    }
    return ((data ?? []) as Raw[]).map((r) => ({
      id:               str(r.id),
      incidentId:       strOrNull(r.incident_id),
      incidentTitle:    strOrNull(r.incident_title),
      title:            str(r.title),
      description:      strOrNull(r.description),
      priority:         str(r.priority),
      status:           str(r.status),
      ownerId:          strOrNull(r.owner_id),
      ownerName:        strOrNull(r.owner_name),
      dueDate:          strOrNull(r.due_date),
      daysToDue:        numOrNull(r.days_to_due),
      isOverdue:        bool(r.is_overdue),
      startedAt:        strOrNull(r.started_at),
      completedAt:      strOrNull(r.completed_at),
      completerName:    strOrNull(r.completer_name),
      verificationNote: strOrNull(r.verification_note),
      cancelReason:     strOrNull(r.cancel_reason),
      creatorName:      strOrNull(r.creator_name),
      createdAt:        strOrNull(r.created_at),
    }));
  }

  /** ملخّص المنظومة — عشرة عدّادات مُرشَّحةٌ بـRLS */
  async summary(): Promise<HealthSafetySummary> {
    const { data, error } = await supabase.rpc('health_safety_summary');
    if (error) {
      logger.error('health_safety_summary فشل: ' + error.message, {
        component: 'OccupationalSafetySdk', action: 'summary',
      });
      throw SdkError.fromSupabaseError(error);
    }
    const r = ((data ?? []) as Raw[])[0] ?? {};
    return {
      incidentsTotal:  num(r.incidents_total),
      incidentsOpen:   num(r.incidents_open),
      incidentsSevere: num(r.incidents_severe),
      incidentsNoCapa: num(r.incidents_no_capa),
      capaTotal:       num(r.capa_total),
      capaOpen:        num(r.capa_open),
      capaOverdue:     num(r.capa_overdue),
      capaCompleted:   num(r.capa_completed),
      capaCancelled:   num(r.capa_cancelled),
      capaUnassigned:  num(r.capa_unassigned),
    };
  }

  /**
   * فتح إجراءٍ تصحيحيّ.
   * ★ الحرّاس: `CAPA_NOT_STAFF` · `CAPA_TITLE_REQUIRED` ·
   *   `CAPA_BAD_PRIORITY` · ومحفّزُ `CAPA_DUE_TOO_OLD` (⑧)
   *   و FK المركَّب (②/③/④).
   */
  async openAction(input: CapaInput): Promise<string> {
    const { data, error } = await supabase.rpc('capa_open', {
      p_incident_id: input.incidentId ?? null,
      p_title:       input.title,
      p_description: input.description ?? null,
      p_priority:    input.priority ?? 'medium',
      p_owner_id:    input.ownerId ?? null,
      p_due_date:    input.dueDate ?? null,
    });
    if (error) throw SdkError.fromSupabaseError(error);
    return str(data);
  }

  /** بدء التنفيذ — يملأ `started_at` آلياً */
  async startAction(id: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('capa_start', { p_id: id });
    if (error) throw SdkError.fromSupabaseError(error);
    return bool(data);
  }

  /**
   * ★★★ العطل ⑥: الإنجاز يملأ `completed_at` و`completed_by` آلياً.
   *   قبل 0369 كان «مكتمل» يُقبل بلا مُنجِزٍ ولا لحظة — وسجلُّ CAPA
   *   **وثيقةٌ تدقيقية**.
   * ★ `verification` هي ملاحظة التحقّق من فاعلية الإجراء.
   */
  async completeAction(id: string, verification?: string | null): Promise<boolean> {
    const { data, error } = await supabase.rpc('capa_complete', {
      p_id: id, p_verification: verification ?? null,
    });
    if (error) throw SdkError.fromSupabaseError(error);
    return bool(data);
  }

  /**
   * ★★★ العطل ⑦: الإلغاء — حالةٌ كانت في CHECK **بلا عمودٍ لتعليلها
   *   وبلا زرٍّ في الصفحة**. وهو أيضاً بديل الحذف (العطل ⑪).
   */
  async cancelAction(id: string, reason: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('capa_cancel', {
      p_id: id, p_reason: reason,
    });
    if (error) throw SdkError.fromSupabaseError(error);
    return bool(data);
  }
}

export const occupationalSafetySdk = new OccupationalSafetySdk();
