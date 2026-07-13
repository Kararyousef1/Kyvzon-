// ============================================================================
// Kyvzon Platform
// تصدير بيانات الحضور إلى CSV
// ============================================================================

import type { AttendanceSummary } from './shiftTypes';
import { STATUS_LABELS } from './shiftReports';

/**
 * تحويل الملخصات إلى صفوف CSV قابلة للتصدير
 */
export function attendanceToCSVRows(
  summaries: AttendanceSummary[],
  employeeNames: Record<string, string> = {}
): string[][] {
  const header = ['التاريخ', 'الموظف', 'الوردية', 'الدخول', 'الخروج', 'الساعات', 'تأخير (دق)', 'أوفرتايم (دق)', 'الحالة'];

  const rows = summaries.map(s => [
    s.shift_date,
    employeeNames[s.employee_id] || s.employee_id,
    s.shift_type || '--',
    s.check_in ? new Date(s.check_in).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' }) : '--',
    s.check_out ? new Date(s.check_out).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' }) : '--',
    s.total_hours.toFixed(2),
    s.late_minutes.toString(),
    s.overtime_minutes.toString(),
    STATUS_LABELS[s.status] || s.status,
  ]);

  return [header, ...rows];
}

/**
 * إنشاء نص CSV جاهز للتحميل
 */
export function generateCSV(
  summaries: AttendanceSummary[],
  employeeNames: Record<string, string> = {}
): string {
  const rows = attendanceToCSVRows(summaries, employeeNames);
  return rows
    .map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

/**
 * إنشاء ملف CSV وتحميله في المتصفح
 */
export function downloadCSV(
  summaries: AttendanceSummary[],
  filename: string,
  employeeNames: Record<string, string> = {}
): void {
  const csv = generateCSV(summaries, employeeNames);
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}