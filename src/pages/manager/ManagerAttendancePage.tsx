import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  BarChart3, Clock, Download, Loader, Search, Users,
  TrendingUp, TrendingDown, Award, AlertTriangle,
  ChevronDown, ChevronUp, CalendarDays, FileSpreadsheet,
  Filter,
} from 'lucide-react';
import { format, parseISO, subDays } from 'date-fns';
import { ar } from 'date-fns/locale';
import { useAuthStore, useUIStore } from '../../core/stores';
import { userService } from '../../services/sdk/UserService';
import { attendanceService, attendanceSummaryService } from '../../services/sdk/AttendanceService';
import {
  AttendanceSummary, AttendanceStatus, AttendanceLog,
  STATUS_COLORS, STATUS_LABELS,
  generateTeamReports,
  getTeamQuickStats,
  getDailyAttendanceStats,
  downloadCSV,
  createAttendanceSummary,
  EmployeeAttendanceReport,
} from '../../utils/shiftUtils';

// ============================================================================
// أنواع المساعدة
// ============================================================================

type ViewMode = 'daily' | 'weekly' | 'monthly';
type SortField = 'name' | 'attendance_rate' | 'late_days' | 'absent_days' | 'overtime';
type SortDirection = 'asc' | 'desc';

interface TeamMember {
  id: string;
  full_name: string;
  department: string;
  role: string;
}

interface DailySummary {
  employee_id: string;
  full_name: string;
  department: string;
  summary: AttendanceSummary | null;
}

// ============================================================================
// المكون الرئيسي
// ============================================================================

export default function ManagerAttendancePage() {
  const { user } = useAuthStore();
  const { addToast } = useUIStore();

  // حالة التحميل
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // بيانات الفريق
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [dailySummaries, setDailySummaries] = useState<DailySummary[]>([]);

  // التقارير التحليلية
  const [reports, setReports] = useState<EmployeeAttendanceReport[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);

  // التصفية والفرز
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('attendance_rate');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // التاريخ
  const [viewMode, setViewMode] = useState<ViewMode>('daily');
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));

  // ملخص سريع
  const [quickStats, setQuickStats] = useState<{
    totalEmployees: number;
    averageAttendanceRate: number;
    totalAbsentDays: number;
    totalLateDays: number;
    totalOvertimeHours: number;
    topPerformers: EmployeeAttendanceReport[];
    underPerformers: EmployeeAttendanceReport[];
  } | null>(null);

  // ================================================================
  // جلب الفريق
  // ================================================================

  const fetchTeam = useCallback(async () => {
    if (!user?.id) return;

    try {
      const allUsers = await userService.findAllUsers();
      if (!allUsers) return;

      const typedUsers = allUsers as unknown as TeamMember[];

      const byManager = typedUsers.filter(
        (u: any) => u.manager_id === user.id && u.role !== 'developer'
      );

      if (byManager.length > 0) {
        setTeamMembers(byManager);
        return;
      }

      const currentUser = typedUsers.find((u) => u.id === user.id);
      if (currentUser?.department) {
        const byDepartment = typedUsers.filter(
          (u) => u.department === currentUser.department && u.id !== user.id
        ).slice(0, 50);
        if (byDepartment.length > 0) setTeamMembers(byDepartment);
      }
    } catch (err) {
      console.error('Error fetching team:', err);
    }
  }, [user?.id]);

  // ================================================================
  // جلب الحضور اليومي
  // ================================================================

  const fetchDailyAttendance = useCallback(async () => {
    if (teamMembers.length === 0) return;

    try {
      const sumData = await attendanceSummaryService.findAll({
        filters: { shift_date: selectedDate },
      });

      const merged: DailySummary[] = teamMembers.map((emp) => {
        const s = (sumData || []).find((sm: any) => sm.employee_id === emp.id);
        return {
          employee_id: emp.id,
          full_name: emp.full_name,
          department: emp.department || '',
          summary: s
            ? {
                id: s.id,
                employee_id: s.employee_id,
                shift_date: s.shift_date,
                shift_type: s.shift_type,
                check_in: s.check_in,
                check_out: s.check_out,
                total_hours: s.total_hours || 0,
                late_minutes: s.late_minutes || 0,
                early_leave_minutes: s.early_leave_minutes || 0,
                overtime_minutes: s.overtime_minutes || 0,
                status: s.status,
              } as unknown as AttendanceSummary
            : null,
        };
      });

      setDailySummaries(merged);
    } catch (err) {
      console.error('Error fetching attendance:', err);
      addToast('فشل تحميل بيانات الحضور', 'error');
    }
  }, [teamMembers, selectedDate, addToast]);

  // ================================================================
  // جلب التقارير التحليلية للمدى الزمني
  // ================================================================

  const fetchAnalytics = useCallback(async () => {
    if (teamMembers.length === 0) return;

    try {
      const empIds = teamMembers.map((e) => e.id);
      const logs: AttendanceLog[] = [];

      // جلب سجلات لكل موظف في النطاق الزمني
      for (const empId of empIds) {
        const empLogs = await attendanceService.findLogsByEmployee(empId, {
          fromDate: dateFrom,
          toDate: dateTo,
          limit: 1000,
        });
        if (empLogs && empLogs.length > 0) {
          logs.push(...(empLogs as unknown as AttendanceLog[]));
        }
      }

      // إنشاء الملخصات باستخدام shiftUtils
      const employeeMap = new Map(teamMembers.map((e) => [e.id, e]));
      const grouped = new Map<string, AttendanceLog[]>();

      for (const log of logs) {
        const key = `${log.employee_id}_${log.shift_date}`;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(log);
      }

      // إنشاء ملخص لكل موظف لكل يوم في النطاق
      const allSummaries: AttendanceSummary[] = [];
      const startDate = new Date(dateFrom);
      const endDate = new Date(dateTo);

      for (const emp of teamMembers) {
        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
          const dateStr = format(d, 'yyyy-MM-dd');
          const key = `${emp.id}_${dateStr}`;
          const dayLogs = grouped.get(key) || [];
          const isFriday = d.getDay() === 6; // الجمعة

          const summary = createAttendanceSummary(emp.id, dayLogs, dateStr, {
            isFriday,
            isHoliday: false,
          });

          allSummaries.push(summary);
        }
      }

      // توليد التقارير
      const empData = teamMembers.map((e) => ({
        id: e.id,
        full_name: e.full_name,
        department: e.department || '',
      }));

      const generatedReports = generateTeamReports(allSummaries, empData);
      setReports(generatedReports);

      // إحصائيات سريعة
      const stats = getTeamQuickStats(generatedReports);
      setQuickStats(stats);
    } catch (err) {
      console.error('Error fetching analytics:', err);
    }
  }, [teamMembers, dateFrom, dateTo]);

  // ================================================================
  // تحميل البيانات
  // ================================================================

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchTeam()]).finally(() => setLoading(false));
  }, [fetchTeam]);

  useEffect(() => {
    if (teamMembers.length > 0) {
      fetchDailyAttendance();
      fetchAnalytics();
    }
  }, [teamMembers, selectedDate, dateFrom, dateTo, fetchDailyAttendance, fetchAnalytics]);

  // ================================================================
  // الفرز والتصفية
  // ================================================================

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const sortedReports = useMemo(() => {
    const filtered = reports.filter(
      (r) =>
        !searchQuery ||
        r.full_name.includes(searchQuery) ||
        r.department.includes(searchQuery)
    );

    return [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name':
          cmp = a.full_name.localeCompare(b.full_name);
          break;
        case 'attendance_rate':
          cmp = a.attendance_rate - b.attendance_rate;
          break;
        case 'late_days':
          cmp = a.late_days - b.late_days;
          break;
        case 'absent_days':
          cmp = a.absent_days - b.absent_days;
          break;
        case 'overtime':
          cmp = a.overtime_total_hours - b.overtime_total_hours;
          break;
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [reports, searchQuery, sortField, sortDirection]);

  // ================================================================
  // إحصائيات اليوم
  // ================================================================

  const dailyStats = useMemo(() => {
    const validSummaries = dailySummaries
      .filter((ds) => ds.summary)
      .map((ds) => ds.summary!);
    return getDailyAttendanceStats(validSummaries);
  }, [dailySummaries]);

  // ================================================================
  // التصدير
  // ================================================================

  const handleExportCSV = () => {
    setExporting(true);
    try {
      const validSummaries = dailySummaries
        .filter((ds) => ds.summary)
        .map((ds) => ds.summary!);

      const names: Record<string, string> = {};
      dailySummaries.forEach((ds) => {
        names[ds.employee_id] = ds.full_name;
      });

      const filename = `تقرير_حضور_${selectedDate}.csv`;
      downloadCSV(validSummaries, filename, names);

      addToast(`✅ تم تصدير ${validSummaries.length} سجل`, 'success');
    } catch (err) {
      console.error('Export error:', err);
      addToast('❌ فشل التصدير', 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleExportReportCSV = () => {
    setExporting(true);
    try {
      const header = [
        'الموظف',
        'القسم',
        'أيام العمل',
        'حضور',
        'غياب',
        'تأخير',
        'مجاز/عطلة',
        'نسبة الحضور%',
        'أوفرتايم (س)',
        'تأخير (دق)',
      ];
      const rows = sortedReports.map((r) => [
        r.full_name,
        r.department,
        r.total_days.toString(),
        r.present_days.toString(),
        r.absent_days.toString(),
        r.late_days.toString(),
        (r.leave_days + r.holiday_days).toString(),
        r.attendance_rate.toString(),
        r.overtime_total_hours.toFixed(2),
        r.late_total_minutes.toString(),
      ]);

      const csv = [header, ...rows]
        .map((row) => row.map((c) => `"${c.replace(/"/g, '""')}"`).join(','))
        .join('\n');

      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `تقرير_تحليلي_${dateFrom}_${dateTo}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      addToast(`✅ تم تصدير ${sortedReports.length} تقرير`, 'success');
    } catch (err) {
      console.error('Export error:', err);
      addToast('❌ فشل التصدير', 'error');
    } finally {
      setExporting(false);
    }
  };

  // ================================================================
  // فرز الجدول
  // ================================================================

  const SortHeader = ({
    field,
    label,
    className = '',
  }: {
    field: SortField;
    label: string;
    className?: string;
  }) => (
    <th
      className={`py-3 px-4 font-bold text-slate-500 cursor-pointer hover:text-amber-600 select-none ${className}`}
      onClick={() => toggleSort(field)}
    >
      <div className="flex items-center gap-1">
        {label}
        {sortField === field &&
          (sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
      </div>
    </th>
  );

  // ================================================================
  // التحميل
  // ================================================================

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <Loader className="animate-spin text-amber-600" size={40} />
      </div>
    );
  }

  // ================================================================
  // التصميم
  // ================================================================

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      {/* ===== الرأس ===== */}
      <div className="bg-gradient-to-br from-amber-600 to-orange-700 rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-extrabold flex items-center gap-2">
              <Users size={24} /> حضور فريقي
            </h2>
            <p className="text-white/70 mt-1">متابعة حضور وانصراف فريقك مع تحليلات شاملة</p>
          </div>
          <span className="bg-white/20 px-3 py-1 rounded-full text-sm">
            {teamMembers.length} موظف
          </span>
        </div>
      </div>

      {/* ===== Quick Stats ===== */}
      {quickStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <div className="bg-white rounded-xl p-4 border border-slate-100">
            <div className="text-2xl font-bold text-slate-800">{quickStats.totalEmployees}</div>
            <div className="text-xs text-slate-500">إجمالي الفريق</div>
          </div>
          <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-200">
            <div className="text-2xl font-bold text-emerald-700 flex items-center gap-1">
              {quickStats.averageAttendanceRate}% <TrendingUp size={16} />
            </div>
            <div className="text-xs text-slate-500">متوسط الحضور</div>
          </div>
          <div className="bg-red-50 rounded-xl p-4 border border-red-200">
            <div className="text-2xl font-bold text-red-700">{quickStats.totalAbsentDays}</div>
            <div className="text-xs text-slate-500">أيام غياب</div>
          </div>
          <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
            <div className="text-2xl font-bold text-amber-700">{quickStats.totalLateDays}</div>
            <div className="text-xs text-slate-500">أيام تأخير</div>
          </div>
          <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
            <div className="text-2xl font-bold text-blue-700">
              {quickStats.totalOvertimeHours.toFixed(1)}
            </div>
            <div className="text-xs text-slate-500">أوفرتايم (س)</div>
          </div>
          <div className="bg-purple-50 rounded-xl p-4 border border-purple-200">
            <div className="text-2xl font-bold text-purple-700">{reports.length}</div>
            <div className="text-xs text-slate-500">تقرير موظف</div>
          </div>
        </div>
      )}

      {/* ===== Top/Under Performers ===== */}
      {quickStats &&
        (quickStats.topPerformers.length > 0 ||
          quickStats.underPerformers.length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {quickStats.topPerformers.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-100 p-4">
                <h3 className="font-bold text-emerald-700 flex items-center gap-2 mb-3">
                  <Award size={18} /> أفضل الموظفين أداءً
                </h3>
                <div className="space-y-2">
                  {quickStats.topPerformers.slice(0, 5).map((emp, i) => (
                    <div key={emp.employee_id} className="flex items-center justify-between py-1">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold">
                          {i + 1}
                        </span>
                        <span className="text-sm font-medium text-slate-700">{emp.full_name}</span>
                      </div>
                      <span className="text-sm font-bold text-emerald-600">
                        {emp.attendance_rate}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {quickStats.underPerformers.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-100 p-4">
                <h3 className="font-bold text-red-700 flex items-center gap-2 mb-3">
                  <AlertTriangle size={18} /> يحتاجون تحسين
                </h3>
                <div className="space-y-2">
                  {quickStats.underPerformers.slice(0, 5).map((emp, i) => (
                    <div key={emp.employee_id} className="flex items-center justify-between py-1">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-red-100 text-red-700 flex items-center justify-center text-xs font-bold">
                          {i + 1}
                        </span>
                        <span className="text-sm font-medium text-slate-700">{emp.full_name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-red-500">{emp.absent_days} غياب</span>
                        <span className="text-sm font-bold text-red-600">
                          {emp.attendance_rate}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

      {/* ===== Daily Stats ===== */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl p-3 border border-slate-100 text-center">
          <div className="text-xl font-bold text-slate-800">{dailyStats.total}</div>
          <div className="text-xs text-slate-500">إجمالي اليوم</div>
        </div>
        <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-200 text-center">
          <div className="text-xl font-bold text-emerald-700">{dailyStats.present}</div>
          <div className="text-xs text-slate-500">🟢 حضور</div>
        </div>
        <div className="bg-amber-50 rounded-xl p-3 border border-amber-200 text-center">
          <div className="text-xl font-bold text-amber-700">{dailyStats.late}</div>
          <div className="text-xs text-slate-500">🟡 متأخر</div>
        </div>
        <div className="bg-red-50 rounded-xl p-3 border border-red-200 text-center">
          <div className="text-xl font-bold text-red-700">{dailyStats.absent}</div>
          <div className="text-xs text-slate-500">🔴 غائب</div>
        </div>
      </div>

      {/* ===== Toolbar ===== */}
      <div className="bg-white rounded-2xl border border-slate-100 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2">
            <CalendarDays size={16} className="text-slate-400" />
            <span className="text-xs text-slate-500">اليوم:</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-sm outline-none"
            />
          </div>

          <div className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2">
            <Filter size={16} className="text-slate-400" />
            <span className="text-xs text-slate-500">من:</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="bg-transparent text-sm outline-none w-28"
            />
            <span className="text-xs text-slate-500">إلى:</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="bg-transparent text-sm outline-none w-28"
            />
          </div>

          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="ابحث باسم الموظف أو القسم..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pr-9 pl-3 py-2 border rounded-xl text-sm outline-none focus:border-amber-500 bg-slate-50"
            />
          </div>

          <button
            onClick={handleExportCSV}
            disabled={exporting || dailySummaries.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:opacity-50 text-sm"
          >
            {exporting ? <Loader size={16} className="animate-spin" /> : <Download size={16} />}
            تصدير اليوم
          </button>

          <button
            onClick={handleExportReportCSV}
            disabled={exporting || reports.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 text-sm"
          >
            <FileSpreadsheet size={16} />
            تصدير التقرير
          </button>
        </div>
      </div>

      {/* ===== Daily Table ===== */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <div className="px-4 py-3 border-b bg-slate-50 flex items-center justify-between">
          <h3 className="font-bold text-slate-700 flex items-center gap-2">
            <Clock size={16} /> حضور اليوم - {selectedDate}
          </h3>
          <span className="text-xs text-slate-400">{dailySummaries.length} موظف</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50">
                <th className="text-right py-3 px-4 font-bold text-slate-500">الموظف</th>
                <th className="text-right py-3 px-4 font-bold text-slate-500">القسم</th>
                <th className="text-right py-3 px-4 font-bold text-slate-500">الوردية</th>
                <th className="text-right py-3 px-4 font-bold text-slate-500">الدخول</th>
                <th className="text-right py-3 px-4 font-bold text-slate-500">الخروج</th>
                <th className="text-right py-3 px-4 font-bold text-slate-500">الساعات</th>
                <th className="text-right py-3 px-4 font-bold text-slate-500">تأخير</th>
                <th className="text-right py-3 px-4 font-bold text-slate-500">أوفرتايم</th>
                <th className="text-right py-3 px-4 font-bold text-slate-500">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {dailySummaries.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-16 text-slate-400">
                    <Users size={40} className="mx-auto mb-2 opacity-30" />
                    لا يوجد فريق تابع لك
                  </td>
                </tr>
              ) : (
                dailySummaries.map((ds, i) => {
                  const s = ds.summary;
                  return (
                    <tr
                      key={ds.employee_id}
                      className={`border-b border-slate-50 hover:bg-slate-50 transition-colors
                        ${i % 2 === 0 ? '' : 'bg-slate-50/30'}
                        ${s?.status === 'غائب' ? 'bg-red-50/30' : ''}
                        ${s?.status === 'متأخر' ? 'bg-amber-50/30' : ''}`}
                    >
                      <td className="py-3 px-4 font-bold text-slate-800">{ds.full_name}</td>
                      <td className="py-3 px-4 text-slate-600">{ds.department || '--'}</td>
                      <td className="py-3 px-4">{s?.shift_type || '--'}</td>
                      <td className="py-3 px-4 font-mono text-xs">
                        {s?.check_in ? format(parseISO(s.check_in), 'hh:mm a') : '--'}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs">
                        {s?.check_out ? format(parseISO(s.check_out), 'hh:mm a') : '--'}
                      </td>
                      <td className="py-3 px-4 font-medium">
                        {s ? `${s.total_hours.toFixed(1)}` : '0.0'}
                      </td>
                      <td className="py-3 px-4">
                        {s && s.late_minutes > 0 ? (
                          <span className="text-amber-600 text-xs font-medium">
                            {s.late_minutes} د
                          </span>
                        ) : (
                          <span className="text-slate-300">--</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {s && s.overtime_minutes > 0 ? (
                          <span className="text-blue-600 text-xs font-medium">
                            {s.overtime_minutes} د
                          </span>
                        ) : (
                          <span className="text-slate-300">--</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {s ? (
                          <span
                            className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
                            style={{
                              backgroundColor: `${STATUS_COLORS[s.status as AttendanceStatus]}20`,
                              color: STATUS_COLORS[s.status as AttendanceStatus],
                            }}
                          >
                            {STATUS_LABELS[s.status as AttendanceStatus]}
                          </span>
                        ) : (
                          <span className="text-slate-300">غير محدد</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===== Analytics Table ===== */}
      {sortedReports.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="px-4 py-3 border-b bg-slate-50 flex items-center justify-between">
            <h3 className="font-bold text-slate-700 flex items-center gap-2">
              <BarChart3 size={16} /> تقارير تحليلية ({dateFrom} إلى {dateTo})
            </h3>
            <span className="text-xs text-slate-400">{sortedReports.length} تقرير</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50">
                  <SortHeader field="name" label="الموظف" />
                  <th className="text-right py-3 px-4 font-bold text-slate-500">القسم</th>
                  <th className="text-right py-3 px-4 font-bold text-slate-500">أيام</th>
                  <SortHeader field="attendance_rate" label="نسبة الحضور" />
                  <SortHeader field="absent_days" label="غياب" />
                  <SortHeader field="late_days" label="تأخير" />
                  <th className="text-right py-3 px-4 font-bold text-slate-500">مجاز</th>
                  <SortHeader field="overtime" label="أوفرتايم" />
                  <th className="text-right py-3 px-4 font-bold text-slate-500">تأخير (د)</th>
                </tr>
              </thead>
              <tbody>
                {sortedReports.map((r, i) => (
                  <tr
                    key={r.employee_id}
                    className={`border-b border-slate-50 hover:bg-slate-50 transition-colors
                      ${i % 2 === 0 ? '' : 'bg-slate-50/30'}
                      ${r.attendance_rate < 70 ? 'bg-red-50/30' : ''}
                      ${r.attendance_rate >= 95 ? 'bg-emerald-50/30' : ''}`}
                  >
                    <td className="py-3 px-4 font-bold text-slate-800">{r.full_name}</td>
                    <td className="py-3 px-4 text-slate-600">{r.department || '--'}</td>
                    <td className="py-3 px-4 font-medium">{r.total_days}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              r.attendance_rate >= 90
                                ? 'bg-emerald-500'
                                : r.attendance_rate >= 70
                                ? 'bg-amber-500'
                                : 'bg-red-500'
                            }`}
                            style={{ width: `${r.attendance_rate}%` }}
                          />
                        </div>
                        <span
                          className={`text-xs font-bold ${
                            r.attendance_rate >= 90
                              ? 'text-emerald-600'
                              : r.attendance_rate >= 70
                              ? 'text-amber-600'
                              : 'text-red-600'
                          }`}
                        >
                          {r.attendance_rate}%
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`font-medium ${r.absent_days > 0 ? 'text-red-600' : 'text-slate-400'}`}
                      >
                        {r.absent_days}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`font-medium ${r.late_days > 0 ? 'text-amber-600' : 'text-slate-400'}`}
                      >
                        {r.late_days}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-600">{r.leave_days + r.holiday_days}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`font-medium ${r.overtime_total_hours > 0 ? 'text-blue-600' : 'text-slate-400'}`}
                      >
                        {r.overtime_total_hours > 0
                          ? `${r.overtime_total_hours.toFixed(1)}س`
                          : '--'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-600">{r.late_total_minutes} د</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}