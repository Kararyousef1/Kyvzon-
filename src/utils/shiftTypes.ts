// ============================================================================
// Kyvzon Platform
// أنواع بيانات الورديات والحضور
// ============================================================================

/**
 * أنواع الورديات الثلاث
 */
export type ShiftType = 'صباحي' | 'مسائي' | 'ليلي';

/**
 * حالات الحضور الثمانية
 */
export type AttendanceStatus =
  | 'حضور_بوقت'
  | 'متأخر'
  | 'زمنية_معتمدة'
  | 'زمنية_انتظار'
  | 'مجاز'
  | 'إجازة_انتظار'
  | 'غائب'
  | 'عطلة';

/**
 * أنواع الزمنيات الأربعة
 */
export type PermissionType = 'عادية' | 'مغادرة' | 'تعويضية' | 'بدون_راتب';

/**
 * حالة الزمنية
 */
export type PermissionStatus = 'انتظار' | 'موافق' | 'مرفوض';

/**
 * أنواع البصمة
 */
export type VerificationType = 'finger' | 'face' | 'card' | 'password';

/** إعدادات الوردية الواحدة */
export interface ShiftConfig {
  start: string;   // HH:mm
  end: string;     // HH:mm
  hours: number;   // عدد ساعات الوردية
}

/** إعدادات كل الورديات */
export interface ShiftsConfig {
  صباحي: ShiftConfig;
  مسائي: ShiftConfig;
  ليلي: ShiftConfig;
}

/** نافذة تحديد الوردية من بصمة الدخول */
export interface ShiftWindow {
  from: string;  // HH:mm
  to: string;    // HH:mm
}

/** نوافذ كل الورديات */
export interface ShiftWindows {
  صباحي: ShiftWindow;
  مسائي: ShiftWindow;
  ليلي: ShiftWindow;
}

/** سجل بصمة واحد */
export interface AttendanceLog {
  id: number;
  employee_id: string;
  punch_time: string;      // ISO timestamp
  punch_type?: string;
  shift_type?: ShiftType;
  shift_date: string;      // YYYY-MM-DD
  device_id?: string;
  verification_type?: VerificationType;
  source?: 'ADMS' | 'Python';
  created_at: string;
}

/** ملخص الحضور اليومي */
export interface AttendanceSummary {
  id: number;
  employee_id: string;
  shift_date: string;
  shift_type?: ShiftType;
  check_in?: string;
  check_out?: string;
  total_hours: number;
  late_minutes: number;
  early_leave_minutes: number;
  overtime_minutes: number;
  status: AttendanceStatus;
}

/** تقرير تحليلي للمدير عن موظف في نطاق تاريخي */
export interface EmployeeAttendanceReport {
  employee_id: string;
  full_name: string;
  department: string;
  total_days: number;
  present_days: number;
  absent_days: number;
  late_days: number;
  leave_days: number;
  holiday_days: number;
  overtime_total_hours: number;
  late_total_minutes: number;
  attendance_rate: number; // نسبة الحضور %
}

/** سياسة الأوفرتايم */
export interface OvertimePolicy {
  dailyThresholdMinutes: number;
  normalMultiplier: number;
  holidayMultiplier: number;
  monthlyLimitMinutes: number;
  requiresApproval: boolean;
}

/** سياسة التأخير */
export interface LatePolicy {
  gracePeriodMinutes: number;
  halfDayThreshold: number;
  fullDayThreshold: number;
  deductionPerMinute: number;
}

/** إعدادات سياسة الشركة الكاملة */
export interface CompanyPolicy {
  overtime: OvertimePolicy;
  late: LatePolicy;
  workDaysPerWeek: number;
  workHoursPerDay: number;
}

/** سياق تحديد حالة الحضور */
export interface AttendanceContext {
  hasPunch: boolean;
  checkIn?: string | Date;
  checkOut?: string | Date;
  shiftType: ShiftType;
  hasApprovedLeave: boolean;
  hasPendingLeave: boolean;
  hasApprovedPermission: boolean;
  hasPendingPermission: boolean;
  isFriday: boolean;
  isHoliday: boolean;
  shiftTimings?: ShiftsConfig;
}