import { useState, useMemo, useEffect } from 'react';
import {
  FileText, Users, CheckCircle, Clock, AlertCircle, Search,
  Download, BarChart3, PieChart, TrendingUp, Award, Star,
  Filter, X, Eye, Calendar, ChevronDown, ChevronUp,
  Loader2, User as UserIcon, BookOpen, GraduationCap,
  Target, Activity, Shield, Layers, ArrowUp, ArrowDown
} from 'lucide-react';
import { supabase } from '../../services/supabase/supabase';
import { useUIStore, useAuthStore } from '../../core/stores';
import { exportToStyledExcel } from '../../utils/exportToExcel';

// ── Types ──
interface EmployeeSOPProgress {
  employeeId: string;
  employeeName: string;
  department: string;
  totalSOPs: number;
  completed: number;
  inProgress: number;
  notStarted: number;
  completionRate: number;
  totalTimeSpent: number;
  lastActivity: string;
}

interface DepartmentStats {
  department: string;
  departmentAr: string;
  totalEmployees: number;
  totalSOPs: number;
  totalCompleted: number;
  avgCompletionRate: number;
}

// ── SOP departments mapping ──
const DEPT_MAP: Record<string, string> = {
  sales: 'المبيعات',
  marketing: 'التسويق',
  tech: 'التقنية',
  support: 'الدعم الفني',
  management: 'الإدارة',
  hr: 'الموارد البشرية',
  it: 'تقنية المعلومات',
  quality: 'ضمان الجودة',
  general: 'عام',
};

// ── Mock data for demonstration ──
const generateMockReport = (): EmployeeSOPProgress[] => {
  const departments = ['tablets', 'ointments', 'syrups', 'powders', 'quality', 'general'];
  const employees = [
    { name: 'أحمد محمد', dept: 'tablets' },
    { name: 'سارة علي', dept: 'ointments' },
    { name: 'خالد عمر', dept: 'syrups' },
    { name: 'نورة حسن', dept: 'tablets' },
    { name: 'فهد عبدالله', dept: 'powders' },
    { name: 'مريم خالد', dept: 'quality' },
    { name: 'يوسف ابراهيم', dept: 'general' },
    { name: 'هدى سامي', dept: 'ointments' },
    { name: 'عمر حسن', dept: 'syrups' },
    { name: 'لمى احمد', dept: 'quality' },
    { name: 'بدر فهد', dept: 'tablets' },
    { name: 'رنا محمود', dept: 'general' },
  ];

  return employees.map((emp, idx) => {
    const total = Math.floor(Math.random() * 5) + 3;
    const completed = Math.floor(Math.random() * total);
    const inProgress = Math.floor(Math.random() * (total - completed));
    const notStarted = total - completed - inProgress;
    return {
      employeeId: `emp-${idx + 1}`,
      employeeName: emp.name,
      department: emp.dept,
      totalSOPs: total,
      completed,
      inProgress,
      notStarted,
      completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
      totalTimeSpent: Math.floor(Math.random() * 300) + 30,
      lastActivity: ['2025-06-10', '2025-06-09', '2025-06-08', '2025-06-07', '2025-06-05'][Math.floor(Math.random() * 5)],
    };
  });
};

export default function AdminSOPsReport() {
  const { addToast } = useUIStore();

  const [reportData, setReportData] = useState<EmployeeSOPProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterDept, setFilterDept] = useState('all');
  const [sortBy, setSortBy] = useState<'name' | 'completion' | 'department'>('completion');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [expandedEmp, setExpandedEmp] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('cards');
  const [selectedView, setSelectedView] = useState<'employees' | 'departments'>('employees');

  // Load data
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        // In production this would come from Supabase
        // For demo we use mock data
        const stored = localStorage.getItem('sops_readings');
        if (stored) {
          const readings = JSON.parse(stored);
          // Process readings into report data
        }
        // Fall back to mock
        const mock = generateMockReport();
        setReportData(mock);
      } catch (err) {
        console.error('Failed to load report data:', err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  // Filtered and sorted data
  const filteredData = useMemo(() => {
    let data = [...reportData];
    
    // Filter
    if (search) {
      const term = search.toLowerCase();
      data = data.filter(d => d.employeeName.toLowerCase().includes(term));
    }
    if (filterDept !== 'all') {
      data = data.filter(d => d.department === filterDept);
    }

    // Sort
    data.sort((a, b) => {
      if (sortBy === 'name') return sortDir === 'asc' ? a.employeeName.localeCompare(b.employeeName) : b.employeeName.localeCompare(a.employeeName);
      if (sortBy === 'completion') return sortDir === 'asc' ? a.completionRate - b.completionRate : b.completionRate - a.completionRate;
      if (sortBy === 'department') return sortDir === 'asc' ? a.department.localeCompare(b.department) : b.department.localeCompare(a.department);
      return 0;
    });

    return data;
  }, [reportData, search, filterDept, sortBy, sortDir]);

  // Department stats
  const deptStats = useMemo(() => {
    const stats: Record<string, DepartmentStats> = {};
    reportData.forEach(emp => {
      if (!stats[emp.department]) {
        stats[emp.department] = {
          department: emp.department,
          departmentAr: DEPT_MAP[emp.department] || emp.department,
          totalEmployees: 0,
          totalSOPs: 0,
          totalCompleted: 0,
          avgCompletionRate: 0,
        };
      }
      stats[emp.department].totalEmployees++;
      stats[emp.department].totalSOPs += emp.totalSOPs;
      stats[emp.department].totalCompleted += emp.completed;
    });
    Object.values(stats).forEach(s => {
      s.avgCompletionRate = s.totalSOPs > 0 ? Math.round((s.totalCompleted / s.totalSOPs) * 100) : 0;
    });
    return Object.values(stats);
  }, [reportData]);

  // Overall stats
  const overallStats = useMemo(() => ({
    totalEmployees: reportData.length,
    totalSOPs: reportData.reduce((sum, d) => sum + d.totalSOPs, 0),
    totalCompleted: reportData.reduce((sum, d) => sum + d.completed, 0),
    totalInProgress: reportData.reduce((sum, d) => sum + d.inProgress, 0),
    avgCompletion: reportData.length > 0 ? Math.round(reportData.reduce((sum, d) => sum + d.completionRate, 0) / reportData.length) : 0,
  }), [reportData]);

  const toggleSort = (field: typeof sortBy) => {
    if (sortBy === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortDir('desc');
    }
  };

  const handleExport = () => {
    const headers = ['الموظف', 'القسم', 'إجمالي SOPs', 'مكتمل', 'قيد القراءة', 'لم تبدأ', 'نسبة الإنجاز', 'الوقت المستغرق', 'آخر نشاط'];
    const data = filteredData.map(d => [
      d.employeeName,
      DEPT_MAP[d.department] || d.department,
      d.totalSOPs.toString(),
      d.completed.toString(),
      d.inProgress.toString(),
      d.notStarted.toString(),
      `${d.completionRate}%`,
      `${Math.floor(d.totalTimeSpent / 60)} ساعة ${d.totalTimeSpent % 60} دقيقة`,
      d.lastActivity,
    ]);
    exportToStyledExcel('تقرير_SOPs_الموظفين', headers, data);
    if (addToast) addToast('تم تصدير التقرير بنجاح', 'success');
  };

  const getProgressColor = (rate: number) => {
    if (rate >= 80) return 'text-emerald-500';
    if (rate >= 50) return 'text-amber-500';
    return 'text-rose-500';
  };

  const getProgressBg = (rate: number) => {
    if (rate >= 80) return 'bg-emerald-500';
    if (rate >= 50) return 'bg-amber-500';
    return 'bg-rose-500';
  };

  return (
    <div className="space-y-6 pb-20 animate-fade-in" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <BarChart3 className="text-indigo-600" /> تقارير SOPs
          </h2>
          <p className="text-slate-500 mt-1">تتبع أداء الموظفين في قراءة واعتماد إجراءات SOP</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-200 transition-all">
            <Download size={14} /> تصدير
          </button>
        </div>
      </div>

      {/* Overall Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <div className="bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-2xl p-4 text-white">
          <p className="text-2xl font-black">{overallStats.totalEmployees}</p>
          <p className="text-indigo-100 text-xs font-bold mt-1">الموظفين</p>
        </div>
        <div className="bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl p-4 text-white">
          <p className="text-2xl font-black">{overallStats.totalSOPs}</p>
          <p className="text-blue-100 text-xs font-bold mt-1">إجمالي SOPs</p>
        </div>
        <div className="bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-2xl p-4 text-white">
          <p className="text-2xl font-black">{overallStats.totalCompleted}</p>
          <p className="text-emerald-100 text-xs font-bold mt-1">مكتملة</p>
        </div>
        <div className="bg-gradient-to-br from-amber-500 to-amber-700 rounded-2xl p-4 text-white">
          <p className="text-2xl font-black">{overallStats.totalInProgress}</p>
          <p className="text-amber-100 text-xs font-bold mt-1">قيد الإنجاز</p>
        </div>
        <div className="bg-gradient-to-br from-violet-500 to-violet-700 rounded-2xl p-4 text-white">
          <p className="text-2xl font-black">{overallStats.avgCompletion}%</p>
          <p className="text-violet-100 text-xs font-bold mt-1">متوسط الإنجاز</p>
        </div>
      </div>

      {/* View Tabs */}
      <div className="flex bg-white rounded-2xl p-1 border border-slate-200 w-fit">
        <button onClick={() => setSelectedView('employees')}
          className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${selectedView === 'employees' ? 'bg-indigo-500 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          <Users size={16} className="inline ml-1" /> الموظفين
        </button>
        <button onClick={() => setSelectedView('departments')}
          className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${selectedView === 'departments' ? 'bg-indigo-500 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          <Layers size={16} className="inline ml-1" /> الأقسام
        </button>
      </div>

      {/* Filters */}
      {selectedView === 'employees' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="ابحث عن موظف..." dir="rtl"
                className="w-full pr-9 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-indigo-400 focus:bg-white transition-all" />
            </div>
            <select value={filterDept} onChange={e => setFilterDept(e.target.value)}
              className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-indigo-400 focus:bg-white transition-all">
              <option value="all">جميع الأقسام</option>
              {Object.entries(DEPT_MAP).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
            <select value={sortBy} onChange={e => { setSortBy(e.target.value as any); setSortDir('desc'); }}
              className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-indigo-400 focus:bg-white transition-all">
              <option value="completion">ترتيب حسب الإنجاز</option>
              <option value="name">ترتيب حسب الاسم</option>
              <option value="department">ترتيب حسب القسم</option>
            </select>
            <button onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
              className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-500 hover:text-slate-700 transition-all">
              {sortDir === 'desc' ? <ArrowDown size={16} /> : <ArrowUp size={16} />}
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="animate-spin text-indigo-500" />
        </div>
      ) : selectedView === 'employees' ? (
        <div className="space-y-3">
          {filteredData.map(emp => (
            <div key={emp.employeeId} className="bg-white border-2 border-slate-200 rounded-2xl overflow-hidden hover:border-indigo-200 transition-all shadow-sm">
              <div className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-slate-50/50 transition-colors"
                onClick={() => setExpandedEmp(expandedEmp === emp.employeeId ? null : emp.employeeId)}>
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold shrink-0">
                    {emp.employeeName.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-800 text-sm">{emp.employeeName}</p>
                    <p className="text-[10px] text-slate-400">{DEPT_MAP[emp.department] || emp.department}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    {/* Progress bar */}
                    <div className="hidden sm:block w-32">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full ${getProgressBg(emp.completionRate)} rounded-full transition-all`} style={{ width: `${emp.completionRate}%` }} />
                        </div>
                      </div>
                    </div>
                    <span className={`text-sm font-black ${getProgressColor(emp.completionRate)}`}>{emp.completionRate}%</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex gap-1">
                    <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold">{emp.completed}</span>
                    <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">{emp.inProgress}</span>
                    <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-bold">{emp.notStarted}</span>
                  </div>
                  <ChevronDown size={16} className={`text-slate-400 transition-transform ${expandedEmp === emp.employeeId ? 'rotate-180' : ''}`} />
                </div>
              </div>
              {expandedEmp === emp.employeeId && (
                <div className="px-5 pb-4 pt-0 border-t border-slate-100 animate-[fadeIn_0.2s_ease]">
                  <div className="grid sm:grid-cols-4 gap-4 mt-4">
                    <div className="bg-slate-50 rounded-xl p-3">
                      <p className="text-[10px] font-bold text-slate-400">إجمالي SOPs</p>
                      <p className="text-lg font-bold text-slate-700">{emp.totalSOPs}</p>
                    </div>
                    <div className="bg-emerald-50 rounded-xl p-3">
                      <p className="text-[10px] font-bold text-emerald-500">مكتمل</p>
                      <p className="text-lg font-bold text-emerald-700">{emp.completed}</p>
                    </div>
                    <div className="bg-amber-50 rounded-xl p-3">
                      <p className="text-[10px] font-bold text-amber-500">قيد القراءة</p>
                      <p className="text-lg font-bold text-amber-700">{emp.inProgress}</p>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-3">
                      <p className="text-[10px] font-bold text-slate-400">الوقت المستغرق</p>
                      <p className="text-lg font-bold text-slate-700">{Math.floor(emp.totalTimeSpent / 60)} س</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        /* Department View */
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {deptStats.map(dept => (
            <div key={dept.department} className="bg-white border-2 border-slate-200 rounded-2xl p-5 hover:border-indigo-200 transition-all shadow-sm hover:shadow-md">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
                  <Layers size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800">{dept.departmentAr}</h3>
                  <p className="text-[10px] text-slate-400">{dept.totalEmployees} موظف</p>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">عدد SOPs</span>
                  <span className="font-bold text-slate-700">{dept.totalSOPs}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">مكتملة</span>
                  <span className="font-bold text-emerald-600">{dept.totalCompleted}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">نسبة الإنجاز</span>
                  <span className={`font-bold ${getProgressColor(dept.avgCompletionRate)}`}>{dept.avgCompletionRate}%</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden mt-2">
                  <div className={`h-full ${getProgressBg(dept.avgCompletionRate)} rounded-full transition-all`} style={{ width: `${dept.avgCompletionRate}%` }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}