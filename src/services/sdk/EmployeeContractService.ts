/**
 * ════════════════════════════════════════════════════════════════
 *  EmployeeContractService — عقود الموظفين (migration 0364)
 *
 *  ★★★ الأعطال التي يُصلحها — كلها مُثبتة تشغيلياً على Postgres 17
 *      قبل كتابة سطر واحد (المسبار: tools/dev/_probe_0364.sql):
 *
 *  ① ★★★ **شرطٌ ميّتٌ في سياسة القراءة: `employee_id = auth.uid()`.**
 *     `employee_id` = `employees.id` و`auth.uid()` = `auth.users.id`.
 *     PROBE_1: يتساويان؟ **false** · صفوف `employees` حيث
 *     `id = user_id`: **0** ⇒ الشرط لا يُطابق صفّاً أبداً. شيفرةٌ ميتة
 *     في جدارٍ أمنيّ تُوحي بأمانٍ مزدوج غير موجود.
 *
 *  ②/③ **`employee_id` بلا FK** — معدومٌ (PROBE_2) أو من **مستأجرٍ
 *     آخر** (PROBE_3) ⇒ قُبِلا.
 *  ④ **`end_date` قبل `start_date`** — PROBE_4: عقدٌ ينتهي قبل أن
 *     يبدأ بأربعمئة يوم ⇒ قُبِل.
 *  ⑤ ★★★ **عقودٌ نشطةٌ متداخلة** — PROBE_5: **ثلاثة** عقودٍ نشطة
 *     لسالم. أيُّها النافذ؟ والراتب المرجعيّ ثلاثة أرقام متناقضة.
 *  ⑥ **`fixed_term` بلا `end_date`** (PROBE_6) ⇒ تناقضٌ في التسمية.
 *  ⑦ ★★★ **الحالة لا تتغيّر — المنتهي يبقى «نشطاً»**: PROBE_7
 *     عقدان `active` انتهيا فعلاً · ودوالٌ تُحدّث الحالة = **صفر**.
 *  ⑧ `renewal_notice_days` يقبل `-30` (PROBE_8).
 *  ⑨ `salary_amount` سالب و`salary_currency` بلا CHECK (PROBE_9).
 *  ⑩ ★★★ **الحذف النهائيّ مسموح** بدور `authenticated` (PROBE_10) —
 *     عقد العمل وثيقةٌ قانونية.
 *  ⑪ ★★★ **التجديد بلا سجلّ**: `renewContract` تكتب `end_date` فوق
 *     القديم. PROBE_11: أعمدة التتبّع **★ لا شيء** · جدول التاريخ
 *     **★ معدوم** ⇒ عقدٌ جُدِّد خمس مرّات يبدو عقداً واحداً.
 *  ⑫ **الإنهاء بلا سبب ولا تاريخ** (PROBE_12).
 *  ⑬ **العقد جزيرةٌ معزولة** — لا ربط بالتوظيف (0362) ولا بإنهاء
 *     الخدمة (0359). PROBE_13: **★ لا شيء**.
 *  ⑭ **صفر دالة** (PROBE_14).
 *  ⑮ ★★★ **الحساب بتوقيت المتصفّح**: `differenceInCalendarDays`.
 *     إثباتٌ بلحظةٍ ثابتة `2026-08-07 22:30 UTC` = `01:30` بغداد:
 *       UTC ⇒ «1 يوم» · بغداد ⇒ «0 يوم» — **يومٌ كامل فرقاً**.
 *  ⑯ جلب **كل** الموظفين و`Map` يدويّ و`orderBy 'full_name_ar'` على
 *     عمودٍ NULL لكل موظف.
 *  ⑰ `created_by`/`updated_by` لا يُملآن (PROBE_17: ثمانية بلا منشئ).
 *  ⑱ `contract_number` يقبل الفراغ (PROBE_18).
 *
 *  ★ الصفحة لا تلمس Supabase — كل شيء عبر هذه الطبقة.
 * ════════════════════════════════════════════════════════════════
 */
import { supabase } from '../supabase/supabase';
import { logger } from '../utils/logger';
import { SdkError } from './BaseService';

/** ★ أنواع العقود الستّة — مطابِقة لـ`employee_contracts_contract_type_check` */
export const CONTRACT_TYPES = [
  'permanent', 'fixed_term', 'probation', 'part_time', 'consultant', 'other',
] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];

/** ★ حالات العقد الخمس — مطابِقة لـ`employee_contracts_status_check` */
export const CONTRACT_STATES = [
  'draft', 'active', 'expired', 'terminated', 'renewed',
] as const;
export type ContractState = (typeof CONTRACT_STATES)[number];

/** ★ حالة الانتهاء — تُحسب في القاعدة بتوقيت بغداد لا بالمتصفّح */
export const CONTRACT_EXPIRY_STATES = ['open_ended', 'valid', 'expiring', 'expired'] as const;
export type ContractExpiryState = (typeof CONTRACT_EXPIRY_STATES)[number];

/** ★ العملات الخمس — مطابِقة لـ`employee_contracts_currency_chk` */
export const CONTRACT_CURRENCIES = ['IQD', 'USD', 'EUR', 'SAR', 'AED'] as const;
export type ContractCurrency = (typeof CONTRACT_CURRENCIES)[number];

/**
 * ★★ الأنواع التي تُلزم بتاريخ نهاية — مطابِقة لـ
 *    `employee_contracts_term_chk` وحارس `CONTRACT_TERM_NEEDS_END`.
 */
export const TERM_TYPES: readonly ContractType[] = ['fixed_term', 'probation'] as const;
export const needsEndDate = (t: string): boolean =>
  (TERM_TYPES as readonly string[]).includes(t);

export const CONTRACT_TYPE_AR: Record<ContractType, string> = {
  permanent:  'دائم',
  fixed_term: 'محدد المدة',
  probation:  'تجربة',
  part_time:  'دوام جزئي',
  consultant: 'استشاري',
  other:      'آخر',
};

export const CONTRACT_STATE_AR: Record<ContractState, string> = {
  draft:      'مسودة',
  active:     'نشط',
  expired:    'منتهٍ',
  terminated: 'مُنهى',
  renewed:    'مُجدَّد',
};

export const CONTRACT_STATE_TONE: Record<ContractState, string> = {
  draft:      'bg-slate-100 text-slate-600 border-slate-200',
  active:     'bg-emerald-50 text-emerald-700 border-emerald-200',
  expired:    'bg-red-50 text-red-700 border-red-200',
  terminated: 'bg-orange-50 text-orange-700 border-orange-200',
  renewed:    'bg-indigo-50 text-indigo-700 border-indigo-200',
};

export const CONTRACT_EXPIRY_AR: Record<ContractExpiryState, string> = {
  open_ended: 'بلا نهاية',
  valid:      'سارٍ',
  expiring:   'يقارب الانتهاء',
  expired:    'منتهٍ',
};

export const CONTRACT_EXPIRY_TONE: Record<ContractExpiryState, string> = {
  open_ended: 'bg-slate-100 text-slate-600 border-slate-200',
  valid:      'bg-emerald-50 text-emerald-700 border-emerald-200',
  expiring:   'bg-amber-50 text-amber-700 border-amber-200',
  expired:    'bg-red-50 text-red-700 border-red-200',
};

export const contractTypeLabel = (t: string): string =>
  CONTRACT_TYPE_AR[t as ContractType] ?? t;
export const contractStateLabel = (s: string): string =>
  CONTRACT_STATE_AR[s as ContractState] ?? s;
export const contractStateTone = (s: string): string =>
  CONTRACT_STATE_TONE[s as ContractState]
  ?? 'bg-slate-100 text-slate-600 border-slate-200';
export const contractExpiryLabel = (s: string): string =>
  CONTRACT_EXPIRY_AR[s as ContractExpiryState] ?? s;
export const contractExpiryTone = (s: string): string =>
  CONTRACT_EXPIRY_TONE[s as ContractExpiryState]
  ?? 'bg-slate-100 text-slate-600 border-slate-200';

export interface ContractRow {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  department: string;
  contractNumber: string;
  contractType: ContractType | string;
  title: string;
  status: ContractState | string;
  startDate: string | null;
  endDate: string | null;
  /** ★★★ محسوبٌ بتوقيت بغداد لا بالمتصفّح · `null` = بلا نهاية */
  daysLeft: number | null;
  expiryState: ContractExpiryState | string;
  noticeDays: number;
  salaryAmount: number | null;
  salaryCurrency: ContractCurrency | string;
  documentUrl: string | null;
  notes: string | null;
  /** ★ العطل ⑪: سلسلة التجديد التي لم تكن موجودة */
  renewalCount: number;
  previousEnd: string | null;
  terminatedAt: string | null;
  terminationReason: string | null;
  creatorName: string;
  createdAt: string | null;
}

export interface ContractSummary {
  total: number;
  active: number;
  expiring: number;
  expired: number;
  terminated: number;
  draft: number;
  /** ★★★ «نشطٌ» وقد انتهى — التناقض الذي يكشفه العطل ⑦ */
  stale: number;
  /** موظفون نشطون بلا عقدٍ نشط */
  uncovered: number;
  noDocument: number;
}

export interface ContractInput {
  id?: string | null;
  employeeId: string;
  contractType: ContractType;
  contractNumber?: string | null;
  title?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  noticeDays?: number;
  salaryAmount?: number | null;
  salaryCurrency?: ContractCurrency;
  documentUrl?: string | null;
  notes?: string | null;
  status?: ContractState;
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

class EmployeeContractSdk {
  /** ملخّص العقود — محسوب في القاعدة (staff فقط) */
  async summary(): Promise<ContractSummary> {
    const { data, error } = await supabase.rpc('contract_summary');
    if (error) {
      logger.error('contract_summary فشل: ' + error.message, {
        component: 'EmployeeContractSdk', action: 'summary',
      });
      throw SdkError.fromSupabaseError(error);
    }
    const r = ((data ?? []) as Raw[])[0] ?? {};
    return {
      total:      num(r.out_total),
      active:     num(r.out_active),
      expiring:   num(r.out_expiring),
      expired:    num(r.out_expired),
      terminated: num(r.out_terminated),
      draft:      num(r.out_draft),
      stale:      num(r.out_stale),
      uncovered:  num(r.out_uncovered),
      noDocument: num(r.out_no_document),
    };
  }

  /**
   * لوح العقود — استعلامٌ واحد.
   *
   * ★ العطل ⑯: النسخة السابقة جلبت **كل** الموظفين وبنت `Map` يدوياً.
   * ★★★ العطل ⑮: `daysLeft` و`expiryState` محسوبان **بتوقيت بغداد**
   *   في القاعدة — لا بـ`differenceInCalendarDays` في المتصفّح.
   */
  async board(
    status?: ContractState | null,
    type?: ContractType | null,
    limit = 200,
  ): Promise<ContractRow[]> {
    const { data, error } = await supabase.rpc('contract_board', {
      p_status: status ?? null,
      p_type:   type ?? null,
      p_limit:  limit,
    });
    if (error) {
      logger.error('contract_board فشل: ' + error.message, {
        component: 'EmployeeContractSdk', action: 'board',
      });
      throw SdkError.fromSupabaseError(error);
    }
    return ((data ?? []) as Raw[]).map((r) => ({
      id:                str(r.out_id),
      employeeId:        str(r.out_employee_id),
      employeeName:      str(r.out_employee_name),
      employeeCode:      str(r.out_employee_code),
      department:        str(r.out_department),
      contractNumber:    str(r.out_contract_number),
      contractType:      str(r.out_contract_type),
      title:             str(r.out_title),
      status:            str(r.out_status),
      startDate:         strOrNull(r.out_start_date),
      endDate:           strOrNull(r.out_end_date),
      daysLeft:          numOrNull(r.out_days_left),
      expiryState:       str(r.out_expiry_state),
      noticeDays:        num(r.out_notice_days),
      salaryAmount:      numOrNull(r.out_salary_amount),
      salaryCurrency:    str(r.out_salary_currency),
      documentUrl:       strOrNull(r.out_document_url),
      notes:             strOrNull(r.out_notes),
      renewalCount:      num(r.out_renewal_count),
      previousEnd:       strOrNull(r.out_previous_end),
      terminatedAt:      strOrNull(r.out_terminated_at),
      terminationReason: strOrNull(r.out_termination_reason),
      creatorName:       str(r.out_creator_name),
      createdAt:         strOrNull(r.out_created_at),
    }));
  }

  /**
   * ★★★ العطل ⑦: ترحيل العقود المنتهية إلى `expired`.
   *
   *   لم يكن في المنظومة أيُّ مسارٍ يُحدّث الحالة — عقدان «نشطان»
   *   انتهيا منذ أربعمئة يوم.
   *
   * @returns عدد العقود المُرحَّلة
   */
  async expireDue(): Promise<number> {
    const { data, error } = await supabase.rpc('contract_expire_due');
    if (error) throw SdkError.fromSupabaseError(error);
    return num(data);
  }

  /**
   * إنشاء عقدٍ أو تعديله.
   *
   * ★ الحرّاس: `CONTRACT_EMPLOYEE_NOT_FOUND` (②/③) ·
   *   `_END_BEFORE_START` (④) · `_TERM_NEEDS_END` (⑥) ·
   *   `_NOTICE_INVALID` (⑧) · `_SALARY_INVALID` / `_CURRENCY_INVALID` (⑨)
   *   · **`_ACTIVE_EXISTS`** (⑤: عقدٌ نشطٌ واحد لكل موظف).
   */
  async save(input: ContractInput): Promise<string> {
    const { data, error } = await supabase.rpc('contract_upsert', {
      p_id:       input.id ?? null,
      p_employee: input.employeeId,
      p_type:     input.contractType,
      p_number:   input.contractNumber ?? null,
      p_title:    input.title ?? null,
      p_start:    input.startDate ?? null,
      p_end:      input.endDate ?? null,
      p_notice:   input.noticeDays ?? 30,
      p_salary:   input.salaryAmount ?? null,
      p_currency: input.salaryCurrency ?? 'IQD',
      p_document: input.documentUrl ?? null,
      p_notes:    input.notes ?? null,
      p_status:   input.status ?? 'active',
    });
    if (error) throw SdkError.fromSupabaseError(error);
    return str(data);
  }

  /**
   * ★★★ العطل ⑪: التجديد يُنشئ عقداً جديداً ويحفظ السلسلة.
   *
   *   القديم يصير `renewed` بنهايته الأصلية محفوظة، والجديد يحمل
   *   `renewed_from` و`previous_end_date` و`renewal_count + 1`.
   *   كان `renewContract` يكتب `end_date` **فوق** القديم فيضيع
   *   تاريخ العقد كلّه.
   *
   * @returns معرّف العقد الجديد
   */
  async renew(
    id: string, newEnd: string, salary?: number | null, number?: string | null,
  ): Promise<string> {
    const { data, error } = await supabase.rpc('contract_renew', {
      p_id: id, p_new_end: newEnd,
      p_salary: salary ?? null, p_number: number ?? null,
    });
    if (error) {
      logger.error('contract_renew فشل: ' + error.message, {
        component: 'EmployeeContractSdk', action: 'renew',
      });
      throw SdkError.fromSupabaseError(error);
    }
    return str(data);
  }

  /**
   * ★★ العطل ⑫: الإنهاء بسببٍ وتاريخ.
   *
   *   `CONTRACT_TERMINATION_REASON_REQUIRED` — والقيد في القاعدة
   *   يجعل الإنهاء بلا سببٍ **مستحيلاً بنيوياً**.
   */
  async terminate(id: string, reason: string, date?: string | null): Promise<string> {
    const { data, error } = await supabase.rpc('contract_terminate', {
      p_id: id, p_reason: reason, p_date: date ?? null,
    });
    if (error) throw SdkError.fromSupabaseError(error);
    return str(data);
  }
}

export const contractSdk = new EmployeeContractSdk();
export default contractSdk;
