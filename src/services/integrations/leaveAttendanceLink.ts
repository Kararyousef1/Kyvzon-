/**
 * ════════════════════════════════════════════════════════════════
 *  LeaveAttendanceLink - ربط الإجازات والزمنيات بالحضور
 * ════════════════════════════════════════════════════════════════
 *  يضمن أن:
 *  1. الموافقة على إجازة ← تحديث attendance_summary إلى "مجاز"
 *  2. الموافقة على زمنية ← تحديث attendance_summary إلى "زمنية_معتمدة"
 *  3. رفض إجازة ← إعادة attendance_summary إلى حالتها الأصلية
 *
 *  ★★★ إصلاح 0344 — ثلاثة أعطال مُثبتة تشغيلياً على Postgres:
 *
 *  ① الملف كان يلمس Supabase مباشرة فلا يستفيد من حقن tenant_id في
 *    BaseService. الـupsert (سطر 52 سابقاً) كان بلا tenant_id، والعمود
 *    NOT NULL بلا default وبلا محفّز ⇒ مُثبَت:
 *      null value in column "tenant_id" of relation
 *      "attendance_summary" violates not-null constraint
 *    ⇒ **اعتماد أي إجازة لم يكن يُحدّث سجلّ الحضور إطلاقاً.**
 *
 *  ② وأعلن `onConflict: 'employee_id, shift_date'` بينما القيد الحقيقي
 *    UNIQUE (tenant_id, employee_id, shift_date) ⇒ مُثبَت:
 *      there is no unique or exclusion constraint matching the
 *      ON CONFLICT specification
 *    (فهارس فريدة على العمودين وحدهما = 0)
 *
 *  ③ والرفض كان يحذف الصفوف **حذفاً نهائياً** ثم يستدعي
 *    `refresh_attendance_summary` لإعادة بنائها — وهي دالة غير موجودة
 *    في القاعدة إطلاقاً (مُثبَت: 0 في pg_proc · صفر مطابقة في
 *    `grep -rln refresh_attendance_summary supabase/`؛ تعريفها الوحيد
 *    في `database/legacy-DO-NOT-USE/schema.sql:869` ولم يُنقَل قط).
 *    ⇒ **فقدان بيانات صافٍ.** الآن الحالة تعود «غائب» بلا حذف.
 *
 *  ★ ولماذا RPC لا BaseService؟ سياسة INSERT على attendance_summary
 *    تشترط current_user_is_staff() = admin·hr·developer·it_admin فقط.
 *    **المدير الذي يعتمد الإجازة ليس staff** فكان الإدراج يُصدّ حتى
 *    بـtenant_id صحيح (مُثبَت بـRLS: new row violates row-level
 *    security policy). دوال 0344 تعمل SECURITY DEFINER وتفحص الصلاحية
 *    والمستأجر بنفسها.
 * ════════════════════════════════════════════════════════════════
 */

import { notifyUser } from '../notifications/notificationService';
import { attendanceService, attendanceSummaryService } from '../sdk/AttendanceService';
import type { AttendanceSummaryRecord } from '../../shared/types/sdk';
import { getErrorMessage } from '../errors';

// ============================================================================
//  1. ربط الموافقة على إجازة ← تحديث ملخص الحضور
// ============================================================================

/**
 * عند الموافقة على إجازة، يتم تحديث attendance_summary للأيام المغطاة
 * @param employeeId - معرف الموظف (من employees.id)
 * @param dateFrom - تاريخ بداية الإجازة
 * @param dateTo - تاريخ نهاية الإجازة
 * @returns عدد الأيام التي تم تحديثها
 */
export async function linkLeaveApproval(
  employeeId: string,
  dateFrom: string,
  dateTo: string,
  _leaveType: string
): Promise<{ success: boolean; daysUpdated: number; error?: string }> {
  try {
    const daysUpdated = await attendanceService.applyLeaveToAttendance(
      employeeId, dateFrom, dateTo,
    );
    return { success: true, daysUpdated };
  } catch (err) {
    return { success: false, daysUpdated: 0, error: getErrorMessage(err) };
  }
}

// ============================================================================
//  2. ربط الموافقة على زمنية ← تحديث ملخص الحضور
// ============================================================================

/**
 * عند الموافقة على زمنية، يتم تحديث attendance_summary لذلك اليوم
 * @param employeeId - معرف الموظف
 * @param date - تاريخ الزمنية
 * @param expectedOutTime - وقت الخروج المتوقع
 * @param expectedReturnTime - وقت العودة المتوقع
 */
export async function linkPermissionApproval(
  employeeId: string,
  date: string,
  _expectedOutTime: string,
  _expectedReturnTime?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    /**
     * ★★★ عطل مُثبَت (0344): الكود القديم كتب
     *     if (dayOfWeek === 6) continue; // جمعة
     *   و`Date.getDay()` يُرجع 0=الأحد … 5=**الجمعة** … 6=السبت.
     *   مُحقَّق بالتشغيل:
     *     new Date('2026-05-01').getDay() === 5  ⇒ الجمعة
     *     new Date('2026-05-02').getDay() === 6  ⇒ السبت
     *   ⇒ كان **يتخطّى السبت** (يوم عمل) و**يعالج الجمعة** (عطلة).
     *   عطلة الأسبوع مقلوبة تماماً. مايجريشن 0344 يستعمل
     *   EXTRACT(DOW FROM d) <> 5 الصحيح.
     */
    const dayOfWeek = new Date(date).getDay();
    if (dayOfWeek === 5) {
      return { success: true }; // الجمعة — عطلة أسبوعية
    }

    /**
     * ★★ ونفس عطل tenant_id: الإدراج المباشر كان بلا tenant_id
     *   (NOT NULL بلا default) ⇒ اعتماد أي زمنية لم يكن يُحدّث الحضور.
     *   نمرّ عبر SDK ليُحقن tenant_id، وعبر updateSummary التي تُحدّث
     *   إن وُجد الصفّ وتُنشئ إن لم يوجد.
     */
    await attendanceSummaryService.updateSummary(employeeId, date, {
      status: 'زمنية_معتمدة',
      // ★ لا نمسّ check_in/check_out/total_hours — الموظف بصم فعلاً
    } as Partial<AttendanceSummaryRecord>);

    return { success: true };
  } catch (err) {
    console.error('linkPermissionApproval failed:', getErrorMessage(err));
    return { success: false, error: getErrorMessage(err) };
  }
}

// ============================================================================
//  3. ربط رفض إجازة ← إعادة حساب ملخص الحضور
// ============================================================================

/**
 * عند رفض إجازة، يتم إعادة حساب ملخص الحضور لتلك الأيام
 * بناءً على البصمات الفعلية
 */
export async function linkLeaveRejection(
  employeeId: string,
  dateFrom: string,
  dateTo: string
): Promise<{ success: boolean; daysRecalculated: number }> {
  try {
    const daysRecalculated = await attendanceService.revertLeaveFromAttendance(
      employeeId, dateFrom, dateTo,
    );
    return { success: true, daysRecalculated };
  } catch (err) {
    console.error('linkLeaveRejection failed:', getErrorMessage(err));
    return { success: false, daysRecalculated: 0 };
  }
}

// ============================================================================
//  4. إشعار الموظف بنتيجة الطلب
// ============================================================================

/**
 * إرسال إشعار للموظف عند الموافقة على إجازته
 * ✅ إصلاح: يكتب في Supabase عبر notifyUser بدل localStorage
 */
async function notifyEmployeeLeaveApproved(
  userId: string,
  leaveType: string,
  dateFrom: string,
  dateTo: string
): Promise<void> {
  await notifyUser(userId, {
    type: 'leave_approved',
    priority: 'high',
    title: '✅ تمت الموافقة على الإجازة',
    message: `تمت الموافقة على إجازتك ${leaveType} من ${dateFrom} إلى ${dateTo}`,
    actionUrl: 'employee-leaves',
    groupKey: `leave-approved-${userId}-${dateFrom}`,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  });
}

/**
 * إرسال إشعار للموظف عند رفض إجازته
 * ✅ إصلاح: يكتب في Supabase عبر notifyUser بدل localStorage
 */
async function notifyEmployeeLeaveRejected(
  userId: string,
  leaveType: string,
  reason: string
): Promise<void> {
  await notifyUser(userId, {
    type: 'leave_rejected',
    priority: 'high',
    title: '❌ تم رفض الإجازة',
    message: `تم رفض إجازتك ${leaveType}. السبب: ${reason}`,
    actionUrl: 'employee-leaves',
    groupKey: `leave-rejected-${userId}-${Date.now()}`,
  });
}

/**
 * إرسال إشعار للموظف عند الموافقة على الزمنية
 * ✅ إصلاح: يكتب في Supabase عبر notifyUser بدل localStorage
 */
async function notifyEmployeePermissionApproved(
  userId: string,
  date: string
): Promise<void> {
  await notifyUser(userId, {
    type: 'attendance_recorded',
    priority: 'normal',
    title: '✅ تمت الموافقة على الزمنية',
    message: `تمت الموافقة على طلب الزمنية ليوم ${date}`,
    actionUrl: 'employee-permissions',
  });
}

// ============================================================================
//  دالة مساعدة: إنشاء مصفوفة التواريخ بين تاريخين
// ============================================================================

function getDatesInRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const current = new Date(from);
  const end = new Date(to);

  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

// ============================================================================
//  تصدير دوال الإشعارات للاستخدام في المكونات
// ============================================================================

export {
  notifyEmployeeLeaveApproved,
  notifyEmployeeLeaveRejected,
  notifyEmployeePermissionApproved,
};