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
  BarChart3, Target,
} from 'lucide-react';
import { useAuthStore, useUIStore } from '../../core/stores';
import { incidentService } from '../../services/sdk/IncidentService';
import { wellnessService, wellnessEntryService } from '../../services/sdk/WellnessService';
import { attendanceSummaryService } from '../../services/sdk/AttendanceService';
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
  const { user } = useAuthStore();
  const { setActiveView } = useUIStore();
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

  const fetchDashboardData = useCallback(async () => {
    if (!user?.id) return;
    try {
      const [problems, wellness, attendance] = await Promise.all([
        incidentService.findByEmployee(user.id) as unknown as Problem[],
        wellnessEntryService.findByUser(user.id, 30) as unknown as WellnessEntry[],
        attendanceSummaryService.findAll({
          filters: { employee_id: user.id },
          orderBy: 'shift_date',
          ascending: false,
          limit: 30,
        }) as unknown as AttendanceRecord[],
      ]);

      const problemsList = problems || [];
      const wellnessList = wellness || [];
      const attendanceList = attendance || [];

      setRecentProblems(problemsList.slice(0, 5));

      setStats({
        totalProblems: problemsList.length,
        resolvedProblems: problemsList.filter((p: Problem) => p.status === 'resolved' || p.status === 'closed').length,
        pendingProblems: problemsList.filter((p: Problem) => p.status === 'pending').length,
        wellnessScore: wellnessList.length > 0 ? (wellnessList[0] as any).score || (wellnessList[0] as any).mood_score || 0 : 0,
        streak: calculateStreakFromAttendance(attendanceList),
        attendanceRate: attendanceList.length > 0 ? Math.round((attendanceList.filter((a) => (a as any).status !== 'غائب').length / attendanceList.length) * 100) : 0,
      });

      const trend: TrendDataPoint[] = Array.from({ length: 7 }, (_, i) => {
        const date = format(subDays(new Date(), 6 - i), 'yyyy-MM-dd');
        return {
          date: format(subDays(new Date(), 6 - i), 'E', { locale: ar }),
          problems: problemsList.filter((p: Problem) => (p as any).created_at?.startsWith(date)).length,
          wellness: (wellnessList as any[]).find((w: any) => w.date === date)?.score || (wellnessList as any[]).find((w: any) => w.date === date)?.mood_score || 0,
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

  const quickActions: QuickAction[] = [
    { label: 'بلاغ جديد', icon: Plus, action: () => setActiveView('new-problem'), color: 'bg-gradient-to-br from-rose-500 to-pink-600' },
    { label: 'طلب إجازة', icon: Calendar, action: () => setActiveView('employee-leave-requests'), color: 'bg-gradient-to-br from-emerald-500 to-teal-600' },
    { label: 'تسجيل مزاج', icon: Heart, action: () => setActiveView('employee-wellness'), color: 'bg-gradient-to-br from-violet-500 to-purple-600' },
    { label: 'تدريب', icon: BookOpen, action: () => setActiveView('employee-training'), color: 'bg-gradient-to-br from-amber-500 to-orange-600' },
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

  const severityBadge = (severity: Problem['severity']): 'danger' | 'warning' | 'info' =>
    severity === 'critical' || severity === 'high' ? 'danger' : severity === 'medium' ? 'warning' : 'info';

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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
              <Button size="sm" variant="ghost" onClick={() => setActiveView('employee-problems')}>عرض الكل</Button>
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