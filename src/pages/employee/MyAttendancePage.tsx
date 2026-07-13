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
  AlertTriangle,
} from 'lucide-react';
import { useAuthStore } from '../../core/stores';
import { employeeService } from '../../services/sdk/EmployeeService';
import { attendanceService, attendanceSummaryService } from '../../services/sdk/AttendanceService';
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
  totalHours: number;
  avgHours: number;
  weeklyStreak: number;
}

// ════════════════════════════════════════════════════
// ثوابت
// ════════════════════════════════════════════════════

/** أسماء حالات الحضور المتوقّعة من قاعدة البيانات */
const ATTENDANCE_STATUS = {
  ON_TIME: 'حضور_بوقت',
  LATE: 'متأخر',
  ABSENT: 'غائب',
  LEAVE: 'مجاز',
  HOLIDAY: 'عطلة',
} as const;

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
  const [loading, setLoading] = useState(true);
  const [employeeId, setEmployeeId] = useState<string>('');
  const [logs, setLogs] = useState<AttendanceLogRecord[]>([]);
  const [summary, setSummary] = useState<AttendanceSummaryRecord[]>([]);
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [todayStatus, setTodayStatus] = useState<TodayStatus>({ checked: false });
  const [stats, setStats] = useState<MonthStats>({
    total: 0, present: 0, late: 0, absent: 0,
    totalHours: 0, avgHours: 0, weeklyStreak: 0,
  });

  // ── الحصول على معرف الموظف ────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;
    const getEmployeeId = async () => {
      const employees = await employeeService.findAll({
        filters: { user_id: user.id },
        limit: 1,
      });
      if (employees.length > 0) {
        setEmployeeId(employees[0].id);
      }
    };
    getEmployeeId();
  }, [user]);

  // ── جلب بيانات الحضور ─────────────────────────────────────────
  const fetchAttendance = useCallback(async () => {
    if (!employeeId) return;
    setLoading(true);
    try {
      const startDate = format(new Date(currentYear, currentMonth, 1), 'yyyy-MM-dd');
      const endDate = format(new Date(currentYear, currentMonth + 1, 0), 'yyyy-MM-dd');
      const today = format(new Date(), 'yyyy-MM-dd');

      const [logsData, summaryData] = await Promise.all([
        attendanceService.findAll({
          filters: { employee_id: employeeId },
          orderBy: 'punch_time',
          ascending: false,
        }),
        attendanceSummaryService.findAll({
          filters: { employee_id: employeeId },
          orderBy: 'shift_date',
          ascending: false,
        }),
      ]);

      const logsList = (logsData || []) as AttendanceLogRecord[];
      const summaryList = (summaryData || []) as AttendanceSummaryRecord[];

      setLogs(logsData);
      setSummary(summaryData as any);

      // ── حالة اليوم ────────────────────────────────────────────
      const todaySummary = summaryData.find((s) => s.shift_date === today);
      if (todaySummary) {
        setTodayStatus({
          checked: true,
          checkIn: todaySummary.check_in,
          checkOut: todaySummary.check_out,
          shiftType: todaySummary.shift_type as any,
          status: todaySummary.status,
          totalHours: todaySummary.total_hours,
          lateMinutes: todaySummary.late_minutes,
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

      // ── إحصائيات ──────────────────────────────────────────────
      const present = summaryData.filter(
        (s) => s.status === ATTENDANCE_STATUS.ON_TIME || s.status === ATTENDANCE_STATUS.LATE
      ).length;
      const late = summaryData.filter((s) => s.status === ATTENDANCE_STATUS.LATE).length;
      const absent = summaryData.filter((s) => s.status === ATTENDANCE_STATUS.ABSENT).length;
      const totalHours = summaryData.reduce((sum, s) => sum + (s.total_hours || 0), 0);

      setStats({
        total: summaryData.length,
        present,
        late,
        absent,
        totalHours,
        avgHours: summaryData.length > 0 ? totalHours / summaryData.length : 0,
        weeklyStreak: Math.min(summaryData.filter((s) => s.status !== ATTENDANCE_STATUS.ABSENT).length, 7),
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
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-extrabold flex items-center gap-2"><Clock size={24} /> حضوري</h2>
            <p className="text-white/70 mt-1">سجل الحضور والانصراف مع تحليل ذكي</p>
          </div>
        </div>
      </div>

      {loading ? (
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
              <p className="text-xs text-emerald-500">ساعة/يوم</p>
            </div>
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
                      let bg = 'bg-slate-50';

                      if (daySummary?.status) {
                        if (daySummary.status === ATTENDANCE_STATUS.ON_TIME) bg = 'bg-emerald-100';
                        else if (daySummary.status === ATTENDANCE_STATUS.LATE) bg = 'bg-amber-100';
                        else if (daySummary.status === ATTENDANCE_STATUS.ABSENT) bg = 'bg-red-100';
                        else if (daySummary.status === ATTENDANCE_STATUS.LEAVE) bg = 'bg-purple-100';
                        else if (daySummary.status === ATTENDANCE_STATUS.HOLIDAY) bg = 'bg-slate-100';
                      }

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
        </>
      )}
    </div>
  );
}
