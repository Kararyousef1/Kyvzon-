/**
 * ════════════════════════════════════════════════════════════════
 *  OnboardingLifecycleService — التعريف وإنهاء الخدمة (migration 0359)
 *
 *  ★★★ الأعطال التي يُصلحها — كلها مُثبتة تشغيلياً على Postgres 17
 *      قبل كتابة سطر واحد (المسبار: tools/dev/_probe_0359.sql):
 *
 *  ① **إنهاء الخدمة يفشل ويترك سجلاً يتيماً.** `handleOffboard`
 *     ينفّذ نداءين متتابعين بلا معاملة:
 *        createRecord(...)                       ← ينجح
 *        employeeService.update(id, {
 *          is_active: false,
 *          employment_status: 'terminated' })    ← يرمي
 *     PROBE_1:
 *        ERROR: column "employment_status" of relation "employees"
 *               does not exist
 *     ⇒ سجلُّ إنهاء مكتوب والموظف **ما زال نشطاً**.
 *
 *  ② **بدء التعريف مرّتين يُضاعف المهام.** لا قيد فرادة.
 *     PROBE_2: مهمّتان × ضغطتان ⇒ 4 صفوف.
 *
 *  ③ `upsert()` اسمٌ كاذب: حلقة `create` بلا معاملة.
 *  ④ لا FK على `employee_id` في الجدولين (PROBE_4A/4B).
 *  ⑤ `status` و`exit_type` بلا CHECK (PROBE_5A/5B).
 *     ★ والعرض يفكّ **ثلاثة** أنواع من أربعة: `end_contract` يظهر
 *       «تقاعد» لأن السلسلة الشرطية تنتهي بـ`: 'تقاعد'`.
 *  ⑥ لا فرادة في إنهاء الخدمة (PROBE_6: ثلاثة سجلّات لموظف واحد).
 *  ⑦ `completed_by` لا يُكتب أبداً.
 *  ⑧ أربعة أعمدة معدومة في الواجهة: `is_final_settlement_done` ·
 *     `assets_returned` · `access_revoked` · `conducted_by`.
 *  ⑨ لا محفّز يمنع الحذف · ⑩ أربعة استعلامات + O(n×m) · ⑪ `any`.
 *
 *  ★ الصفحة لا تلمس Supabase — كل شيء عبر هذه الطبقة.
 * ════════════════════════════════════════════════════════════════
 */
import { supabase } from '../supabase/supabase';
import { logger } from '../utils/logger';
import { SdkError } from './BaseService';
import {
  employeeIdentityService,
  type IdentityJobStatus,
} from './EmployeeIdentityService';

/** ★ مفردات حالة المهمة — مطابِقة لـ`employee_onboarding_status_chk` */
export const ONBOARDING_TASK_STATUSES = [
  'pending', 'in_progress', 'completed', 'skipped',
] as const;
export type OnboardingTaskStatus = (typeof ONBOARDING_TASK_STATUSES)[number];

/**
 * ★★ أنواع الإنهاء الأربعة — مطابِقة لـ`offboarding_records_type_chk`.
 *   العرض القديم كان يفكّ ثلاثة فقط فيظهر `end_contract` «تقاعد».
 */
export const EXIT_TYPES = [
  'voluntary', 'involuntary', 'retirement', 'end_contract',
] as const;
export type ExitType = (typeof EXIT_TYPES)[number];

export const ONBOARDING_TASK_STATUS_AR: Record<OnboardingTaskStatus, string> = {
  pending:     'بانتظار',
  in_progress: 'قيد التنفيذ',
  completed:   'مكتملة',
  skipped:     'متخطّاة',
};

export const ONBOARDING_TASK_STATUS_TONE: Record<OnboardingTaskStatus, string> = {
  pending:     'bg-slate-100 text-slate-600 border-slate-200',
  in_progress: 'bg-blue-50 text-blue-700 border-blue-200',
  completed:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  skipped:     'bg-amber-50 text-amber-700 border-amber-200',
};

export const EXIT_TYPE_AR: Record<ExitType, string> = {
  voluntary:    'استقالة',
  involuntary:  'فصل',
  retirement:   'تقاعد',
  end_contract: 'انتهاء عقد',
};

export const EXIT_TYPE_TONE: Record<ExitType, string> = {
  voluntary:    'bg-blue-50 text-blue-700 border-blue-200',
  involuntary:  'bg-red-50 text-red-700 border-red-200',
  retirement:   'bg-violet-50 text-violet-700 border-violet-200',
  end_contract: 'bg-slate-100 text-slate-600 border-slate-200',
};

export const exitTypeLabel = (t: string): string =>
  EXIT_TYPE_AR[t as ExitType] ?? t;
export const exitTypeTone = (t: string): string =>
  EXIT_TYPE_TONE[t as ExitType] ?? 'bg-slate-100 text-slate-600 border-slate-200';

export interface OnboardingTask {
  id: string;
  taskId: string;
  title: string;
  type: string;
  mandatory: boolean;
  status: OnboardingTaskStatus;
  completedAt: string | null;
  /** اسم مَن أتمّ المهمة — كان `completed_by` لا يُكتب أبداً */
  completer: string;
  skippedReason: string | null;
}

export interface OnboardingRow {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  department: string;
  isActive: boolean;
  total: number;
  completed: number;
  skipped: number;
  /** الإلزاميّ غير المُنجَز ولا المتخطّى — مؤشّر الجاهزية */
  mandatoryLeft: number;
  progress: number;
  startedAt: string | null;
  tasks: OnboardingTask[];
}

export interface OffboardingRow {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  department: string;
  lastDay: string | null;
  reason: string;
  exitType: ExitType | string;
  notes: string | null;
  accessRevoked: boolean;
  settlementDone: boolean;
  assets: string[];
  conductedBy: string | null;
  conductor: string;
  /** ★★★ الحالة الشاذّة: سجلُّ إنهاء وموظفٌ ما زال نشطاً (العطل ①) */
  stillActive: boolean;
  createdAt: string | null;
  identityJobId: string | null;
  identityStatus: IdentityJobStatus | null;
  identityError: string | null;
  closedContracts: number;
}

export interface OnboardingSummary {
  tasksActive: number;
  tasksMandatory: number;
  inProgress: number;
  finished: number;
  /** ★ `null` تعني «لا تعريف جارٍ» — لا «تقدّم صفر» (درس 0353) */
  avgProgress: number | null;
  offboarded: number;
  /** عدد السجلّات اليتيمة التي خلّفها العطل ① */
  orphanActive: number;
  pendingAccess: number;
}

export interface OffboardingInput {
  employeeId: string;
  lastDay: string;
  reason: string;
  exitType: ExitType;
  notes?: string | null;
  accessRevoked?: boolean;
  settlementDone?: boolean;
  assets?: string[] | null;
}

export interface OffboardingResult {
  recordId: string;
  identityJobId: string | null;
  identityStatus: IdentityJobStatus | null;
  identityError: string | null;
}

type Raw = Record<string, unknown>;

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
/** ★ يحفظ التمييز بين «صفر» و«غير مُقاس» */
const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string => (v == null ? '' : String(v));
const strOrNull = (v: unknown): string | null =>
  v == null || String(v) === '' ? null : String(v);

/** ★ فكّ مصفوفة المهامّ من JSONB بلا `as any` */
function parseTasks(v: unknown): OnboardingTask[] {
  if (!Array.isArray(v)) return [];
  return (v as Raw[]).map((t) => ({
    id:            str(t.id),
    taskId:        str(t.taskId),
    title:         str(t.title),
    type:          str(t.type),
    mandatory:     Boolean(t.mandatory),
    status:        str(t.status) as OnboardingTaskStatus,
    completedAt:   strOrNull(t.completedAt),
    completer:     str(t.completer),
    skippedReason: strOrNull(t.skippedReason),
  }));
}

class OnboardingLifecycleSdk {
  /** ملخّص التعريف وإنهاء الخدمة — محسوب في القاعدة */
  async summary(): Promise<OnboardingSummary> {
    const { data, error } = await supabase.rpc('onboarding_summary');
    if (error) {
      logger.error('onboarding_summary فشل: ' + error.message, {
        component: 'OnboardingLifecycleSdk', action: 'summary',
      });
      throw SdkError.fromSupabaseError(error);
    }
    const r = ((data ?? []) as Raw[])[0] ?? {};
    return {
      tasksActive:    num(r.out_tasks_active),
      tasksMandatory: num(r.out_tasks_mandatory),
      inProgress:     num(r.out_in_progress),
      finished:       num(r.out_finished),
      avgProgress:    numOrNull(r.out_avg_progress),
      offboarded:     num(r.out_offboarded),
      orphanActive:   num(r.out_orphan_active),
      pendingAccess:  num(r.out_pending_access),
    };
  }

  /**
   * لوحة التعريف — الموظف ومهامّه في استعلام واحد.
   *
   * ★ العطل ⑩: النسخة السابقة جلبت أربعة جداول بلا حدّ ثم جمّعت في
   *   المتصفّح مع `tasks.find()` **داخل** `map`.
   */
  async board(search?: string | null, limit = 200): Promise<OnboardingRow[]> {
    const { data, error } = await supabase.rpc('onboarding_board', {
      p_search: search ?? null,
      p_limit:  limit,
    });
    if (error) {
      logger.error('onboarding_board فشل: ' + error.message, {
        component: 'OnboardingLifecycleSdk', action: 'board',
      });
      throw SdkError.fromSupabaseError(error);
    }
    return ((data ?? []) as Raw[]).map((r) => ({
      employeeId:    str(r.out_employee_id),
      employeeName:  str(r.out_employee_name),
      employeeCode:  str(r.out_employee_code),
      department:    str(r.out_department),
      isActive:      Boolean(r.out_is_active),
      total:         num(r.out_total),
      completed:     num(r.out_completed),
      skipped:       num(r.out_skipped),
      mandatoryLeft: num(r.out_mandatory_left),
      progress:      num(r.out_progress),
      startedAt:     strOrNull(r.out_started_at),
      tasks:         parseTasks(r.out_tasks),
    }));
  }

  /**
   * بدء التعريف — كل المهامّ في معاملة واحدة.
   *
   * ★★★ العطلان ② و③: `ON CONFLICT DO NOTHING` على الفهرس الفريد،
   *   فإعادة الضغط لا تُضاعف المهامّ — تُضيف الجديد منها فقط.
   *
   * @returns عدد المهامّ المُضافة فعلاً (صفر إن كانت كلها موجودة)
   */
  async start(employeeId: string): Promise<number> {
    const { data, error } = await supabase.rpc('onboarding_start', {
      p_employee_id: employeeId,
    });
    if (error) throw SdkError.fromSupabaseError(error);
    return num(data);
  }

  /**
   * تبديل حالة مهمة.
   *
   * ★ العطل ⑦: `completed_by` يُكتب في القاعدة من `auth.uid()`.
   * ★ التخطّي يحتاج سبباً — قرارٌ إداريّ لا يُترك بلا تبرير.
   */
  async setTask(
    recordId: string,
    status: OnboardingTaskStatus,
    note?: string | null,
  ): Promise<OnboardingTaskStatus> {
    const { data, error } = await supabase.rpc('onboarding_set_task', {
      p_record_id: recordId,
      p_status:    status,
      p_note:      note ?? null,
    });
    if (error) throw SdkError.fromSupabaseError(error);
    return String(data ?? status) as OnboardingTaskStatus;
  }

  /** سجلّات إنهاء الخدمة */
  async offboardings(opts?: {
    exitType?: ExitType | null;
    search?: string | null;
    limit?: number;
  }): Promise<OffboardingRow[]> {
    const { data, error } = await supabase.rpc('offboarding_board', {
      p_exit_type: opts?.exitType ?? null,
      p_search:    opts?.search ?? null,
      p_limit:     opts?.limit ?? 200,
    });
    if (error) {
      logger.error('offboarding_board فشل: ' + error.message, {
        component: 'OnboardingLifecycleSdk', action: 'offboardings',
      });
      throw SdkError.fromSupabaseError(error);
    }
    return ((data ?? []) as Raw[]).map((r) => ({
      id:             str(r.out_id),
      employeeId:     str(r.out_employee_id),
      employeeName:   str(r.out_employee_name),
      employeeCode:   str(r.out_employee_code),
      department:     str(r.out_department),
      lastDay:        strOrNull(r.out_last_day),
      reason:         str(r.out_reason),
      exitType:       str(r.out_exit_type),
      notes:          strOrNull(r.out_notes),
      accessRevoked:  Boolean(r.out_access_revoked),
      settlementDone: Boolean(r.out_settlement),
      assets:         Array.isArray(r.out_assets)
                        ? (r.out_assets as unknown[]).map(str) : [],
      conductedBy:    strOrNull(r.out_conducted_by),
      conductor:      str(r.out_conductor),
      stillActive:    Boolean(r.out_still_active),
      createdAt:      strOrNull(r.out_created_at),
      identityJobId:  strOrNull(r.out_identity_task_id),
      identityStatus: strOrNull(r.out_identity_status) as IdentityJobStatus | null,
      identityError:  strOrNull(r.out_identity_error),
      closedContracts: num(r.out_closed_contracts),
    }));
  }

  /**
   * إنهاء الخدمة — السجلّ والتعطيل **معاً أو لا شيء**.
   *
   * ★★★ العطل ①: الصفحة كانت تنفّذ نداءين والثاني يرمي
   *   (`employment_status` عمود معدوم) فيبقى سجلٌّ يتيم وموظفٌ نشط.
   *   الآن كلاهما في معاملة واحدة داخل القاعدة.
   */
  async offboard(input: OffboardingInput): Promise<OffboardingResult> {
    const { data, error } = await supabase.rpc('offboarding_execute', {
      p_employee_id:     input.employeeId,
      p_last_day:        input.lastDay,
      p_reason:          input.reason,
      p_exit_type:       input.exitType,
      p_notes:           input.notes ?? null,
      p_access_revoked:  input.accessRevoked ?? false,
      p_settlement_done: input.settlementDone ?? false,
      p_assets:          input.assets ?? null,
    });
    if (error) throw SdkError.fromSupabaseError(error);

    const recordId = String(data ?? '');
    let identity = await employeeIdentityService.findForEmployee(input.employeeId, 'disable');
    let identityError = identity?.lastError ?? null;
    if (identity && ['pending', 'failed'].includes(identity.status)) {
      try {
        const status = await employeeIdentityService.run(identity.id);
        identity = { ...identity, status, lastError: null };
        identityError = null;
      } catch (edgeError) {
        identity = { ...identity, status: 'failed' };
        identityError = edgeError instanceof Error
          ? edgeError.message
          : 'تعذّر تعطيل حساب Auth';
      }
    }

    return {
      recordId,
      identityJobId: identity?.id ?? null,
      identityStatus: identity?.status ?? null,
      identityError,
    };
  }

  /** إعادة محاولة تعطيل Auth من بطاقة إنهاء الخدمة. */
  async runIdentityJob(jobId: string): Promise<IdentityJobStatus> {
    return employeeIdentityService.run(jobId);
  }

  /**
   * إجراءات ما بعد الإنهاء (العطل ⑧).
   *
   * ★ أربعة أعمدة كانت موجودة في القاعدة بلا أيّ زرّ: سحب الصلاحيات ·
   *   التصفية النهائية · إعادة العهدة.
   */
  async updateChecklist(
    recordId: string,
    patch: {
      accessRevoked?: boolean | null;
      settlementDone?: boolean | null;
      assets?: string[] | null;
    },
  ): Promise<boolean> {
    const { data, error } = await supabase.rpc('offboarding_update_checklist', {
      p_record_id:       recordId,
      p_access_revoked:  patch.accessRevoked ?? null,
      p_settlement_done: patch.settlementDone ?? null,
      p_assets:          patch.assets ?? null,
    });
    if (error) throw SdkError.fromSupabaseError(error);
    return Boolean(data);
  }
}

export const onboardingLifecycleSdk = new OnboardingLifecycleSdk();
