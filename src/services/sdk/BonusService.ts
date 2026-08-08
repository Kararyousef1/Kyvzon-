/**
 * ════════════════════════════════════════════════════════════════
 *  BonusService — دورة حياة المكافآت (migration 0358)
 *
 *  ★★★ الأعطال التي يُصلحها — كلها مُثبتة تشغيلياً على Postgres 17
 *      قبل كتابة سطر واحد (المسبار: tools/dev/_probe_0358.sql):
 *
 *  ① **زرّ «موافقة» يرمي دائماً.** `handleApprove` يستدعي
 *     `approveBonus(bonus.id, "system")` فتُكتب السلسلة في عمود UUID:
 *       PROBE_9: ERROR: invalid input syntax for type uuid: "system"
 *     ⇒ الاعتماد **مستحيل** من الواجهة.
 *
 *  ② **مفردتان عربيّتان تكسران كل شيء.** حتى لو نجح الاعتماد:
 *       approveBonus → 'موافق' · cancelBonus → 'ملغي'
 *     والصفحة تُرشِّح `=== 'pending'` و`=== 'approved'` وتقرأ
 *     `BONUS_STATUS_LABELS[status]` بالإنجليزية.
 *     PROBE_1: بطاقة «معتمدة» صفر أبداً · الشارة تعرض النصّ الخام.
 *     PROBE_1B: والعمود بلا CHECK — «حالة مخترعة تماماً» قُبِلت.
 *
 *  ③ **حقلان للمبلغ يتضاربان.** المحفّز القديم يملأ الفارغ منهما فقط:
 *     PROBE_2C: `(amount=100000, bonus_amount=999999)` ⇒ diverged = t
 *     الصفحة تُرسل `bonus_amount` وتقرأ `bonus.amount`.
 *
 *  ④ لا حارس على المبلغ — PROBE_3: `-50000` قُبِلت.
 *  ⑤ `bonus_type` بلا CHECK — PROBE_4: «نوع مخترع» قُبِل.
 *  ⑥ لا FK على `employee_id` — PROBE_6: موظف غير موجود.
 *  ⑦ الحذف النهائي متاح بلا محفّز حارس.
 *  ⑧ `period_start`/`period_end` تُجمَعان ولا يُمرَّران.
 *  ⑨ `referral` مفقود من أزرار الفلترة (ستّة أنواع · خمسة أزرار).
 *  ⑩ جدولان كاملان إلى المتصفّح + ربط بـMap.
 *  ⑪ نافذة التفاصيل تستعمل `PAYROLL_STATUS_LABELS` ⇒ `undefined`.
 *
 *  ★ الصفحة لا تلمس Supabase — كل شيء عبر هذه الطبقة.
 * ════════════════════════════════════════════════════════════════
 */
import { supabase } from '../supabase/supabase';
import { logger } from '../utils/logger';
import { SdkError } from './BaseService';

/**
 * ★ مفردات الحالة الأربع — مطابِقة نصّاً لـ`bonuses_status_chk`
 *   كما فُرض في 0358. قبلها كان العمود نصّاً حرّاً يقبل «موافق».
 */
export const BONUS_STATUSES = [
  'pending', 'approved', 'paid', 'cancelled',
] as const;
export type BonusDbStatus = (typeof BONUS_STATUSES)[number];

/** ★ الأنواع الستّة — مطابِقة لـ`bonuses_type_chk`. `referral` منها */
export const BONUS_TYPES = [
  'performance', 'overtime', 'annual', 'spot', 'referral', 'other',
] as const;
export type BonusDbType = (typeof BONUS_TYPES)[number];

export const BONUS_STATUS_AR: Record<BonusDbStatus, string> = {
  pending:   'بانتظار الاعتماد',
  approved:  'معتمدة',
  paid:      'مدفوعة',
  cancelled: 'ملغاة',
};

export const BONUS_STATUS_TONE: Record<BonusDbStatus, string> = {
  pending:   'bg-amber-50 text-amber-700 border-amber-200',
  approved:  'bg-indigo-50 text-indigo-700 border-indigo-200',
  paid:      'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled: 'bg-red-50 text-red-600 border-red-200',
};

export const BONUS_TYPE_AR: Record<BonusDbType, string> = {
  performance: 'مكافأة أداء',
  overtime:    'مكافأة وقت إضافي',
  annual:      'مكافأة سنوية',
  spot:        'مكافأة فورية',
  referral:    'مكافأة إحالة',
  other:       'مكافأة أخرى',
};

/**
 * ★★ الانتقالات المسموحة — **نسخة من جدول القاعدة** في
 *    `bonus_decide`. المدفوعة والملغاة نهائيتان.
 */
export const BONUS_TRANSITIONS: Record<BonusDbStatus, BonusDbStatus[]> = {
  pending:   ['approved', 'cancelled'],
  approved:  ['paid', 'cancelled'],
  paid:      [],
  cancelled: [],
};

export type BonusDecision = 'approved' | 'paid' | 'cancelled';

export interface BonusSummary {
  total: number;
  pending: number;
  approved: number;
  paid: number;
  cancelled: number;
  amtPending: number;
  amtApproved: number;
  amtPaid: number;
  /** مكافآت الشهر الجاري (معتمَدة + مدفوعة) بتوقيت بغداد */
  amtMonth: number;
  employees: number;
}

export interface BonusRow {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  department: string;
  type: BonusDbType | string;
  amount: number;
  currency: string;
  reason: string;
  status: BonusDbStatus;
  periodStart: string | null;
  periodEnd: string | null;
  bonusDate: string | null;
  approvedBy: string | null;
  approverName: string;
  decidedAt: string | null;
  decisionNote: string | null;
  archived: boolean;
  createdAt: string | null;
}

export interface BonusCreateInput {
  employeeId: string;
  type: BonusDbType;
  amount: number;
  reason: string;
  /** YYYY-MM-DD — يُمرَّر فعلاً الآن (كان يُهمَل) */
  periodStart?: string | null;
  periodEnd?: string | null;
}

type Raw = Record<string, unknown>;

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown): string => (v == null ? '' : String(v));
const strOrNull = (v: unknown): string | null =>
  v == null || String(v) === '' ? null : String(v);

class BonusSdk {
  /** بطاقات الصفحة — محسوبة في القاعدة */
  async summary(): Promise<BonusSummary> {
    const { data, error } = await supabase.rpc('bonus_summary');
    if (error) {
      logger.error('bonus_summary فشل: ' + error.message, {
        component: 'BonusSdk', action: 'summary',
      });
      throw SdkError.fromSupabaseError(error);
    }
    const r = ((data ?? []) as Raw[])[0] ?? {};
    return {
      total:       num(r.out_total),
      pending:     num(r.out_pending),
      approved:    num(r.out_approved),
      paid:        num(r.out_paid),
      cancelled:   num(r.out_cancelled),
      amtPending:  num(r.out_amt_pending),
      amtApproved: num(r.out_amt_approved),
      amtPaid:     num(r.out_amt_paid),
      amtMonth:    num(r.out_amt_month),
      employees:   num(r.out_employees),
    };
  }

  /**
   * لوحة المكافآت — الاسم والقسم والمعتمِد في استعلام واحد.
   *
   * ★ العطل ⑩: النسخة السابقة جلبت كل المكافآت **وكل الموظفين**
   *   بلا حدّ وربطتهما بـ`Map` في المتصفّح.
   */
  async board(opts?: {
    status?: BonusDbStatus | null;
    type?: BonusDbType | null;
    search?: string | null;
    includeArchived?: boolean;
    limit?: number;
  }): Promise<BonusRow[]> {
    const { data, error } = await supabase.rpc('bonus_board', {
      p_status:           opts?.status ?? null,
      p_type:             opts?.type ?? null,
      p_search:           opts?.search ?? null,
      p_include_archived: opts?.includeArchived ?? false,
      p_limit:            opts?.limit ?? 200,
    });
    if (error) {
      logger.error('bonus_board فشل: ' + error.message, {
        component: 'BonusSdk', action: 'board',
      });
      throw SdkError.fromSupabaseError(error);
    }
    return ((data ?? []) as Raw[]).map((r) => ({
      id:           str(r.out_id),
      employeeId:   str(r.out_employee_id),
      employeeName: str(r.out_employee_name),
      employeeCode: str(r.out_employee_code),
      department:   str(r.out_department),
      type:         str(r.out_type),
      amount:       num(r.out_amount),
      currency:     str(r.out_currency),
      reason:       str(r.out_reason),
      status:       str(r.out_status) as BonusDbStatus,
      periodStart:  strOrNull(r.out_period_start),
      periodEnd:    strOrNull(r.out_period_end),
      bonusDate:    strOrNull(r.out_bonus_date),
      approvedBy:   strOrNull(r.out_approved_by),
      approverName: str(r.out_approver_name),
      decidedAt:    strOrNull(r.out_decided_at),
      decisionNote: strOrNull(r.out_decision_note),
      archived:     Boolean(r.out_archived),
      createdAt:    strOrNull(r.out_created_at),
    }));
  }

  /**
   * إنشاء مكافأة.
   *
   * ★ العطل ⑧: الفترة تُمرَّر فعلاً الآن — وتُحرَس في القاعدة.
   * ★ العطل ③: `amount` وحده يُرسَل؛ المحفّز يعكسه على `bonus_amount`
   *   فلا يتضاربان.
   */
  async create(input: BonusCreateInput): Promise<string> {
    const { data, error } = await supabase.rpc('bonus_create', {
      p_employee_id:  input.employeeId,
      p_type:         input.type,
      p_amount:       input.amount,
      p_reason:       input.reason,
      p_period_start: input.periodStart ?? null,
      p_period_end:   input.periodEnd ?? null,
    });
    if (error) throw SdkError.fromSupabaseError(error);
    return String(data ?? '');
  }

  /**
   * بتّ في المكافأة.
   *
   * ★★★ العطل ①: `approveBonus(id, "system")` كانت تكتب سلسلة في
   *   عمود UUID فيرمي Postgres. الآن `approved_by` يأخذ `auth.uid()`
   *   في القاعدة — لا يُمرَّر من المتصفّح إطلاقاً.
   * ★★★ والعطل ②: المفردات إنجليزية مطابِقة لما تقرؤه الواجهة.
   */
  async decide(
    bonusId: string,
    decision: BonusDecision,
    note?: string | null,
  ): Promise<BonusDecision> {
    const { data, error } = await supabase.rpc('bonus_decide', {
      p_bonus_id: bonusId,
      p_decision: decision,
      p_note:     note ?? null,
    });
    if (error) throw SdkError.fromSupabaseError(error);
    return String(data ?? decision) as BonusDecision;
  }

  /** أرشفة بدل حذف — السبب إلزاميّ في القاعدة */
  async archive(bonusId: string, reason: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('bonus_archive', {
      p_bonus_id: bonusId,
      p_reason:   reason,
    });
    if (error) throw SdkError.fromSupabaseError(error);
    return Boolean(data);
  }
}

export const bonusSdk = new BonusSdk();
