/**
 * ════════════════════════════════════════════════════════════════
 *  PayrollRunService — تشغيل واعتماد الرواتب (migration 0348)
 *
 *  ★★★ الأعطال التي يُصلحها — كلها مُثبتة تشغيلياً على Postgres:
 *
 *  ① `PayrollPage.tsx:88` يرسل `frequency` و`payment_date` وجدول
 *     `payroll_periods` **لا يحوي أياً منهما**. مُثبَت:
 *       column "frequency" of relation "payroll_periods" does not exist
 *     ⇒ تعذّر إنشاء فترة رواتب واحدة عبر الواجهة.
 *
 *  ② محفّز `update_payroll_periods_updated_at` يُسند `NEW.updated_at`
 *     والعمود غير موجود ⇒ **كل** UPDATE يفشل:
 *       record "new" has no field "updated_at"
 *     ⇒ «تشغيل الرواتب» و«الاعتماد» معطّلان تماماً.
 *
 *  ③ `:118` `basic_salary: emp.base_salary || emp.salary || 0`
 *     و`employees` لا يحوي أياً من العمودين (مُقاس: 0)
 *     ⇒ **كشف رواتب كامل بأصفار**.
 *
 *  ④ `:124` `working_days: 26 · present_days: 26 · absent_days: 0`
 *     أرقام مكتوبة يدوياً ⇒ لا غياب لأحد أبداً — رغم أن
 *     `attendance_summary` صار يُبنى من البصمات فعلياً بعد 0347.
 *
 *  ⑤ الإعدادات المالية كلها مُهمَلة: ضريبة · ضمان · أوفرتايم ·
 *     خصم غياب · وأقساط القروض.
 *
 *  ⑥ `upsertRecords` هو `create` في حلقة ولا قيد فريد
 *     ⇒ ضغطتان على «تشغيل الرواتب» = **راتب مضاعف**.
 *
 *  ⑦ لا حراسة انتقال ولا أثر تدقيق: اعتماد مرّتين مسموح، والكتابة
 *     فوق فترة معتمَدة مسموحة، ولا يُعرف من وافق ومتى.
 * ════════════════════════════════════════════════════════════════
 */
import { supabase } from '../supabase/supabase';
import { logger } from '../utils/logger';
import { SdkError } from './BaseService';

export interface PayrollRunResult {
  employees: number;
  gross: number;
  deductions: number;
  net: number;
}

export interface PayrollPaymentResult {
  records: number;
  bonuses: number;
  bonusAmount: number;
}

export interface PayrollSummary {
  records: number;
  gross: number;
  deductions: number;
  net: number;
  avgNet: number;
  absentDays: number;
  overtimeHours: number;
}

const EMPTY_SUMMARY: PayrollSummary = {
  records: 0, gross: 0, deductions: 0, net: 0,
  avgNet: 0, absentDays: 0, overtimeHours: 0,
};

class PayrollRunService {
  /**
   * تشغيل الرواتب — ذرّي ومحسوب في القاعدة.
   *
   * ★★ RPC لا BaseService: سياسة INSERT على payroll_records تشترط
   *   `current_user_is_staff()`، والدالة DEFINER تفحص الدور بنفسها
   *   وترفض التشغيل على فترة معتمَدة.
   */
  async run(periodId: string): Promise<PayrollRunResult> {
    const { data, error } = await supabase.rpc('payroll_run', {
      p_period_id: periodId,
    });
    if (error) throw SdkError.fromSupabaseError(error);
    type Raw = {
      out_employees: number; out_gross: number;
      out_deductions: number; out_net: number;
    };
    const rows = (data ?? []) as Raw[];
    if (rows.length === 0) {
      return { employees: 0, gross: 0, deductions: 0, net: 0 };
    }
    const r = rows[0];
    return {
      employees:  Number(r.out_employees ?? 0),
      gross:      Number(r.out_gross ?? 0),
      deductions: Number(r.out_deductions ?? 0),
      net:        Number(r.out_net ?? 0),
    };
  }

  /**
   * اعتماد الفترة — بحراسة انتقال وأثر تدقيق.
   *
   * ★ يرفض: الاعتماد المكرّر · فترةً بلا سجلّات · دوراً غير admin/hr.
   */
  async approve(periodId: string): Promise<number> {
    const { data, error } = await supabase.rpc('payroll_approve', {
      p_period_id: periodId,
    });
    if (error) throw SdkError.fromSupabaseError(error);
    return Number(data ?? 0);
  }

  /** صرف الفترة المعتمدة وإغلاق مكافآتها المرتبطة ذرياً (0377). */
  async markPaid(periodId: string): Promise<PayrollPaymentResult> {
    const { data, error } = await supabase.rpc('payroll_mark_paid', {
      p_period_id: periodId,
    });
    if (error) throw SdkError.fromSupabaseError(error);
    type Raw = {
      out_records: number;
      out_bonuses: number;
      out_bonus_amount: number;
    };
    const row = ((data ?? []) as Raw[])[0];
    return {
      records: Number(row?.out_records ?? 0),
      bonuses: Number(row?.out_bonuses ?? 0),
      bonusAmount: Number(row?.out_bonus_amount ?? 0),
    };
  }

  /** ملخّص الفترة — لم يكن للصفحة ملخّص مالي إطلاقاً */
  async summary(periodId: string | null): Promise<PayrollSummary> {
    if (!periodId) return EMPTY_SUMMARY;
    const { data, error } = await supabase.rpc('payroll_period_summary', {
      p_period_id: periodId,
    });
    if (error) {
      logger.error('payroll_period_summary فشل: ' + error.message, {
        component: 'PayrollRunService', action: 'summary',
      });
      return EMPTY_SUMMARY;
    }
    type Raw = {
      out_records: number; out_gross: number; out_deductions: number;
      out_net: number; out_avg_net: number; out_absent: number;
      out_overtime: number;
    };
    const rows = (data ?? []) as Raw[];
    if (rows.length === 0) return EMPTY_SUMMARY;
    const r = rows[0];
    return {
      records:       Number(r.out_records ?? 0),
      gross:         Number(r.out_gross ?? 0),
      deductions:    Number(r.out_deductions ?? 0),
      net:           Number(r.out_net ?? 0),
      avgNet:        Number(r.out_avg_net ?? 0),
      absentDays:    Number(r.out_absent ?? 0),
      overtimeHours: Number(r.out_overtime ?? 0),
    };
  }
}

export const payrollRunService = new PayrollRunService();
