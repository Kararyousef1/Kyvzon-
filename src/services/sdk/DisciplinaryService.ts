/**
 * ════════════════════════════════════════════════════════════════
 *  DisciplinaryService — الإجراءات التأديبية (migration 0365)
 *
 *  ★★★ الأعطال التي يُصلحها — كلها مُثبتة تشغيلياً على Postgres 17
 *      قبل كتابة سطر واحد (المسباران `_probe_0365.sql`/`_probe_0365b.sql`
 *      على قاعدةٍ نظيفة بـ293 مايجريشناً · **ثلاثة عشر صفّاً فاسداً
 *      قُبِلت كلُّها**، ولا صفَّ واحداً رفضته القاعدة).
 *
 *  ★ الجدول كان **عارياً تماماً**: `pg_constraint` كاملاً سطران —
 *    `pkey` و FK على `tenants`. صفر CHECK · صفر FK على الموظف أو
 *    المُصدِر · صفر دالة · محفّزٌ واحدٌ عامّ (`updated_at`).
 *
 *  ① **`employee_id` بلا FK** — PROBE_1: إجراءٌ بحقّ موظفٍ معدوم قُبِل.
 *  ② **`issued_by` بلا FK** — PROBE_2: إجراءٌ لا يُعرف من أصدره.
 *     وعنوانه **`profiles`** لا `employees`: PROBE_17 على العيّنة
 *     نفسها = 12 تطابق profiles · **0** تطابق employees.
 *  ③ ★★★ **العبور بين المستأجرين** — PROBE_3: `tenant_id = ألف` مع
 *     موظفٍ من **باء** ⇒ قُبِل. الحلّ FK **مركَّب** لا مفرد.
 *  ④ ★★★ **`tenant_id` قابلٌ للعدم** — PROBE_4: صفٌّ يتيم. وكلُّ
 *     سياسات RLS تبدأ بـ`tenant_id = current_user_tenant_id()`
 *     و`NULL = x` ⇒ NULL ⇒ **الصفّ يختفي عن الجميع إلى الأبد**.
 *  ⑤/⑥/⑦ **`type`/`severity`/`status` بلا CHECK** — PROBE_5/6/7:
 *     `execution` · `apocalyptic` · `banana` ⇒ قُبِلت. والصفحة تعرض
 *     `DISCIPLINARY_TYPE_LABELS[action.type]` = `undefined`.
 *  ⑧ **واقعةٌ في المستقبل** — PROBE_8: عقابٌ على واقعةٍ بعد سنتين.
 *  ⑨ **`valid_until` قبل `incident_date`** — PROBE_9: إنذارٌ انتهى
 *     قبل أن يُكتب بأربعمئة يوم.
 *  ⑩ **`reason` ثلاث مسافات** — PROBE_10: **فصلٌ من العمل** بسببٍ
 *     نصُّه `'   '`. `NOT NULL` لا يمنع المسافات.
 *  ⑪ **الموظف يعاقب نفسه** — PROBE_11 (نظير محفّزَي 0361).
 *  ⑫ **`appeal_response` بلا تظلّم** — PROBE_12.
 *  ⑬ ★★★ **لا آليةَ تظلّمٍ إطلاقاً** — PROBE_13: دوال التأديب = **0**
 *     وأعمدة دورة الحياة = **0**. العمودان `is_appealed` و
 *     `appeal_response` يتيمان: لا متى، ولا ما نصُّه، ولا من بتّ.
 *  ⑭ ★★★ **لا انتهاءَ تلقائيّاً** — PROBE_14: صفّان `active` وقد
 *     انقضى أجلهما (أحدهما منذ مئتَي يوم) · دوال التحديث = **0**.
 *  ⑮ ★★★ **الحذف النهائيّ مسموح** — و HR **تمارسه فعلاً**: مسبار
 *     الـRLS بدور `authenticated` حقيقيّ أثبت «HR محا 1 سجلَّ إيقافٍ
 *     نهائياً بلا أثر». يخالف قاعدة المشروع: لا حذف نهائيّ.
 *  ⑯ ★★★★ **حقُّ التظلّم مكتوبٌ في الجدول وغيرُ قابلٍ للممارسة.**
 *     أخطر ما في الجولة:
 *        RLS_1: سالم يرى إجراءه.                = **1 صفّ** ✔
 *        RLS_2: سالم يُحدّث `is_appealed=TRUE`. = **0 صفّ** ✘
 *     لأن سياسة UPDATE تشترط `current_user_is_staff()` وهي
 *     admin·hr·developer·it_admin **فقط**. الموظف **يقرأ** عقوبته
 *     ولا يستطيع الاعتراض عليها بحرف. والصفحة لا تعرض زرَّ تظلّمٍ
 *     أصلاً ⇒ العطل مكتملُ الطبقات: لا واجهة ولا خدمة ولا سياسة.
 *     ★ ولا يجوز فتح UPDATE للموظف (سيُحرّر `type`/`severity`/`status`)
 *       ⇒ الحلُّ دالةُ `SECURITY DEFINER` تسمح بحقلَي التظلّم وحدهما.
 *
 *  ★ الصفحة لا تلمس Supabase — كل شيء عبر هذه الطبقة.
 * ════════════════════════════════════════════════════════════════
 */
import { supabase } from '../supabase/supabase';
import { logger } from '../utils/logger';
import { SdkError } from './BaseService';

/** ★ الأنواع الخمسة — مطابِقة لـ`chk_disciplinary_type` */
export const DISCIPLINARY_TYPES = [
  'verbal_warning', 'written_warning', 'suspension', 'demotion', 'termination',
] as const;
export type DisciplinaryKind = (typeof DISCIPLINARY_TYPES)[number];

/** ★ درجات الخطورة الأربع — مطابِقة لـ`chk_disciplinary_severity` */
export const DISCIPLINARY_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
export type DisciplinarySeverity = (typeof DISCIPLINARY_SEVERITIES)[number];

/**
 * ★★★ الحالات الخمس — مطابِقة لـ`chk_disciplinary_status`.
 *   قبل 0365 كان العمود بلا CHECK و`banana` قيمةٌ مقبولة.
 */
export const DISCIPLINARY_STATES = [
  'active', 'appealed', 'overturned', 'expired', 'revoked',
] as const;
export type DisciplinaryState = (typeof DISCIPLINARY_STATES)[number];

/** ★ قرارات التظلّم الثلاثة — مطابِقة لـ`chk_disciplinary_appeal_decision` */
export const APPEAL_DECISIONS = ['upheld', 'reduced', 'overturned'] as const;
export type AppealDecision = (typeof APPEAL_DECISIONS)[number];

export const DISCIPLINARY_KIND_AR: Record<DisciplinaryKind, string> = {
  verbal_warning:  'إنذار شفوي',
  written_warning: 'إنذار كتابي',
  suspension:      'إيقاف عن العمل',
  demotion:        'خفض درجة',
  termination:     'فصل من العمل',
};

export const DISCIPLINARY_SEVERITY_AR: Record<DisciplinarySeverity, string> = {
  low:      'منخفضة',
  medium:   'متوسطة',
  high:     'عالية',
  critical: 'حرجة',
};

export const DISCIPLINARY_STATE_AR: Record<DisciplinaryState, string> = {
  active:     'نافذ',
  appealed:   'قيد التظلّم',
  overturned: 'مُلغى بالتظلّم',
  expired:    'منتهي الأجل',
  revoked:    'مُلغى إدارياً',
};

export const APPEAL_DECISION_AR: Record<AppealDecision, string> = {
  upheld:     'مُثبَت',
  reduced:    'مُخفَّف',
  overturned: 'مُلغى',
};

export const DISCIPLINARY_STATE_TONE: Record<DisciplinaryState, string> = {
  active:     'bg-red-50 text-red-700 border-red-200',
  appealed:   'bg-amber-50 text-amber-700 border-amber-200',
  overturned: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  expired:    'bg-slate-100 text-slate-600 border-slate-200',
  revoked:    'bg-indigo-50 text-indigo-700 border-indigo-200',
};

export const DISCIPLINARY_SEVERITY_TONE: Record<DisciplinarySeverity, string> = {
  low:      'bg-slate-100 text-slate-600 border-slate-200',
  medium:   'bg-amber-50 text-amber-700 border-amber-200',
  high:     'bg-orange-50 text-orange-700 border-orange-200',
  critical: 'bg-red-50 text-red-700 border-red-200',
};

export const DISCIPLINARY_KIND_TONE: Record<DisciplinaryKind, string> = {
  verbal_warning:  'bg-amber-50 text-amber-700 border-amber-200',
  written_warning: 'bg-orange-50 text-orange-700 border-orange-200',
  suspension:      'bg-red-50 text-red-700 border-red-200',
  demotion:        'bg-purple-50 text-purple-700 border-purple-200',
  termination:     'bg-rose-100 text-rose-800 border-rose-300',
};

/**
 * ★★ دوالُ العرض تُعيد النصّ الخامّ عند وصول مفردةٍ غير معروفة بدل
 *   `undefined`. قبل 0365 كان الجدول بلا CHECK فكان هذا واقعاً لا
 *   احتمالاً (PROBE_5: `type='execution'` ⇒ شارةٌ فارغة في الواجهة).
 */
export const disciplinaryKindLabel = (v: string): string =>
  DISCIPLINARY_KIND_AR[v as DisciplinaryKind] ?? v;
export const disciplinarySeverityLabel = (v: string): string =>
  DISCIPLINARY_SEVERITY_AR[v as DisciplinarySeverity] ?? v;
export const disciplinaryStateLabel = (v: string): string =>
  DISCIPLINARY_STATE_AR[v as DisciplinaryState] ?? v;
export const appealDecisionLabel = (v: string): string =>
  APPEAL_DECISION_AR[v as AppealDecision] ?? v;

const NEUTRAL_TONE = 'bg-slate-100 text-slate-600 border-slate-200';
export const disciplinaryStateTone = (v: string): string =>
  DISCIPLINARY_STATE_TONE[v as DisciplinaryState] ?? NEUTRAL_TONE;
export const disciplinarySeverityTone = (v: string): string =>
  DISCIPLINARY_SEVERITY_TONE[v as DisciplinarySeverity] ?? NEUTRAL_TONE;
export const disciplinaryKindTone = (v: string): string =>
  DISCIPLINARY_KIND_TONE[v as DisciplinaryKind] ?? NEUTRAL_TONE;

/** ★ الأنواع الثلاثة الشديدة — تُعرض بتحذيرٍ خاصّ في الصفحة */
export const SEVERE_KINDS: readonly DisciplinaryKind[] =
  ['suspension', 'demotion', 'termination'] as const;
export const isSevereKind = (v: string): boolean =>
  (SEVERE_KINDS as readonly string[]).includes(v);

export interface DisciplinaryRow {
  id: string;
  employeeId: string;
  /** ★ مُركَّبٌ في القاعدة من first_name/last_name — `full_name_ar` فارغٌ بنيوياً */
  employeeName: string;
  employeeCode: string;
  kind: DisciplinaryKind | string;
  severity: DisciplinarySeverity | string;
  status: DisciplinaryState | string;
  reason: string;
  description: string | null;
  incidentDate: string | null;
  validUntil: string | null;
  /** ★★★ محسوبٌ بتوقيت بغداد لا بالمتصفّح · `null` = بلا أجل */
  daysRemaining: number | null;
  isExpiringSoon: boolean;
  issuedBy: string;
  issuerName: string;
  acknowledgedAt: string | null;
  isAppealed: boolean;
  appealedAt: string | null;
  appealReason: string | null;
  appealDecision: AppealDecision | string | null;
  appealResponse: string | null;
  appealDecidedAt: string | null;
  appealDecider: string | null;
  revokedAt: string | null;
  revocationReason: string | null;
  /** ★★★ العطل ⑯: هل يملك المستخدم الحاليّ حقَّ التظلّم على هذا الصفّ */
  canAppeal: boolean;
  createdAt: string | null;
}

export interface DisciplinarySummary {
  total: number;
  active: number;
  appealed: number;
  overturned: number;
  expired: number;
  revoked: number;
  verbal: number;
  written: number;
  severe: number;
  criticalActive: number;
  unacknowledged: number;
  expiringSoon: number;
  /** ★★★ «نافذٌ» وقد انقضى أجله — التناقض الذي يكشفه العطل ⑭ */
  overdueExpiry: number;
}

export interface DisciplinaryInput {
  employeeId: string;
  kind: DisciplinaryKind;
  reason: string;
  severity?: DisciplinarySeverity;
  description?: string | null;
  incidentDate?: string | null;
  validUntil?: string | null;
}

type Raw = Record<string, unknown>;

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
/** ★ يحفظ التمييز بين «صفر يوم» و«بلا أجل» (درس 0353) */
const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string => (v == null ? '' : String(v));
const strOrNull = (v: unknown): string | null =>
  v == null || String(v) === '' ? null : String(v);
const bool = (v: unknown): boolean => v === true || v === 'true' || v === 't';

class DisciplinarySdk {
  /**
   * لوح الإجراءات — استعلامٌ واحد.
   *
   * ★ العطل ⑯ في الصفحة القديمة: جلبت **كل** الموظفين
   *   (`employeeService.findAll({ orderBy: 'full_name_ar' })`) وبنت
   *   `Map` يدوياً — و`full_name_ar` معدومٌ لكل موظف فالفرز بلا معنى.
   * ★★★ `daysRemaining` محسوبٌ **بتوقيت بغداد** في القاعدة.
   * ★★★ `canAppeal` يعتمد `current_user_employee_id()` — لا يمكن
   *   حسابه في المتصفّح لأن `employees.id ≠ auth.uid()`.
   */
  async board(
    search?: string | null,
    status?: DisciplinaryState | null,
    kind?: DisciplinaryKind | null,
    limit = 200,
  ): Promise<DisciplinaryRow[]> {
    const { data, error } = await supabase.rpc('disciplinary_board', {
      p_search: search ?? null,
      p_status: status ?? null,
      p_type:   kind ?? null,
      p_limit:  limit,
    });
    if (error) {
      logger.error('disciplinary_board فشل: ' + error.message, {
        component: 'DisciplinarySdk', action: 'board',
      });
      throw SdkError.fromSupabaseError(error);
    }
    return ((data ?? []) as Raw[]).map((r) => ({
      id:               str(r.id),
      employeeId:       str(r.employee_id),
      employeeName:     str(r.employee_name),
      employeeCode:     str(r.employee_code),
      kind:             str(r.type),
      severity:         str(r.severity),
      status:           str(r.status),
      reason:           str(r.reason),
      description:      strOrNull(r.description),
      incidentDate:     strOrNull(r.incident_date),
      validUntil:       strOrNull(r.valid_until),
      daysRemaining:    numOrNull(r.days_remaining),
      isExpiringSoon:   bool(r.is_expiring_soon),
      issuedBy:         str(r.issued_by),
      issuerName:       str(r.issuer_name),
      acknowledgedAt:   strOrNull(r.acknowledged_at),
      isAppealed:       bool(r.is_appealed),
      appealedAt:       strOrNull(r.appealed_at),
      appealReason:     strOrNull(r.appeal_reason),
      appealDecision:   strOrNull(r.appeal_decision),
      appealResponse:   strOrNull(r.appeal_response),
      appealDecidedAt:  strOrNull(r.appeal_decided_at),
      appealDecider:    strOrNull(r.appeal_decider),
      revokedAt:        strOrNull(r.revoked_at),
      revocationReason: strOrNull(r.revocation_reason),
      canAppeal:        bool(r.can_appeal),
      createdAt:        strOrNull(r.created_at),
    }));
  }

  /** ملخّص الإجراءات — محسوبٌ في القاعدة ومُرشَّحٌ بـRLS */
  async summary(): Promise<DisciplinarySummary> {
    const { data, error } = await supabase.rpc('disciplinary_summary');
    if (error) {
      logger.error('disciplinary_summary فشل: ' + error.message, {
        component: 'DisciplinarySdk', action: 'summary',
      });
      throw SdkError.fromSupabaseError(error);
    }
    const r = ((data ?? []) as Raw[])[0] ?? {};
    return {
      total:          num(r.total),
      active:         num(r.active),
      appealed:       num(r.appealed),
      overturned:     num(r.overturned),
      expired:        num(r.expired),
      revoked:        num(r.revoked),
      verbal:         num(r.verbal),
      written:        num(r.written),
      severe:         num(r.severe),
      criticalActive: num(r.critical_active),
      unacknowledged: num(r.unacknowledged),
      expiringSoon:   num(r.expiring_soon),
      overdueExpiry:  num(r.overdue_expiry),
    };
  }

  /**
   * إصدار إجراءٍ تأديبيّ.
   *
   * ★ الحرّاس: `DISCIPLINARY_NOT_STAFF` · `_REASON_REQUIRED` ·
   *   `_BAD_TYPE` · `_BAD_SEVERITY` · ومحفّزُ `_FUTURE_INCIDENT` (⑧)
   *   و`_SELF_ISSUE` (⑪) · و FK المركَّب (①/③).
   * ★ الصفحة القديمة كانت تُرسل `issued_by: user?.id` من المتصفّح —
   *   الآن `auth.uid()` في القاعدة، لا يُزوَّر.
   */
  async issue(input: DisciplinaryInput): Promise<string> {
    const { data, error } = await supabase.rpc('disciplinary_issue', {
      p_employee_id:   input.employeeId,
      p_type:          input.kind,
      p_reason:        input.reason,
      p_severity:      input.severity ?? 'low',
      p_description:   input.description ?? null,
      p_incident_date: input.incidentDate ?? null,
      p_valid_until:   input.validUntil ?? null,
    });
    if (error) throw SdkError.fromSupabaseError(error);
    return str(data);
  }

  /**
   * ★★★ العطل ⑯: تظلّمُ الموظف.
   *
   *   الموظف **لا يملك UPDATE** على الجدول (سياسة UPDATE تشترط
   *   `current_user_is_staff()`)، ولا يجوز فتحها له وإلّا حرّر
   *   `type` و`severity` و`status`. هذه الدالة `SECURITY DEFINER`
   *   تسمح بحقلَي التظلّم **وحدهما**.
   *
   * ★ الحرّاس: `_NOT_OWNER` · `_ALREADY_APPEALED` · `_NOT_ACTIVE` ·
   *   `_APPEAL_REASON_REQUIRED` · وترشيح المستأجر (`_NOT_FOUND`).
   */
  async appeal(id: string, reason: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('disciplinary_appeal', {
      p_id: id, p_reason: reason,
    });
    if (error) throw SdkError.fromSupabaseError(error);
    return bool(data);
  }

  /**
   * البتّ في التظلّم — للموارد البشرية.
   *
   * ★★★ التعليل **إلزاميّ** (`_RESPONSE_REQUIRED`) — تعميمٌ لدرس
   *   العطل ⑲ في 0363: قرارٌ بلا سببٍ يضيع تعليله إلى الأبد.
   * ★ `reduced` يُنزل درجة الخطورة **فعلياً** لا لفظاً:
   *   critical→high · high→medium · وما دونهما→low.
   *
   * @returns الحالة الجديدة: `overturned` أو `active`
   */
  async decideAppeal(
    id: string,
    decision: AppealDecision,
    response: string,
  ): Promise<string> {
    const { data, error } = await supabase.rpc('disciplinary_appeal_decide', {
      p_id: id, p_decision: decision, p_response: response,
    });
    if (error) throw SdkError.fromSupabaseError(error);
    return str(data);
  }

  /**
   * إقرار الموظف باطّلاعه على الإجراء.
   *
   * ★ يُسجَّل مرّةً واحدة — النداء الثاني يُعيد `false` ولا يدهس
   *   الطابع الأول (تأكيد 6.1).
   */
  async acknowledge(id: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('disciplinary_acknowledge', {
      p_id: id,
    });
    if (error) throw SdkError.fromSupabaseError(error);
    return bool(data);
  }

  /**
   * ★★★ العطل ⑮: الإلغاء الإداريّ — **بديل الحذف**.
   *
   *   قبل 0365 كانت HR تحذف السجلّ التأديبيّ حذفاً نهائياً بدور
   *   `authenticated` حقيقيّ (أُثبت في مسبار RLS). الآن يمنعه محفّز
   *   `DISCIPLINARY_DELETE_BLOCKED` وهذا هو البديل السليم: الحالة
   *   تصير `revoked` مع سببٍ وفاعلٍ ولحظة، والسجلّ يبقى.
   */
  async revoke(id: string, reason: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('disciplinary_revoke', {
      p_id: id, p_reason: reason,
    });
    if (error) throw SdkError.fromSupabaseError(error);
    return bool(data);
  }

  /**
   * ★★★ العطل ⑭: ترحيل الإجراءات منتهية الأجل إلى `expired`.
   *
   *   لم يكن في المنظومة أيُّ مسارٍ يُحدّث الحالة — صفّان «نافذان»
   *   انقضى أجلهما (أحدهما منذ مئتَي يوم). معزولةٌ بالمستأجر
   *   (أُثبت بصفٍّ أجنبيٍّ حقيقيّ) و idempotent (النداء الثاني = 0).
   *
   * @returns عدد الإجراءات المُرحَّلة
   */
  async expireDue(): Promise<number> {
    const { data, error } = await supabase.rpc('disciplinary_expire_due');
    if (error) throw SdkError.fromSupabaseError(error);
    return num(data);
  }
}

export const disciplinarySdk = new DisciplinarySdk();
