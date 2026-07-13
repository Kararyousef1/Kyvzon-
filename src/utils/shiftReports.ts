// ============================================================================
// Kyvzon Platform
// تقارير الحضور التحليلية وإحصائيات الفريق
// ============================================================================

import type { AttendanceSummary, EmployeeAttendanceReport, AttendanceStatus } from './shiftTypes';

/** ألوان حالات الحضور */
export const STATUS_COLORS: Record<AttendanceStatus, string> = {
  حضور_بوقت: '#22C55E',        // أخضر
  متأخر: '#EAB308',             // أصفر
  زمنية_معتمدة: '#3B82F6',     // أزرق
  زمنية_انتظار: '#EAB308',     // أصفر
  مجاز: '#A855F7',              // بنفسجي
  إجازة_انتظار: '#EAB308',     // أصفر
  غائب: '#EF4444',              // أحمر
  عطلة: '#9CA3AF',              // رمادي
};

/** أيقونات حالات الحضور */
export const STATUS_ICONS: Record<AttendanceStatus, string> = {
  حضور_بوقت: 'check-circle',
  متأخر: 'clock',
  زمنية_معتمدة: 'file-check',
  زمنية_انتظار: 'clock',
  مجاز: 'umbrella',
  إجازة_انتظار: 'clock',
  غائب: 'x-circle',
  عطلة: 'calendar-off',
};

/** تسميات حالات الحضور */
export const STATUS_LABELS: Record<AttendanceStatus, string> = {
  حضور_بوقت: 'حضور بوقت',
  متأخر: 'متأخر',
  زمنية_معتمدة: 'زمنية معتمدة',
  زمنية_انتظار: 'زمنية انتظار',
  مجاز: 'مجاز',
  إجازة_انتظار: 'إجازة انتظار',
  غائب: 'غائب',
  عطلة: 'عطلة',
};

/** ألوان أنواع الزمنيات */
export const PERMISSION_TYPE_COLORS: Record<string, string> = {
  عادية: '#22C55E',
  مغادرة: '#EF4444',
  تعويضية: '#3B82F6',
  بدون_راتب: '#9CA3AF',
};

/**
 * تحليل حضور موظف في نطاق تاريخي وإنشاء تقرير كامل
 */
export function generateEmployeeReport(
  employeeId: string,
  fullName: string,
  department: string,
  summaries: AttendanceSummary[]
): EmployeeAttendanceReport {
  const totalDays = summaries.length;
  const presentDays = summaries.filter(s => s.status === 'حضور_بوقت' || s.status === 'زمنية_معتمدة').length;
  const absentDays = summaries.filter(s => s.status === 'غائب').length;
  const lateDays = summaries.filter(s => s.status === 'متأخر').length;
  const leaveDays = summaries.filter(s => s.status === 'مجاز' || s.status === 'إجازة_انتظار').length;
  const holidayDays = summaries.filter(s => s.status === 'عطلة').length;

  const overtimeTotalHours = summaries.reduce((sum, s) => sum + s.overtime_minutes, 0) / 60;
  const lateTotalMinutes = summaries.reduce((sum, s) => sum + s.late_minutes, 0);

  const attendanceRate = totalDays > 0
    ? Math.round(((presentDays + lateDays) / totalDays) * 100)
    : 0;

  return {
    employee_id: employeeId,
    full_name: fullName,
    department,
    total_days: totalDays,
    present_days: presentDays,
    absent_days: absentDays,
    late_days: lateDays,
    leave_days: leaveDays,
    holiday_days: holidayDays,
    overtime_total_hours: Math.round(overtimeTotalHours * 100) / 100,
    late_total_minutes: lateTotalMinutes,
    attendance_rate: attendanceRate,
  };
}

/**
 * إنشاء تقارير لجميع أعضاء الفريق
 */
export function generateTeamReports(
  summaries: AttendanceSummary[],
  employees: { id: string; full_name: string; department: string }[]
): EmployeeAttendanceReport[] {
  return employees.map(emp => {
    const empSummaries = summaries.filter(s => s.employee_id === emp.id);
    return generateEmployeeReport(emp.id, emp.full_name, emp.department, empSummaries);
  });
}

/**
 * الحصول على إحصائيات سريعة للفريق
 */
export function getTeamQuickStats(
  reports: EmployeeAttendanceReport[]
): {
  totalEmployees: number;
  averageAttendanceRate: number;
  totalAbsentDays: number;
  totalLateDays: number;
  totalOvertimeHours: number;
  topPerformers: EmployeeAttendanceReport[];
  underPerformers: EmployeeAttendanceReport[];
} {
  const totalEmployees = reports.length;
  const totalAbsentDays = reports.reduce((sum, r) => sum + r.absent_days, 0);
  const totalLateDays = reports.reduce((sum, r) => sum + r.late_days, 0);
  const totalOvertimeHours = reports.reduce((sum, r) => sum + r.overtime_total_hours, 0);
  const averageAttendanceRate = totalEmployees > 0
    ? Math.round(reports.reduce((sum, r) => sum + r.attendance_rate, 0) / totalEmployees)
    : 0;

  const sortedByRate = [...reports].sort((a, b) => b.attendance_rate - a.attendance_rate);
  const topPerformers = sortedByRate.slice(0, 5);
  const underPerformers = sortedByRate.reverse().slice(0, 5);

  return {
    totalEmployees,
    averageAttendanceRate,
    totalAbsentDays,
    totalLateDays,
    totalOvertimeHours: Math.round(totalOvertimeHours * 100) / 100,
    topPerformers,
    underPerformers,
  };
}

/**
 * إحصائيات حضور يومية (لـ Dashboard)
 */
export function getDailyAttendanceStats(
  summaries: AttendanceSummary[]
): {
  total: number;
  present: number;
  absent: number;
  late: number;
  onLeave: number;
  onHoliday: number;
  permissionPending: number;
  permissionApproved: number;
  attendanceRate: number;
} {
  const total = summaries.length;
  if (total === 0) {
    return { total: 0, present: 0, absent: 0, late: 0, onLeave: 0, onHoliday: 0, permissionPending: 0, permissionApproved: 0, attendanceRate: 0 };
  }

  const present = summaries.filter(s => s.status === 'حضور_بوقت').length;
  const absent = summaries.filter(s => s.status === 'غائب').length;
  const late = summaries.filter(s => s.status === 'متأخر').length;
  const onLeave = summaries.filter(s => s.status === 'مجاز' || s.status === 'إجازة_انتظار').length;
  const onHoliday = summaries.filter(s => s.status === 'عطلة').length;
  const permissionApproved = summaries.filter(s => s.status === 'زمنية_معتمدة').length;
  const permissionPending = summaries.filter(s => s.status === 'زمنية_انتظار').length;

  const effectivePresent = present + late + permissionApproved + permissionPending;
  const attendanceRate = Math.round((effectivePresent / total) * 100);

  return {
    total,
    present,
    absent,
    late,
    onLeave,
    onHoliday,
    permissionPending,
    permissionApproved,
    attendanceRate,
  };
}