/**
 * ════════════════════════════════════════════════════════════════
 *  AttendanceNotificationService - إشعارات الحضور الذكية
 * ════════════════════════════════════════════════════════════════
 *  تراقب الحضور وتُرسل إشعارات تلقائية:
 *  1. تغيب موظف ← إشعار للمدير المباشر
 *  2. تأخير موظف ← إشعار للمدير
 *  3. تأخير متكرر (3+ أيام متتالية) ← إشعار عاجل للمدير+HR
 *  4. تذكير صباحي: موظف لم يبصم بعد الساعة 10 صباحاً
 *  5. تلخيص أسبوعي للمدير عن أداء فريقه
 * ════════════════════════════════════════════════════════════════
 */

import { attendanceNotificationQueryService } from '../sdk/AttendanceNotificationQueryService';
import { notifyManager, notifySupervisors, notifyRole, notifyUser } from './notificationService';
import type { AttendanceStatus } from '../../utils/shiftUtils';

// ════════════════════════════════════════════════════════════════
//  أنواع البيانات
// ════════════════════════════════════════════════════════════════

interface AttendanceEvent {
  employeeId: string;
  employeeName: string;
  date: string;
  status: AttendanceStatus;
  lateMinutes?: number;
  department?: string;
}

interface LateStreak {
  employeeId: string;
  employeeName: string;
  consecutiveLateDays: number;
  totalLateMinutes: number;
  department?: string;
}

interface WeeklyReport {
  managerId: string;
  managerName: string;
  weekStart: string;
  weekEnd: string;
  totalEmployees: number;
  presentDays: number;
  absentDays: number;
  lateDays: number;
  topAbsentees: { name: string; days: number }[];
  topLate: { name: string; days: number }[];
}

// ════════════════════════════════════════════════════════════════
//  دالة مساعدة: جلب اسم الموظف
// ════════════════════════════════════════════════════════════════

async function getEmployeeName(employeeId: string): Promise<string> {
  try {
    return await attendanceNotificationQueryService.findEmployeeName(employeeId) || 'موظف';
  } catch {
    return 'موظف';
  }
}

// ════════════════════════════════════════════════════════════════
//  1. إشعار التغيب - يُرسل للمدير عند تغيب الموظف
// ════════════════════════════════════════════════════════════════

/**
 * إرسال إشعار للمدير عند تغيب أحد أعضاء فريقه
 * يُستدعى بعد انتهاء الدوام (مثلاً بعد الساعة 4 عصراً)
 */
export async function notifyAbsentEmployee(
  employeeId: string,
  date: string
): Promise<boolean> {
  try {
    const employeeName = await getEmployeeName(employeeId);

    const result = await notifyManager(employeeId, {
      type: 'attendance_absent',
      priority: 'high',
      title: '🚨 تغيب عن الدوام',
      message: `الموظف ${employeeName} تغيب عن الدوام يوم ${date}. لم يتم تسجيل أي بصمة دخول.`,
      actionUrl: `/manager/attendance?date=${date}`,
      metadata: {
        employeeId,
        date,
        eventType: 'absent',
      },
    });

    return result !== null;
  } catch (err) {
    console.error('❌ notifyAbsentEmployee failed:', err);
    return false;
  }
}

// ════════════════════════════════════════════════════════════════
//  2. إشعار التأخير - يُرسل للمدير عند تأخير الموظف
// ════════════════════════════════════════════════════════════════

/**
 * إرسال إشعار للمدير عند تأخير الموظف
 */
export async function notifyLateEmployee(
  employeeId: string,
  date: string,
  lateMinutes: number
): Promise<boolean> {
  try {
    const employeeName = await getEmployeeName(employeeId);
    const lateHours = (lateMinutes / 60).toFixed(1);

    const severity = lateMinutes <= 30 ? 'normal' :
                     lateMinutes <= 60 ? 'high' : 'urgent';

    const message = lateMinutes <= 60
      ? `الموظف ${employeeName} تأخر ${lateMinutes} دقيقة يوم ${date}.`
      : `⚠️ الموظف ${employeeName} تأخر ${lateHours} ساعات يوم ${date}. هذا تجاوز كبير!`;

    const result = await notifyManager(employeeId, {
      type: 'attendance_late',
      priority: severity,
      title: `🕐 تأخير ${lateMinutes} دقيقة`,
      message,
      actionUrl: `/manager/attendance?date=${date}`,
      metadata: {
        employeeId,
        date,
        lateMinutes,
        eventType: 'late',
      },
    });

    return result !== null;
  } catch (err) {
    console.error('❌ notifyLateEmployee failed:', err);
    return false;
  }
}

// ════════════════════════════════════════════════════════════════
//  3. تأخير متكرر - يُرسل إشعار عاجل بعد 3 أيام تأخير متتالية
// ════════════════════════════════════════════════════════════════

/**
 * التحقق من وجود تأخير متكرر وإرسال إشعار عاجل
 * @param employeeId - معرف الموظف
 * @param employeeName - اسم الموظف
 * @returns true إذا تم إرسال إشعار
 */
export async function checkAndNotifyRepeatedLate(
  employeeId: string,
  employeeName: string
): Promise<boolean> {
  try {
    // جلب آخر 7 أيام من ملخص الحضور
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const summaries = await attendanceNotificationQueryService.findEmployeeSummaries(
      employeeId,
      startDate,
      endDate,
    );

    if (!summaries || summaries.length === 0) return false;

    // عد الأيام المتتالية من التأخير
    let consecutiveLateDays = 0;
    let totalLateMinutes = 0;
    const lateDates: string[] = [];

    for (const s of summaries) {
      if (s.status === 'متأخر') {
        consecutiveLateDays++;
        totalLateMinutes += s.late_minutes || 0;
        lateDates.push(s.shift_date);
      } else if (s.status !== 'عطلة' && s.status !== 'مجاز') {
        // إذا وجد يوم عمل بدون تأخير، نوقف العد
        // (لكننا نسمح بالعطل والإجازات)
        break;
      }
    }

    if (consecutiveLateDays >= 3) {
      // 🔴 تأخير متكرر! إرسال إشعار عاجل للمدير و HR
      await notifySupervisors(employeeId, {
        type: 'attendance_violation',
        priority: 'urgent',
        title: `🚨 تأخير متكرر! ${consecutiveLateDays} أيام`,
        message: `الموظف ${employeeName} تأخر ${consecutiveLateDays} أيام متتالية بمجموع ${totalLateMinutes} دقيقة.
الأيام: ${lateDates.join(', ')}`,
        actionUrl: `/manager/attendance`,
        metadata: {
          employeeId,
          consecutiveLateDays,
          totalLateMinutes,
          lateDates,
          eventType: 'repeated_late',
        },
      });

      // أيضاً إشعار لـ HR
      await notifyRole(['hr', 'admin'], {
        type: 'attendance_violation',
        priority: 'urgent',
        title: `🚨 [HR] تأخير متكرر: ${employeeName}`,
        message: `الموظف ${employeeName} - ${consecutiveLateDays} أيام تأخير متتالية.
المجموع: ${totalLateMinutes} دقيقة تأخير.`,
        actionUrl: `/hr/attendance`,
        metadata: {
          employeeId,
          consecutiveLateDays,
          totalLateMinutes,
          eventType: 'repeated_late_hr',
        },
      });

      return true;
    }

    return false;
  } catch (err) {
    console.error('❌ checkAndNotifyRepeatedLate failed:', err);
    return false;
  }
}

// ════════════════════════════════════════════════════════════════
//  4. تذكير صباحي - موظف لم يبصم بعد الساعة 10 صباحاً
// ════════════════════════════════════════════════════════════════

/**
 * التحقق من الموظفين الذين لم يبصموا بعد الساعة 10 صباحاً
 * وإرسال تذكير للمدير
 * @param managerId - معرف المدير
 * @param date - التاريخ (YYYY-MM-DD)
 */
export async function notifyMorningReminder(
  managerId: string,
  date: string
): Promise<void> {
  try {
    // جلب فريق المدير
    const team = await attendanceNotificationQueryService.findTeam(managerId, true);

    if (!team || team.length === 0) return;

    const teamIds = team.map(e => e.id);

    // جلب ملخصات الحضور لليوم
    const summaries = await attendanceNotificationQueryService.findDailySummaries(date, teamIds);

    // الموظفون الذين لم يبصموا
    const punchedIds = new Set((summaries || []).map(s => s.employee_id));
    const notPunched = team.filter(e => !punchedIds.has(e.id));

    if (notPunched.length === 0) return;

    // إرسال إشعار للمدير
    const names = notPunched.map(e => e.full_name).join(', ');
    await notifyUser(managerId, {
      type: 'attendance_recorded',
      priority: 'normal',
      title: '☀️ تذكير صباحي',
      message: `${notPunched.length} موظف لم يسجلوا حضورهم بعد: ${names}`,
      actionUrl: `/manager/attendance?date=${date}`,
      metadata: {
        date,
        notPunchedCount: notPunched.length,
        notPunchedIds: notPunched.map(e => e.id),
        eventType: 'morning_reminder',
      },
    });
  } catch (err) {
    console.error('❌ notifyMorningReminder failed:', err);
  }
}

// ════════════════════════════════════════════════════════════════
//  5. التقرير الأسبوعي للمدير
// ════════════════════════════════════════════════════════════════

/**
 * إرسال تقرير أسبوعي للمدير عن أداء فريقه
 */
export async function sendWeeklyReportToManager(
  managerId: string,
  managerName: string
): Promise<boolean> {
  try {
    const today = new Date();
    const weekEnd = today.toISOString().split('T')[0];
    const weekStart = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // جلب الفريق
    const team = await attendanceNotificationQueryService.findTeam(managerId);

    if (!team || team.length === 0) return false;

    const teamIds = team.map(e => e.id);

    // جلب ملخصات الأسبوع
    const summaries = await attendanceNotificationQueryService.findSummariesForEmployees(
      teamIds,
      weekStart,
      weekEnd,
    );

    if (!summaries) return false;

    // حساب الإحصائيات
    const empAbsences = new Map<string, number>();
    const empLate = new Map<string, number>();
    let totalPresent = 0;
    let totalAbsent = 0;
    let totalLate = 0;

    for (const s of summaries) {
      if (s.status === 'غائب') {
        totalAbsent++;
        empAbsences.set(s.employee_id, (empAbsences.get(s.employee_id) || 0) + 1);
      } else if (s.status === 'متأخر') {
        totalLate++;
        empLate.set(s.employee_id, (empLate.get(s.employee_id) || 0) + 1);
      } else if (s.status === 'حضور_بوقت') {
        totalPresent++;
      }
    }

    // أكثر الموظفين غياباً
    const topAbsentees = [...empAbsences.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, days]) => ({
        name: team.find(e => e.id === id)?.full_name || 'موظف',
        days,
      }));

    // أكثر الموظفين تأخيراً
    const topLate = [...empLate.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, days]) => ({
        name: team.find(e => e.id === id)?.full_name || 'موظف',
        days,
      }));

    const totalDays = totalPresent + totalAbsent + totalLate;
    const attendanceRate = totalDays > 0 ? Math.round(((totalPresent + totalLate) / totalDays) * 100) : 0;

    // بناء الرسالة
    let message = `📊 تقرير الأسبوع من ${weekStart} إلى ${weekEnd}\n`;
    message += `فريقك: ${team.length} موظف\n`;
    message += `نسبة الحضور: ${attendanceRate}%\n`;
    message += `✅ حضور: ${totalPresent} | 🟡 تأخير: ${totalLate} | 🔴 غياب: ${totalAbsent}\n\n`;

    if (topAbsentees.length > 0) {
      message += '🔴 الأكثر غياباً:\n';
      topAbsentees.forEach(e => { message += `  • ${e.name}: ${e.days} أيام\n`; });
    }

    if (topLate.length > 0) {
      message += '🟡 الأكثر تأخيراً:\n';
      topLate.forEach(e => { message += `  • ${e.name}: ${e.days} أيام\n`; });
    }

    // إرسال الإشعار
    await notifyUser(managerId, {
      type: 'attendance_recorded',
      priority: 'normal',
      title: `📊 تقرير حضور الأسبوعي`,
      message,
      actionUrl: `/manager/attendance`,
      metadata: {
        weekStart,
        weekEnd,
        totalEmployees: team.length,
        attendanceRate,
        totalPresent,
        totalAbsent,
        totalLate,
        eventType: 'weekly_report',
      },
    });

    return true;
  } catch (err) {
    console.error('❌ sendWeeklyReportToManager failed:', err);
    return false;
  }
}

// ════════════════════════════════════════════════════════════════
//  6. دالة مسح شامل (تستدعى بشكل دوري)
// ════════════════════════════════════════════════════════════════

/**
 * مسح شامل للحضور وإرسال الإشعارات المناسبة
 * تستدعى بشكل دوري (مثلاً كل ساعة)
 *
 * @param date - التاريخ المراد فحصه (default: اليوم)
 */
export async function runAttendanceScan(date?: string): Promise<{
  notifiedAbsent: number;
  notifiedLate: number;
  notifiedRepeatedLate: number;
  notifiedMorning: number;
  notifiedWeekly: number;
}> {
  const scanDate = date || new Date().toISOString().split('T')[0];
  const results = {
    notifiedAbsent: 0,
    notifiedLate: 0,
    notifiedRepeatedLate: 0,
    notifiedMorning: 0,
    notifiedWeekly: 0,
  };

  try {
    console.log(`🔍 بدء مسح الحضور لـ ${scanDate}...`);

    // جلب جميع ملخصات الحضور لليوم
    const summaries = await attendanceNotificationQueryService.findDailySummaries(scanDate);

    if (!summaries) return results;

    // جلب جميع الموظفين النشطين
    const employees = await attendanceNotificationQueryService.findActiveEmployees();

    const empMap = new Map((employees || []).map(e => [e.id, e]));

    for (const summary of summaries) {
      const emp = empMap.get(summary.employee_id);
      const empName = emp?.full_name || 'موظف';

      switch (summary.status) {
        case 'غائب': {
          // إشعار تغيب للمدير
          const sent = await notifyAbsentEmployee(summary.employee_id, scanDate);
          if (sent) results.notifiedAbsent++;
          break;
        }

        case 'متأخر': {
          // إشعار تأخير للمدير
          const lateMin = summary.late_minutes || 0;
          const sent = await notifyLateEmployee(summary.employee_id, scanDate, lateMin);
          if (sent) results.notifiedLate++;

          // التحقق من التأخير المتكرر
          const repeated = await checkAndNotifyRepeatedLate(summary.employee_id, empName);
          if (repeated) results.notifiedRepeatedLate++;
          break;
        }
      }
    }

    // إرسال التقارير الأسبوعية (يومياً للأسبوع الماضي)
    if (scanDate.endsWith('T00:00:00')) {
      // TODO: جدولة التقارير الأسبوعية عند الطلب
    }

    console.log(`✅ اكتمل مسح الحضور:`, results);
    return results;

  } catch (err) {
    console.error('❌ runAttendanceScan failed:', err);
    return results;
  }
}

// ════════════════════════════════════════════════════════════════
//  تصدير دالة الإشعار لمستخدم محدد (للاستخدام في المكونات)
// ════════════════════════════════════════════════════════════════

// إعادة تصدير من notificationService للراحة
export { notifyUser, notifyManager, notifySupervisors, notifyRole } from './notificationService';
