/**
 * ════════════════════════════════════════════════════════════════
 *  LeaveAttendanceLink - ربط الإجازات والزمنيات بالحضور
 * ════════════════════════════════════════════════════════════════
 *  يضمن أن:
 *  1. الموافقة على إجازة ← تحديث attendance_summary إلى "مجاز"
 *  2. الموافقة على زمنية ← تحديث attendance_summary إلى "زمنية_معتمدة"
 *  3. رفض إجازة ← إعادة attendance_summary إلى حالتها الأصلية
 *  4. إلغاء إجازة ← إعادة حساب الحضور من البصمات
 * ════════════════════════════════════════════════════════════════
 */

import { supabase } from '../supabase/supabase';
import { notifyUser } from '../notifications/notificationService';

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
    const dates = getDatesInRange(dateFrom, dateTo);
    let daysUpdated = 0;

    for (const date of dates) {
      // التحقق: هل هو يوم جمعة أو عطلة؟ إذاً نتخطى
      const dayOfWeek = new Date(date).getDay();
      if (dayOfWeek === 6) continue; // جمعة

      // التحقق من وجود عطلة رسمية
      const { data: holiday } = await supabase
        .from('holidays')
        .select('id')
        .eq('date', date)
        .maybeSingle();

      if (holiday) continue; // عطلة رسمية

      // تحديث أو إدراج ملخص الحضور
      const { error } = await supabase
        .from('attendance_summary')
        .upsert({
          employee_id: employeeId,
          shift_date: date,
          status: 'مجاز',
          total_hours: 0,
          late_minutes: 0,
          early_leave_minutes: 0,
          overtime_minutes: 0,
          // تعليق: تجاهل بصمات هذا اليوم لأن الموظف مجاز
        }, {
          onConflict: 'employee_id, shift_date',
          ignoreDuplicates: false,
        });

      if (error) {
        console.error(`❌ Failed to update attendance for ${date}:`, error);
        continue;
      }
      daysUpdated++;
    }

    console.log(`✅ Leave linked: ${daysUpdated} days updated for employee ${employeeId}`);
    return { success: true, daysUpdated };
  } catch (err: any) {
    console.error('❌ linkLeaveApproval failed:', err);
    return { success: false, daysUpdated: 0, error: err.message };
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
    // التحقق: هل اليوم جمعة أو عطلة؟
    const dayOfWeek = new Date(date).getDay();
    if (dayOfWeek === 6) {
      return { success: true }; // الجمعة، لا داعي للتحديث
    }

    // جلب ملخص الحضور الحالي لذلك اليوم
    const { data: existing } = await supabase
      .from('attendance_summary')
      .select('*')
      .eq('employee_id', employeeId)
      .eq('shift_date', date)
      .maybeSingle();

    if (!existing) {
      // لا يوجد ملخص حضور لهذا اليوم (ربما الموظف لم يبصم)
      // ننشئ ملخصاً جديداً بحالة "زمنية_معتمدة"
      const { error } = await supabase
        .from('attendance_summary')
        .insert({
          employee_id: employeeId,
          shift_date: date,
          status: 'زمنية_معتمدة',
          total_hours: 0,
          late_minutes: 0,
          early_leave_minutes: 0,
          overtime_minutes: 0,
        });

      if (error) throw error;
      return { success: true };
    }

    // إذا كان الموظف حاضراً، نحدّث الحالة إلى "زمنية_معتمدة"
    // مع الحفاظ على وقت الدخول والخروج إن وجد
    const { error } = await supabase
      .from('attendance_summary')
      .update({
        status: 'زمنية_معتمدة',
        // نحتفظ بباقي البيانات (check_in, check_out, total_hours)
      })
      .eq('employee_id', employeeId)
      .eq('shift_date', date);

    if (error) throw error;

    console.log(`✅ Permission linked for employee ${employeeId} on ${date}`);
    return { success: true };
  } catch (err: any) {
    console.error('❌ linkPermissionApproval failed:', err);
    return { success: false, error: err.message };
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
    const dates = getDatesInRange(dateFrom, dateTo);
    let daysRecalculated = 0;

    for (const date of dates) {
      // حذف الإدخال الذي وضعناه كـ "مجاز"
      // trigger refresh_attendance_summary سيعيد حسابه تلقائياً
      const { error } = await supabase
        .from('attendance_summary')
        .delete()
        .eq('employee_id', employeeId)
        .eq('shift_date', date)
        .eq('status', 'مجاز');

      if (error) {
        console.error(`❌ Failed to delete summary for ${date}:`, error);
        continue;
      }
      daysRecalculated++;

      // استدعاء دالة إعادة الحساب في SQL
      await supabase.rpc('refresh_attendance_summary', {
        p_employee_id: employeeId,
        p_shift_date: date,
      });
    }

    return { success: true, daysRecalculated };
  } catch (err: any) {
    console.error('❌ linkLeaveRejection failed:', err);
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