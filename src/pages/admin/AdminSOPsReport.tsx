/**
 * ════════════════════════════════════════════════════════════════
 *  AdminSOPsReport v2 — تقرير SOPs الحقيقي
 * ════════════════════════════════════════════════════════════════
 *  ✅ إصلاح: إزالة generateMockReport() وMath.random() بالكامل
 *  ✅ إصلاح: إزالة localStorage — البيانات من Supabase مباشرة
 *  ✅ عزل tenant: كل استعلام مقيّد بـ tenant_id
 *  ✅ يجمع بيانات حقيقية من: employees + sops + sop_readings
 * ════════════════════════════════════════════════════════════════
 */

import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  BarChart3, Users, Layers, Search, Download,
  ArrowUp, ArrowDown, Loader2, ChevronDown,
  AlertTriangle, RefreshCw, BookOpen, Clock,
  CheckCircle, XCircle, ShieldAlert,
} from 'lucide-react';
import { useUIStore, useAuthStore } from '../../core/stores';
import { getCurrentTenantId } from '../../services/sdk/BaseService';
import { sopAdminService } from '../../services/sdk/SopAdminService';
import { sopService, type SopCompliance } from '../../services/sdk/SopService';
import { exportToStyledExcel } from '../../utils/exportToExcel';

// ════════════════════════════════════════════════════════════════
//  الأنواع
// ════════════════════════════════════════════════════════════════

interface EmployeeSOPProgress {
  employeeId:      string;
  employeeName:    string;
  department:      string;
  totalSOPs:       number;
  completed:       number;
  inProgress:      number;
  notStarted:      number;
  completionRate:  number;
  totalTimeSpent:  number;    // بالدقائق
  lastActivity:    string | null;
}

interface DepartmentStats {
  department:        string;
  totalEmployees:    number;
  totalSOPs:         number;
  totalCompleted:    number;
  avgCompletionRate: number;
}

// ════════════════════════════════════════════════════════════════
//  مساعدات
// ════════════════════════════════════════════════════════════════

const getProgressColor = (rate: number) =>
  rate >= 80 ? 'text-emerald-600' : rate >= 50 ? 'text-amber-500' : 'text-red-500';

const getProgressBg = (rate: number) =>
  rate >= 80 ? 'bg-emerald-500' : rate >= 50 ? 'bg-amber-400' : 'bg-red-500';

const fmtTime = (mins: number) => {
  if (mins < 60) return `${mins} د`;
  return `${Math.floor(mins / 60)}س ${mins % 60}د`;
};

// ════════════════════════════════════════════════════════════════
//  Skeleton
// ════════════════════════════════════════════════════════════════

function SkeletonRow() {
  return (
    <div className="bg-white border-2 border-slate-100 rounded-2xl px-5 py-4 animate-pulse">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-slate-200 shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-3.5 bg-slate-200 rounded-full w-1/4" />
          <div className="h-2.5 bg-slate-100 rounded-full w-1/6" />
        </div>
        <div className="w-32 h-2 bg-slate-100 rounded-full hidden sm:block" />
        <div className="h-5 bg-slate-100 rounded-full w-12" />
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
//  الصفحة
// ════════════════════════════════════════════════════════════════

export default function AdminSOPsReport() {
  const { addToast } = useUIStore();

  const [reportData, setReportData]   = useState<EmployeeSOPProgress[]>([]);
  const [loading, setLoading]         = useState(true);
  const [fetchError, setFetchError]   = useState<string | null>(null);
  const [search, setSearch]           = useState('');
  const [filterDept, setFilterDept]   = useState('all');
  const [sortBy, setSortBy]           = useState<'name' | 'completion' | 'department'>('completion');
  const [sortDir, setSortDir]         = useState<'asc' | 'desc'>('desc');
  const [expandedEmp, setExpandedEmp] = useState<string | null>(null);
  const [selectedView, setSelectedView] = useState<'employees' | 'departments' | 'compliance'>('employees');
  const [complianceRows, setComplianceRows] = useState<SopCompliance[]>([]);

  // ════════════════════════════════════════════════════════════
  //  جلب البيانات من Supabase — بيانات حقيقية 100%
  // ════════════════════════════════════════════════════════════
  const fetchReport = useCallback(async () => {
    setLoading(true);
    setFetchError(null);

    try {
      const tenantId = getCurrentTenantId();

      const report = await sopAdminService.loadReport(tenantId || undefined);
      const employees = report.employees;
      if (employees.length === 0) {
        setReportData([]);
        setLoading(false);
        return;
      }

      const allSops = report.sops;
      const allReadings = report.readings;

      // ── 4: تجميع البيانات لكل موظف ─────────────────────────
      const readingsByEmployee = new Map<string, typeof allReadings>();
      allReadings.forEach(r => {
        if (!readingsByEmployee.has(r.employee_id)) {
          readingsByEmployee.set(r.employee_id, []);
        }
        readingsByEmployee.get(r.employee_id)!.push(r);
      });

      const result: EmployeeSOPProgress[] = employees.map(emp => {
        const dept = emp.manufacturing_dept || emp.department || 'general';

        // SOPs المخصصة للموظف = كل SOPs القسم + SOPs العامة
        const relevantSops = allSops.filter(
          s => !s.department || s.department === dept || s.department === 'general'
        );
        const totalSOPs = relevantSops.length;

        const empReadings = readingsByEmployee.get(emp.id) || [];
        const readingBySopId = new Map(empReadings.map(r => [r.sop_id, r]));

        let completed  = 0;
        let inProgress = 0;
        let totalTimeSpent = 0;
        let lastActivity: string | null = null;

        relevantSops.forEach(sop => {
          const reading = readingBySopId.get(sop.id);
          if (!reading) return; // notStarted

          if (reading.completed || reading.approved) {
            completed++;
          } else {
            inProgress++;
          }

          totalTimeSpent += reading.time_spent || 0;

          if (reading.last_read_at) {
            if (!lastActivity || reading.last_read_at > lastActivity) {
              lastActivity = reading.last_read_at;
            }
          }
        });

        const notStarted    = totalSOPs - completed - inProgress;
        const completionRate = totalSOPs > 0
          ? Math.round((completed / totalSOPs) * 100)
          : 0;

        return {
          employeeId:     emp.id,
          employeeName:   emp.full_name || 'موظف',
          department:     dept,
          totalSOPs,
          completed,
          inProgress,
          notStarted:     Math.max(0, notStarted),
          completionRate,
          totalTimeSpent, // بالدقائق
          lastActivity,
        };
      });

      setReportData(result);
    } catch (err: any) {
      console.error('[AdminSOPsReport] خطأ في جلب البيانات:', err);
      setFetchError(err?.message || 'تعذّر تحميل البيانات');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchReport(); }, [fetchReport]);
  useEffect(() => {
    void sopService.compliance().then(setComplianceRows).catch(() => setComplianceRows([]));
  }, []);

  // ════════════════════════════════════════════════════════════
  //  القيم المشتقة
  // ════════════════════════════════════════════════════════════

  const departments = useMemo(() => (
    ['all', ...new Set(reportData.map(d => d.department).filter(Boolean))]
  ), [reportData]);

  const filteredData = useMemo(() => {
    let data = [...reportData];
    if (search) {
      const term = search.toLowerCase();
      data = data.filter(d => d.employeeName.toLowerCase().includes(term));
    }
    if (filterDept !== 'all') {
      data = data.filter(d => d.department === filterDept);
    }
    data.sort((a, b) => {
      if (sortBy === 'name')       return sortDir === 'asc' ? a.employeeName.localeCompare(b.employeeName) : b.employeeName.localeCompare(a.employeeName);
      if (sortBy === 'completion') return sortDir === 'asc' ? a.completionRate - b.completionRate : b.completionRate - a.completionRate;
      if (sortBy === 'department') return sortDir === 'asc' ? a.department.localeCompare(b.department) : b.department.localeCompare(a.department);
      return 0;
    });
    return data;
  }, [reportData, search, filterDept, sortBy, sortDir]);

  const deptStats = useMemo<DepartmentStats[]>(() => {
    const map = new Map<string, DepartmentStats>();
    reportData.forEach(emp => {
      if (!map.has(emp.department)) {
        map.set(emp.department, {
          department: emp.department,
          totalEmployees: 0, totalSOPs: 0,
          totalCompleted: 0, avgCompletionRate: 0,
        });
      }
      const s = map.get(emp.department)!;
      s.totalEmployees++;
      s.totalSOPs    += emp.totalSOPs;
      s.totalCompleted += emp.completed;
    });
    map.forEach(s => {
      s.avgCompletionRate = s.totalSOPs > 0
        ? Math.round((s.totalCompleted / s.totalSOPs) * 100)
        : 0;
    });
    return Array.from(map.values()).sort((a, b) => b.avgCompletionRate - a.avgCompletionRate);
  }, [reportData]);

  const overall = useMemo(() => ({
    totalEmployees:  reportData.length,
    totalSOPs:       reportData.reduce((s, d) => s + d.totalSOPs, 0),
    totalCompleted:  reportData.reduce((s, d) => s + d.completed, 0),
    totalInProgress: reportData.reduce((s, d) => s + d.inProgress, 0),
    avgCompletion:   reportData.length > 0
      ? Math.round(reportData.reduce((s, d) => s + d.completionRate, 0) / reportData.length)
      : 0,
  }), [reportData]);

  // ─── تصدير ──────────────────────────────────────────────────
  const handleExport = () => {
    const headers = ['الموظف', 'القسم', 'إجمالي SOPs', 'مكتمل', 'قيد القراءة', 'لم تبدأ', 'نسبة الإنجاز', 'الوقت المستغرق', 'آخر نشاط'];
    const data = filteredData.map(d => [
      d.employeeName,
      d.department,
      d.totalSOPs.toString(),
      d.completed.toString(),
      d.inProgress.toString(),
      d.notStarted.toString(),
      `${d.completionRate}%`,
      fmtTime(d.totalTimeSpent),
      d.lastActivity ? new Date(d.lastActivity).toLocaleDateString('ar-IQ') : '—',
    ]);
    exportToStyledExcel('تقرير_SOPs_الموظفين', headers, data);
    addToast('تم تصدير التقرير', 'success');
  };

  const toggleSort = (field: typeof sortBy) => {
    if (sortBy === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(field); setSortDir('desc'); }
  };

  // ════════════════════════════════════════════════════════════
  //  JSX
  // ════════════════════════════════════════════════════════════
  return (
    <div className="space-y-6 pb-20" dir="rtl">

      {/* ── الهيدر ─────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <BarChart3 className="text-indigo-600" /> تقارير SOPs
          </h2>
          <p className="text-slate-500 mt-1 text-sm">
            تتبع أداء الموظفين في قراءة واعتماد إجراءات SOP — بيانات حية من قاعدة البيانات
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchReport}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-200 transition-all disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> تحديث
          </button>
          <button
            onClick={handleExport}
            disabled={loading || reportData.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all disabled:opacity-50"
          >
            <Download size={14} /> تصدير
          </button>
        </div>
      </div>

      {/* ── الإحصائيات العامة ──────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'الموظفين',      value: overall.totalEmployees,  from: 'from-indigo-500',  to: 'to-indigo-700' },
          { label: 'إجمالي SOPs',   value: overall.totalSOPs,       from: 'from-blue-500',    to: 'to-blue-700' },
          { label: 'مكتملة',        value: overall.totalCompleted,   from: 'from-emerald-500', to: 'to-emerald-700' },
          { label: 'قيد الإنجاز',   value: overall.totalInProgress,  from: 'from-amber-500',   to: 'to-amber-700' },
          { label: 'متوسط الإنجاز', value: `${overall.avgCompletion}%`, from: 'from-violet-500', to: 'to-violet-700' },
        ].map(s => (
          <div key={s.label} className={`bg-gradient-to-br ${s.from} ${s.to} rounded-2xl p-4 text-white`}>
            <p className="text-2xl font-black">{loading ? '—' : s.value}</p>
            <p className="text-white/80 text-xs font-bold mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* ── تبويبات العرض ─────────────────────────────────── */}
      <div className="flex bg-white rounded-2xl p-1 border border-slate-200 w-fit shadow-sm">
        {([
          { key: 'employees',   label: 'الموظفين',  Icon: Users },
          { key: 'departments', label: 'الأقسام',   Icon: Layers },
          { key: 'compliance',  label: 'امتثال الإجراءات', Icon: ShieldAlert },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => setSelectedView(tab.key)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
              selectedView === tab.key
                ? 'bg-indigo-500 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <tab.Icon size={15} /> {tab.label}
          </button>
        ))}
      </div>

      {/* ── فلاتر البحث (عرض الموظفين) ───────────────────── */}
      {selectedView === 'employees' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="ابحث عن موظف..."
                dir="rtl"
                className="w-full pr-9 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 focus:bg-white transition-all"
              />
            </div>
            <select
              value={filterDept}
              onChange={e => setFilterDept(e.target.value)}
              className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 focus:bg-white transition-all"
            >
              <option value="all">جميع الأقسام</option>
              {departments.filter(d => d !== 'all').map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            <select
              value={sortBy}
              onChange={e => { setSortBy(e.target.value as typeof sortBy); setSortDir('desc'); }}
              className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 focus:bg-white transition-all"
            >
              <option value="completion">ترتيب حسب الإنجاز</option>
              <option value="name">ترتيب حسب الاسم</option>
              <option value="department">ترتيب حسب القسم</option>
            </select>
            <button
              onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
              className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-500 hover:text-slate-700 transition-all"
            >
              {sortDir === 'desc' ? <ArrowDown size={16} /> : <ArrowUp size={16} />}
            </button>
          </div>
        </div>
      )}

      {/* ── المحتوى ───────────────────────────────────────── */}

      {/* خطأ */}
      {!loading && fetchError && (
        <div className="bg-white rounded-2xl border border-red-100 p-8 text-center shadow-sm">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-red-50 flex items-center justify-center">
            <AlertTriangle size={26} className="text-red-400" />
          </div>
          <h3 className="font-bold text-slate-800 mb-1">تعذّر تحميل البيانات</h3>
          <p className="text-sm text-slate-500 mb-5">{fetchError}</p>
          <button
            onClick={fetchReport}
            className="flex items-center gap-2 mx-auto px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold text-sm hover:bg-indigo-700"
          >
            <RefreshCw size={15} /> إعادة المحاولة
          </button>
        </div>
      )}

      {/* عرض الموظفين */}
      {!fetchError && selectedView === 'employees' && (
        <div className="space-y-2">
          {loading && [1, 2, 3, 4].map(i => <SkeletonRow key={i} />)}

          {!loading && filteredData.length === 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center shadow-sm">
              <BookOpen size={36} className="mx-auto text-slate-200 mb-3" />
              <h3 className="font-bold text-slate-700">لا توجد بيانات</h3>
              <p className="text-sm text-slate-400 mt-1">
                {search ? 'لا يوجد موظف بهذا الاسم' : 'لا يوجد موظفون نشطون أو SOPs مضافة بعد'}
              </p>
            </div>
          )}

          {!loading && filteredData.map(emp => (
            <div
              key={emp.employeeId}
              className="bg-white border-2 border-slate-100 rounded-2xl overflow-hidden hover:border-indigo-100 transition-all shadow-sm"
            >
              {/* الصف الرئيسي */}
              <div
                className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-slate-50/50 transition-colors"
                onClick={() => setExpandedEmp(expandedEmp === emp.employeeId ? null : emp.employeeId)}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold shrink-0 shadow-md shadow-indigo-100">
                    {emp.employeeName.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-800 text-sm">{emp.employeeName}</p>
                    <p className="text-xs text-slate-400">{emp.department}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 sm:gap-5 shrink-0">
                  {/* شريط التقدم */}
                  <div className="hidden sm:flex items-center gap-2 w-36">
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${getProgressBg(emp.completionRate)} rounded-full transition-all`}
                        style={{ width: `${emp.completionRate}%` }}
                      />
                    </div>
                  </div>
                  <span className={`text-sm font-black w-12 text-right ${getProgressColor(emp.completionRate)}`}>
                    {emp.completionRate}%
                  </span>

                  {/* الشارات */}
                  <div className="hidden sm:flex gap-1">
                    <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold">✓ {emp.completed}</span>
                    <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">◎ {emp.inProgress}</span>
                    <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-bold">○ {emp.notStarted}</span>
                  </div>

                  <ChevronDown
                    size={16}
                    className={`text-slate-400 transition-transform duration-200 ${expandedEmp === emp.employeeId ? 'rotate-180' : ''}`}
                  />
                </div>
              </div>

              {/* التفاصيل الموسّعة */}
              {expandedEmp === emp.employeeId && (
                <div className="px-5 pb-4 border-t border-slate-100 pt-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-slate-50 rounded-xl p-3 text-center">
                      <p className="text-xs font-bold text-slate-400 mb-1">إجمالي SOPs</p>
                      <p className="text-xl font-black text-slate-700">{emp.totalSOPs}</p>
                    </div>
                    <div className="bg-emerald-50 rounded-xl p-3 text-center">
                      <CheckCircle size={16} className="mx-auto text-emerald-500 mb-1" />
                      <p className="text-xs font-bold text-emerald-600 mb-1">مكتمل</p>
                      <p className="text-xl font-black text-emerald-700">{emp.completed}</p>
                    </div>
                    <div className="bg-amber-50 rounded-xl p-3 text-center">
                      <Clock size={16} className="mx-auto text-amber-500 mb-1" />
                      <p className="text-xs font-bold text-amber-600 mb-1">قيد القراءة</p>
                      <p className="text-xl font-black text-amber-700">{emp.inProgress}</p>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-3 text-center">
                      <Clock size={16} className="mx-auto text-slate-400 mb-1" />
                      <p className="text-xs font-bold text-slate-400 mb-1">وقت القراءة</p>
                      <p className="text-xl font-black text-slate-700">{fmtTime(emp.totalTimeSpent)}</p>
                    </div>
                  </div>
                  {emp.lastActivity && (
                    <p className="text-xs text-slate-400 mt-3">
                      آخر نشاط: {new Date(emp.lastActivity).toLocaleDateString('ar-IQ', { year: 'numeric', month: 'long', day: 'numeric' })}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* عرض الأقسام */}
      {!fetchError && selectedView === 'departments' && (
        <div>
          {loading && (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-white rounded-2xl border border-slate-100 p-5 animate-pulse">
                  <div className="flex gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-slate-200" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3.5 bg-slate-200 rounded-full w-1/2" />
                      <div className="h-2.5 bg-slate-100 rounded-full w-1/3" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="h-2.5 bg-slate-100 rounded-full" />
                    <div className="h-2.5 bg-slate-100 rounded-full w-4/5" />
                    <div className="h-2 bg-slate-100 rounded-full mt-3" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && deptStats.length === 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center shadow-sm">
              <Layers size={36} className="mx-auto text-slate-200 mb-3" />
              <h3 className="font-bold text-slate-700">لا توجد بيانات أقسام</h3>
            </div>
          )}

          {!loading && deptStats.length > 0 && (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {deptStats.map(dept => (
                <div key={dept.department} className="bg-white border-2 border-slate-100 rounded-2xl p-5 hover:border-indigo-100 transition-all shadow-sm hover:shadow-md">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
                      <Layers size={18} />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800">{dept.department}</h3>
                      <p className="text-xs text-slate-400">{dept.totalEmployees} موظف</p>
                    </div>
                  </div>
                  <div className="space-y-2.5">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">عدد SOPs</span>
                      <span className="font-bold text-slate-700">{dept.totalSOPs}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">مكتملة</span>
                      <span className="font-bold text-emerald-600">{dept.totalCompleted}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">نسبة الإنجاز</span>
                      <span className={`font-bold ${getProgressColor(dept.avgCompletionRate)}`}>
                        {dept.avgCompletionRate}%
                      </span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden mt-1">
                      <div
                        className={`h-full ${getProgressBg(dept.avgCompletionRate)} rounded-full transition-all duration-700`}
                        style={{ width: `${dept.avgCompletionRate}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!fetchError && selectedView === 'compliance' && (
        <div className="space-y-3">
          {complianceRows.length === 0 ? (
            <div className="bg-white rounded-2xl border p-10 text-center text-slate-500">
              لا توجد إجراءات نشطة لقياس الامتثال.
            </div>
          ) : complianceRows.map((row) => (
            <div key={row.sopId} className="bg-white rounded-2xl border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-indigo-700 bg-indigo-50 px-2 py-1 rounded">{row.code}</span>
                    {row.isMandatory && <span className="text-xs text-red-700 bg-red-50 px-2 py-1 rounded">إلزامي</span>}
                  </div>
                  <h3 className="font-bold text-slate-800 mt-2">{row.title}</h3>
                  <p className="text-xs text-slate-500">{row.department}</p>
                </div>
                <div className={`text-2xl font-black ${getProgressColor(row.compliancePct)}`}>
                  {row.compliancePct}%
                </div>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden mt-3">
                <div className={`h-full ${getProgressBg(row.compliancePct)}`}
                  style={{ width: `${row.compliancePct}%` }} />
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3 text-center text-xs">
                <div className="bg-slate-50 rounded-lg p-2"><b>{row.targetCount}</b><br />مستهدف</div>
                <div className="bg-blue-50 rounded-lg p-2 text-blue-700"><b>{row.readCount}</b><br />قرأ</div>
                <div className="bg-emerald-50 rounded-lg p-2 text-emerald-700"><b>{row.approvedCount}</b><br />اعتمد</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}