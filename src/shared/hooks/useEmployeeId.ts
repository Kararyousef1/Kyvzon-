/**
 * ════════════════════════════════════════════════════════════════
 *  useEmployeeId — حلّ معرّف سجلّ الموظف للمستخدم الحالي
 *
 *  ═══ العطل الذي يسدّه (migration 0335) ═════════════════════════
 *
 *  `user.id` هو **`profiles.id`** بينما العمود `employee_id` في
 *  الجداول يشير إلى **`employees.id`** — معرّفان مختلفان تماماً.
 *  مُحقَّق من `pg_constraint`:
 *
 *      wellness_entries.employee_id    → employees
 *      attendance_summary.employee_id  → employees
 *      leave_balance.employee_id       → employees
 *
 *  أربع صفحات مرّرت `user.id` مباشرةً فعرضت **أصفاراً** بينما
 *  البيانات موجودة كلّها. الإثبات على Postgres:
 *
 *      بـuser.id      → wellness=0 · attendance=0 · goals=0 · balance=0
 *      بـemployees.id → wellness=1 · attendance=1 · goals=1 · balance=1
 *
 *  وعشر صفحات حلّته صحيحاً بتكرار يدوي للنمط نفسه — تكرارٌ هو سبب
 *  نسيانه في الأربع. هذا الهوك يُنهي التكرار.
 * ════════════════════════════════════════════════════════════════
 */
import { useState, useEffect } from 'react';
import { employeeService } from '../../services/sdk';
import { useAuthStore } from '../../core/stores';
import { logger } from '../../services/utils/logger';

export interface EmployeeIdState {
  /** معرّف سجلّ الموظف — `null` أثناء التحميل */
  employeeId: string | null;
  /** ما زال يُحلّ */
  loading: boolean;
  /**
   * ★ للمستخدم ملف لكن **لا سجلّ موظف مرتبط**.
   *   حالة مختلفة تماماً عن «لا بيانات» وتحتاج رسالة مختلفة:
   *   الأولى تُحلّ بالانتظار، والثانية تحتاج تدخّل الموارد البشرية.
   */
  linkMissing: boolean;
}

export function useEmployeeId(): EmployeeIdState {
  const { user } = useAuthStore();
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [linkMissing, setLinkMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (!user?.id) {
      setLoading(false);
      return;
    }

    // ★ `user.employee_id` متاح أحياناً في الجلسة — نستعمله فوراً
    //   ونتجنّب دورة شبكة كاملة.
    if (user.employee_id) {
      setEmployeeId(user.employee_id);
      setLinkMissing(false);
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const rows = await employeeService.findAll({
          filters: { user_id: user.id },
          limit: 1,
        });
        if (cancelled) return;

        if (rows.length > 0) {
          setEmployeeId(rows[0].id);
          setLinkMissing(false);
        } else {
          setEmployeeId(null);
          setLinkMissing(true);
        }
      } catch (err) {
        if (cancelled) return;
        logger.error('useEmployeeId فشل في حلّ معرّف الموظف', {
          component: 'useEmployeeId',
          action: 'resolve',
          error: err instanceof Error ? err.message : String(err),
        });
        setEmployeeId(null);
        // ★ لا نُعلن linkMissing عند فشل الشبكة — الربط قد يكون سليماً
        setLinkMissing(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [user?.id, user?.employee_id]);

  return { employeeId, loading, linkMissing };
}

export default useEmployeeId;
