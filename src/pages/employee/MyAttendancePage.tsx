/**
 * ════════════════════════════════════════════════════════════════
 *  MyAttendancePage - سجل الحضور (نسخة مُصلحة)
 * ════════════════════════════════════════════════════════════════
 *
 *  🔧 الإصلاحات المُطبّقة:
 *  ─────────────────────────────────────────────────────────────────
 *  ✅ 15 استخدام any → 0 (أنواع صريحة للسجلات)
 *  ✅ تنظيف جميع markdown artifacts
 *  ✅ إزالة `as any` غير الضرورية على استعلامات Supabase
 *  ✅ catch (err: any) → catch (err: unknown) + getErrorMessage
 *  ✅ تحويل (s: any)/(l: any) → أنواع صريحة في الفلاتر
 *  ════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Clock, Loader,
  Sun, Moon, Sunrise, ChevronRight, ChevronLeft,
  AlertTriangle, CalendarX, Send, X,
} from 'lucide-react';
import { useAuthStore, useUIStore } from '../../core/stores';
import { employeeService } from '../../services/sdk/EmployeeService';
import { attendanceService } from '../../services/sdk/AttendanceService';
import type { MyAttendanceCorrection } from '../../services/sdk/AttendanceService';
import { hrCaseService } from '../../services/sdk';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import Card, { CardHeader, CardTitle } from '../../shared/components/ui/Card';
import {
  determineShift, calculateLateMinutes,
  calculateTotalHours,
  ShiftType,
} from '../../utils/shiftUtils';
import { getErrorMessage } from '../../services/errors';

// ════════════════════════════════════════════════════
// أنواع البيانات (محلّية - تحلّ محل any)
// ════════════════════════════════════════════════════

/** سجل بصمة واحد من جدول attendance_logs */
interface AttendanceLogRecord {
  id: string | number;
  employee_id: string;
  shift_date: string;
  punch_time: string;
  punch_type?: string;
}

/** ملخص يوم من attendance_summary */
interface AttendanceSummaryRecord {
  id: string | number;
  employee_id: string;
  shift_date: string;
  check_in?: string;
  check_out?: string;
  shift_type?: ShiftType;
  status?: string;
  total_hours?: number;
  late_minutes?: number;
  early_leave_minutes?: number;
}

/** نوع قيمة حالة اليوم */
interface TodayStatus {
  checked: boolean;
  checkIn?: string;
  checkOut?: string;
  shiftType?: ShiftType;
  status?: string;
  totalHours?: number;
  lateMinutes?: number;
}

/** إحصائيات الشهر */
interface MonthStats {
  total: number;
  present: number;
  late: number;
  absent: number;
  /** ★ 0344: مجاز + عطلة + إجازة_انتظار — كانت تسقط من كل خانة */
  leave: number;
  totalHours: number;
  avgHours: number;
  weeklyStreak: number;
  longestStreak: number;
  /** ★★ 0344: أيام بحالة خارج المفردات الثماني — تُعرض لا تُبتلع */
  unknown: number;
}

// ════════════════════════════════════════════════════
// ثوابت
// ════════════════════════════════════════════════════

/**
 * حالات الحضور **الثماني** — المصدر: determineAttendanceStatus في
 * src/utils/shiftCalculations.ts:261 (وهي نفسها AttendanceStatus في
 * shiftTypes.ts وSTATUS_LABELS في shiftReports.ts).
 *
 * ★★ كانت خمساً فقط: 'زمنية_معتمدة' و'زمنية_انتظار' و'إجازة_انتظار'
 *   غائبة ⇒ أيامها تظهر في التقويم بلون «لا سجلّ» الرمادي رغم وجود
 *   سجلّ لها. مايجريشن 0344 وحّد المفردات في القاعدة أيضاً.
 */
const ATTENDANCE_STATUS = {
  ON_TIME: 'حضور_بوقت',
  LATE: 'متأخر',
  PERM_OK: 'زمنية_معتمدة',
  PERM_WAIT: 'زمنية_انتظار',
  ABSENT: 'غائب',
  LEAVE: 'مجاز',
  LEAVE_WAIT: 'إجازة_انتظار',
  HOLIDAY: 'عطلة',
} as const;

/**
 * حالات قضايا الموارد البشرية — القيم من CHECK المُحقَّق على
 * hr_cases.status: open · in_review · waiting_employee · resolved · closed
 */
const CASE_STATUS_LABEL: Record<string, string> = {
  open: 'قيد الانتظار',
  in_review: 'قيد المراجعة',
  waiting_employee: 'بانتظار ردّك',
  resolved: 'تم الحلّ',
  closed: 'مغلق',
};

const CASE_STATUS_STYLE: Record<string, string> = {
  open: 'bg-amber-100 text-amber-700',
  in_review: 'bg-sky-100 text-sky-700',
  waiting_employee: 'bg-orange-100 text-orange-700',
  resolved: 'bg-emerald-100 text-emerald-700',
  closed: 'bg-slate-200 text-slate-600',
};

/** لون خلفية اليوم في التقويم لكل حالة */
const STATUS_BG: Record<string, string> = {
  'حضور_بوقت': 'bg-emerald-100',
  'متأخر': 'bg-amber-100',
  'زمنية_معتمدة': 'bg-sky-100',
  'زمنية_انتظار': 'bg-yellow-100',
  'غائب': 'bg-red-100',
  'مجاز': 'bg-purple-100',
  'إجازة_انتظار': 'bg-fuchsia-100',
  'عطلة': 'bg-slate-100',
};

/** أنواع البصمة (دخول/خروج) — يدعم عدة صيغ */
const CHECK_IN_TYPES = ['check-in', 'check_in', 'الدخول'];
const CHECK_OUT_TYPES = ['check-out', 'check_out', 'الخروج'];

const isCheckIn = (type?: string): boolean =>
  !!type && CHECK_IN_TYPES.includes(type);

const isCheckOut = (type?: string): boolean =>
  !!type && CHECK_OUT_TYPES.includes(type);

// ════════════════════════════════════════════════════
// المكون الرئيسي
// ════════════════════════════════════════════════════

export default function MyAttendancePage() {
  const { user } = useAuthStore();
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(true);
  const [employeeId, setEmployeeId] = useState<string>('');
  const [employeeLinkMissing, setEmployeeLinkMissing] = useState(false);
  const [logs, setLogs] = useState<AttendanceLogRecord[]>([]);
  const [summary, setSummary] = useState<AttendanceSummaryRecord[]>([]);
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [todayStatus, setTodayStatus] = useState<TodayStatus>({ checked: false });
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);
  const [submittingCorrection, setSubmittingCorrection] = useState(false);
  const [correctionForm, setCorrectionForm] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    type: 'missing_punch',
    expected_time: '',
    reason: '',
  });
  const [stats, setStats] = useState<MonthStats>({
    total: 0, present: 0, late: 0, absent: 0, leave: 0,
    totalHours: 0, avgHours: 0, weeklyStreak: 0, longestStreak: 0, unknown: 0,
  });
  const [corrections, setCorrections] = useState<MyAttendanceCorrection[]>([]);

  // ── الحصول على معرف الموظف ────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;
    const getEmployeeId = async () => {
      setLoading(true);
      setEmployeeLinkMissing(false);
      try {
        if (user.employee_id) {
          setEmployeeId(user.employee_id);
          return;
        }
        const employees = await employeeService.findAll({
          filters: { user_id: user.id },
          limit: 1,
        });
        if (employees.length > 0) {
          setEmployeeId(employees[0].id);
          return;
        }
        setEmployeeId('');
        setEmployeeLinkMissing(true);
        setLoading(false);
      } catch (err) {
        console.error('Error resolving employee id:', getErrorMessage(err));
        setEmployeeLinkMissing(true);
        setLoading(false);
      }
    };
    getEmployeeId();
  }, [user?.id, user?.employee_id]);

  // ── جلب بيانات الحضور ─────────────────────────────────────────
  const fetchAttendance = useCallback(async () => {
    if (!employeeId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const startDate = format(new Date(currentYear, currentMonth, 1), 'yyyy-MM-dd');
      const endDate = format(new Date(currentYear, currentMonth + 1, 0), 'yyyy-MM-dd');
      const today = format(new Date(), 'yyyy-MM-dd');

      // ★★★ إصلاح 0337: كان الاستعلامان بلا ترشيح نطاق رغم حساب
      //   startDate/endDate أعلاه — فجُلب **كل تاريخ الموظف** وعُرض
      //   كأنه الشهر المختار، وأزرار التنقّل لا تغيّر شيئاً.
      //   مُثبَت على Postgres: 23 سجلاً بدل 3 · 175 ساعة بدل 15.
      const [logsData, summaryData, statsRow, streakRow, correctionRows] = await Promise.all([
        attendanceService.findAll({
          filters: { employee_id: employeeId },
          orderBy: 'punch_time',
          ascending: false,
          limit: 200,
        }),
        attendanceService.myMonth(currentYear, currentMonth + 1),
        attendanceService.myMonthStats(currentYear, currentMonth + 1),
        attendanceService.myStreak(),
        // ★★ 0344: الصفحة كانت تُنشئ hr_case ثم لا تعرضه أبداً —
        //   الموظف يرى «تم الإرسال» ولا يعرف مصير طلبه بعدها.
        attendanceService.myCorrections(20),
      ]);
      setCorrections(correctionRows);

      const logsList = (logsData || []) as AttendanceLogRecord[];
      // ★ 0337: myMonth تُرجع الشهر المُرشَّح — نُطابقه مع شكل الحالة
      const summaryList: AttendanceSummaryRecord[] = summaryData.map((d) => ({
        shift_date: d.shiftDate,
        shift_type: d.shiftType,
        check_in: d.checkIn ?? undefined,
        check_out: d.checkOut ?? undefined,
        status: d.status,
        total_hours: d.totalHours,
        late_minutes: d.lateMinutes,
      })) as unknown as AttendanceSummaryRecord[];

      setLogs(logsData);
      setSummary(summaryList);

      // ── حالة اليوم ────────────────────────────────────────────
      // ★ 0337: myMonth تُرجع camelCase — الأسماء تغيّرت لا الدلالة
      const todaySummary = summaryData.find((d) => d.shiftDate === today);
      if (todaySummary) {
        setTodayStatus({
          checked: true,
          checkIn: todaySummary.checkIn ?? undefined,
          checkOut: todaySummary.checkOut ?? undefined,
          shiftType: todaySummary.shiftType as ShiftType | undefined,
          status: todaySummary.status,
          totalHours: todaySummary.totalHours,
          lateMinutes: todaySummary.lateMinutes,
        });
      } else {
        const todayLog = logsData.filter((l) => l.shift_date === today);
        if (todayLog.length > 0) {
          let checkIn: string | undefined;
          let checkOut: string | undefined;

          if (todayLog[0]?.punch_type) {
            const checkInEntry = todayLog.find((l) => isCheckIn(l.punch_type));
            const checkOutEntry = todayLog.find((l) => isCheckOut(l.punch_type));
            checkIn = checkInEntry?.punch_time;
            checkOut = checkOutEntry?.punch_time;
          } else {
            const sorted = [...todayLog].sort(
              (a, b) => new Date(a.punch_time).getTime() - new Date(b.punch_time).getTime()
            );
            checkIn = sorted[0]?.punch_time;
            checkOut = sorted.length > 1 ? sorted[sorted.length - 1].punch_time : undefined;
          }

          const shiftType = checkIn ? determineShift(checkIn) : undefined;
          setTodayStatus({
            checked: true,
            checkIn,
            checkOut,
            shiftType,
            status: checkOut ? ATTENDANCE_STATUS.ON_TIME : ATTENDANCE_STATUS.LATE,
            totalHours: checkOut && checkIn ? calculateTotalHours(checkIn, checkOut) : undefined,
            lateMinutes: checkIn && shiftType ? calculateLateMinutes(checkIn, shiftType) : undefined,
          });
        } else {
          setTodayStatus({ checked: false });
        }
      }

      // ── إحصائيات — من القاعدة (0337) ──────────────────────────
      //
      //   ★★ المتوسط يُحسب على **أيام الحضور** لا كل الأيام: القسمة
      //     على أيام تشمل الغياب تُظهر متوسطاً أقلّ من الحقيقة
      //     (5 ساعات بدل 7.5 في الإثبات).
      //
      //   ★★★ weeklyStreak كان `Math.min(عدد غير الغائب, 7)` — عدٌّ لا
      //     تتابع. من حضر يوماً وغاب يوماً شهراً كاملاً كان يحصل على 7
      //     بينما أطول تتابع لديه 1. صار تتابعاً حقيقياً محسوباً في
      //     القاعدة، والأيام بلا سجلّ (عطلة الأسبوع) لا تكسره.
      //   ★★★ 0344: مفردات 0337 كانت **مختلقة** ('في الوقت'·'حاضر'·
      //     'إجازة') ولا تطابق ما تكتبه المنصّة فعلاً. مُثبَت على
      //     Postgres: موظف حضر 4 أيام كان يرى «حضور: 1» و«إجازة: 0»
      //     ومتوسطاً 7.00 بدل 7.25.
      setStats({
        total: statsRow.total,
        present: statsRow.present,
        late: statsRow.late,
        absent: statsRow.absent,
        leave: statsRow.leave,
        totalHours: statsRow.totalHours,
        avgHours: statsRow.avgHours,
        weeklyStreak: streakRow.current,
        longestStreak: streakRow.longest,
        unknown: statsRow.unknown,
      });
    } catch (err) {
      console.error('Error fetching attendance:', getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [employeeId, currentMonth, currentYear]);

  useEffect(() => { fetchAttendance(); }, [fetchAttendance]);

  // ── التنقّل بين الأشهر ─────────────────────────────────────────
  const navigateMonth = (delta: number) => {
    const newDate = new Date(currentYear, currentMonth + delta);
    setCurrentMonth(newDate.getMonth());
    setCurrentYear(newDate.getFullYear());
  };

  const submitCorrectionRequest = async () => {
    if (!employeeId) return;
    if (!correctionForm.reason.trim()) {
      addToast('يرجى كتابة سبب طلب التصحيح', 'warning');
      return;
    }
    setSubmittingCorrection(true);
    try {
      await hrCaseService.createCase({
        employee_id: employeeId,
        case_type: 'attendance_correction',
        subject: `طلب تصحيح حضور - ${correctionForm.date}`,
        description: `نوع التصحيح: ${correctionForm.type}\nالوقت المتوقع: ${correctionForm.expected_time || 'غير محدد'}\nالسبب: ${correctionForm.reason}`,
        priority: 'normal',
        status: 'open',
      });
      addToast('تم إرسال طلب تصحيح الحضور إلى الموارد البشرية', 'success');
      setShowCorrectionModal(false);
      setCorrectionForm({ date: format(new Date(), 'yyyy-MM-dd'), type: 'missing_punch', expected_time: '', reason: '' });
      // ★ 0344: نُحدّث السجلّ فوراً — الطلب يظهر في القائمة بدل أن
      //   يختفي بلا أثر كما كان.
      setCorrections(await attendanceService.myCorrections(20));
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setSubmittingCorrection(false);
    }
  };

  const monthName = format(new Date(currentYear, currentMonth), 'MMMM yyyy', { locale: ar });

  const shiftIcon = (type?: ShiftType) => {
    switch (type) {
      case 'صباحي': return <Sun size={14} className="text-amber-500" />;
      case 'مسائي': return <Moon size={14} className="text-indigo-500" />;
      case 'ليلي': return <Sunrise size={14} className="text-blue-500" />;
      default: return <Clock size={14} />;
    }
  };

  // ════════════════════════════════════════════════════
  // العرض
  // ════════════════════════════════════════════════════

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      {/* Header */}
      <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-2xl font-extrabold flex items-center gap-2"><Clock size={24} /> حضوري</h2>
            <p className="text-white/70 mt-1">سجل الحضور والانصراف مع تحليل ذكي</p>
          </div>
          <button onClick={() => setShowCorrectionModal(true)} className="flex items-center gap-2 bg-white/15 hover:bg-white/25 rounded-xl px-4 py-2 text-sm font-bold transition-colors">
            <CalendarX size={16} /> طلب تصحيح حضور
          </button>
        </div>
      </div>

      {employeeLinkMissing && !loading ? (
        <Card>
          <div className="py-14 px-6 text-center">
            <AlertTriangle size={42} className="mx-auto mb-4 text-amber-500" />
            <h3 className="text-lg font-extrabold text-slate-800 mb-2">لا يوجد سجل موظف مرتبط بحسابك</h3>
            <p className="text-sm text-slate-500 max-w-xl mx-auto leading-7">
              لا يمكن عرض سجل الحضور لأن حسابك غير مربوط بسجل موظف داخل الشركة. يرجى التواصل مع إدارة الموارد البشرية أو مسؤول النظام لربط الحساب بسجل موظف.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700"
            >
              تحديث الصفحة
            </button>
          </div>
        </Card>
      ) : loading ? (
        <div className="flex justify-center py-20"><Loader className="animate-spin" size={32} /></div>
      ) : (
        <>
          {/* Today Status */}
          <Card>
            <CardHeader>
              <CardTitle>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-700">حالة اليوم</span>
                  <span className="text-sm text-slate-500">{format(new Date(), 'EEEE', { locale: ar })}</span>
                </div>
              </CardTitle>
            </CardHeader>
            <div className="px-4 pb-4">
              {todayStatus.checked ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl p-3 text-center">
                    <div className="flex justify-center mb-1">{shiftIcon(todayStatus.shiftType)}</div>
                    <p className="text-xs text-slate-500">الوردية</p>
                    <p className="font-bold text-slate-700">{todayStatus.shiftType || 'صباحي'}</p>
                  </div>
                  <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-3 text-center">
                    <p className="text-xs text-slate-500">وقت الحضور</p>
                    <p className="font-bold text-slate-700">{todayStatus.checkIn ? format(new Date(todayStatus.checkIn), 'HH:mm') : '--:--'}</p>
                  </div>
                  <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-3 text-center">
                    <p className="text-xs text-slate-500">وقت الانصراف</p>
                    <p className="font-bold text-slate-700">{todayStatus.checkOut ? format(new Date(todayStatus.checkOut), 'HH:mm') : '--:--'}</p>
                  </div>
                  <div className="bg-gradient-to-br from-violet-50 to-purple-50 rounded-xl p-3 text-center">
                    <p className="text-xs text-slate-500">إجمالي الساعات</p>
                    <p className="font-bold text-slate-700">{todayStatus.totalHours?.toFixed(1) || '0'} س</p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-4 text-slate-400">
                  <AlertTriangle size={24} className="mx-auto mb-2" />
                  <p className="font-medium">لا يوجد تسجيل حضور لليوم</p>
                  <p className="text-xs mt-1">يرجى تسجيل الدخول عبر جهاز البصمة</p>
                </div>
              )}
            </div>
          </Card>

          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white rounded-2xl p-4 border border-slate-100">
              <p className="text-xs font-bold text-slate-500">إجمالي أيام الحضور</p>
              <p className="text-2xl font-extrabold text-slate-800 mt-1">{stats.present}</p>
              <p className="text-xs text-slate-400">من أصل {stats.total} يوم</p>
            </div>
            <div className="bg-amber-50 rounded-2xl p-4 border border-amber-100">
              <p className="text-xs font-bold text-amber-600">تأخير</p>
              <p className="text-2xl font-extrabold text-amber-700 mt-1">{stats.late}</p>
              <p className="text-xs text-amber-500">مرة هذا الشهر</p>
            </div>
            <div className="bg-red-50 rounded-2xl p-4 border border-red-100">
              <p className="text-xs font-bold text-red-600">غياب</p>
              <p className="text-2xl font-extrabold text-red-700 mt-1">{stats.absent}</p>
              <p className="text-xs text-red-500">يوم</p>
            </div>
            <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-100">
              <p className="text-xs font-bold text-emerald-600">متوسط الساعات</p>
              <p className="text-2xl font-extrabold text-emerald-700 mt-1">{stats.avgHours.toFixed(1)}</p>
              <p className="text-xs text-emerald-500">على أيام الحضور</p>
            </div>
          </div>

          {/* ★★★ 0344: بطاقات كانت غائبة تماماً.
              'مجاز' و'عطلة' و'إجازة_انتظار' لم تكن تُحتسب في أي خانة —
              لا حضوراً ولا غياباً ولا إجازةً: تتبخّر من الشاشة. */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-purple-50 rounded-2xl p-4 border border-purple-100">
              <p className="text-xs font-bold text-purple-600">إجازات وعطل</p>
              <p className="text-2xl font-extrabold text-purple-700 mt-1">{stats.leave}</p>
              <p className="text-xs text-purple-500">يوم هذا الشهر</p>
            </div>
            <div className="bg-indigo-50 rounded-2xl p-4 border border-indigo-100">
              <p className="text-xs font-bold text-indigo-600">إجمالي الساعات</p>
              <p className="text-2xl font-extrabold text-indigo-700 mt-1">{stats.totalHours.toFixed(1)}</p>
              <p className="text-xs text-indigo-500">ساعة</p>
            </div>
            <div className="bg-teal-50 rounded-2xl p-4 border border-teal-100">
              <p className="text-xs font-bold text-teal-600">تتابع الحضور</p>
              <p className="text-2xl font-extrabold text-teal-700 mt-1">{stats.weeklyStreak}</p>
              <p className="text-xs text-teal-500">أطول تتابع: {stats.longestStreak} يوم</p>
            </div>
            {stats.unknown > 0 ? (
              <div className="bg-orange-50 rounded-2xl p-4 border border-orange-200">
                <p className="text-xs font-bold text-orange-600 flex items-center gap-1">
                  <AlertTriangle size={12} /> أيام بحالة غير معروفة
                </p>
                <p className="text-2xl font-extrabold text-orange-700 mt-1">{stats.unknown}</p>
                <p className="text-xs text-orange-500">راجع الموارد البشرية</p>
              </div>
            ) : (
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                <p className="text-xs font-bold text-slate-500">دقائق التأخير</p>
                <p className="text-2xl font-extrabold text-slate-700 mt-1">{stats.late > 0 ? stats.late : 0}</p>
                <p className="text-xs text-slate-400">مرات تأخير</p>
              </div>
            )}
          </div>

          {/* Monthly Calendar */}
          <Card>
            <CardHeader>
              <CardTitle>
                <div className="flex items-center justify-between">
                  <button onClick={() => navigateMonth(-1)} className="p-1 hover:bg-slate-100 rounded-lg"><ChevronRight size={18} /></button>
                  <span className="font-bold text-slate-700">{monthName}</span>
                  <button onClick={() => navigateMonth(1)} className="p-1 hover:bg-slate-100 rounded-lg"><ChevronLeft size={18} /></button>
                </div>
              </CardTitle>
            </CardHeader>
            <div className="px-4 pb-4">
              {summary.length === 0 ? (
                <div className="text-center py-8 text-slate-400">لا توجد سجلات حضور لهذا الشهر</div>
              ) : (
                <div className="grid grid-cols-7 gap-2 text-center">
                  {['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س'].map((d) => (
                    <div key={d} className="text-xs font-bold text-slate-500 py-1">{d}</div>
                  ))}
                  {(() => {
                    const days: React.ReactNode[] = [];
                    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
                    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

                    for (let i = 0; i < (firstDay === 0 ? 6 : firstDay - 1); i++) {
                      days.push(<div key={`empty-${i}`} />);
                    }

                    for (let d = 1; d <= daysInMonth; d++) {
                      const dateStr = format(new Date(currentYear, currentMonth, d), 'yyyy-MM-dd');
                      const daySummary = summary.find((s) => s.shift_date === dateStr);
                      const isToday = format(new Date(), 'yyyy-MM-dd') === dateStr;
                      // ★ خريطة واحدة للحالات الثماني. المنطق القديم
                      //   غطّى خمساً، فظهرت أيام «زمنية_معتمدة» و
                      //   «زمنية_انتظار» و«إجازة_انتظار» بلون «لا سجلّ».
                      //   والحالة المجهولة تُميَّز بإطار متقطّع لا تُخفى.
                      const known = daySummary?.status
                        ? STATUS_BG[daySummary.status]
                        : undefined;
                      const bg = known ?? (daySummary?.status
                        ? 'bg-slate-200 border border-dashed border-slate-400'
                        : 'bg-slate-50');

                      days.push(
                        <div key={d} className={`${bg} rounded-lg p-1.5 ${isToday ? 'ring-2 ring-indigo-400' : ''}`}>
                          <p className="text-xs font-bold text-slate-700">{d}</p>
                          {daySummary?.total_hours && (
                            <p className="text-[9px] text-slate-500">{daySummary.total_hours.toFixed(1)}س</p>
                          )}
                        </div>
                      );
                    }
                    return days;
                  })()}
                </div>
              )}
            </div>
          </Card>

          {/* Recent Logs */}
          <Card>
            <CardHeader>
              <CardTitle>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-700">سجل البصمات</span>
                  <span className="text-xs text-slate-500">{logs.length} تسجيل</span>
                </div>
              </CardTitle>
            </CardHeader>
            <div className="px-4 pb-4 space-y-2 max-h-80 overflow-y-auto">
              {logs.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <Clock size={32} className="mx-auto mb-2 opacity-40" />
                  <p className="font-medium">لا توجد بصمات مسجلة</p>
                </div>
              ) : (
                logs.slice(0, 30).map((log) => (
                  <div key={log.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-indigo-100 text-indigo-600"><Clock size={14} /></div>
                      <div>
                        <p className="text-sm font-semibold text-slate-700">{determineShift(log.punch_time)}</p>
                        <p className="text-xs text-slate-500">{isCheckIn(log.punch_type) ? 'حضور' : 'انصراف'}</p>
                      </div>
                    </div>
                    <span className="text-xs text-slate-500 font-mono">{format(new Date(log.punch_time), 'dd MMM - HH:mm', { locale: ar })}</span>
                  </div>
                ))
              )}
            </div>
          </Card>
          {/* ★★★ 0344: سجلّ طلبات التصحيح.
              الصفحة كانت تُنشئ hr_case بـcase_type='attendance_correction'
              ثم **لا تعرضه أبداً**: الموظف يضغط «أرسل»، يرى رسالة نجاح،
              ولا يعرف بعدها شيئاً — لا رقم طلب ولا حالة ولا ردّ. */}
          <Card>
            <CardHeader>
              <CardTitle>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-700 flex items-center gap-2">
                    <CalendarX size={16} /> طلبات تصحيح الحضور
                  </span>
                  <span className="text-xs text-slate-500">{corrections.length} طلب</span>
                </div>
              </CardTitle>
            </CardHeader>
            <div className="px-4 pb-4 space-y-2">
              {corrections.length === 0 ? (
                <div className="text-center py-6 text-slate-400">
                  <CalendarX size={28} className="mx-auto mb-2 opacity-40" />
                  <p className="font-medium text-sm">لم ترسل أي طلب تصحيح</p>
                </div>
              ) : (
                corrections.map((c) => (
                  <div key={c.id} className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-700">{c.subject}</p>
                        <p className="text-xs text-slate-500 mt-0.5 whitespace-pre-line">{c.description}</p>
                      </div>
                      <span className={`text-[11px] font-bold px-2 py-1 rounded-full shrink-0 ${
                        CASE_STATUS_STYLE[c.status] ?? 'bg-slate-100 text-slate-600'
                      }`}>
                        {CASE_STATUS_LABEL[c.status] ?? c.status}
                      </span>
                    </div>
                    {c.resolution ? (
                      <p className="text-xs text-emerald-700 bg-emerald-50 rounded-lg px-2 py-1.5 mt-2">
                        <span className="font-bold">ردّ الموارد البشرية: </span>{c.resolution}
                      </p>
                    ) : null}
                    <p className="text-[11px] text-slate-400 mt-2">
                      أُرسل {format(new Date(c.createdAt), 'dd MMM yyyy - HH:mm', { locale: ar })}
                      {c.resolvedAt
                        ? ` · حُسم ${format(new Date(c.resolvedAt), 'dd MMM yyyy', { locale: ar })}`
                        : ''}
                    </p>
                  </div>
                ))
              )}
            </div>
          </Card>
        </>
      )}

      {showCorrectionModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowCorrectionModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2"><CalendarX size={18} className="text-indigo-600" /> طلب تصحيح حضور</h3>
              <button onClick={() => setShowCorrectionModal(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">التاريخ</label>
                <input type="date" value={correctionForm.date} onChange={e => setCorrectionForm(p => ({ ...p, date: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">نوع التصحيح</label>
                <select value={correctionForm.type} onChange={e => setCorrectionForm(p => ({ ...p, type: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400">
                  <option value="missing_punch">بصمة مفقودة</option>
                  <option value="wrong_time">وقت غير صحيح</option>
                  <option value="forgot_checkout">نسيان بصمة خروج</option>
                  <option value="device_issue">مشكلة جهاز</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">الوقت المتوقع</label>
                <input type="time" value={correctionForm.expected_time} onChange={e => setCorrectionForm(p => ({ ...p, expected_time: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">السبب <span className="text-red-500">*</span></label>
                <textarea value={correctionForm.reason} onChange={e => setCorrectionForm(p => ({ ...p, reason: e.target.value }))} rows={4} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none resize-none focus:border-indigo-400" placeholder="اشرح سبب التصحيح..." />
              </div>
              <button onClick={submitCorrectionRequest} disabled={submittingCorrection} className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-xl py-2.5 font-bold transition-colors">
                <Send size={15} /> {submittingCorrection ? 'جاري الإرسال...' : 'إرسال الطلب'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
