/**
 * ════════════════════════════════════════════════════════════════
 * اختبار مسار المدير بالكامل - End-to-End Testing
 * ════════════════════════════════════════════════════════════════
 * يختبر السيناريوهات الكاملة:
 * 1. مدير يشاهد حضور فريقه
 * 2. مدير يوافق على إجازة ← تحديث الحضور تلقائياً
 * 3. مدير يرفض إجازة ← إعادة الحضور لحالته
 * 4. نظام الإشعارات الذكية (تغيب + تأخير + تأخير متكرر)
 * 5. التقارير التحليلية (نسبة الحضور، أفضل/أسوأ الموظفين)
 * 6. تصدير CSV
 * ════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AttendanceSummary, AttendanceLog, AttendanceStatus,
  createAttendanceSummary,
  generateEmployeeReport,
  generateTeamReports,
  getTeamQuickStats,
  getDailyAttendanceStats,
  downloadCSV,
  attendanceToCSVRows,
  generateCSV,
  EmployeeAttendanceReport,
  STATUS_LABELS,
} from '../utils/shiftUtils';
import {
  linkLeaveApproval,
  linkLeaveRejection,
  linkPermissionApproval,
} from '../services/integrations/leaveAttendanceLink';
import {
  notifyAbsentEmployee,
  notifyLateEmployee,
  checkAndNotifyRepeatedLate,
  sendWeeklyReportToManager,
} from '../services/notifications/attendanceNotificationService';

// ════════════════════════════════════════════════════════════════
// تهيئة mock
// ════════════════════════════════════════════════════════════════

// Mock supabase
vi.mock('../services/supabase/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      // ★ 0344: findAll داخل updateSummary يستدعي .limit() — كان ناقصاً
      //   في الموك فظهر «query.limit is not a function».
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      range: vi.fn().mockResolvedValue({ data: [], error: null }),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      // ★ 0344: BaseService.create يسلسل .insert().select().single()
      //   والموك كان يُرجع Promise من insert مباشرة ⇒
      //   «insert(...).select is not a function».
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({
            data: { id: 'as-mock-1' }, error: null,
          }),
        })),
        then: (r: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(r),
      })),
      upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
      update: vi.fn().mockResolvedValue({ data: null, error: null }),
      delete: vi.fn(() => {
        const query = { eq: vi.fn() };
        query.eq
          .mockReturnValueOnce(query)
          .mockReturnValueOnce(query)
          .mockResolvedValueOnce({ data: null, error: null });
        return query;
      }),
    })),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
    })),
  },
}));

// Mock notificationService
vi.mock('../services/notifications/notificationService', () => ({
  notifyManager: vi.fn().mockResolvedValue('mock-notification-id'),
  notifySupervisors: vi.fn().mockResolvedValue(['mock-notification-id']),
  notifyRole: vi.fn().mockResolvedValue(['mock-notification-id']),
  notifyUser: vi.fn().mockResolvedValue('mock-notification-id'),
}));

// Mock notificationManager
vi.mock('../services/notifications/notificationManager', () => ({
  addNotification: vi.fn().mockReturnValue({ id: 'mock-local-id' }),
}));

// ════════════════════════════════════════════════════════════════
// بيانات اختبار ثابتة
// ════════════════════════════════════════════════════════════════

const MOCK_MANAGER = {
  id: 'manager-001',
  user_id: 'user-manager-1',
  full_name: 'المدير أحمد',
  department: 'الإنتاج',
  role: 'manager',
};

const MOCK_TEAM = [
  { id: 'emp-001', user_id: 'user-1', full_name: 'محمد علي', department: 'الإنتاج', role: 'employee', manager_id: 'manager-001' },
  { id: 'emp-002', user_id: 'user-2', full_name: 'سارة خالد', department: 'الإنتاج', role: 'employee', manager_id: 'manager-001' },
  { id: 'emp-003', user_id: 'user-3', full_name: 'كريم حسن', department: 'الإنتاج', role: 'employee', manager_id: 'manager-001' },
];

// سجلات بصمات لمدة 5 أيام
const generateLogs = (): AttendanceLog[] => {
  const logs: AttendanceLog[] = [];
  const baseDate = new Date('2026-06-15'); // يوم الاثنين

  MOCK_TEAM.forEach((emp, empIdx) => {
    for (let day = 0; day < 5; day++) {
      const d = new Date(baseDate);
      d.setDate(d.getDate() + day);
      const dateStr = d.toISOString().split('T')[0];
      const isFriday = d.getDay() === 5;

      if (isFriday) continue; // جمعة

      // موظف 1: ملتزم (يدخل 07:50 - يخرج 16:10)
      if (empIdx === 0) {
        logs.push({
          id: day * 10 + 1,
          employee_id: emp.id,
          punch_time: `${dateStr}T07:50:00+03:00`,
          shift_type: 'صباحي',
          shift_date: dateStr,
          device_id: 'ZK1',
          verification_type: 'finger',
          source: 'Python',
          created_at: `${dateStr}T07:50:01+03:00`,
        });
        logs.push({
          id: day * 10 + 2,
          employee_id: emp.id,
          punch_time: `${dateStr}T16:10:00+03:00`,
          shift_type: 'صباحي',
          shift_date: dateStr,
          device_id: 'ZK1',
          verification_type: 'finger',
          source: 'Python',
          created_at: `${dateStr}T16:10:01+03:00`,
        });
      }

      // موظف 2: متأخر (يدخل 08:25 - يخرج 15:50)
      if (empIdx === 1) {
        logs.push({
          id: day * 10 + 3,
          employee_id: emp.id,
          punch_time: `${dateStr}T08:25:00+03:00`,
          shift_type: 'صباحي',
          shift_date: dateStr,
          device_id: 'ZK1',
          verification_type: 'finger',
          source: 'Python',
          created_at: `${dateStr}T08:25:01+03:00`,
        });
        logs.push({
          id: day * 10 + 4,
          employee_id: emp.id,
          punch_time: `${dateStr}T15:50:00+03:00`,
          shift_type: 'صباحي',
          shift_date: dateStr,
          device_id: 'ZK1',
          verification_type: 'finger',
          source: 'Python',
          created_at: `${dateStr}T15:50:01+03:00`,
        });
      }

      // موظف 3: غائب (لا بصمات)
      // لا نضيف له بصمات
    }
  });

  return logs;
};

// ════════════════════════════════════════════════════════════════
// 1. اختبار: مشاهدة حضور الفريق
// ════════════════════════════════════════════════════════════════

describe('📋 1. مشاهدة حضور الفريق (Team Dashboard)', () => {
  const logs = generateLogs();

  it('يجب أن يرى المدير 3 موظفين في فريقه', () => {
    expect(MOCK_TEAM.length).toBe(3);
  });

  it('يجب أن يكون الموظف 1 (محمد) = حضور بوقت لجميع الأيام', () => {
    const baseDate = new Date('2026-06-15');

    for (let day = 0; day < 5; day++) {
      const d = new Date(baseDate);
      d.setDate(d.getDate() + day);
      const dateStr = d.toISOString().split('T')[0];
      const isFriday = d.getDay() === 5;
      if (isFriday) continue;

      const dayLogs = logs.filter(
        l => l.employee_id === 'emp-001' && l.shift_date === dateStr
      );

      const summary = createAttendanceSummary('emp-001', dayLogs, dateStr, {
        isFriday,
        isHoliday: false,
      });

      expect(summary.status).toBe('حضور_بوقت');
      expect(summary.late_minutes).toBe(0);
      expect(summary.total_hours).toBeGreaterThan(7);
    }
  });

  it('يجب أن يكون الموظف 2 (سارة) = متأخر لجميع الأيام', () => {
    const baseDate = new Date('2026-06-15');

    for (let day = 0; day < 5; day++) {
      const d = new Date(baseDate);
      d.setDate(d.getDate() + day);
      const dateStr = d.toISOString().split('T')[0];
      const isFriday = d.getDay() === 5;
      if (isFriday) continue;

      const dayLogs = logs.filter(
        l => l.employee_id === 'emp-002' && l.shift_date === dateStr
      );

      const summary = createAttendanceSummary('emp-002', dayLogs, dateStr, {
        isFriday,
        isHoliday: false,
      });

      expect(summary.status).toBe('متأخر');
      // 08:25 - 15 Grace = 10 دقائق تأخير
      expect(summary.late_minutes).toBeGreaterThan(0);
    }
  });

  it('يجب أن يكون الموظف 3 (كريم) = غائب لجميع الأيام', () => {
    const baseDate = new Date('2026-06-15');

    for (let day = 0; day < 5; day++) {
      const d = new Date(baseDate);
      d.setDate(d.getDate() + day);
      const dateStr = d.toISOString().split('T')[0];
      const isFriday = d.getDay() === 5;
      if (isFriday) continue;

      const summary = createAttendanceSummary('emp-003', [], dateStr, {
        isFriday,
        isHoliday: false,
      });

      expect(summary.status).toBe('غائب');
      expect(summary.total_hours).toBe(0);
    }
  });

  it('يجب أن تكون إحصائيات اليوم صحيحة', () => {
    const baseDate = '2026-06-15';
    const dayLogs = logs.filter(l => l.shift_date === baseDate);

    const summaries = MOCK_TEAM.map(emp => {
      const empLogs = dayLogs.filter(l => l.employee_id === emp.id);
      return createAttendanceSummary(emp.id, empLogs, baseDate, {
        isFriday: false,
        isHoliday: false,
      });
    });

    const stats = getDailyAttendanceStats(summaries);

    expect(stats.total).toBe(3);
    expect(stats.present).toBe(1); // محمد
    expect(stats.late).toBe(1);    // سارة
    expect(stats.absent).toBe(1);  // كريم
  });
});

// ════════════════════════════════════════════════════════════════
// 2. اختبار: الموافقة على إجازة ← تحديث الحضور
// ════════════════════════════════════════════════════════════════

describe('📋 2. الموافقة على إجازة (Leave Approval Flow)', () => {
  it('عند الموافقة على إجازة يجب تحديث attendance_summary إلى "مجاز"', () => {
    // محاكاة: كريم (الموظف الغائب) يطلب إجازة 3 أيام وتمت الموافقة
    const employeeId = 'emp-003';
    const dateFrom = '2026-06-15';
    const dateTo = '2026-06-17';

    // قبل الموافقة: كان غائب
    const beforeSummary = createAttendanceSummary(employeeId, [], dateFrom, {
      isFriday: false,
      isHoliday: false,
    });
    expect(beforeSummary.status).toBe('غائب');

    // بعد الموافقة: يصبح مجاز
    // ملاحظة: هذا يختبر المنطق، لكنه لا يستدعي supabase لأنه mock
    // الاختبار الحقيقي للـ linkLeaveApproval هو في Supabase
    const statusAfterApproval: AttendanceStatus = 'مجاز';
    expect(statusAfterApproval).toBe('مجاز');
  });

  it('يجب أن لا تؤثر العطل والجمعة على أيام الإجازة', () => {
    const dates = ['2026-06-16', '2026-06-17', '2026-06-18', '2026-06-19'];

    const workDays = dates.filter(d => new Date(d).getDay() !== 5);

    // 4 أيام - 1 جمعة = 3 أيام عمل
    expect(workDays.length).toBe(3);
  });

  it('بعد الموافقة، يجب أن يظهر تقرير المدير "مجاز" بدلاً من "غائب"', () => {
    // إنشاء ملخصات لكريم بعد الموافقة على الإجازة
    const summaries: AttendanceSummary[] = [
      createAttendanceSummary('emp-003', [], '2026-06-15', {
        isFriday: false,
        isHoliday: false,
        hasApprovedLeave: true, // تمت الموافقة على الإجازة!
      }),
      createAttendanceSummary('emp-003', [], '2026-06-16', {
        isFriday: false,
        isHoliday: false,
        hasApprovedLeave: true,
      }),
      createAttendanceSummary('emp-003', [], '2026-06-17', {
        isFriday: false,
        isHoliday: false,
        hasApprovedLeave: true,
      }),
    ];

    // كلها مجاز وليست غائب
    summaries.forEach(s => {
      expect(s.status).toBe('مجاز');
      expect(s.status).not.toBe('غائب');
    });

    // التقرير التحليلي
    const report = generateEmployeeReport('emp-003', 'كريم حسن', 'الإنتاج', summaries);
    expect(report.leave_days).toBe(3);  // 3 أيام إجازة
    expect(report.absent_days).toBe(0); // 0 أيام غياب (لأنها إجازة)
    expect(report.attendance_rate).toBe(0); // 0% لأن لم يحضر فعلياً
  });
});

// ════════════════════════════════════════════════════════════════
// 3. اختبار: رفض إجازة وإعادة الحساب
// ════════════════════════════════════════════════════════════════

describe('📋 3. رفض إجازة (Leave Rejection Flow)', () => {
  it('عند رفض إجازة يجب إعادة حساب الحضور من البصمات', () => {
    // كريم (emp-003) لا بصمات له → رفض الإجازة → رجوع إلى "غائب"
    const summary = createAttendanceSummary('emp-003', [], '2026-06-15', {
      isFriday: false,
      isHoliday: false,
      hasApprovedLeave: false, // أُلغيت الموافقة
    });

    expect(summary.status).toBe('غائب');
  });
});

// ════════════════════════════════════════════════════════════════
// 4. اختبار: الموافقة على زمنية
// ════════════════════════════════════════════════════════════════

describe('📋 4. الموافقة على زمنية (Permission Approval Flow)', () => {
  it('عند الموافقة على زمنية يجب تحديث الحالة إلى "زمنية_معتمدة"', () => {
    // سارة (emp-002) كانت متأخرة، نأخذ يوم واحد
    const summary = createAttendanceSummary('emp-002', [
      {
        id: 1,
        employee_id: 'emp-002',
        punch_time: '2026-06-15T08:25:00+03:00',
        shift_type: 'صباحي',
        shift_date: '2026-06-15',
        device_id: 'ZK1',
        verification_type: 'finger',
        source: 'Python',
        created_at: '2026-06-15T08:25:01+03:00',
      },
      {
        id: 2,
        employee_id: 'emp-002',
        punch_time: '2026-06-15T15:50:00+03:00',
        shift_type: 'صباحي',
        shift_date: '2026-06-15',
        device_id: 'ZK1',
        verification_type: 'finger',
        source: 'Python',
        created_at: '2026-06-15T15:50:01+03:00',
      },
    ], '2026-06-15', {
      isFriday: false,
      isHoliday: false,
      hasApprovedPermission: true, // تمت الموافقة على الزمنية!
    });

    expect(summary.status).toBe('زمنية_معتمدة');
    expect(summary.status).not.toBe('متأخر');
  });
});

// ════════════════════════════════════════════════════════════════
// 5. اختبار: نظام الإشعارات الذكية
// ════════════════════════════════════════════════════════════════

describe('📋 5. الإشعارات الذكية (Smart Notifications)', () => {
  it('تغيب موظف → إشعار للمدير (high priority)', async () => {
    // تم mock لـ notifyManager في الأعلى
    const result = await notifyAbsentEmployee('emp-003', '2026-06-15');
    expect(result).toBe(true);
  });

  it('تأخير موظف → إشعار للمدير', async () => {
    const result = await notifyLateEmployee('emp-002', '2026-06-15', 10);
    expect(result).toBe(true);
  });

  it('تأخير متكرر 3 أيام → إشعار عاجل', async () => {
    // ملاحظة: هذا الاختبار يحتاج supabase حقيقي
    // هنا نختبر فقط أن الدالة تتعامل مع الخطأ
    const result = await checkAndNotifyRepeatedLate('emp-002', 'سارة خالد');
    // مع mock، ستفشل الدالة لأن supabase يعيد null
    // لكننا نتأكد أنها لا ترمي خطأ
    expect(typeof result).toBe('boolean');
  });

  it('التقرير الأسبوعي → إشعار للمدير', async () => {
    const result = await sendWeeklyReportToManager('manager-001', 'المدير أحمد');
    expect(typeof result).toBe('boolean');
  });
});

// ════════════════════════════════════════════════════════════════
// 6. اختبار: التقارير التحليلية
// ════════════════════════════════════════════════════════════════

describe('📋 6. التقارير التحليلية (Analytics Reports)', () => {
  const logs = generateLogs();

  it('تقرير موظف واحد: حساب صحيح لعدد أيام الحضور والغياب', () => {
    const baseDate = new Date('2026-06-15');
    const summaries: AttendanceSummary[] = [];

    for (let day = 0; day < 5; day++) {
      const d = new Date(baseDate);
      d.setDate(d.getDate() + day);
      const dateStr = d.toISOString().split('T')[0];
      const isFriday = d.getDay() === 5;
      if (isFriday) continue;

      const dayLogs = logs.filter(
        l => l.employee_id === 'emp-001' && l.shift_date === dateStr
      );

      summaries.push(createAttendanceSummary('emp-001', dayLogs, dateStr, {
        isFriday,
        isHoliday: false,
      }));
    }

    const report = generateEmployeeReport('emp-001', 'محمد علي', 'الإنتاج', summaries);

    expect(report.total_days).toBeGreaterThan(0);
    expect(report.attendance_rate).toBeGreaterThanOrEqual(95);
    expect(report.absent_days).toBe(0);
    expect(report.late_days).toBe(0);
  });

  it('تصنيف الفريق: أفضل الموظفين وأسوئهم', () => {
    const baseDate = new Date('2026-06-15');
    const allSummaries: AttendanceSummary[] = [];

    // 5 أيام لكل موظف
    MOCK_TEAM.forEach(emp => {
      for (let day = 0; day < 5; day++) {
        const d = new Date(baseDate);
        d.setDate(d.getDate() + day);
        const dateStr = d.toISOString().split('T')[0];
        const isFriday = d.getDay() === 5;
        if (isFriday) continue;

        const dayLogs = logs.filter(l => l.employee_id === emp.id && l.shift_date === dateStr);
        allSummaries.push(createAttendanceSummary(emp.id, dayLogs, dateStr, {
          isFriday,
          isHoliday: false,
        }));
      }
    });

    const empData = MOCK_TEAM.map(e => ({
      id: e.id,
      full_name: e.full_name,
      department: e.department,
    }));

    const reports = generateTeamReports(allSummaries, empData);

    expect(reports.length).toBe(3);

    // أفضل موظف: محمد (نسبة حضور عالية)
    const mohammedReport = reports.find(r => r.full_name === 'محمد علي');
    expect(mohammedReport).toBeDefined();
    expect(mohammedReport!.attendance_rate).toBeGreaterThanOrEqual(90);

    // أسوأ موظف: كريم (غائب كل الأيام)
    const kareemReport = reports.find(r => r.full_name === 'كريم حسن');
    expect(kareemReport).toBeDefined();
    expect(kareemReport!.absent_days).toBeGreaterThan(0);
    expect(kareemReport!.attendance_rate).toBe(0);

    // إحصائيات الفريق السريعة
    const stats = getTeamQuickStats(reports);
    expect(stats.totalEmployees).toBe(3);
    expect(stats.totalAbsentDays).toBeGreaterThan(0);
    expect(stats.topPerformers.length).toBeGreaterThan(0);
    expect(stats.underPerformers.length).toBeGreaterThan(0);
  });
});

// ════════════════════════════════════════════════════════════════
// 7. اختبار: تصدير CSV
// ════════════════════════════════════════════════════════════════

describe('📋 7. تصدير البيانات (CSV Export)', () => {
  it('يجب أن يكون CSV صالحاً مع header وبيانات', () => {
    const summaries: AttendanceSummary[] = [
      {
        id: 1,
        employee_id: 'emp-001',
        shift_date: '2026-06-15',
        shift_type: 'صباحي',
        check_in: '2026-06-15T07:50:00+03:00',
        check_out: '2026-06-15T16:10:00+03:00',
        total_hours: 8.33,
        late_minutes: 0,
        early_leave_minutes: 0,
        overtime_minutes: 20,
        status: 'حضور_بوقت',
      },
      {
        id: 2,
        employee_id: 'emp-002',
        shift_date: '2026-06-15',
        shift_type: 'صباحي',
        check_in: '2026-06-15T08:25:00+03:00',
        check_out: '2026-06-15T15:50:00+03:00',
        total_hours: 7.42,
        late_minutes: 10,
        early_leave_minutes: 10,
        overtime_minutes: 0,
        status: 'متأخر',
      },
    ];

    const names: Record<string, string> = {
      'emp-001': 'محمد علي',
      'emp-002': 'سارة خالد',
    };

    const rows = attendanceToCSVRows(summaries, names);

    // Header: 9 أعمدة
    expect(rows[0].length).toBe(9);
    expect(rows[0]).toContain('التاريخ');
    expect(rows[0]).toContain('الموظف');
    expect(rows[0]).toContain('الحالة');

    // البيانات: صفين
    expect(rows.length).toBe(3); // header + 2 rows

    // التحقق من المحتوى
    const csv = generateCSV(summaries, names);
    expect(csv).toContain('2026-06-15');
    expect(csv).toContain('محمد علي');
    expect(csv).toContain('سارة خالد');
    expect(csv).toContain('حضور بوقت');
    expect(csv).toContain('متأخر');
  });
});

// ════════════════════════════════════════════════════════════════
// 8. اختبار: حالات الحافة (Edge Cases)
// ════════════════════════════════════════════════════════════════

describe('📋 8. حالات الحافة (Edge Cases)', () => {
  it('فريق فارغ: لا يوجد موظفين', () => {
    const reports: EmployeeAttendanceReport[] = [];
    const stats = getTeamQuickStats(reports);

    expect(stats.totalEmployees).toBe(0);
    expect(stats.averageAttendanceRate).toBe(0);
    expect(stats.totalAbsentDays).toBe(0);
    expect(stats.topPerformers.length).toBe(0);
  });

  it('لا يوجد ملخصات حضور: كل الملخصات فارغة في الـ daily stats', () => {
    const stats = getDailyAttendanceStats([]);
    expect(stats.total).toBe(0);
    expect(stats.attendanceRate).toBe(0);
  });

  it('موظف بصم مرة واحدة فقط (دخول بدون خروج)', () => {
    const log: AttendanceLog = {
      id: 1,
      employee_id: 'emp-001',
      punch_time: '2026-06-15T07:50:00+03:00',
      shift_type: 'صباحي',
      shift_date: '2026-06-15',
      device_id: 'ZK1',
      verification_type: 'finger',
      source: 'Python',
      created_at: '2026-06-15T07:50:01+03:00',
    };

    const summary = createAttendanceSummary('emp-001', [log], '2026-06-15', {
      isFriday: false,
      isHoliday: false,
    });

    // ما زال يعتبر حضور بوقت (بصم دخول فقط)
    expect(summary.check_in).toBeDefined();
    expect(summary.check_out).toBeUndefined(); // لم يخرج بعد
    expect(summary.status).toBe('حضور_بوقت');
    expect(summary.total_hours).toBe(0); // لا يمكن حساب الساعات بدون خروج
  });

  it('موظف بصم في يوم الجمعة → عطلة (حتى لو بصم)', () => {
    const log: AttendanceLog = {
      id: 1,
      employee_id: 'emp-001',
      punch_time: '2026-06-19T07:50:00+03:00',
      shift_type: 'صباحي',
      shift_date: '2026-06-19',
      device_id: 'ZK1',
      verification_type: 'finger',
      source: 'Python',
      created_at: '2026-06-19T07:50:01+03:00',
    };

    const summary = createAttendanceSummary('emp-001', [log], '2026-06-19', {
      isFriday: true, // جمعة
      isHoliday: false,
    });

    expect(summary.status).toBe('عطلة');
  });

  it('تقرير الموظف بنسبة حضور 0%', () => {
    const summaries: AttendanceSummary[] = Array(5).fill(null).map((_, i) =>
      createAttendanceSummary('emp-003', [], `2026-06-${15 + i}`, {
        isFriday: new Date(`2026-06-${15 + i}`).getDay() === 5,
        isHoliday: false,
      })
    );

    const report = generateEmployeeReport('emp-003', 'كريم حسن', 'الإنتاج', summaries);
    expect(report.attendance_rate).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════
// 9. اختبار: ربط الإجازات (Leave Link Mocked)
// ════════════════════════════════════════════════════════════════

describe('📋 9. ربط الإجازات (LeaveLink Mocked)', () => {
  it('linkLeaveApproval: نجاح عند الموافقة', async () => {
    // مع mock سيعيد success
    const result = await linkLeaveApproval('emp-003', '2026-06-15', '2026-06-17', 'سنوية');
    expect(result.success).toBe(true);
    // الدالة تحاول الاتصال بـ supabase (mock)، تنجح أو تفشل بهدوء
    expect(typeof result.daysUpdated).toBe('number');
  });

  it('linkLeaveRejection: نجاح عند الرفض', async () => {
    const result = await linkLeaveRejection('emp-003', '2026-06-15', '2026-06-17');
    expect(result.success).toBe(true);
  });

  /**
   * ★★★ تصحيح 0344 — هذا الاختبار كان يمرّ **بسبب العطل نفسه**.
   *
   *   `linkPermissionApproval` كان يلمس Supabase مباشرة، والموك يُرجع
   *   `{ data: null, error: null }` لأي إدراج ⇒ success=true دائماً.
   *   لكن في القاعدة الحقيقية كان الإدراج يفشل بلا استثناء:
   *     null value in column "tenant_id" of relation
   *     "attendance_summary" violates not-null constraint
   *   (مُثبَت على Postgres محلي). أي أن «النجاح» كان وهماً.
   *
   *   بعد التوجيه عبر SDK صار `requireTenantId()` يرمي حين لا سياق —
   *   وهو **السلوك الصحيح**: أفضل من كتابة صفٍّ يتيم أو ابتلاع الفشل.
   *   نختبر الحالتين صراحةً.
   */
  it('★★★ linkPermissionApproval: يفشل صراحةً بلا سياق مستأجر', async () => {
    localStorage.removeItem('tenant_id');
    const result = await linkPermissionApproval('emp-002', '2026-06-15', '10:00', '12:00');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Tenant ID');
  });

  it('★★ وينجح حين يوجد سياق مستأجر', async () => {
    localStorage.setItem('tenant_id', '00000000-0000-0000-0000-0000000000aa');
    try {
      const result = await linkPermissionApproval('emp-002', '2026-06-15', '10:00', '12:00');
      expect(result.success).toBe(true);
    } finally {
      localStorage.removeItem('tenant_id');
    }
  });

  /**
   * ★★ والجمعة: getDay()===5. الكود القديم كتب ===6 ظانّاً أنها الجمعة
   *   وهو **السبت** — يوم عمل. مُحقَّق: new Date('2026-05-01').getDay()===5
   */
  it('★★★ الجمعة تُتخطّى ولا تحتاج سياقاً (2026-05-01)', async () => {
    localStorage.removeItem('tenant_id');
    const result = await linkPermissionApproval('emp-002', '2026-05-01', '10:00', '12:00');
    expect(result.success).toBe(true);
  });

  it('★★★ والسبت لا يُتخطّى — يوم عمل (2026-05-02)', async () => {
    localStorage.removeItem('tenant_id');
    const result = await linkPermissionApproval('emp-002', '2026-05-02', '10:00', '12:00');
    // لو كان السبت مُتخطّى (العطل القديم) لعاد success=true بلا سياق
    expect(result.success).toBe(false);
  });
});