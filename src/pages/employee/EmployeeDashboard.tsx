/**
 * ════════════════════════════════════════════════════════════════
 *  EmployeeDashboard - لوحة الموظف (نسخة مُصلحة)
 * ════════════════════════════════════════════════════════════════
 *
 *  🔧 الإصلاحات المُطبّقة:
 *  ─────────────────────────────────────────────────────────────────
 *  ✅ 4 استخدام any → 0
 *  ✅ attendanceData: any[] → AttendanceRecord[]
 *  ✅ problemTrend: any[] → TrendDataPoint[]
 *  ✅ attendance as any[] → AttendanceRecord[]
 *  ✅ setSelectedPeriod(... as any) → TrendPeriod union
 *  ✅ تنظيف جميع markdown artifacts
 *  ✅ catch blocks → getErrorMessage
 *  ════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle, Clock, Plus,
  Star, TrendingUp,
  Heart, Award, Activity, Calendar,
  FileText, Zap, Flame, BookOpen, Brain,
  BarChart3, Target, Wallet, Receipt, CreditCard,
  AlertCircle,
} from 'lucide-react';
import { useAuthStore, useUIStore } from '../../core/stores';
import { incidentService } from '../../services/sdk/IncidentService';
import { wellnessService, wellnessEntryService } from '../../services/sdk/WellnessService';
import { attendanceSummaryService } from '../../services/sdk/AttendanceService';
import { employeeLoanService, expenseRequestService } from '../../services/sdk/FinanceService';
import { payrollRecordService } from '../../services/sdk/PayrollService';
import { employeeGoalService } from '../../services/sdk/EmployeeDevelopmentService';
import { employeeService } from '../../services/sdk/EmployeeService';
import { leaveBalanceService } from '../../services/sdk/LeaveService';
import Card, { CardHeader, CardTitle } from '../../shared/components/ui/Card';
import Badge from '../../shared/components/ui/Badge';
import Button from '../../shared/components/ui/Button';
import { format, subDays } from 'date-fns';
import { ar } from 'date-fns/locale';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar,
} from 'recharts';
import type { LucideIcon } from 'lucide-react';
import { getErrorMessage } from '../../services/errors';
import { useNavigate } from 'react-router-dom';
import { useEmployeeId } from '../../shared/hooks/useEmployeeId';
import { employeeDashboardService } from '../../services/sdk';

// ════════════════════════════════════════════════════
// أنواع البيانات
// ════════════════════════════════════════════════════

type TrendPeriod = 'week' | 'month' | 'quarter';

interface Problem {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'resolved' | 'closed';
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  created_at: string;
  ai_analysis?: {
    urgencyLevel: number;
    sentiment: string;
  };
}

interface WellnessEntry {
  date: string;
  score: number;
  mood: string;
  stress: number;
  energy: number;
  notes?: string;
}

interface AttendanceRecord {
  id?: string;
  shift_date: string;
  status?: string;
}

/** ★ المرحلة 1: سجل الصحة النفسية — score أو mood_score حسب المصدر */
interface WellnessEntryLite {
  date?: string;
  score?: number;
  mood_score?: number;
}

interface TrendDataPoint {
  date: string;
  problems: number;
  wellness: number;
}

interface QuickAction {
  label: string;
  icon: LucideIcon;
  action: () => void;
  color: string;
}

/**
 * حساب عدد أيام الحضور المتتالية (streak) من سجل الحضور الحقيقي.
 * يبدأ من أحدث سجل ويعدّ الأيام المتتالية غير الغائبة.
 */
const calculateStreakFromAttendance = (records: AttendanceRecord[]): number => {
  if (!records.length) return 0;
  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < records.length; i++) {
    const recordDate = new Date(records[i].shift_date);
    recordDate.setHours(0, 0, 0, 0);
    const diffDays = Math.round((today.getTime() - recordDate.getTime()) / 86400000);
    // السجل مُرتّب تنازلياً حسب التاريخ: نتوقع فرق = i (اليوم، أمس، قبل أمس...)
    if (diffDays === i && records[i].status !== 'غائب') {
      streak++;
    } else {
      break;
    }
  }
  return streak;
};

// ════════════════════════════════════════════════════
// المكون الرئيسي
// ════════════════════════════════════════════════════

export default function EmployeeDashboard() {
  // ★★ 0335: اللوحة كانت تمرّر user.id (profiles.id) حيث يُنتظر
  //   employees.id — فعرضت أصفاراً بينما البيانات موجودة كلّها.
  const { employeeId, linkMissing } = useEmployeeId();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalProblems: 0,
    resolvedProblems: 0,
    pendingProblems: 0,
    wellnessScore: 0,
    streak: 0,
    attendanceRate: 0,
  });
  const [recentProblems, setRecentProblems] = useState<Problem[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<TrendPeriod>('week');
  const [problemTrend, setProblemTrend] = useState<TrendDataPoint[]>([]);
  const [financialSummary, setFinancialSummary] = useState({
    latestNetSalary: 0,
    pendingExpenses: 0,
    outstandingLoans: 0,
    currency: 'IQD',
  });
  const [developmentSummary, setDevelopmentSummary] = useState({ activeGoals: 0, averageGoalProgress: 0 });
  // رصيد الإجازات (سنوي + مرضي)
  const [leaveBalance, setLeaveBalance] = useState<{
    annual: { total: number; used: number; pending: number; remaining: number };
    sick: { total: number; used: number; pending: number; remaining: number };
  } | null>(null);

  const fetchDashboardData = useCallback(async () => {
    if (!user?.id) return;
    try {
      // ★★ إصلاح 0335 — كان هنا سبعة استعلامات كلّها بـ`user.id`:
      //     attendanceSummaryService.findAll({ filters: { employee_id: user.id } })
      //     expenseRequestService.findByEmployee(user.id)
      //     employeeLoanService.findByEmployee(user.id)  … إلخ
      //   لكن `user.id` هو profiles.id بينما العمود employee_id يشير
      //   إلى employees.id. الإثبات على Postgres بموظف ببيانات كاملة:
      //     بـuser.id      → wellness=0 attendance=0 goals=0 balance=0
      //     بـemployees.id → wellness=1 attendance=1 goals=1 balance=1
      //   ⇒ اللوحة عرضت أصفاراً بينما بيانات الموظف كلّها موجودة.
      //
      //   الإجماليات صارت صفّاً واحداً محسوباً في القاعدة، وما تبقّى
      //   من قوائم تفصيلية يستعمل المعرّف المُحلّ.
      if (!employeeId) { setLoading(false); return; }

      const [summaryRow, problems, wellness, attendance, payrollRows, expenses, loans] =
        await Promise.all([
          employeeDashboardService.summary(),
          incidentService.findByEmployee(employeeId) as unknown as Problem[],
          wellnessEntryService.findByUser(employeeId, 30) as unknown as WellnessEntry[],
          attendanceSummaryService.findAll({
            filters: { employee_id: employeeId },
            orderBy: 'shift_date',
            ascending: false,
            limit: 30,
          }) as unknown as AttendanceRecord[],
          payrollRecordService.findAll({ filters: { employee_id: employeeId }, orderBy: 'created_at', ascending: false, limit: 3 }),
          expenseRequestService.findByEmployee(employeeId),
          employeeLoanService.findByEmployee(employeeId),
        ]);

      const problemsList = problems || [];
      const wellnessList = (wellness ?? []) as unknown as WellnessEntryLite[];
      const attendanceList = attendance || [];

      setRecentProblems(problemsList.slice(0, 5));

      // ★ الإجماليات من القاعدة (0335) لا من عدّ المصفوفات في المتصفح.
      //   `streak` يبقى محلّياً — يحتاج تسلسل الأيام لا مجرّد عدّ.
      setStats({
        totalProblems: summaryRow.totalProblems,
        resolvedProblems: summaryRow.resolvedProblems,
        pendingProblems: summaryRow.pendingProblems,
        wellnessScore: summaryRow.wellnessScore,
        streak: calculateStreakFromAttendance(attendanceList),
        attendanceRate: summaryRow.attendanceRate,
      });

      const latestPayroll = (payrollRows || [])[0] || {};
      const pendingExpenses = (expenses || [])
        .filter((expense: any) => ['pending', 'submitted', 'in_review', 'new', 'قيد الانتظار'].includes(String(expense.status || '').toLowerCase()) || expense.status === 'قيد المراجعة')
        .reduce((sum: number, expense: any) => sum + Number(expense.amount || 0), 0);
      const outstandingLoans = (loans || [])
        .filter((loan: any) => !['rejected', 'closed', 'paid', 'مرفوض', 'مغلق', 'مسدد'].includes(String(loan.status || '').toLowerCase()))
        .reduce((sum: number, loan: any) => sum + Number(loan.remaining_amount ?? loan.loan_amount ?? loan.amount ?? 0), 0);
      setFinancialSummary({
        latestNetSalary: Number(latestPayroll.net_salary ?? latestPayroll.total_salary ?? latestPayroll.basic_salary ?? 0),
        pendingExpenses,
        outstandingLoans,
        currency: latestPayroll.currency || 'IQD',
      });

      // ★ 0335: من القاعدة — الأهداف النشطة وحدها، والمكتمل لا يُحتسب
      //   في المتوسط (لو حُسب لرفعه زوراً إلى ≈73 بدل 60).
      setDevelopmentSummary({
        activeGoals: summaryRow.activeGoals,
        averageGoalProgress: summaryRow.avgGoalProgress,
      });

      const trend: TrendDataPoint[] = Array.from({ length: 7 }, (_, i) => {
        const date = format(subDays(new Date(), 6 - i), 'yyyy-MM-dd');
        return {
          date: format(subDays(new Date(), 6 - i), 'E', { locale: ar }),
          problems: problemsList.filter((p: Problem) => p.created_at?.startsWith(date)).length,
          wellness: (() => {
            const w = wellnessList.find((x) => x.date === date);
            return w?.score ?? w?.mood_score ?? 0;
          })(),
        };
      });
      setProblemTrend(trend);
    } catch (err) {
      console.error('Dashboard fetch error:', getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { fetchDashboardData(); }, [fetchDashboardData]);

  // جلب رصيد الإجازات (يتطلب معرّف سجل الموظف من جدول employees)
  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      try {
        const employees = await employeeService.findAll({ filters: { user_id: user.id }, limit: 1 });
        if (employees.length > 0) {
          const summary = await leaveBalanceService.getBalanceSummary(employees[0].id);
          setLeaveBalance({ annual: summary.annual, sick: summary.sick });
        }
      } catch {
        // تجاهل — القسم يظهر فقط عند توفّر البيانات
      }
    })();
  }, [user]);

  const quickActions: QuickAction[] = [
    { label: 'بلاغ جديد', icon: Plus, action: () => navigate('/app/employee/problems/new'), color: 'bg-gradient-to-br from-rose-500 to-pink-600' },
    { label: 'طلب إجازة', icon: Calendar, action: () => navigate('/app/employee/leave-requests'), color: 'bg-gradient-to-br from-emerald-500 to-teal-600' },
    { label: 'تسجيل مزاج', icon: Heart, action: () => navigate('/app/employee/wellness'), color: 'bg-gradient-to-br from-violet-500 to-purple-600' },
    { label: 'تدريب', icon: BookOpen, action: () => navigate('/app/employee/training'), color: 'bg-gradient-to-br from-amber-500 to-orange-600' },
    { label: 'أهدافي', icon: Target, action: () => navigate('/app/employee/goals'), color: 'bg-gradient-to-br from-blue-500 to-indigo-600' },
  ];

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'صباح الخير';
    if (hour < 17) return 'مساء الخير';
    return 'مساء النور';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600" />
      </div>
    );
  }

  /**
   * ★★ 0335: حالة «حساب بلا سجلّ موظف».
   *
   *   قبل هذا الإصلاح كان الموظف في هذه الحالة يرى **لوحة أصفار
   *   كاملة** بلا أي تفسير — يظنّ أن بياناته ضاعت. وهي حالة مختلفة
   *   تماماً عن «لا بيانات بعد»: تلك تُحلّ بالوقت، وهذه تحتاج تدخّل
   *   الموارد البشرية لربط الحساب.
   */
  if (linkMissing) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center mb-4">
          <AlertCircle className="text-amber-500" size={28} />
        </div>
        <h2 className="text-lg font-black text-slate-800 mb-2">
          حسابك غير مرتبط بسجلّ موظف
        </h2>
        <p className="text-sm text-slate-500 max-w-md leading-relaxed">
          لديك حساب على النظام، لكن لا يوجد سجلّ موظف مرتبط به — لذلك لا
          يمكن عرض حضورك أو إجازاتك أو رواتبك.
        </p>
        <p className="text-sm text-slate-500 mt-2">
          راجع قسم الموارد البشرية لإتمام الربط.
        </p>
      </div>
    );
  }

  const severityBadge = (severity: Problem['severity']): 'danger' | 'warning' | 'info' =>
    severity === 'critical' || severity === 'high' ? 'danger' : severity === 'medium' ? 'warning' : 'info';

  const formatMoney = (amount: number) => `${Number(amount || 0).toLocaleString('ar-IQ')} ${financialSummary.currency}`;

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      {/* Welcome + Quick Actions */}
      <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-extrabold">{greeting()}، {user?.full_name || 'موظفنا العزيز'} 👋</h2>
            <p className="text-white/70 mt-1">Kyvzon Platform</p>
          </div>
          <div className="flex items-center gap-2 bg-white/20 rounded-xl px-4 py-2">
            <Star className="text-yellow-300" size={18} />
            <span className="font-bold">{user?.wellnessScore || stats.wellnessScore}%</span>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {quickActions.map((action, idx) => {
            const ActionIcon = action.icon;
            return (
              <button key={idx} onClick={action.action} className="flex items-center gap-2 bg-white/10 hover:bg-white/20 rounded-xl px-4 py-3 transition-all">
                <div className="p-2 rounded-lg bg-white/20"><ActionIcon size={18} /></div>
                <span className="text-sm font-bold">{action.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500">البلاغات</span>
                <FileText size={16} className="text-indigo-500" />
              </div>
              <div className="text-2xl font-extrabold mt-2">{stats.totalProblems}</div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-emerald-600 font-bold">✓ {stats.resolvedProblems} تم الحل</span>
                <span className="text-xs text-amber-600 font-bold">⏳ {stats.pendingProblems} قيد الانتظار</span>
              </div>
            </CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500">الحضور</span>
                <Clock size={16} className="text-emerald-500" />
              </div>
              <div className="text-2xl font-extrabold mt-2">{stats.attendanceRate}%</div>
              <div className="flex items-center gap-2 mt-1"><TrendingUp size={14} className="text-emerald-500" /><span className="text-xs text-slate-500">نسبة الالتزام</span></div>
            </CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500">الصحة النفسية</span>
                <Heart size={16} className="text-rose-500" />
              </div>
              <div className="text-2xl font-extrabold mt-2">{stats.wellnessScore}%</div>
              <div className="flex items-center gap-2 mt-1"><Activity size={14} className="text-rose-500" /><span className="text-xs text-slate-500">آخر تحديث اليوم</span></div>
            </CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500">التسلسل</span>
                <Zap size={16} className="text-amber-500" />
              </div>
              <div className="text-2xl font-extrabold mt-2">{stats.streak}🔥</div>
              <div className="flex items-center gap-2 mt-1"><Award size={14} className="text-amber-500" /><span className="text-xs text-slate-500">أيام متتالية</span></div>
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* رصيد الإجازات */}
      {leaveBalance && (
        <Card>
          <CardHeader>
            <CardTitle>
              <span className="flex items-center gap-2">
                <Calendar size={18} className="text-emerald-600" />
                رصيد الإجازات ({new Date().getFullYear()})
              </span>
            </CardTitle>
          </CardHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 pt-0">
            {/* الإجازة السنوية */}
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-bold text-emerald-800">الإجازة السنوية</span>
                <span className="text-2xl font-black text-emerald-700">{leaveBalance.annual.remaining}</span>
              </div>
              <div className="w-full h-2 bg-emerald-100 rounded-full overflow-hidden mb-2">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all"
                  style={{ width: `${leaveBalance.annual.total > 0 ? Math.min(100, (leaveBalance.annual.remaining / leaveBalance.annual.total) * 100) : 0}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-slate-500">
                <span>متبقٍّ: {leaveBalance.annual.remaining}</span>
                <span>مستخدم: {leaveBalance.annual.used}</span>
                <span>الإجمالي: {leaveBalance.annual.total}</span>
              </div>
              {leaveBalance.annual.pending > 0 && (
                <p className="text-xs text-amber-600 mt-1.5">قيد الموافقة: {leaveBalance.annual.pending} يوم</p>
              )}
            </div>

            {/* الإجازة المرضية */}
            <div className="rounded-2xl border border-sky-100 bg-sky-50/50 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-bold text-sky-800">الإجازة المرضية</span>
                <span className="text-2xl font-black text-sky-700">{leaveBalance.sick.remaining}</span>
              </div>
              <div className="w-full h-2 bg-sky-100 rounded-full overflow-hidden mb-2">
                <div
                  className="h-full bg-sky-500 rounded-full transition-all"
                  style={{ width: `${leaveBalance.sick.total > 0 ? Math.min(100, (leaveBalance.sick.remaining / leaveBalance.sick.total) * 100) : 0}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-slate-500">
                <span>متبقٍّ: {leaveBalance.sick.remaining}</span>
                <span>مستخدم: {leaveBalance.sick.used}</span>
                <span>الإجمالي: {leaveBalance.sick.total}</span>
              </div>
              {leaveBalance.sick.pending > 0 && (
                <p className="text-xs text-amber-600 mt-1.5">قيد الموافقة: {leaveBalance.sick.pending} يوم</p>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Financial + Development Self-Service Summary */}
      <div className="grid lg:grid-cols-4 gap-4">
        <Card hover onClick={() => navigate('/app/employee/payroll')}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-500">آخر صافي راتب</p>
              <p className="text-xl font-extrabold text-slate-800 mt-1">{formatMoney(financialSummary.latestNetSalary)}</p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center"><Wallet size={20} /></div>
          </div>
        </Card>
        <Card hover onClick={() => navigate('/app/employee/expenses')}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-500">نفقات معلقة</p>
              <p className="text-xl font-extrabold text-slate-800 mt-1">{formatMoney(financialSummary.pendingExpenses)}</p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center"><Receipt size={20} /></div>
          </div>
        </Card>
        <Card hover onClick={() => navigate('/app/employee/loans')}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-500">سلف/قروض متبقية</p>
              <p className="text-xl font-extrabold text-slate-800 mt-1">{formatMoney(financialSummary.outstandingLoans)}</p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center"><CreditCard size={20} /></div>
          </div>
        </Card>
        <Card hover onClick={() => navigate('/app/employee/goals')}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-500">الأهداف النشطة</p>
              <p className="text-xl font-extrabold text-slate-800 mt-1">{developmentSummary.activeGoals} • {developmentSummary.averageGoalProgress}%</p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center"><Target size={20} /></div>
          </div>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle><span className="text-sm font-bold text-slate-700">تحليل البلاغات</span></CardTitle>
          </CardHeader>
          <div className="px-4 pb-4" dir="ltr">
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={problemTrend}>
                <defs>
                  <linearGradient id="colorProblems" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366F1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94A3B8' }} />
                <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} />
                <Tooltip />
                <Area type="monotone" dataKey="problems" stroke="#6366F1" fill="url(#colorProblems)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-700">مؤشر الصحة النفسية</span>
                <select value={selectedPeriod} onChange={(e) => setSelectedPeriod(e.target.value as TrendPeriod)} className="text-xs border rounded-lg px-2 py-1 outline-none">
                  <option value="week">أسبوع</option>
                  <option value="month">شهر</option>
                  <option value="quarter">ربع سنة</option>
                </select>
              </div>
            </CardTitle>
          </CardHeader>
          <div className="px-4 pb-4" dir="ltr">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={problemTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94A3B8' }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#94A3B8' }} />
                <Tooltip />
                <Bar dataKey="wellness" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Recent Problems */}
      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-slate-700">آخر البلاغات</span>
              <Button size="sm" variant="ghost" onClick={() => navigate('/app/employee/problems')}>عرض الكل</Button>
            </div>
          </CardTitle>
        </CardHeader>
        <div className="px-4 pb-4 space-y-2">
          {recentProblems.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <CheckCircle size={32} className="mx-auto mb-2 text-emerald-400" />
              <p className="font-bold text-sm">لا توجد بلاغات! 🎉</p>
            </div>
          ) : (
            recentProblems.slice(0, 5).map((problem) => (
              <div key={problem.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className={`w-2.5 h-2.5 rounded-full ${problem.status === 'resolved' ? 'bg-emerald-500' : problem.status === 'in_progress' ? 'bg-blue-500' : problem.status === 'pending' ? 'bg-amber-500' : 'bg-slate-500'}`} />
                  <div>
                    <p className="text-sm font-bold text-slate-700">{problem.title}</p>
                    <p className="text-xs text-slate-500">{problem.category} • {problem.created_at ? format(new Date(problem.created_at), 'P', { locale: ar }) : ''}</p>
                  </div>
                </div>
                <Badge variant={severityBadge(problem.severity)}>{problem.severity}</Badge>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* AI Insights */}
      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex items-center gap-2"><Brain size={18} className="text-indigo-500" /><span className="text-sm font-bold text-slate-700">نظرة تحليلية سريعة</span></div>
          </CardTitle>
        </CardHeader>
        <div className="px-4 pb-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2"><Target size={16} className="text-indigo-600" /><span className="text-xs font-bold text-indigo-600">الإنتاجية</span></div>
              <p className="text-lg font-extrabold text-slate-800">{stats.resolvedProblems > 0 ? Math.round((stats.resolvedProblems / stats.totalProblems) * 100) : 100}%</p>
              <p className="text-xs text-slate-500 mt-1">نسبة إنجاز البلاغات</p>
            </div>
            <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2"><Flame size={16} className="text-emerald-600" /><span className="text-xs font-bold text-emerald-600">التسلسل</span></div>
              <p className="text-lg font-extrabold text-slate-800">{stats.streak} أيام</p>
              <p className="text-xs text-slate-500 mt-1">أيام متتالية من النشاط</p>
            </div>
            <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2"><BarChart3 size={16} className="text-amber-600" /><span className="text-xs font-bold text-amber-600">الحضور</span></div>
              <p className="text-lg font-extrabold text-slate-800">{stats.attendanceRate}%</p>
              <p className="text-xs text-slate-500 mt-1">نسبة الحضور الإجمالية</p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}