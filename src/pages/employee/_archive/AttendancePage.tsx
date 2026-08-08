/**
 * ════════════════════════════════════════════════════════════════
 *  ⚠ مُؤرشَف في 0373 — ملفٌّ ميّت
 *
 *  غيرُ مُوجَّهٍ في AppRouter: المسار `app/employee/attendance` يشير
 *  إلى `MyAttendancePage`، وهذا الملفّ لا يستورده أحدٌ إطلاقاً.
 *  ومع ذلك كان يلمس Supabase في خمسة مواضع فيُبقي «خطّ الأساس»
 *  في portalHygieneContract مرتفعاً بلا سبب.
 *
 *  ★ يُحتفظ به مرجعاً — لا يُحذف (قاعدةُ المشروع).
 *  ★ المساراتُ عُدِّلت من `../../` إلى `../../../` بعد النقل.
 * ════════════════════════════════════════════════════════════════
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Clock, Calendar, Loader,
  ChevronRight, ChevronLeft
} from 'lucide-react';
import { supabase } from '../../../services/supabase/supabase';
import { useAuthStore } from '../../../core/stores';
import { format, parseISO } from 'date-fns';
import { ar } from 'date-fns/locale';
import Card, { CardHeader, CardTitle } from '../../../shared/components/ui/Card';
import { useUIStore } from '../../../core/stores';
import {
  determineShift, calculateLateMinutes,
  calculateTotalHours, STATUS_COLORS, STATUS_LABELS,
  AttendanceLog, AttendanceSummary, ShiftType
} from '../../../utils/shiftUtils';
import {
  LeaveBalance, Leave,
  getLeaveTypeLabel, getLeaveTypeColor, getLeaveStatusLabel
} from '../../../utils/leaveUtils';

export default function AttendancePage() {
  const { user } = useAuthStore();
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(true);
  const [, setAttendanceLogs] = useState<AttendanceLog[]>([]);
  const [attendanceSummary, setAttendanceSummary] = useState<AttendanceSummary[]>([]);
  const [leaveBalance, setLeaveBalance] = useState<LeaveBalance | null>(null);
  const [leaveRequests, setLeaveRequests] = useState<Leave[]>([]);
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [employeeId, setEmployeeId] = useState<string>('');
  const [todayStatus, setTodayStatus] = useState<{
    checkIn?: string;
    checkOut?: string;
    shiftType?: ShiftType;
    status?: string;
    totalHours?: number;
    lateMinutes?: number;
  }>({});

  // الحصول على معرف الموظف
  useEffect(() => {
    const getEmployeeId = async () => {
      if (!user?.id) return;
      const { data } = await supabase
        .from('employees')
        .select('id')
        .eq('user_id', user.id)
        .single();
      if (data) setEmployeeId(data.id);
    };
    getEmployeeId();
  }, [user]);

  // جلب بيانات الحضور
  const fetchAttendanceData = useCallback(async () => {
    if (!employeeId) return;
    setLoading(true);
    try {
      const startDate = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`;
      const endDate = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-31`;

      // جلب سجلات البصمات
      const { data: logs } = await supabase
        .from('attendance_logs')
        .select('*')
        .eq('employee_id', employeeId)
        .gte('shift_date', startDate)
        .lte('shift_date', endDate)
        .order('punch_time', { ascending: false });
      if (logs) setAttendanceLogs(logs as AttendanceLog[]);

      // جلب ملخص الحضور
      const { data: summary } = await supabase
        .from('attendance_summary')
        .select('*')
        .eq('employee_id', employeeId)
        .gte('shift_date', startDate)
        .lte('shift_date', endDate)
        .order('shift_date', { ascending: false });
      if (summary) setAttendanceSummary(summary as AttendanceSummary[]);

      // جلب رصيد الإجازات
      const { data: balance } = await supabase
        .from('leave_balance')
        .select('*')
        .eq('employee_id', employeeId)
        .eq('year', currentYear)
        .single();
      if (balance) setLeaveBalance(balance as LeaveBalance);

      // جلب طلبات الإجازة
      const { data: leaves } = await supabase
        .from('leaves')
        .select('*')
        .eq('employee_id', employeeId)
        .order('created_at', { ascending: false });
      if (leaves) setLeaveRequests(leaves as Leave[]);

      // حالة اليوم
      const today = format(new Date(), 'yyyy-MM-dd');
      const todayLogs = (logs as AttendanceLog[] | null)?.filter(
        l => l.shift_date === today
      ) || [];

      if (todayLogs.length > 0) {
        const sorted = [...todayLogs].sort(
          (a, b) => new Date(a.punch_time).getTime() - new Date(b.punch_time).getTime()
        );
        const checkIn = sorted[0];
        const checkOut = sorted[sorted.length - 1];
        const shiftType = checkIn.shift_type || determineShift(checkIn.punch_time);
        const lateMin = calculateLateMinutes(checkIn.punch_time, shiftType);
        const totalHrs = checkOut ? calculateTotalHours(checkIn.punch_time, checkOut.punch_time) : 0;

        setTodayStatus({
          checkIn: checkIn.punch_time,
          checkOut: checkOut.punch_time,
          shiftType,
          totalHours: totalHrs,
          lateMinutes: lateMin
        });
      }
    } catch (err) {
      console.error('❌ فشل تحميل بيانات الحضور:', err);
      addToast('فشل تحميل بيانات الحضور', 'error');
    } finally {
      setLoading(false);
    }
  }, [employeeId, currentMonth, currentYear, addToast]);

  useEffect(() => {
    fetchAttendanceData();
  }, [fetchAttendanceData]);

  // التنقل بين الأشهر
  const prevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else setCurrentMonth(currentMonth - 1);
  };
  const nextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else setCurrentMonth(currentMonth + 1);
  };

  // تنسيق الوقت
  const formatTime = (iso: string) => {
    return format(parseISO(iso), 'hh:mm a');
  };

  const formatDate = (iso: string) => {
    return format(parseISO(iso), 'yyyy/MM/dd');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64" dir="rtl">
        <Loader className="w-8 h-8 animate-spin text-indigo-600" />
        <span className="mr-3 text-gray-600">جاري تحميل بيانات الحضور...</span>
      </div>
    );
  }

  const monthName = format(new Date(currentYear, currentMonth), 'MMMM yyyy', { locale: ar });

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      {/* بطاقة حالة اليوم */}
      <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl p-6 text-white">
        <h2 className="text-2xl font-bold mb-1">حضوري اليوم</h2>
        <p className="text-indigo-200 text-sm">{format(new Date(), 'EEEE, d MMMM yyyy', { locale: ar })}</p>
        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white/20 rounded-xl p-4 text-center">
            <div className="text-3xl font-bold">
              {todayStatus.checkIn ? formatTime(todayStatus.checkIn) : '--:--'}
            </div>
            <div className="text-xs text-indigo-200 mt-1">وقت الدخول</div>
          </div>
          <div className="bg-white/20 rounded-xl p-4 text-center">
            <div className="text-3xl font-bold">
              {todayStatus.checkOut ? formatTime(todayStatus.checkOut) : '--:--'}
            </div>
            <div className="text-xs text-indigo-200 mt-1">وقت الخروج</div>
          </div>
          <div className="bg-white/20 rounded-xl p-4 text-center">
            <div className="text-3xl font-bold">
              {todayStatus.totalHours ? `${todayStatus.totalHours.toFixed(1)}` : '0'}
            </div>
            <div className="text-xs text-indigo-200 mt-1">ساعات العمل</div>
          </div>
          <div className="bg-white/20 rounded-xl p-4 text-center">
            <div className="text-3xl font-bold">
              {todayStatus.shiftType || '--'}
            </div>
            <div className="text-xs text-indigo-200 mt-1">الوردية</div>
          </div>
        </div>
        {todayStatus.lateMinutes && todayStatus.lateMinutes > 0 ? (
          <div className="mt-4 bg-red-500/30 rounded-lg px-4 py-2 text-sm">
            ⚠️ تأخرت {todayStatus.lateMinutes} دقيقة
          </div>
        ) : todayStatus.checkIn ? (
          <div className="mt-4 bg-green-500/30 rounded-lg px-4 py-2 text-sm">
            ✅ تم تسجيل الحضور في الوقت المحدد
          </div>
        ) : (
          <div className="mt-4 bg-yellow-500/30 rounded-lg px-4 py-2 text-sm">
            🟡 لم تسجل حضورك بعد اليوم
          </div>
        )}
      </div>

      {/* رصيد الإجازات */}
      <Card>
        <CardHeader>
          <CardTitle>
            <Calendar className="inline ml-2" size={20} />
            رصيد الإجازات
          </CardTitle>
        </CardHeader>
        <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-green-50 rounded-xl p-4 text-center border border-green-200">
            <div className="text-2xl font-bold text-green-700">
              {leaveBalance?.annual_remaining.toFixed(3) || '0'}
            </div>
            <div className="text-xs text-gray-600">إجازة سنوية</div>
            <div className="text-xs text-gray-400">المجموع: {leaveBalance?.annual_total || 0}</div>
          </div>
          <div className="bg-red-50 rounded-xl p-4 text-center border border-red-200">
            <div className="text-2xl font-bold text-red-700">
              {leaveBalance?.sick_remaining.toFixed(1) || '30'}
            </div>
            <div className="text-xs text-gray-600">إجازة مرضية</div>
          </div>
          <div className="bg-purple-50 rounded-xl p-4 text-center border border-purple-200">
            <div className="text-2xl font-bold text-purple-700">
              {leaveBalance?.hajj_taken ? '✗' : '✓'}
            </div>
            <div className="text-xs text-gray-600">إجازة حج</div>
            <div className="text-xs text-gray-400">{leaveBalance?.hajj_taken ? 'مستخدمة' : 'متاحة'}</div>
          </div>
          <div className="bg-blue-50 rounded-xl p-4 text-center border border-blue-200">
            <div className="text-2xl font-bold text-blue-700">
              {leaveRequests.filter(l => l.status === 'انتظار').length}
            </div>
            <div className="text-xs text-gray-600">طلبات معلقة</div>
          </div>
        </div>
      </Card>

      {/* اختيار الشهر */}
      <div className="flex items-center justify-between bg-white rounded-xl p-4 shadow-sm">
        <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-lg">
          <ChevronRight className="w-5 h-5 text-gray-600" />
        </button>
        <h3 className="text-lg font-bold text-gray-800">{monthName}</h3>
        <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-lg">
          <ChevronLeft className="w-5 h-5 text-gray-600" />
        </button>
      </div>

      {/* جدول الحضور الشهري */}
      <Card>
        <CardHeader>
          <CardTitle>
            <Clock className="inline ml-2" size={20} />
            سجلات الحضور
          </CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="px-4 py-3 text-right">التاريخ</th>
                <th className="px-4 py-3 text-right">الوردية</th>
                <th className="px-4 py-3 text-right">الدخول</th>
                <th className="px-4 py-3 text-right">الخروج</th>
                <th className="px-4 py-3 text-right">الساعات</th>
                <th className="px-4 py-3 text-right">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {attendanceSummary.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-gray-500">
                    لا توجد سجلات حضور لهذا الشهر
                  </td>
                </tr>
              ) : (
                attendanceSummary.map((record) => (
                  <tr key={`${record.employee_id}-${record.shift_date}`} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3">{formatDate(record.shift_date)}</td>
                    <td className="px-4 py-3">{record.shift_type || '--'}</td>
                    <td className="px-4 py-3">
                      {record.check_in ? formatTime(record.check_in) : '--'}
                    </td>
                    <td className="px-4 py-3">
                      {record.check_out ? formatTime(record.check_out) : '--'}
                    </td>
                    <td className="px-4 py-3">{record.total_hours.toFixed(1)}</td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium"
                        style={{
                          backgroundColor: `${STATUS_COLORS[record.status]}20`,
                          color: STATUS_COLORS[record.status],
                          border: `1px solid ${STATUS_COLORS[record.status]}40`
                        }}
                      >
                        {STATUS_LABELS[record.status]}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* طلبات الإجازة */}
      <Card>
        <CardHeader>
          <CardTitle>
            <Calendar className="inline ml-2" size={20} />
            طلبات الإجازات
          </CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="px-4 py-3 text-right">النوع</th>
                <th className="px-4 py-3 text-right">من</th>
                <th className="px-4 py-3 text-right">إلى</th>
                <th className="px-4 py-3 text-right">أيام</th>
                <th className="px-4 py-3 text-right">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {leaveRequests.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-gray-500">
                    لا توجد طلبات إجازة
                  </td>
                </tr>
              ) : (
                leaveRequests.slice(0, 10).map((leave) => (
                  <tr key={leave.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium"
                        style={{ backgroundColor: `${getLeaveTypeColor(leave.leave_type)}20`, color: getLeaveTypeColor(leave.leave_type) }}
                      >
                        {getLeaveTypeLabel(leave.leave_type)}
                      </span>
                    </td>
                    <td className="px-4 py-3">{formatDate(leave.date_from)}</td>
                    <td className="px-4 py-3">{formatDate(leave.date_to)}</td>
                    <td className="px-4 py-3">{leave.working_days_count}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                        leave.status === 'موافق' ? 'bg-green-100 text-green-700' :
                        leave.status === 'مرفوض' ? 'bg-red-100 text-red-700' :
                        'bg-yellow-100 text-yellow-700'
                      }`}>
                        {getLeaveStatusLabel(leave.status)}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}