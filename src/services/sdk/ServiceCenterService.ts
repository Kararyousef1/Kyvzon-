/**
 * ════════════════════════════════════════════════════════════════
 *  ServiceCenterService — مركز خدمات الموارد البشرية (migration 0367)
 *
 *  ★★★ الأعطال التي يُصلحها — كلها مُثبتة تشغيلياً على Postgres 17
 *      قبل كتابة سطر واحد (`_probe_0367.sql`/`_probe_0367b.sql`
 *      على قاعدةٍ نظيفة بـ295 مايجريشناً).
 *
 *  ★ إنصافاً للجدولين: فيهما CHECK جيّدةٌ على المفردات، و`tenant_id`
 *    و`employee_id` كلاهما NOT NULL. الأعطال **في الجدار الأمنيّ**.
 *
 *  ═══════════ أعطال الجدار — وهي الأخطر ═══════════
 *
 *  ① ★★★★ **الموظف يُصدر شهادة راتبه ويعتمدها ويُسلّمها بنفسه.**
 *     السياسة القديمة `kyvzon_letter_requests_write` كانت
 *     `polcmd = '*'` (ALL) — SELECT و INSERT و UPDATE و DELETE معاً،
 *     والموظف يمرّ منها بشرط `employee_id = current_user_employee_id()`.
 *     RLS_4 بدور `authenticated` حقيقيّ:
 *        UPDATE … SET status='delivered',
 *                     document_url='http://fake/شهادة-راتب-مزوّرة.pdf',
 *                     reviewed_by = <الموظف نفسه>
 *        ⇒ **حدّث 1 صفّاً · الحالة=delivered**
 *     شهادة الراتب تُقدَّم للمصارف والسفارات — والموظف يُنشئها ويرفع
 *     ملفّها ويكتب أنه راجعها ويُعلن تسليمها **بلا مرور HR إطلاقاً**.
 *
 *  ② ★★★ **الموظف يُغلق شكواه ويكتب «تم الحل»** (RLS_2 = 1 صفّ).
 *  ③ ★★★ **الموظف يُسنِد الطلب لنفسه** (RLS_3 = 1 صفّ).
 *  ④ ★★★ **الموظف يحذف طلب خطابه نهائياً** (RLS_5 = 1 صفّ).
 *  ⑤ ★★ **شرطٌ ميّتٌ في ثلاث سياسات**: `employee_id = auth.uid()` —
 *     صفوف `employees` حيث `id = user_id` = **0 من 5**.
 *
 *  ═══════════ أعطال الترابط ═══════════
 *
 *  ⑦/⑧/⑨/⑩ **صفر FK**: طلبٌ لموظفٍ معدوم · موظفٌ من مستأجرٍ آخر ·
 *     شهادةُ راتبٍ لموظفٍ معدوم · مُسنَدٌ إلى مستخدمٍ معدوم — قُبِلت كلُّها.
 *  ⑪ **الموضوع والوصف من مسافات** — `NOT NULL` لا يمنعها.
 *  ⑫ ★★★ **«تم الحل» بلا ملخّصٍ ولا لحظة**.
 *  ⑬ ★★★ **«تم التسليم» بلا ملفّ خطاب** — الموظف يرى «سُلِّم» ولا شيء
 *     ليُنزّله.
 *  ⑭ ★★★ **«مرفوض» بلا سبب — ولا عمود أصلاً.** مفردةٌ في CHECK بلا
 *     مكانٍ لتعليلها **وبلا زرٍّ في الصفحة**.
 *  ⑮ ★★★ **`sla_due_at` عمودٌ ميّت**: دوالٌ تذكره = 0 · محفّزات = 0 ·
 *     صفوفٌ ممتلئة = 0. عمودُ الاستحقاق في نظام خدماتٍ لا يُملأ أبداً.
 *  ⑯ ★★★ **صفر دالة في المنظومة** — الصفحة تكتب مباشرةً عبر
 *     `BaseService.update()`، فكلُّ حارسٍ منطقيٍّ غائبٌ بالضرورة.
 *
 *  ★ الصفحة لا تلمس Supabase — كل شيء عبر هذه الطبقة.
 * ════════════════════════════════════════════════════════════════
 */
import { supabase } from '../supabase/supabase';
import { logger } from '../utils/logger';
import { SdkError } from './BaseService';

/** ★ حالات الطلب الخمس — مطابِقة لـ`hr_cases_status_check` */
export const CASE_STATES = [
  'open', 'in_review', 'waiting_employee', 'resolved', 'closed',
] as const;
export type CaseState = (typeof CASE_STATES)[number];

/** ★ الأولويات الثلاث — مطابِقة لـ`hr_cases_priority_check` */
export const CASE_PRIORITIES = ['low', 'normal', 'urgent'] as const;
export type CasePriority = (typeof CASE_PRIORITIES)[number];

/** ★ القنوات الأربع — مطابِقة لـ`hr_cases_channel_check` */
export const CASE_CHANNELS = ['employee_portal', 'tawathul', 'email', 'phone'] as const;
export type CaseChannel = (typeof CASE_CHANNELS)[number];

/**
 * ★★ أنواع الطلبات. القاعدة **لا تُقيّدها بـCHECK** (لا قيد على
 *   `case_type`) — فهذه قائمةُ الواجهة، ودوالُ العرض تُعيد النصّ
 *   الخامّ لأيّ مفردةٍ خارجها بدل `undefined`.
 */
export const CASE_TYPES = [
  'general_inquiry', 'payroll', 'benefits', 'documents',
  'attendance', 'attendance_correction', 'work_environment',
] as const;
export type CaseType = (typeof CASE_TYPES)[number];

/** ★ أنواع الخطابات الأربعة — مطابِقة لـ`..._letter_type_check` */
export const LETTER_TYPES = [
  'employment_verification', 'salary_certificate', 'experience_letter', 'other',
] as const;
export type LetterType = (typeof LETTER_TYPES)[number];

/** ★ حالات الخطاب الخمس — مطابِقة لـ`..._status_check` */
export const LETTER_STATES = [
  'submitted', 'in_review', 'ready', 'delivered', 'rejected',
] as const;
export type LetterState = (typeof LETTER_STATES)[number];

export const LETTER_LANGUAGES = ['ar', 'en', 'both'] as const;
export type LetterLanguage = (typeof LETTER_LANGUAGES)[number];

export const LETTER_DELIVERIES = ['portal', 'email', 'printed'] as const;
export type LetterDelivery = (typeof LETTER_DELIVERIES)[number];

export const CASE_STATE_AR: Record<CaseState, string> = {
  open:             'مفتوح',
  in_review:        'قيد المراجعة',
  waiting_employee: 'بانتظار الموظف',
  resolved:         'تم الحل',
  closed:           'مغلق',
};

export const CASE_PRIORITY_AR: Record<CasePriority, string> = {
  low:    'منخفضة',
  normal: 'عادية',
  urgent: 'عاجلة',
};

export const CASE_CHANNEL_AR: Record<CaseChannel, string> = {
  employee_portal: 'بوابة الموظف',
  tawathul:        'تواصل',
  email:           'البريد',
  phone:           'الهاتف',
};

export const CASE_TYPE_AR: Record<CaseType, string> = {
  general_inquiry:       'استفسار عام',
  payroll:               'الرواتب',
  benefits:              'المزايا',
  documents:             'المستندات',
  attendance:            'الحضور',
  attendance_correction: 'تصحيح حضور',
  work_environment:      'بيئة العمل',
};

export const LETTER_TYPE_AR: Record<LetterType, string> = {
  employment_verification: 'إثبات عمل',
  salary_certificate:      'شهادة راتب',
  experience_letter:       'شهادة خبرة',
  other:                   'خطاب آخر',
};

export const LETTER_STATE_AR: Record<LetterState, string> = {
  submitted: 'مُقدَّم',
  in_review: 'قيد المراجعة',
  ready:     'جاهز',
  delivered: 'تم التسليم',
  rejected:  'مرفوض',
};

/** ★ العطل ㉑: كانت تُعرض نصّاً إنجليزياً خامّاً */
export const LETTER_LANGUAGE_AR: Record<LetterLanguage, string> = {
  ar:   'عربي',
  en:   'إنجليزي',
  both: 'عربي وإنجليزي',
};

export const LETTER_DELIVERY_AR: Record<LetterDelivery, string> = {
  portal:  'عبر البوابة',
  email:   'بريد إلكتروني',
  printed: 'نسخة مطبوعة',
};

export const CASE_STATE_TONE: Record<CaseState, string> = {
  open:             'bg-blue-50 text-blue-700 border-blue-200',
  in_review:        'bg-indigo-50 text-indigo-700 border-indigo-200',
  waiting_employee: 'bg-amber-50 text-amber-700 border-amber-200',
  resolved:         'bg-emerald-50 text-emerald-700 border-emerald-200',
  closed:           'bg-slate-100 text-slate-600 border-slate-200',
};

export const CASE_PRIORITY_TONE: Record<CasePriority, string> = {
  low:    'bg-slate-100 text-slate-600 border-slate-200',
  normal: 'bg-sky-50 text-sky-700 border-sky-200',
  urgent: 'bg-red-50 text-red-700 border-red-200',
};

export const LETTER_STATE_TONE: Record<LetterState, string> = {
  submitted: 'bg-blue-50 text-blue-700 border-blue-200',
  in_review: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  ready:     'bg-purple-50 text-purple-700 border-purple-200',
  delivered: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected:  'bg-red-50 text-red-700 border-red-200',
};

const NEUTRAL_TONE = 'bg-slate-100 text-slate-600 border-slate-200';

/** ★★ كلُّ دوال العرض تُعيد النصّ الخامّ لا `undefined` عند مفردةٍ مجهولة */
export const caseStateLabel = (v: string): string =>
  CASE_STATE_AR[v as CaseState] ?? v;
export const casePriorityLabel = (v: string): string =>
  CASE_PRIORITY_AR[v as CasePriority] ?? v;
export const caseChannelLabel = (v: string): string =>
  CASE_CHANNEL_AR[v as CaseChannel] ?? v;
export const caseTypeLabel = (v: string): string =>
  CASE_TYPE_AR[v as CaseType] ?? v;
export const letterTypeLabel = (v: string): string =>
  LETTER_TYPE_AR[v as LetterType] ?? v;
export const letterStateLabel = (v: string): string =>
  LETTER_STATE_AR[v as LetterState] ?? v;
export const letterLanguageLabel = (v: string): string =>
  LETTER_LANGUAGE_AR[v as LetterLanguage] ?? v;
export const letterDeliveryLabel = (v: string): string =>
  LETTER_DELIVERY_AR[v as LetterDelivery] ?? v;

export const caseStateTone = (v: string): string =>
  CASE_STATE_TONE[v as CaseState] ?? NEUTRAL_TONE;
export const casePriorityTone = (v: string): string =>
  CASE_PRIORITY_TONE[v as CasePriority] ?? NEUTRAL_TONE;
export const letterStateTone = (v: string): string =>
  LETTER_STATE_TONE[v as LetterState] ?? NEUTRAL_TONE;

/** ★ الحالات المُنجزة — لا تُعرض لها أزرار قرار */
export const CASE_CLOSED_STATES: readonly CaseState[] = ['resolved', 'closed'] as const;
export const isCaseClosed = (v: string): boolean =>
  (CASE_CLOSED_STATES as readonly string[]).includes(v);
export const LETTER_FINAL_STATES: readonly LetterState[] = ['delivered', 'rejected'] as const;
export const isLetterFinal = (v: string): boolean =>
  (LETTER_FINAL_STATES as readonly string[]).includes(v);

export interface CaseRow {
  id: string;
  employeeId: string;
  /** ★ مُركَّبٌ في القاعدة — `full_name_ar` فارغٌ بنيوياً */
  employeeName: string;
  employeeCode: string;
  caseType: CaseType | string;
  subject: string;
  description: string;
  priority: CasePriority | string;
  status: CaseState | string;
  channel: CaseChannel | string;
  assignedTo: string | null;
  assigneeName: string | null;
  resolutionSummary: string | null;
  slaDueAt: string | null;
  /** ★★★ محسوبٌ في القاعدة · سالبٌ = متأخّر */
  hoursToSla: number | null;
  /** ★★★ العطل ⑮ مرئيّاً: متأخّرٌ ولمّا يُغلق */
  isOverdue: boolean;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  reopenedCount: number;
  createdAt: string | null;
}

export interface LetterRow {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  letterType: LetterType | string;
  purpose: string | null;
  language: LetterLanguage | string;
  deliveryMethod: LetterDelivery | string;
  status: LetterState | string;
  documentUrl: string | null;
  /** ★★★ العطل ⑭: عمودٌ لم يكن موجوداً */
  rejectionReason: string | null;
  reviewedBy: string | null;
  reviewerName: string | null;
  reviewedAt: string | null;
  issuedAt: string | null;
  deliveredAt: string | null;
  /** ★★★ بتوقيت بغداد · `null` للمُنجز */
  waitingDays: number | null;
  createdAt: string | null;
}

export interface ServiceCenterSummary {
  casesTotal: number;
  casesOpen: number;
  casesUrgent: number;
  casesResolved: number;
  /** ★★★ العطل ⑮: تجاوز موعد الاستحقاق ولمّا يُغلق */
  casesOverdue: number;
  casesUnassigned: number;
  casesNoResponse: number;
  casesReopened: number;
  lettersTotal: number;
  lettersPending: number;
  lettersReady: number;
  lettersDelivered: number;
  lettersRejected: number;
}

export interface CaseInput {
  employeeId?: string | null;
  caseType: CaseType;
  subject: string;
  description: string;
  priority?: CasePriority;
  channel?: CaseChannel;
}

export interface LetterInput {
  employeeId?: string | null;
  letterType: LetterType;
  purpose?: string | null;
  language?: LetterLanguage;
  deliveryMethod?: LetterDelivery;
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
const bool = (v: unknown): boolean => v === true || v === 'true' || v === 't';

class ServiceCenterSdk {
  /**
   * لوح طلبات الخدمة — استعلامٌ واحد.
   *
   * ★ العطلان ⑱/⑲ في الصفحة القديمة: ثلاثة استعلاماتٍ بلا حدّ، منها
   *   جلبُ **كل** الموظفين بـ`orderBy: 'full_name_ar'` وهو عمودٌ
   *   معدومٌ لكل موظف، ثم بناء `Map` يدويّ.
   * ★★★ `hoursToSla` و`isOverdue` محسوبان في القاعدة لا بساعة المتصفّح.
   */
  async cases(
    search?: string | null,
    status?: CaseState | null,
    priority?: CasePriority | null,
    limit = 200,
  ): Promise<CaseRow[]> {
    const { data, error } = await supabase.rpc('hr_case_board', {
      p_search:   search ?? null,
      p_status:   status ?? null,
      p_priority: priority ?? null,
      p_limit:    limit,
    });
    if (error) {
      logger.error('hr_case_board فشل: ' + error.message, {
        component: 'ServiceCenterSdk', action: 'cases',
      });
      throw SdkError.fromSupabaseError(error);
    }
    return ((data ?? []) as Raw[]).map((r) => ({
      id:                str(r.id),
      employeeId:        str(r.employee_id),
      employeeName:      str(r.employee_name),
      employeeCode:      str(r.employee_code),
      caseType:          str(r.case_type),
      subject:           str(r.subject),
      description:       str(r.description),
      priority:          str(r.priority),
      status:            str(r.status),
      channel:           str(r.channel),
      assignedTo:        strOrNull(r.assigned_to),
      assigneeName:      strOrNull(r.assignee_name),
      resolutionSummary: strOrNull(r.resolution_summary),
      slaDueAt:          strOrNull(r.sla_due_at),
      hoursToSla:        numOrNull(r.hours_to_sla),
      isOverdue:         bool(r.is_overdue),
      firstResponseAt:   strOrNull(r.first_response_at),
      resolvedAt:        strOrNull(r.resolved_at),
      closedAt:          strOrNull(r.closed_at),
      reopenedCount:     num(r.reopened_count),
      createdAt:         strOrNull(r.created_at),
    }));
  }

  /** لوح طلبات الخطابات */
  async letters(
    search?: string | null,
    status?: LetterState | null,
    type?: LetterType | null,
    limit = 200,
  ): Promise<LetterRow[]> {
    const { data, error } = await supabase.rpc('letter_request_board', {
      p_search: search ?? null,
      p_status: status ?? null,
      p_type:   type ?? null,
      p_limit:  limit,
    });
    if (error) {
      logger.error('letter_request_board فشل: ' + error.message, {
        component: 'ServiceCenterSdk', action: 'letters',
      });
      throw SdkError.fromSupabaseError(error);
    }
    return ((data ?? []) as Raw[]).map((r) => ({
      id:              str(r.id),
      employeeId:      str(r.employee_id),
      employeeName:    str(r.employee_name),
      employeeCode:    str(r.employee_code),
      letterType:      str(r.letter_type),
      purpose:         strOrNull(r.purpose),
      language:        str(r.language),
      deliveryMethod:  str(r.delivery_method),
      status:          str(r.status),
      documentUrl:     strOrNull(r.document_url),
      rejectionReason: strOrNull(r.rejection_reason),
      reviewedBy:      strOrNull(r.reviewed_by),
      reviewerName:    strOrNull(r.reviewer_name),
      reviewedAt:      strOrNull(r.reviewed_at),
      issuedAt:        strOrNull(r.issued_at),
      deliveredAt:     strOrNull(r.delivered_at),
      waitingDays:     numOrNull(r.waiting_days),
      createdAt:       strOrNull(r.created_at),
    }));
  }

  /** ملخّص المركز — ثلاثة عشر عدّاداً مُرشَّحةً بـRLS */
  async summary(): Promise<ServiceCenterSummary> {
    const { data, error } = await supabase.rpc('service_center_summary');
    if (error) {
      logger.error('service_center_summary فشل: ' + error.message, {
        component: 'ServiceCenterSdk', action: 'summary',
      });
      throw SdkError.fromSupabaseError(error);
    }
    const r = ((data ?? []) as Raw[])[0] ?? {};
    return {
      casesTotal:       num(r.cases_total),
      casesOpen:        num(r.cases_open),
      casesUrgent:      num(r.cases_urgent),
      casesResolved:    num(r.cases_resolved),
      casesOverdue:     num(r.cases_overdue),
      casesUnassigned:  num(r.cases_unassigned),
      casesNoResponse:  num(r.cases_no_response),
      casesReopened:    num(r.cases_reopened),
      lettersTotal:     num(r.letters_total),
      lettersPending:   num(r.letters_pending),
      lettersReady:     num(r.letters_ready),
      lettersDelivered: num(r.letters_delivered),
      lettersRejected:  num(r.letters_rejected),
    };
  }

  /**
   * فتح طلب خدمة.
   *
   * ★ `employeeId = null` ⇒ الطلب لصاحب السياق (الحالة الشائعة).
   * ★ الحرّاس: `CASE_NOT_OWNER` (لا تفتح باسم غيرك) ·
   *   `CASE_SUBJECT_REQUIRED` · `CASE_BAD_PRIORITY`.
   * ★★★ و`sla_due_at` يُملأ آلياً حسب الأولوية — كان عموداً ميتاً.
   */
  async openCase(input: CaseInput): Promise<string> {
    const { data, error } = await supabase.rpc('hr_case_open', {
      p_employee_id: input.employeeId ?? null,
      p_case_type:   input.caseType,
      p_subject:     input.subject,
      p_description: input.description,
      p_priority:    input.priority ?? 'normal',
      p_channel:     input.channel ?? 'employee_portal',
    });
    if (error) throw SdkError.fromSupabaseError(error);
    return str(data);
  }

  /**
   * ★★★ العطل ③: إسناد الطلب — للموارد البشرية وحدها.
   *   `assignee = null` ⇒ المستخدم الحاليّ. وينقل `open` ← `in_review`.
   */
  async assignCase(id: string, assignee?: string | null): Promise<boolean> {
    const { data, error } = await supabase.rpc('hr_case_assign', {
      p_id: id, p_assignee: assignee ?? null,
    });
    if (error) throw SdkError.fromSupabaseError(error);
    return bool(data);
  }

  /**
   * ★★★ العطل ②: تغيير حالة الطلب — للموارد البشرية وحدها.
   *   كان الموظف يُغلق شكواه ويكتب «تم الحل» (أُثبت بدور حقيقيّ).
   * ★★★ العطل ⑫: `CASE_SUMMARY_REQUIRED` — لا إغلاق بلا ملخّص.
   */
  async setCaseStatus(
    id: string,
    status: CaseState,
    summary?: string | null,
  ): Promise<string> {
    const { data, error } = await supabase.rpc('hr_case_set_status', {
      p_id: id, p_status: status, p_summary: summary ?? null,
    });
    if (error) throw SdkError.fromSupabaseError(error);
    return str(data);
  }

  /** طلب خطاب — الموظف لنفسه، أو HR لأيّ موظف */
  async openLetter(input: LetterInput): Promise<string> {
    const { data, error } = await supabase.rpc('letter_request_open', {
      p_employee_id: input.employeeId ?? null,
      p_letter_type: input.letterType,
      p_purpose:     input.purpose ?? null,
      p_language:    input.language ?? 'ar',
      p_delivery:    input.deliveryMethod ?? 'portal',
    });
    if (error) throw SdkError.fromSupabaseError(error);
    return str(data);
  }

  /**
   * ★★★★ العطل ①: إصدار الخطاب — **للموارد البشرية وحدها**.
   *
   *   قبل 0367 كان الموظف يرفع ملفّ شهادة راتبه ويكتب أنه راجعها
   *   ويُعلن تسليمها، بلا مرور HR إطلاقاً. أُثبت بدور `authenticated`
   *   حقيقيّ: «حدّث 1 صفّاً · الحالة=delivered».
   *
   * ★ الحرّاس: `LETTER_NOT_STAFF` · `LETTER_DOCUMENT_REQUIRED` ·
   *   `LETTER_ALREADY_CLOSED` (لا إعادة إصدارٍ لمُنجز).
   */
  async issueLetter(id: string, documentUrl: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('letter_request_issue', {
      p_id: id, p_document_url: documentUrl,
    });
    if (error) throw SdkError.fromSupabaseError(error);
    return bool(data);
  }

  /**
   * تسليم الخطاب.
   * ★★★ العطل ⑬: `LETTER_NOT_ISSUED` — لا تسليمَ لخطابٍ بلا ملفّ.
   */
  async deliverLetter(id: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('letter_request_deliver', {
      p_id: id,
    });
    if (error) throw SdkError.fromSupabaseError(error);
    return bool(data);
  }

  /**
   * ★★★ العطل ⑭: رفض الخطاب.
   *   `rejected` كانت مفردةً في CHECK **بلا عمودٍ لتعليلها وبلا زرٍّ
   *   في الصفحة** — حالةٌ لا سبيل إلى بلوغها. الآن لها سببٌ إلزاميّ.
   */
  async rejectLetter(id: string, reason: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('letter_request_reject', {
      p_id: id, p_reason: reason,
    });
    if (error) throw SdkError.fromSupabaseError(error);
    return bool(data);
  }
}

export const serviceCenterSdk = new ServiceCenterSdk();
