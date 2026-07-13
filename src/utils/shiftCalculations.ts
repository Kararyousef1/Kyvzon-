// ============================================================================
// Kyvzon Platform
// حسابات الورديات: التأخير، الخروج المبكر، الأوفرتايم، وتحديد الحالة
// ============================================================================

import type { ShiftType, ShiftsConfig, AttendanceContext, AttendanceStatus, ShiftWindows, AttendanceLog, AttendanceSummary } from './shiftTypes';
import { DEFAULT_BUSINESS_TIME_ZONE, DEFAULT_SHIFT_TIMINGS, DEFAULT_SHIFT_WINDOWS, DEFAULT_POLICY } from './shiftConfig';

// ─── أدوات مساعدة للوقت ─────────────────────────────────────────

/** تحويل نص وقت (HH:mm) إلى دقائق من منتصف الليل */
export function timeToMinutes(time: string): number {
  if (!time) return 0;
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/** تحويل الدقائق إلى نص HH:mm */
export function minutesToTime(minutes: number): string {
  const h = Math.floor(((minutes % 1440) + 1440) % 1440 / 60);
  const m = Math.floor(((minutes % 1440) + 1440) % 1440 % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * استخراج وقت العمل من timestamp في منطقة الشركة، لا في منطقة الجهاز/CI.
 * هذا يمنع اختلاف نتائج الحضور بين المتصفح وبيئة الاختبار والخادم.
 */
function getBusinessTimeMinutes(value: string | Date): number {
  if (typeof value === 'string' && /^\d{1,2}:\d{2}$/.test(value)) {
    return timeToMinutes(value);
  }

  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid timestamp: ${String(value)}`);
  }

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: DEFAULT_BUSINESS_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0);
  return hour * 60 + minute;
}

/** تحويل ISO timestamp إلى دقائق في منطقة أعمال بغداد */
export function timestampToMinutes(isoString: string): number {
  return getBusinessTimeMinutes(isoString);
}

/** تحويل ISO timestamp إلى نص HH:mm */
export function timestampToTime(isoString: string): string {
  return minutesToTime(timestampToMinutes(isoString));
}

/** فرق الدقائق بين وقتين HH:mm (مع مراعاة منتصف الليل) */
export function diffMinutes(from: string, to: string): number {
  const fromMin = timeToMinutes(from);
  const toMin = timeToMinutes(to);
  if (toMin >= fromMin) return toMin - fromMin;
  return (1440 - fromMin) + toMin;
}

/** تحقق هل الوقت ضمن النطاق (مع مراعاة الوردية الليلية) */
function isTimeInRange(
  timeMinutes: number,
  rangeFrom: number,
  rangeTo: number
): boolean {
  if (rangeFrom <= rangeTo) {
    return timeMinutes >= rangeFrom && timeMinutes < rangeTo;
  }
  return timeMinutes >= rangeFrom || timeMinutes < rangeTo;
}

// ─── تحديد الوردية ─────────────────────────────────────────────

/** تحديد الوردية بناءً على وقت البصمة */
export function determineShift(
  punchTime: string | Date,
  windows: ShiftWindows = DEFAULT_SHIFT_WINDOWS
): ShiftType {
  const minutes = getBusinessTimeMinutes(punchTime);

  const صباحيFrom = timeToMinutes(windows.صباحي.from);
  const صباحيTo = timeToMinutes(windows.صباحي.to);
  const مسائيFrom = timeToMinutes(windows.مسائي.from);
  const مسائيTo = timeToMinutes(windows.مسائي.to);
  const ليليFrom = timeToMinutes(windows.ليلي.from);
  const ليليTo = timeToMinutes(windows.ليلي.to);

  if (isTimeInRange(minutes, صباحيFrom, صباحيTo)) return 'صباحي';
  if (isTimeInRange(minutes, مسائيFrom, مسائيTo)) return 'مسائي';
  if (isTimeInRange(minutes, ليليFrom, ليليTo)) return 'ليلي';

  // خارج النوافذ - تخمين بأقرب وردية
  if (minutes >= 360 && minutes < 840) return 'صباحي';    // 06:00 - 14:00
  if (minutes >= 840 && minutes < 1320) return 'مسائي';   // 14:00 - 22:00
  return 'ليلي';                                            // 22:00 - 06:00
}

/** الحصول على تاريخ الوردية (YYYY-MM-DD) */
export function getShiftDate(punchTime: string | Date): string {
  const date = typeof punchTime === 'string' ? new Date(punchTime) : punchTime;
  return date.toISOString().split('T')[0];
}

// ─── حساب التأخير والخروج المبكر والأوفرتايم ───────────────────

/** حساب دقائق التأخير مع مراعاة مهلة السماح */
export function calculateLateMinutes(
  checkInTime: string | Date,
  shiftType: ShiftType,
  shiftTimings: ShiftsConfig = DEFAULT_SHIFT_TIMINGS,
  gracePeriodMinutes: number = DEFAULT_POLICY.late.gracePeriodMinutes
): number {
  const checkInMinutes = getBusinessTimeMinutes(checkInTime);

  const shiftStartMinutes = timeToMinutes(shiftTimings[shiftType].start);

  if (checkInMinutes <= shiftStartMinutes) return 0;

  if (shiftType === 'ليلي') {
    if (checkInMinutes >= 0 && checkInMinutes < 120) {
      const rawLate = Math.max(0, checkInMinutes - shiftStartMinutes);
      return Math.max(0, rawLate - gracePeriodMinutes);
    }
  }

  const rawLate = checkInMinutes - shiftStartMinutes;
  return Math.max(0, rawLate - gracePeriodMinutes);
}

/** حساب دقائق الخروج المبكر */
export function calculateEarlyLeaveMinutes(
  checkOutTime: string | Date,
  shiftType: ShiftType,
  shiftTimings: ShiftsConfig = DEFAULT_SHIFT_TIMINGS
): number {
  let checkOutMinutes = getBusinessTimeMinutes(checkOutTime);
  const shiftStartMinutes = timeToMinutes(shiftTimings[shiftType].start);
  let shiftEndMinutes = timeToMinutes(shiftTimings[shiftType].end);
  const crossesMidnight = shiftEndMinutes <= shiftStartMinutes;

  if (crossesMidnight) {
    shiftEndMinutes += 1440;
    if (checkOutMinutes < shiftStartMinutes) checkOutMinutes += 1440;
  }

  if (checkOutMinutes >= shiftEndMinutes) return 0;
  return Math.max(0, shiftEndMinutes - checkOutMinutes);
}

/** حساب دقائق الأوفرتايم (الوقت الإضافي) */
export function calculateOvertimeMinutes(
  totalWorkMinutes: number,
  shiftType: ShiftType,
  shiftTimings: ShiftsConfig = DEFAULT_SHIFT_TIMINGS,
  isHoliday: boolean = false
): number {
  const shiftMinutes = shiftTimings[shiftType].hours * 60;

  if (totalWorkMinutes <= shiftMinutes) return 0;
  const overtimeMinutes = totalWorkMinutes - shiftMinutes;

  if (isHoliday) return totalWorkMinutes;

  return overtimeMinutes;
}

/** حساب دقائق الأوفرتايم التفصيلية (قبل وبعد الوردية) */
export function calculateDetailedOvertime(
  checkIn: string | Date,
  checkOut: string | Date,
  shiftType: ShiftType,
  shiftTimings: ShiftsConfig = DEFAULT_SHIFT_TIMINGS
): { beforeShift: number; afterShift: number; totalOvertime: number } {
  const checkInMin = getBusinessTimeMinutes(checkIn);
  let checkOutMin = getBusinessTimeMinutes(checkOut);

  const shiftStart = timeToMinutes(shiftTimings[shiftType].start);
  let shiftEnd = timeToMinutes(shiftTimings[shiftType].end);
  const crossesMidnight = shiftEnd <= shiftStart;
  if (crossesMidnight) {
    shiftEnd += 1440;
    if (checkOutMin < shiftStart) checkOutMin += 1440;
  }

  let beforeShift = 0;
  let afterShift = 0;

  if (checkInMin < shiftStart) {
    beforeShift = shiftStart - checkInMin;
  }

  if (checkOutMin > shiftEnd) {
    afterShift = checkOutMin - shiftEnd;
  }

  return { beforeShift, afterShift, totalOvertime: beforeShift + afterShift };
}

/** حساب إجمالي ساعات العمل */
export function calculateTotalHours(
  checkIn: string | Date,
  checkOut: string | Date
): number {
  const inDate = typeof checkIn === 'string' ? new Date(checkIn) : checkIn;
  const outDate = typeof checkOut === 'string' ? new Date(checkOut) : checkOut;
  const diffMs = outDate.getTime() - inDate.getTime();
  return Math.round((diffMs / 3600000) * 100) / 100;
}

/** حساب صافي ساعات العمل بعد خصم الزمنيات */
export function calculateNetWorkHours(
  totalHours: number,
  permissionMinutes: number = 0
): number {
  const permissionHours = permissionMinutes / 60;
  const net = totalHours - permissionHours;
  return Math.max(0, Math.round(net * 100) / 100);
}

/** حساب الخصم المالي للتأخير */
export function calculateLateDeduction(
  lateMinutes: number,
  gracePeriodMinutes: number = DEFAULT_POLICY.late.gracePeriodMinutes,
  deductionPerMinute: number = DEFAULT_POLICY.late.deductionPerMinute
): number {
  if (lateMinutes <= gracePeriodMinutes) return 0;
  const chargeableMinutes = lateMinutes - gracePeriodMinutes;
  return chargeableMinutes * deductionPerMinute;
}

/** تصنيف التأخير */
export function classifyLateness(
  lateMinutes: number,
  gracePeriodMinutes: number = DEFAULT_POLICY.late.gracePeriodMinutes,
  halfDayThreshold: number = DEFAULT_POLICY.late.halfDayThreshold,
  fullDayThreshold: number = DEFAULT_POLICY.late.fullDayThreshold
): { type: 'none' | 'simple' | 'moderate' | 'half_day' | 'full_day'; label: string } {
  // السماح يحدد فقط حالة "في الوقت"؛ حدود التصنيف تقاس من التأخير الخام.
  if (lateMinutes <= gracePeriodMinutes) return { type: 'none', label: 'في الوقت' };
  if (lateMinutes < 30) return { type: 'simple', label: 'تأخير بسيط' };
  if (lateMinutes < halfDayThreshold) return { type: 'moderate', label: 'تأخير متوسط' };
  if (lateMinutes < fullDayThreshold) return { type: 'half_day', label: 'نصف يوم غياب' };
  return { type: 'full_day', label: 'غياب كامل' };
}

// ─── تحديد حالة الحضور ─────────────────────────────────────────

/**
 * تحديد حالة الحضور حسب المنطق الصارم:
 * 1. لم يبصم → عطلة/مجاز/إجازة_انتظار/غائب
 * 2. بصم → حضور_بوقت/متأخر/زمنية_معتمدة/زمنية_انتظار
 */
export function determineAttendanceStatus(context: AttendanceContext): AttendanceStatus {
  const {
    hasPunch, hasApprovedLeave, hasPendingLeave,
    hasApprovedPermission, hasPendingPermission,
    isFriday, isHoliday, shiftType, checkOut
  } = context;

  // العطلة الرسمية/الجمعة لها أولوية حتى لو وصلت بصمة.
  if (isFriday || isHoliday) return 'عطلة';

  // الموظف لم يبصم
  if (!hasPunch) {
    if (hasApprovedLeave) return 'مجاز';
    if (hasPendingLeave) return 'إجازة_انتظار';
    return 'غائب';
  }

  const lateMinutes = context.checkIn
    ? calculateLateMinutes(context.checkIn, shiftType, context.shiftTimings)
    : 0;

  if (lateMinutes > 0) {
    if (checkOut && hasApprovedPermission) return 'زمنية_معتمدة';
    if (checkOut && hasPendingPermission) return 'زمنية_انتظار';
    return 'متأخر';
  }

  // حضور بوقت
  if (checkOut) {
    const earlyMinutes = calculateEarlyLeaveMinutes(checkOut, shiftType, context.shiftTimings);
    if (earlyMinutes > 0) {
      if (hasApprovedPermission) return 'زمنية_معتمدة';
      if (hasPendingPermission) return 'زمنية_انتظار';
      return 'متأخر';
    }
  }

  return 'حضور_بوقت';
}

/** استخراج أول وآخر بصمة من قائمة البصمات */
export function extractPunchTimes(
  logs: AttendanceLog[]
): { checkIn?: AttendanceLog; checkOut?: AttendanceLog } {
  if (!logs || logs.length === 0) return {};

  const sorted = [...logs].sort(
    (a, b) => new Date(a.punch_time).getTime() - new Date(b.punch_time).getTime()
  );

  return {
    checkIn: sorted[0],
    // بصمة واحدة تعني دخولاً فقط؛ لا نختلق وقت خروج.
    checkOut: sorted.length > 1 ? sorted[sorted.length - 1] : undefined,
  };
}

/** الحصول على حالة الحضور من البيانات الفعلية */
export function getAttendanceStatusFromData(
  logs: AttendanceLog[],
  options: {
    isFriday?: boolean;
    isHoliday?: boolean;
    hasApprovedLeave?: boolean;
    hasPendingLeave?: boolean;
    hasApprovedPermission?: boolean;
    hasPendingPermission?: boolean;
  } = {}
): AttendanceStatus {
  const { checkIn, checkOut } = extractPunchTimes(logs);

  const context: AttendanceContext = {
    hasPunch: !!checkIn,
    checkIn: checkIn?.punch_time,
    checkOut: checkOut?.punch_time,
    shiftType: checkIn?.shift_type || 'صباحي',
    isFriday: options.isFriday ?? false,
    isHoliday: options.isHoliday ?? false,
    hasApprovedLeave: options.hasApprovedLeave ?? false,
    hasPendingLeave: options.hasPendingLeave ?? false,
    hasApprovedPermission: options.hasApprovedPermission ?? false,
    hasPendingPermission: options.hasPendingPermission ?? false,
  };

  return determineAttendanceStatus(context);
}

/** تجميع البصمات حسب الموظف والتاريخ */
export function groupAttendanceByEmployeeAndDate(
  logs: AttendanceLog[]
): Map<string, Map<string, AttendanceLog[]>> {
  const grouped = new Map<string, Map<string, AttendanceLog[]>>();

  for (const log of logs) {
    const empKey = log.employee_id;
    const dateKey = log.shift_date || log.punch_time.split('T')[0];

    if (!grouped.has(empKey)) {
      grouped.set(empKey, new Map());
    }

    const empDates = grouped.get(empKey)!;
    if (!empDates.has(dateKey)) {
      empDates.set(dateKey, []);
    }

    empDates.get(dateKey)!.push(log);
  }

  return grouped;
}

/** إنشاء ملخص حضور كامل ليوم واحد من سجلات البصمة */
export function createAttendanceSummary(
  employeeId: string,
  logs: AttendanceLog[],
  date: string,
  options: {
    isFriday?: boolean;
    isHoliday?: boolean;
    hasApprovedLeave?: boolean;
    hasPendingLeave?: boolean;
    hasApprovedPermission?: boolean;
    hasPendingPermission?: boolean;
    shiftTimings?: ShiftsConfig;
  } = {}
): AttendanceSummary {
  const { checkIn, checkOut } = extractPunchTimes(logs);

  if (!checkIn) {
    const status = determineAttendanceStatus({
      hasPunch: false,
      shiftType: 'صباحي',
      isFriday: options.isFriday ?? false,
      isHoliday: options.isHoliday ?? false,
      hasApprovedLeave: options.hasApprovedLeave ?? false,
      hasPendingLeave: options.hasPendingLeave ?? false,
      hasApprovedPermission: options.hasApprovedPermission ?? false,
      hasPendingPermission: options.hasPendingPermission ?? false,
    });

    return {
      id: 0,
      employee_id: employeeId,
      shift_date: date,
      shift_type: undefined,
      check_in: undefined,
      check_out: undefined,
      total_hours: 0,
      late_minutes: 0,
      early_leave_minutes: 0,
      overtime_minutes: 0,
      status,
    };
  }

  const shiftType = checkIn.shift_type || 'صباحي';
  const shiftTimings = options.shiftTimings || DEFAULT_SHIFT_TIMINGS;

  const totalHours = checkOut
    ? calculateTotalHours(checkIn.punch_time, checkOut.punch_time)
    : 0;

  const totalMinutes = Math.round(totalHours * 60);

  const lateMinutes = calculateLateMinutes(checkIn.punch_time, shiftType, shiftTimings);
  const earlyLeaveMinutes = checkOut
    ? calculateEarlyLeaveMinutes(checkOut.punch_time, shiftType, shiftTimings)
    : 0;
  const overtimeMinutes = checkOut
    ? calculateOvertimeMinutes(totalMinutes, shiftType, shiftTimings, options.isHoliday)
    : 0;

  const status = determineAttendanceStatus({
    hasPunch: true,
    checkIn: checkIn.punch_time,
    checkOut: checkOut?.punch_time,
    shiftType,
    isFriday: options.isFriday ?? false,
    isHoliday: options.isHoliday ?? false,
    hasApprovedLeave: options.hasApprovedLeave ?? false,
    hasPendingLeave: options.hasPendingLeave ?? false,
    hasApprovedPermission: options.hasApprovedPermission ?? false,
    hasPendingPermission: options.hasPendingPermission ?? false,
    shiftTimings,
  });

  return {
    id: 0,
    employee_id: employeeId,
    shift_date: date,
    shift_type: shiftType,
    check_in: checkIn.punch_time,
    check_out: checkOut?.punch_time,
    total_hours: Math.round(totalHours * 100) / 100,
    late_minutes: lateMinutes,
    early_leave_minutes: earlyLeaveMinutes,
    overtime_minutes: overtimeMinutes,
    status,
  };
}

/** إنشاء ملخصات حضور لمجموعة موظفين وتواريخ */
export function createBulkAttendanceSummaries(
  logs: AttendanceLog[],
  employees: { id: string; department?: string }[],
  dateRange: { from: string; to: string },
  options: {
    isFriday?: (date: string) => boolean;
    isHoliday?: (date: string) => boolean;
    hasApprovedLeave?: (empId: string, date: string) => boolean;
    hasPendingLeave?: (empId: string, date: string) => boolean;
    hasApprovedPermission?: (empId: string, date: string) => boolean;
    hasPendingPermission?: (empId: string, date: string) => boolean;
    shiftTimings?: ShiftsConfig;
  } = {}
): AttendanceSummary[] {
  const grouped = groupAttendanceByEmployeeAndDate(logs);
  const summaries: AttendanceSummary[] = [];

  const startDate = new Date(`${dateRange.from}T00:00:00Z`);
  const endDate = new Date(`${dateRange.to}T00:00:00Z`);

  for (const emp of employees) {
    const empLogs = grouped.get(emp.id);

    for (let d = new Date(startDate); d <= endDate; d.setUTCDate(d.getUTCDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const dayLogs = empLogs?.get(dateStr) || [];

      const summary = createAttendanceSummary(emp.id, dayLogs, dateStr, {
        isFriday: options.isFriday?.(dateStr) ?? d.getUTCDay() === 5,
        isHoliday: options.isHoliday?.(dateStr) ?? false,
        hasApprovedLeave: options.hasApprovedLeave?.(emp.id, dateStr) ?? false,
        hasPendingLeave: options.hasPendingLeave?.(emp.id, dateStr) ?? false,
        hasApprovedPermission: options.hasApprovedPermission?.(emp.id, dateStr) ?? false,
        hasPendingPermission: options.hasPendingPermission?.(emp.id, dateStr) ?? false,
        shiftTimings: options.shiftTimings,
      });

      summaries.push(summary);
    }
  }

  return summaries;
}