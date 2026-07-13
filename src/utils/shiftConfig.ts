// ============================================================================
// Kyvzon Platform
// إعدادات الورديات والحضور الافتراضية
// ============================================================================

import type { ShiftsConfig, ShiftWindows, CompanyPolicy } from './shiftTypes';

/** إعدادات الورديات الافتراضية */
export const DEFAULT_SHIFT_TIMINGS: ShiftsConfig = {
  صباحي: { start: '08:00', end: '16:00', hours: 8 },
  مسائي: { start: '16:00', end: '00:00', hours: 8 },
  ليلي: { start: '00:00', end: '08:00', hours: 8 },
};

/** نوافذ البصمة الافتراضية */
export const DEFAULT_SHIFT_WINDOWS: ShiftWindows = {
  صباحي: { from: '06:00', to: '10:00' },
  مسائي: { from: '14:00', to: '18:00' },
  ليلي: { from: '22:00', to: '02:00' },
};

/** سياسة الشركة الافتراضية */
export const DEFAULT_POLICY: CompanyPolicy = {
  overtime: {
    dailyThresholdMinutes: 60,
    normalMultiplier: 1.5,
    holidayMultiplier: 2.0,
    monthlyLimitMinutes: 3600,
    requiresApproval: true,
  },
  late: {
    gracePeriodMinutes: 15,
    halfDayThreshold: 60,
    fullDayThreshold: 120,
    deductionPerMinute: 500,
  },
  workDaysPerWeek: 6,
  workHoursPerDay: 8,
};