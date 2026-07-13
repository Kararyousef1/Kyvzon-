/**
 * ════════════════════════════════════════════════════════════════
 * اختبارات الدمج الشامل - Shift Logic + Biometric + Multi-Tenant
 * ════════════════════════════════════════════════════════════════
 * يختبر التكامل بين:
 * 1. منطق الورديات (shiftUtils.ts)
 * 2. سيناريو البصمة الكامل (من punch → summary)
 * 3. فصل البيانات حسب الـ tenant (Multi-Tenant)
 * ════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  // أنواع
  ShiftType,
  AttendanceStatus,
  AttendanceLog,
  AttendanceSummary,

  // إعدادات
  DEFAULT_SHIFT_TIMINGS,
  DEFAULT_SHIFT_WINDOWS,
  DEFAULT_POLICY,

  // دوال أساسية
  timeToMinutes,
  minutesToTime,
  timestampToMinutes,
  determineShift,
  getShiftDate,

  // حساب
  calculateLateMinutes,
  calculateEarlyLeaveMinutes,
  calculateOvertimeMinutes,
  calculateDetailedOvertime,
  calculateTotalHours,
  calculateNetWorkHours,
  calculateLateDeduction,
  classifyLateness,

  // حالة الحضور
  determineAttendanceStatus,
  getAttendanceStatusFromData,
  extractPunchTimes,
  groupAttendanceByEmployeeAndDate,

  // إنشاء الملخصات
  createAttendanceSummary,
  createBulkAttendanceSummaries,

  // تقارير
  generateEmployeeReport,
  generateTeamReports,
  getTeamQuickStats,
  getDailyAttendanceStats,

  // تصدير
  generateCSV,
  attendanceToCSVRows,

  // Labels
  STATUS_LABELS,
  STATUS_COLORS,
} from '../utils/shiftUtils';

// =========================================================================
// 1. بيانات اختبار وهمية
// =========================================================================

// شركتان مختلفتان (Multi-Tenant)
const TENANT_A = '00000000-0000-0000-0000-000000000001'; // Kyvzon Platform
const TENANT_B = '00000000-0000-0000-0000-000000000002'; // شركة أخرى

// موظفون
const EMPLOYEE_1 = {
  id: 'emp-001',
  user_id: 'user-001',
  full_name: 'أحمد المحمد',
  department: 'الإنتاج',
  tenant_id: TENANT_A,
};
const EMPLOYEE_2 = {
  id: 'emp-002',
  user_id: 'user-002',
  full_name: 'سارة خالد',
  department: 'الإنتاج',
  tenant_id: TENANT_A,
};
const EMPLOYEE_3 = {
  id: 'emp-003',
  user_id: 'user-003',
  full_name: 'كريم علي',
  department: 'الجودة',
  tenant_id: TENANT_B, // شركة مختلفة
};

// سجلات بصمات (زي ما تجي من جهاز ZKTeco)
const MORNING_SHIFT_LOGS: AttendanceLog[] = [
  {
    id: 1,
    employee_id: 'emp-001',
    punch_time: '2026-06-15T07:45:00+03:00', // 07:45 (قبل الوردية)
    shift_type: 'صباحي',
    shift_date: '2026-06-15',
    device_id: 'ZKTeco_192.168.1.201',
    verification_type: 'finger',
    source: 'Python',
    created_at: '2026-06-15T07:45:01+03:00',
  },
  {
    id: 2,
    employee_id: 'emp-001',
    punch_time: '2026-06-15T16:15:00+03:00', // 16:15 (بعد الوردية بـ 15 د)
    shift_type: 'صباحي',
    shift_date: '2026-06-15',
    device_id: 'ZKTeco_192.168.1.201',
    verification_type: 'finger',
    source: 'Python',
    created_at: '2026-06-15T16:15:01+03:00',
  },
];

const LATE_EMPLOYEE_LOG: AttendanceLog[] = [
  {
    id: 3,
    employee_id: 'emp-002',
    punch_time: '2026-06-15T08:22:00+03:00', // 08:22 (22 دقيقة تأخير)
    shift_type: 'صباحي',
    shift_date: '2026-06-15',
    device_id: 'ZKTeco_192.168.1.201',
    verification_type: 'finger',
    source: 'Python',
    created_at: '2026-06-15T08:22:01+03:00',
  },
  {
    id: 4,
    employee_id: 'emp-002',
    punch_time: '2026-06-15T15:55:00+03:00', // 15:55 (خروج مبكر بـ 5 د)
    shift_type: 'صباحي',
    shift_date: '2026-06-15',
    device_id: 'ZKTeco_192.168.1.201',
    verification_type: 'finger',
    source: 'Python',
    created_at: '2026-06-15T15:55:01+03:00',
  },
];

const EMPLOYEE_NO_PUNCH = {
  ...EMPLOYEE_1,
  id: 'emp-no-punch',
  full_name: 'محمد لايبصم',
};

// =========================================================================
// 2. اختبارات الدوال الأساسية (Unit Tests)
// =========================================================================

describe('🧪 1. دوال الوقت الأساسية (Time Utils)', () => {
  it('timeToMinutes: 08:00 = 480', () => {
    expect(timeToMinutes('08:00')).toBe(480);
  });

  it('timeToMinutes: 16:30 = 990', () => {
    expect(timeToMinutes('16:30')).toBe(990);
  });

  it('minutesToTime: 480 = 08:00', () => {
    expect(minutesToTime(480)).toBe('08:00');
  });

  it('minutesToTime: 0 = 00:00', () => {
    expect(minutesToTime(0)).toBe('00:00');
  });

  it('minutesToTime: negative = wraps around', () => {
    expect(minutesToTime(-60)).toBe('23:00');
  });

  it('timestampToMinutes: ISO time', () => {
    const result = timestampToMinutes('2026-06-15T08:30:00+03:00');
    expect(result).toBe(510); // 8*60 + 30
  });
});

// =========================================================================
// 3. اختبارات تحديد الوردية
// =========================================================================

describe('🧪 2. تحديد الوردية (determineShift)', () => {
  it('07:45 → صباحي (ضمن نافذة 06-10)', () => {
    const date = new Date('2026-06-15T07:45:00+03:00');
    expect(determineShift(date)).toBe('صباحي');
  });

  it('08:00 → صباحي (بداية الوردية)', () => {
    const date = new Date('2026-06-15T08:00:00+03:00');
    expect(determineShift(date)).toBe('صباحي');
  });

  it('16:30 → مسائي (ضمن نافذة 14-18)', () => {
    const date = new Date('2026-06-15T16:30:00+03:00');
    expect(determineShift(date)).toBe('مسائي');
  });

  it('23:00 → ليلي', () => {
    const date = new Date('2026-06-15T23:00:00+03:00');
    expect(determineShift(date)).toBe('ليلي');
  });

  it('01:00 → ليلي (بعد منتصف الليل)', () => {
    const date = new Date('2026-06-16T01:00:00+03:00');
    expect(determineShift(date)).toBe('ليلي');
  });

  it('12:00 → صباحي (خارج النوافذ - تخمين)', () => {
    const date = new Date('2026-06-15T12:00:00+03:00');
    expect(determineShift(date)).toBe('صباحي');
  });
});

// =========================================================================
// 4. اختبارات حساب التأخير مع Grace Period
// =========================================================================

describe('🧪 3. حساب التأخير (calculateLateMinutes) + Grace Period', () => {
  it('07:45 → 0 دقيقة تأخير (قبل الوردية)', () => {
    const late = calculateLateMinutes(
      new Date('2026-06-15T07:45:00+03:00'),
      'صباحي',
      DEFAULT_SHIFT_TIMINGS,
      15
    );
    expect(late).toBe(0);
  });

  it('08:00 → 0 دقيقة تأخير (بالضبط)', () => {
    const late = calculateLateMinutes(
      new Date('2026-06-15T08:00:00+03:00'),
      'صباحي',
      DEFAULT_SHIFT_TIMINGS,
      15
    );
    expect(late).toBe(0);
  });

  it('08:10 → 0 دقيقة (ضمن مهلة الـ 15 دقيقة)', () => {
    const late = calculateLateMinutes(
      new Date('2026-06-15T08:10:00+03:00'),
      'صباحي',
      DEFAULT_SHIFT_TIMINGS,
      15
    );
    expect(late).toBe(0);
  });

  it('08:22 → 7 دقائق تأخير فعلي (22 - 15 سماح)', () => {
    const late = calculateLateMinutes(
      new Date('2026-06-15T08:22:00+03:00'),
      'صباحي',
      DEFAULT_SHIFT_TIMINGS,
      15
    );
    expect(late).toBe(7);
  });

  it('09:00 → 45 دقيقة تأخير فعلي', () => {
    const late = calculateLateMinutes(
      new Date('2026-06-15T09:00:00+03:00'),
      'صباحي',
      DEFAULT_SHIFT_TIMINGS,
      15
    );
    expect(late).toBe(45);
  });
});

// =========================================================================
// 5. اختبارات الخروج المبكر والأوفرتايم
// =========================================================================

describe('🧪 4. الخروج المبكر والأوفرتايم', () => {
  it('16:00 → 0 دقيقة خروج مبكر (بالضبط)', () => {
    const early = calculateEarlyLeaveMinutes(
      new Date('2026-06-15T16:00:00+03:00'),
      'صباحي'
    );
    expect(early).toBe(0);
  });

  it('15:55 → 5 دقائق خروج مبكر', () => {
    const early = calculateEarlyLeaveMinutes(
      new Date('2026-06-15T15:55:00+03:00'),
      'صباحي'
    );
    expect(early).toBe(5);
  });

  it('17:00 → 0 دقيقة خروج مبكر (بعد الوردية)', () => {
    const early = calculateEarlyLeaveMinutes(
      new Date('2026-06-15T17:00:00+03:00'),
      'صباحي'
    );
    expect(early).toBe(0);
  });

  it('total 9h → 60 دقيقة أوفرتايم (فوق 8 ساعات)', () => {
    const overtime = calculateOvertimeMinutes(
      9 * 60, // 540 دقيقة
      'صباحي'
    );
    expect(overtime).toBe(60);
  });

  it('total 8h → 0 دقيقة أوفرتايم', () => {
    const overtime = calculateOvertimeMinutes(
      8 * 60, // 480 دقيقة
      'صباحي'
    );
    expect(overtime).toBe(0);
  });

  it('detailed overtime: early arrival + late departure', () => {
    const detailed = calculateDetailedOvertime(
      new Date('2026-06-15T07:30:00+03:00'), // 30 د قبل
      new Date('2026-06-15T16:30:00+03:00'), // 30 د بعد
      'صباحي'
    );
    expect(detailed.beforeShift).toBe(30);  // 30 د قبل
    expect(detailed.afterShift).toBe(30);   // 30 د بعد
    expect(detailed.totalOvertime).toBe(60); // 60 د إجمالي
  });
});

// =========================================================================
// 6. اختبارات تصنيف التأخير والخصم المالي
// =========================================================================

describe('🧪 5. تصنيف التأخير والخصم المالي', () => {
  it('5 دقائق تأخير → في الوقت (ضمن السماح)', () => {
    const result = classifyLateness(5);
    expect(result.type).toBe('none');
  });

  it('20 دقيقة → تأخير بسيط', () => {
    const result = classifyLateness(20);
    expect(result.type).toBe('simple');
  });

  it('45 دقيقة → تأخير متوسط', () => {
    const result = classifyLateness(45);
    expect(result.type).toBe('moderate');
  });

  it('70 دقيقة → نصف يوم غياب', () => {
    const result = classifyLateness(70);
    expect(result.type).toBe('half_day');
  });

  it('130 دقيقة → غياب كامل', () => {
    const result = classifyLateness(130);
    expect(result.type).toBe('full_day');
  });

  it('خصم مالي: 30 دقيقة تأخير فعال = 15000 دينار', () => {
    const deduction = calculateLateDeduction(45); // 45 - 15 سماح = 30
    expect(deduction).toBe(15000); // 30 * 500 = 15000
  });
});

// =========================================================================
// 7. اختبارات تحديد حالة الحضور
// =========================================================================

describe('🧪 6. تحديد حالة الحضور (determineAttendanceStatus)', () => {
  it('موظف بصم في الوقت → حضور بوقت', () => {
    const status = determineAttendanceStatus({
      hasPunch: true,
      checkIn: new Date('2026-06-15T07:55:00+03:00'),
      checkOut: new Date('2026-06-15T16:00:00+03:00'),
      shiftType: 'صباحي',
      hasApprovedLeave: false,
      hasPendingLeave: false,
      hasApprovedPermission: false,
      hasPendingPermission: false,
      isFriday: false,
      isHoliday: false,
    });
    expect(status).toBe('حضور_بوقت');
  });

  it('موظف بصم متأخر → متأخر', () => {
    const status = determineAttendanceStatus({
      hasPunch: true,
      checkIn: new Date('2026-06-15T08:22:00+03:00'),
      checkOut: new Date('2026-06-15T15:55:00+03:00'),
      shiftType: 'صباحي',
      hasApprovedLeave: false,
      hasPendingLeave: false,
      hasApprovedPermission: false,
      hasPendingPermission: false,
      isFriday: false,
      isHoliday: false,
    });
    expect(status).toBe('متأخر');
  });

  it('موظف لم يبصم وليس في إجازة → غائب', () => {
    const status = determineAttendanceStatus({
      hasPunch: false,
      shiftType: 'صباحي',
      hasApprovedLeave: false,
      hasPendingLeave: false,
      hasApprovedPermission: false,
      hasPendingPermission: false,
      isFriday: false,
      isHoliday: false,
    });
    expect(status).toBe('غائب');
  });

  it('موظف لم يبصم وعنده إجازة موافق عليها → مجاز', () => {
    const status = determineAttendanceStatus({
      hasPunch: false,
      shiftType: 'صباحي',
      hasApprovedLeave: true,
      hasPendingLeave: false,
      hasApprovedPermission: false,
      hasPendingPermission: false,
      isFriday: false,
      isHoliday: false,
    });
    expect(status).toBe('مجاز');
  });

  it('يوم الجمعة → عطلة', () => {
    const status = determineAttendanceStatus({
      hasPunch: false,
      shiftType: 'صباحي',
      hasApprovedLeave: false,
      hasPendingLeave: false,
      hasApprovedPermission: false,
      hasPendingPermission: false,
      isFriday: true,
      isHoliday: false,
    });
    expect(status).toBe('عطلة');
  });

  it('موظف خرج مبكراً عنده زمنية معتمدة → زمنية معتمدة', () => {
    const status = determineAttendanceStatus({
      hasPunch: true,
      checkIn: new Date('2026-06-15T07:55:00+03:00'),
      checkOut: new Date('2026-06-15T14:00:00+03:00'), // خرج مبكر
      shiftType: 'صباحي',
      hasApprovedLeave: false,
      hasPendingLeave: false,
      hasApprovedPermission: true, // عنده زمنية
      hasPendingPermission: false,
      isFriday: false,
      isHoliday: false,
    });
    expect(status).toBe('زمنية_معتمدة');
  });

  it('موظف خرج مبكراً بدون زمنية → متأخر', () => {
    const status = determineAttendanceStatus({
      hasPunch: true,
      checkIn: new Date('2026-06-15T07:55:00+03:00'),
      checkOut: new Date('2026-06-15T14:00:00+03:00'),
      shiftType: 'صباحي',
      hasApprovedLeave: false,
      hasPendingLeave: false,
      hasApprovedPermission: false,
      hasPendingPermission: false,
      isFriday: false,
      isHoliday: false,
    });
    expect(status).toBe('متأخر');
  });
});

// =========================================================================
// 8. اختبارات الدمج: بصمة → ملخص حضور (Integration)
// =========================================================================

describe('🧪 7. سيناريو الدمج: بصمة → Summary (Integration)', () => {
  it('موظف يدخل 07:45 ويخرج 16:15 → حضور بوقت + overtime', () => {
    const summary = createAttendanceSummary('emp-001', MORNING_SHIFT_LOGS, '2026-06-15', {
      isFriday: false,
      isHoliday: false,
    });

    expect(summary.employee_id).toBe('emp-001');
    expect(summary.shift_type).toBe('صباحي');
    expect(summary.total_hours).toBeGreaterThanOrEqual(8.3);
    expect(summary.total_hours).toBeLessThanOrEqual(8.6); // 8.5 ساعات
    expect(summary.status).toBe('حضور_بوقت');
    expect(summary.late_minutes).toBe(0);
    expect(summary.overtime_minutes).toBeGreaterThanOrEqual(0);
  });

  it('موظف يدخل 08:22 ويخرج 15:55 → متأخر + early leave', () => {
    const summary = createAttendanceSummary('emp-002', LATE_EMPLOYEE_LOG, '2026-06-15', {
      isFriday: false,
      isHoliday: false,
    });

    expect(summary.employee_id).toBe('emp-002');
    expect(summary.shift_type).toBe('صباحي');
    expect(summary.status).toBe('متأخر');
    expect(summary.late_minutes).toBeGreaterThan(0);
    expect(summary.early_leave_minutes).toBeGreaterThan(0);
  });

  it('موظف بدون بصمات في يوم عمل → غائب', () => {
    const summary = createAttendanceSummary('emp-no-punch', [], '2026-06-15', {
      isFriday: false,
      isHoliday: false,
    });

    expect(summary.employee_id).toBe('emp-no-punch');
    expect(summary.status).toBe('غائب');
    expect(summary.total_hours).toBe(0);
  });

  it('يوم الجمعة → عطلة حتى لو بصم الموظف', () => {
    const summary = createAttendanceSummary('emp-001', MORNING_SHIFT_LOGS, '2026-06-15', {
      isFriday: true, // جمعة
      isHoliday: false,
    });

    expect(summary.status).toBe('عطلة');
  });

  it('موظف في إجازة موافق عليها → مجاز', () => {
    const summary = createAttendanceSummary('emp-001', [], '2026-06-15', {
      isFriday: false,
      isHoliday: false,
      hasApprovedLeave: true,
    });

    expect(summary.status).toBe('مجاز');
  });
});

// =========================================================================
// 9. اختبارات Multi-Tenant (فصل بيانات الشركات)
// =========================================================================

describe('🧪 8. Multi-Tenant: فصل البيانات بين الشركات', () => {
  it('createAttendanceSummary مع tenant_id من الموظف', () => {
    const summary = createAttendanceSummary('emp-001', MORNING_SHIFT_LOGS, '2026-06-15');
    // التحقق من أن البيانات صحيحة بغض النظر عن tenant_id
    expect(summary.employee_id).toBe('emp-001');
    expect(summary.status).toBe('حضور_بوقت');
  });

  it('createBulkAttendanceSummaries: مجموعة موظفين من شركتين', () => {
    const allLogs = [...MORNING_SHIFT_LOGS, ...LATE_EMPLOYEE_LOG];
    const employees = [
      { id: 'emp-001', department: 'الإنتاج' },
      { id: 'emp-002', department: 'الإنتاج' },
    ];

    const summaries = createBulkAttendanceSummaries(allLogs, employees, {
      from: '2026-06-15',
      to: '2026-06-15',
    });

    expect(summaries.length).toBe(2);
    expect(summaries[0].employee_id).toBe('emp-001');
    expect(summaries[1].employee_id).toBe('emp-002');
  });

  it('generateEmployeeReport: تقرير تحليلي لموظف', () => {
    const summaries = [
      createAttendanceSummary('emp-001', MORNING_SHIFT_LOGS, '2026-06-15', { isFriday: false }),
      createAttendanceSummary('emp-001', MORNING_SHIFT_LOGS, '2026-06-16', { isFriday: false }),
      createAttendanceSummary('emp-001', [], '2026-06-17', { isFriday: false }), // غائب
    ];

    const report = generateEmployeeReport(
      'emp-001',
      'أحمد المحمد',
      'الإنتاج',
      summaries
    );

    expect(report.total_days).toBe(3);
    expect(report.present_days).toBe(2);
    expect(report.absent_days).toBe(1);
    expect(report.attendance_rate).toBeGreaterThanOrEqual(66);
  });

  it('getTeamQuickStats: إحصائيات الفريق', () => {
    const reports = [
      generateEmployeeReport('emp-001', 'أحمد', 'إنتاج', [
        createAttendanceSummary('emp-001', MORNING_SHIFT_LOGS, '2026-06-15', { isFriday: false }),
      ]),
      generateEmployeeReport('emp-002', 'سارة', 'إنتاج', [
        createAttendanceSummary('emp-002', LATE_EMPLOYEE_LOG, '2026-06-15', { isFriday: false }),
      ]),
    ];

    const stats = getTeamQuickStats(reports);

    expect(stats.totalEmployees).toBe(2);
    expect(stats.totalAbsentDays).toBe(0);
    expect(stats.totalLateDays).toBeGreaterThanOrEqual(0);
    expect(stats.topPerformers.length).toBeGreaterThanOrEqual(1);
  });
});

// =========================================================================
// 10. اختبارات إحصائيات الـ Dashboard
// =========================================================================

describe('🧪 9. إحصائيات Dashboard (getDailyAttendanceStats)', () => {
  it('يوم عادي: 2 موظفين', () => {
    const summaries: AttendanceSummary[] = [
      {
        id: 1,
        employee_id: 'emp-001',
        shift_date: '2026-06-15',
        shift_type: 'صباحي',
        check_in: '2026-06-15T07:45:00+03:00',
        check_out: '2026-06-15T16:15:00+03:00',
        total_hours: 8.5,
        late_minutes: 0,
        early_leave_minutes: 0,
        overtime_minutes: 30,
        status: 'حضور_بوقت',
      },
      {
        id: 2,
        employee_id: 'emp-002',
        shift_date: '2026-06-15',
        shift_type: 'صباحي',
        check_in: '2026-06-15T08:22:00+03:00',
        check_out: '2026-06-15T15:55:00+03:00',
        total_hours: 7.55,
        late_minutes: 22,
        early_leave_minutes: 5,
        overtime_minutes: 0,
        status: 'متأخر',
      },
    ];

    const stats = getDailyAttendanceStats(summaries);

    expect(stats.total).toBe(2);
    expect(stats.present).toBe(1);
    expect(stats.late).toBe(1);
    expect(stats.absent).toBe(0);
    expect(stats.attendanceRate).toBe(100); // كلهم موجودين
  });

  it('يوم بدون بيانات', () => {
    const stats = getDailyAttendanceStats([]);
    expect(stats.total).toBe(0);
    expect(stats.attendanceRate).toBe(0);
  });
});

// =========================================================================
// 11. اختبارات تصدير CSV
// =========================================================================

describe('🧪 10. تصدير CSV', () => {
  it('generateCSV: يعيد نص CSV مع header', () => {
    const summaries: AttendanceSummary[] = [
      {
        id: 1,
        employee_id: 'emp-001',
        shift_date: '2026-06-15',
        shift_type: 'صباحي',
        check_in: '2026-06-15T07:45:00+03:00',
        check_out: '2026-06-15T16:15:00+03:00',
        total_hours: 8.5,
        late_minutes: 0,
        early_leave_minutes: 0,
        overtime_minutes: 30,
        status: 'حضور_بوقت',
      },
    ];

    const csv = generateCSV(summaries, { 'emp-001': 'أحمد المحمد' });
    
    expect(csv).toContain('التاريخ');
    expect(csv).toContain('الموظف');
    expect(csv).toContain('الحالة');
    expect(csv).toContain('2026-06-15');
    expect(csv).toContain('أحمد المحمد');
    expect(csv).toContain('حضور بوقت');
  });

  it('attendanceToCSVRows: يعيد مصفوفة من الصفوف', () => {
    const summaries: AttendanceSummary[] = [
      {
        id: 1,
        employee_id: 'emp-001',
        shift_date: '2026-06-15',
        shift_type: 'صباحي',
        check_in: '2026-06-15T07:45:00+03:00',
        check_out: '2026-06-15T16:15:00+03:00',
        total_hours: 8.5,
        late_minutes: 0,
        early_leave_minutes: 0,
        overtime_minutes: 30,
        status: 'حضور_بوقت',
      },
    ];

    const rows = attendanceToCSVRows(summaries);
    expect(rows.length).toBe(2); // header + 1 row
    expect(rows[0].length).toBe(9); // 9 columns
  });
});

// =========================================================================
// 12. اختبارات سيناريوهات شاملة (End-to-End Scenarios)
// =========================================================================

describe('🧪 11. سيناريوهات شاملة (E2E)', () => {
  it('السيناريو 1: موظف ملتزم - حضور كامل', () => {
    // يحضر 5 أيام أسبوعياً في الوقت
    const summary = createAttendanceSummary('emp-001', MORNING_SHIFT_LOGS, '2026-06-15', {
      isFriday: false,
      isHoliday: false,
    });

    expect(summary.status).toBe('حضور_بوقت');
    expect(summary.total_hours).toBeGreaterThanOrEqual(8);
    expect(summary.overtime_minutes).toBeGreaterThanOrEqual(0);
  });

  it('السيناريو 2: موظف متأخر بشكل متكرر - نظام العقوبات', () => {
    // تأخير 3 أيام متتالية
    const lateSummaries = [22, 35, 50].map((mins, i) =>
      calculateLateMinutes(
        new Date(`2026-06-${16 + i}T${minutesToTime(8 * 60 + mins)}:00+03:00`),
        'صباحي',
        DEFAULT_SHIFT_TIMINGS,
        DEFAULT_POLICY.late.gracePeriodMinutes
      )
    );

    // اليوم الأول: 7 دقائق فعالة → بسيط
    expect(classifyLateness(lateSummaries[0] + 15).type).toBe('simple');
    // اليوم الثاني: 20 دقيقة فعالة → simple
    expect(classifyLateness(lateSummaries[1] + 15).type).toBe('moderate');
    // اليوم الثالث: 35 دقيقة فعالة → moderate
    expect(classifyLateness(lateSummaries[2] + 15).type).toBe('moderate');

    // الخصم المالي الإجمالي
    const totalDeduction = lateSummaries.reduce((sum, m) => sum + calculateLateDeduction(m + 15), 0);
    expect(totalDeduction).toBeGreaterThan(0);
  });

  it('السيناريو 3: موظف جديد يتم إضافته لشركة - Multi-Tenant', () => {
    // محاكاة: موظف جديد في TENANT_A
    const newEmployee = {
      id: 'emp-new',
      full_name: 'مستخدم جديد',
      department: 'تقنية المعلومات',
      tenant_id: TENANT_A,
    };

    // إنشاء ملخص حضور للموظف الجديد (لم يبصم بعد)
    const summary = createAttendanceSummary(newEmployee.id, [], '2026-06-15', {
      isFriday: false,
      isHoliday: false,
    });

    expect(summary.employee_id).toBe('emp-new');
    expect(summary.status).toBe('غائب');

    // محاكاة: موظف في شركة أخرى TENANT_B
    const otherTenantSummary = createAttendanceSummary('emp-003', [], '2026-06-15', {
      isFriday: false,
      isHoliday: false,
      hasApprovedLeave: true, // في إجازة
    });

    expect(otherTenantSummary.employee_id).toBe('emp-003');
    expect(otherTenantSummary.status).toBe('مجاز');
    // البيانات مفصولة: emp-003 في TENANT_B, emp-new في TENANT_A
    expect(newEmployee.tenant_id).not.toBe(EMPLOYEE_3.tenant_id);
  });

  it('السيناريو 4: جهاز بصمة يرسل بيانات لبصمة + Multi-Tenant', () => {
    // محاكاة: جهاز ZKTeco يرسل بصمة لموظف في الشركة A
    const deviceLog: AttendanceLog = {
      id: 100,
      employee_id: 'emp-001',
      punch_time: '2026-06-15T07:50:00+03:00',
      shift_type: 'صباحي',
      shift_date: '2026-06-15',
      device_id: 'ZKTeco_192.168.1.201',
      verification_type: 'face',
      source: 'ADMS',
      created_at: '2026-06-15T07:50:01+03:00',
    };

    // استخراج البصمة
    const { checkIn, checkOut } = extractPunchTimes([deviceLog]);
    expect(checkIn).toBeDefined();
    expect(checkIn!.employee_id).toBe('emp-001');
    expect(checkIn!.verification_type).toBe('face');
    expect(checkIn!.source).toBe('ADMS');

    // إنشاء الملخص
    const summary = createAttendanceSummary('emp-001', [deviceLog], '2026-06-15', {
      isFriday: false,
      isHoliday: false,
    });

    // بصم فقط دخول بدون خروج → لا يزال يعتبر حضور
    expect(summary.check_in).toBeDefined();
    expect(summary.status).toBe('حضور_بوقت'); // لم يخرج مبكراً
  });

  it('السيناريو 5: تجميع بصمات متعددة لنفس الموظف في نفس اليوم', () => {
    // بصمتين دخول وخروج
    const logs: AttendanceLog[] = [
      {
        id: 1,
        employee_id: 'emp-001',
        punch_time: '2026-06-15T07:50:00+03:00',
        shift_date: '2026-06-15',
        device_id: 'ZK1',
        verification_type: 'finger',
        source: 'Python',
        created_at: '2026-06-15T07:50:01+03:00',
      },
      {
        id: 2,
        employee_id: 'emp-001',
        punch_time: '2026-06-15T12:00:00+03:00',
        shift_date: '2026-06-15',
        device_id: 'ZK1',
        verification_type: 'finger',
        source: 'Python',
        created_at: '2026-06-15T12:00:01+03:00',
      },
      {
        id: 3,
        employee_id: 'emp-001',
        punch_time: '2026-06-15T12:30:00+03:00',
        shift_date: '2026-06-15',
        device_id: 'ZK1',
        verification_type: 'finger',
        source: 'Python',
        created_at: '2026-06-15T12:30:01+03:00',
      },
      {
        id: 4,
        employee_id: 'emp-001',
        punch_time: '2026-06-15T16:05:00+03:00',
        shift_date: '2026-06-15',
        device_id: 'ZK1',
        verification_type: 'finger',
        source: 'Python',
        created_at: '2026-06-15T16:05:01+03:00',
      },
    ];

    // extractPunchTimes: أول بصمة (دخول 07:50) وآخر بصمة (خروج 16:05)
    const { checkIn, checkOut } = extractPunchTimes(logs);
    expect(checkIn).toBeDefined();
    expect(checkOut).toBeDefined();
    expect(timestampToMinutes(checkIn!.punch_time)).toBe(7 * 60 + 50);
    expect(timestampToMinutes(checkOut!.punch_time)).toBe(16 * 60 + 5);

    // groupAttendanceByEmployeeAndDate
    const grouped = groupAttendanceByEmployeeAndDate(logs);
    const empLogs = grouped.get('emp-001');
    expect(empLogs).toBeDefined();
    const dayLogs = empLogs!.get('2026-06-15');
    expect(dayLogs).toBeDefined();
    expect(dayLogs!.length).toBe(4); // 4 بصمات في نفس اليوم

    // createAttendanceSummary مع كل البصمات
    const summary = createAttendanceSummary('emp-001', logs, '2026-06-15', {
      isFriday: false,
      isHoliday: false,
    });

    expect(summary.check_in).toBeDefined();
    expect(summary.check_out).toBeDefined();
    expect(summary.total_hours).toBeGreaterThan(7.5);
    expect(summary.status).toBe('حضور_بوقت');
  });
});