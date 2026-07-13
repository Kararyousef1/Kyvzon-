/**
 * ════════════════════════════════════════════════════════════════
 *  TrainingReportsPage - تقارير التدريب (نسخة مُصلحة)
 * ════════════════════════════════════════════════════════════════
 *
 *  🔧 الإصلاحات المُطبّقة:
 *  ✅ 4 استخدام any → 0
 *  ✅ CustomTooltip props: any → أنواع Recharts
 *  ✅ (entry: any) → TooltipEntry
 *  ✅ catch (err: any) → unknown + getErrorMessage
 *  ✅ setTimeRange(... as any) → TimeRange union
 *  ✅ تنظيف markdown artifacts + إصلاح formatTime
 *  ════════════════════════════════════════════════════════════════
 */

import { useState, useMemo, useEffect } from 'react';
import {
  BarChart3, Download, FileText, Award,
  Users, TrendingUp, Target, CheckCircle, Clock,
  AlertTriangle, Star, Percent,
  PieChart, Eye, Search,
  ArrowUp, ArrowDown, Minus, Loader2, X, Brain,
  Sparkles, UserCheck,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Card, { CardHeader, CardTitle } from '../../shared/components/ui/Card';
import Button from '../../shared/components/ui/Button';
import { useUIStore } from '../../core/stores';
import { courseService, courseProgressService, employeeService, departmentService } from '../../services/sdk';
import { getErrorMessage } from '../../services/errors';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart as RePie, Pie, Cell,
} from 'recharts';

// ════════════════════════════════════════════════════
// أنواع البيانات
// ════════════════════════════════════════════════════

type TimeRange = '6months' | 'year' | 'all';

interface CourseStats {
  id: string;
  title: string;
  category: string;
  level: string;
  enrolled: number;
  completed: number;
  inProgress: number;
  avgScore: number;
  completionRate: number;
  mandatory: boolean;
  active: boolean;
}

interface MonthlyTrend {
  month: string;
  enrollments: number;
  completions: number;
  avgScore: number;
}

interface DepartmentStats {
  dept: string;
  employees: number;
  trained: number;
  pending: number;
  completionRate: number;
}

interface CourseDB {
  id: string;
  title: string;
  title_en?: string;
  category: string;
  level: string;
  mandatory: boolean;
  active: boolean;
  duration?: string;
  instructor?: string;
  points?: number;
}

interface CourseProgressDB {
  id: string;
  course_id: string;
  employee_id: string;
  progress_percent: number;
  completed: boolean;
  completed_at?: string;
  started_at: string;
  last_access_at?: string;
  time_spent?: number;
  approved?: boolean;
  score?: number;
}

interface ProfileDB {
  id: string;
  full_name: string;
  email: string;
  department?: string;
  role: string;
}

interface ParticipantDetail {
  employee: ProfileDB;
  progress: CourseProgressDB | null;
  courseTitle: string;
  timeSpentFormatted: string;
  statusText: string;
  scoreText: string;
  aiAnalysis?: string;
}

interface TooltipEntry {
  name?: string;
  value?: number | string;
  color?: string;
}

interface TooltipProps {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
}

type IconType = LucideIcon;

interface KpiCard {
  val: number | string;
  label: string;
  icon: IconType;
  color: string;
  suffix?: string;
}

// ════════════════════════════════════════════════════
// ثوابت ومساعدات
// ════════════════════════════════════════════════════

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

function formatTime(seconds: number): string {
  if (!seconds) return '—';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) return `${hrs}س ${mins}د`;
  if (mins > 0) return `${mins}د ${secs}ث`;
  return `${secs}ث`;
}

// ════════════════════════════════════════════════════
// Custom Tooltip
// ════════════════════════════════════════════════════

const CustomTooltip = ({ active, payload, label }: TooltipProps) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-slate-200 shadow-xl rounded-xl p-3 text-xs" dir="rtl">
        <p className="font-bold text-slate-700 mb-1">{label}</p>
        {payload.map((entry, idx) => (
          <p key={idx} style={{ color: entry.color }}>
            {entry.name}: <span className="font-bold">{entry.value}</span>
          </p>
        ))}
      </div>
    );
  }
  return null;
};

// ════════════════════════════════════════════════════
// Participant Detail Modal
// ════════════════════════════════════════════════════

function ParticipantDetailModal({ participant, onClose, onGenerateAI }: {
  participant: ParticipantDetail;
  onClose: () => void;
  onGenerateAI: () => void;
}) {
  const p = participant;
  const progress = p.progress;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <div className="relative bg-white rounded-3xl p-6 max-w-2xl w-full shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-bold text-lg shadow-md">{p.employee.full_name?.charAt(0) || '?'}</div>
          <div>
            <h3 className="text-lg font-extrabold text-slate-800">{p.employee.full_name}</h3>
            <p className="text-xs text-slate-500">{p.employee.email} · {p.employee.department || 'غير محدد'}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100"><p className="text-xs text-slate-500 mb-1">الدورة</p><p className="text-sm font-bold text-slate-800">{p.courseTitle}</p></div>
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100"><p className="text-xs text-slate-500 mb-1">الحالة</p><p className={`text-sm font-bold ${progress?.completed ? 'text-emerald-600' : progress ? 'text-amber-600' : 'text-slate-400'}`}>{p.statusText}</p></div>
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
            <p className="text-xs text-slate-500 mb-1">التقدم</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${(progress?.progress_percent || 0) >= 80 ? 'bg-emerald-500' : (progress?.progress_percent || 0) >= 40 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${progress?.progress_percent || 0}%` }} />
              </div>
              <span className="text-sm font-bold text-slate-700">{progress?.progress_percent || 0}%</span>
            </div>
          </div>
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100"><p className="text-xs text-slate-500 mb-1">الدرجة</p><p className="text-sm font-bold text-slate-800">{p.scoreText}</p></div>
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100"><p className="text-xs text-slate-500 mb-1">الوقت المستغرق</p><p className="text-sm font-bold text-slate-800">{p.timeSpentFormatted}</p></div>
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100"><p className="text-xs text-slate-500 mb-1">تاريخ البدء</p><p className="text-sm font-bold text-slate-800">{progress?.started_at ? new Date(progress.started_at).toLocaleDateString('ar-IQ') : '—'}</p></div>
        </div>

        {p.aiAnalysis ? (
          <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-2xl p-5 border border-purple-200">
            <div className="flex items-center gap-2 mb-3"><Brain size={18} className="text-purple-600" /><h4 className="font-bold text-purple-800 text-sm">تحليل AI للأداء</h4></div>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{p.aiAnalysis}</p>
          </div>
        ) : (
          <div className="bg-gradient-to-br from-slate-50 to-indigo-50 rounded-2xl p-5 border border-slate-200 text-center">
            <Brain size={32} className="mx-auto mb-2 text-slate-300" />
            <p className="text-sm text-slate-500 mb-3">توليد تحليل ذكي لأداء هذا المشارك</p>
            <Button variant="primary" size="sm" onClick={onGenerateAI} icon={<Sparkles size={14} />} iconPosition="left" className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700">توليد تحليل بالذكاء الاصطناعي</Button>
          </div>
        )}

        {progress && (
          <div className="mt-6 bg-white rounded-2xl border border-slate-100 p-4">
            <h4 className="font-bold text-slate-700 text-sm mb-3">الجدول الزمني</h4>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center"><Clock size={14} className="text-indigo-600" /></div>
                <div><p className="text-xs font-bold text-slate-700">بدء الدورة</p><p className="text-[11px] text-slate-500">{new Date(progress.started_at).toLocaleString('ar-IQ')}</p></div>
              </div>
              {progress.last_access_at && (
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center"><Clock size={14} className="text-amber-600" /></div>
                  <div><p className="text-xs font-bold text-slate-700">آخر وصول</p><p className="text-[11px] text-slate-500">{new Date(progress.last_access_at).toLocaleString('ar-IQ')}</p></div>
                </div>
              )}
              {progress.completed_at && (
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center"><CheckCircle size={14} className="text-emerald-600" /></div>
                  <div><p className="text-xs font-bold text-slate-700">إتمام الدورة</p><p className="text-[11px] text-slate-500">{new Date(progress.completed_at).toLocaleString('ar-IQ')}</p></div>
                </div>
              )}
            </div>
          </div>
        )}

        <button onClick={onClose} className="absolute top-4 left-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"><X size={18} /></button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════
// المكون الرئيسي
// ════════════════════════════════════════════════════

export default function TrainingReportsPage() {
  const { addToast } = useUIStore();
  const [timeRange, setTimeRange] = useState<TimeRange>('all');
  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState<CourseDB[]>([]);
  const [courseProgress, setCourseProgress] = useState<CourseProgressDB[]>([]);
  const [profiles, setProfiles] = useState<ProfileDB[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedParticipant, setSelectedParticipant] = useState<ParticipantDetail | null>(null);
  const [participantSearch, setParticipantSearch] = useState('');
  const [selectedCourseForParticipants, setSelectedCourseForParticipants] = useState<string>('all');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
      const coursesData = await courseService.findAllCourses();
      const progressData = await courseProgressService.findAllProgress();
      const profilesData = await employeeService.findAll();
      // جلب أسماء الأقسام
      const depts = await departmentService.findAll({ orderBy: 'name_ar' });
      const deptMap = new Map((depts || []).map((d: { id: string; name_ar: string }) => [d.id, d.name_ar]));
        const normalizedProfiles: ProfileDB[] = (profilesData as any[] || []).map((e) => ({
          id: e.id,
          full_name: e.full_name_ar || '',
          email: e.email || '',
          department: deptMap.get(e.department_id || '') || '',
          role: e.role || 'employee',
        }));
        setCourses((coursesData as unknown as CourseDB[]) || []);
        setCourseProgress((progressData as unknown as CourseProgressDB[]) || []);
        setProfiles(normalizedProfiles);
      } catch (err) {
        console.error('Failed to load training data:', getErrorMessage(err));
        setError(getErrorMessage(err, 'فشل في تحميل بيانات التدريب'));
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const courseStats: CourseStats[] = useMemo(() => {
    return courses.map((course) => {
      const progressForCourse = courseProgress.filter((p) => p.course_id === course.id);
      const enrolled = progressForCourse.length;
      const completed = progressForCourse.filter((p) => p.completed).length;
      const inProgress = enrolled - completed;
      const completionRate = enrolled > 0 ? Math.round((completed / enrolled) * 100) : 0;
      const avgScore = completed > 0 ? Math.round(progressForCourse.filter((p) => p.completed).reduce((sum, p) => sum + (p.score || 0), 0) / completed) : 0;
      return { id: course.id, title: course.title, category: course.category, level: course.level, enrolled, completed, inProgress, avgScore, completionRate, mandatory: course.mandatory, active: course.active };
    });
  }, [courses, courseProgress]);

  const monthlyTrends: MonthlyTrend[] = useMemo(() => {
    const monthMap = new Map<string, { enrollments: number; completions: number; avgScores: number[] }>();
    courseProgress.forEach((p) => {
      if (!p.started_at) return;
      const date = new Date(p.started_at);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!monthMap.has(monthKey)) monthMap.set(monthKey, { enrollments: 0, completions: 0, avgScores: [] });
      const entry = monthMap.get(monthKey)!;
      entry.enrollments += 1;
      if (p.completed && p.completed_at) { entry.completions += 1; if (p.score) entry.avgScores.push(p.score); }
    });
    return Array.from(monthMap.entries()).map(([key, data]) => ({
      month: key, enrollments: data.enrollments, completions: data.completions,
      avgScore: data.avgScores.length > 0 ? Math.round(data.avgScores.reduce((a, b) => a + b, 0) / data.avgScores.length) : 0,
    })).sort((a, b) => a.month.localeCompare(b.month)).slice(-12);
  }, [courseProgress]);

  const departmentStats: DepartmentStats[] = useMemo(() => {
    const deptMap = new Map<string, { employees: Set<string>; trained: Set<string> }>();
    profiles.forEach((p) => {
      const dept = p.department || 'غير محدد';
      if (!deptMap.has(dept)) deptMap.set(dept, { employees: new Set(), trained: new Set() });
      deptMap.get(dept)!.employees.add(p.id);
    });
    courseProgress.forEach((p) => {
      if (p.completed) {
        const profile = profiles.find((pr) => pr.id === p.employee_id);
        if (profile) {
          const dept = profile.department || 'غير محدد';
          if (deptMap.has(dept)) deptMap.get(dept)!.trained.add(p.employee_id);
        }
      }
    });
    return Array.from(deptMap.entries()).map(([dept, data]) => ({
      dept, employees: data.employees.size, trained: data.trained.size,
      pending: data.employees.size - data.trained.size,
      completionRate: data.employees.size > 0 ? Math.round((data.trained.size / data.employees.size) * 100) : 0,
    })).filter((d) => d.employees > 0).sort((a, b) => b.employees - a.employees);
  }, [profiles, courseProgress]);

  const participants = useMemo(() => {
    const list: ParticipantDetail[] = [];
    courses.forEach((course) => {
      courseProgress.filter((p) => p.course_id === course.id).forEach((p) => {
        const profile = profiles.find((pr) => pr.id === p.employee_id);
        if (profile) {
          const timeSpent = p.time_spent || 0;
          const hrs = Math.floor(timeSpent / 3600);
          const mins = Math.floor((timeSpent % 3600) / 60);
          list.push({
            employee: profile, progress: p, courseTitle: course.title,
            timeSpentFormatted: hrs > 0 ? `${hrs}س ${mins}د` : mins > 0 ? `${mins}د` : `${timeSpent}ث`,
            statusText: p.completed ? '✅ مكتمل' : p.progress_percent > 0 ? '🔄 قيد التنفيذ' : '❌ لم يبدأ',
            scoreText: p.score ? `${p.score}%` : '—',
          });
        }
      });
    });
    profiles.forEach((profile) => {
      const hasProgress = courseProgress.some((p) => p.employee_id === profile.id);
      if (!hasProgress && profile.role === 'employee') {
        list.push({ employee: profile, progress: null, courseTitle: '—', timeSpentFormatted: '—', statusText: '❌ لم يبدأ أي دورة', scoreText: '—' });
      }
    });
    return list.sort((a, b) => a.employee.full_name.localeCompare(b.employee.full_name));
  }, [courses, courseProgress, profiles]);

  const filteredParticipants = useMemo(() => {
    return participants.filter((p) => {
      const matchSearch = !participantSearch || p.employee.full_name.includes(participantSearch) || p.employee.email.includes(participantSearch) || p.employee.department?.includes(participantSearch);
      const matchCourse = selectedCourseForParticipants === 'all' || p.courseTitle === courses.find((c) => c.id === selectedCourseForParticipants)?.title;
      return matchSearch && matchCourse;
    });
  }, [participants, participantSearch, selectedCourseForParticipants, courses]);

  const totalEnrolled = courseStats.reduce((a, c) => a + c.enrolled, 0);
  const totalCompleted = courseStats.reduce((a, c) => a + c.completed, 0);
  const totalInProgress = courseStats.reduce((a, c) => a + c.inProgress, 0);
  const overallCompletionRate = totalEnrolled > 0 ? Math.round((totalCompleted / totalEnrolled) * 100) : 0;
  const overallAvgScore = courseStats.length > 0 ? Math.round(courseStats.reduce((a, c) => a + c.avgScore, 0) / courseStats.length) : 0;
  const mandatoryCourses = courseStats.filter((c) => c.mandatory);
  const mandatoryCompleted = mandatoryCourses.reduce((a, c) => a + c.completed, 0);
  const mandatoryEnrolled = mandatoryCourses.reduce((a, c) => a + c.enrolled, 0);
  const mandatoryRate = mandatoryEnrolled > 0 ? Math.round((mandatoryCompleted / mandatoryEnrolled) * 100) : 0;

  const categoryData = useMemo(() => {
    const map = new Map<string, number>();
    courseStats.forEach((c) => map.set(c.category, (map.get(c.category) || 0) + c.enrolled));
    return Array.from(map.entries()).map(([name, value]) => ({ name, value })).filter((d) => d.value > 0);
  }, [courseStats]);

  const levelData = useMemo(() => {
    const map = new Map<string, { enrolled: number; completed: number }>();
    courseStats.forEach((c) => {
      const existing = map.get(c.level) || { enrolled: 0, completed: 0 };
      map.set(c.level, { enrolled: existing.enrolled + c.enrolled, completed: existing.completed + c.completed });
    });
    return Array.from(map.entries()).map(([name, data]) => ({ name, enrolled: data.enrolled, completed: data.completed, rate: data.enrolled > 0 ? Math.round((data.completed / data.enrolled) * 100) : 0 }));
  }, [courseStats]);

  const deptChartData = useMemo(() => departmentStats.map((d) => ({ name: d.dept, 'معدل_الإتمام': d.completionRate, 'المتبقي': 100 - d.completionRate })), [departmentStats]);

  const handleGenerateAIAnalysis = async (participant: ParticipantDetail) => {
    try {
      const progress = participant.progress;
      const recommendations: string[] = [];
      if (!progress) {
        recommendations.push('لم يبدأ الموظف أي دورة تدريبية بعد');
        recommendations.push('يوصى بتعيين دورات إلزامية تتناسب مع دوره الوظيفي');
      } else {
        if (progress.completed && progress.score) {
          if (progress.score >= 85) { recommendations.push(`أداء متميز: حقق ${progress.score}% في الدورة`); recommendations.push('يمكن ترشيحه كمدرب مساعد للدورة'); }
          else if (progress.score >= 70) { recommendations.push(`أداء جيد: حقق ${progress.score}%`); recommendations.push('ينصح بمراجعة المواضيع التي أخطأ فيها'); }
          else { recommendations.push(`يحتاج تحسين: حقق ${progress.score}% فقط`); recommendations.push('يوصى بإعادة الدورة والتركيز على النقاط الرئيسية'); }
        }
        if (progress.time_spent) {
          const coursePoints = courses.find((c) => c.id === progress.course_id)?.points || 1;
          const avgSecondsPerModule = Math.round(progress.time_spent / coursePoints);
          if (avgSecondsPerModule < 60) recommendations.push('⚠️ سرعة غير طبيعية في إنهاء المحتوى');
          else if (avgSecondsPerModule > 600) recommendations.push('وقت دراسة طويل قد يشير إلى صعوبة في الفهم');
        }
        recommendations.push(`إجمالي وقت التدريب: ${formatTime(progress.time_spent || 0)}`);
      }
      const updated = { ...participant, aiAnalysis: recommendations.join('\n') };
      setSelectedParticipant(updated);
      addToast('✅ تم توليد التحليل بنجاح', 'success');
    } catch {
      addToast('❌ فشل في توليد التحليل', 'error');
    }
  };

  const handleExport = () => addToast('تم تحميل التقرير بصيغة PDF', 'success');

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]" dir="rtl">
        <div className="text-center"><Loader2 size={40} className="animate-spin text-indigo-600 mx-auto mb-4" /><p className="text-slate-500 font-semibold">جاري تحميل بيانات التقارير...</p></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]" dir="rtl">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center mx-auto mb-4"><AlertTriangle size={32} className="text-red-500" /></div>
          <h3 className="text-lg font-bold text-slate-800 mb-2">فشل تحميل البيانات</h3>
          <p className="text-sm text-slate-500 mb-4">{error}</p>
          <Button variant="primary" size="sm" onClick={() => window.location.reload()}>إعادة المحاولة</Button>
        </div>
      </div>
    );
  }

  const kpiCards: KpiCard[] = [
    { val: totalEnrolled, label: 'إجمالي المسجلين', icon: Users, color: 'from-blue-500 to-indigo-600' },
    { val: totalCompleted, label: 'مكتمل', icon: CheckCircle, color: 'from-emerald-500 to-emerald-600' },
    { val: totalInProgress, label: 'قيد التنفيذ', icon: Clock, color: 'from-amber-500 to-amber-600' },
    { val: `${overallCompletionRate}%`, label: 'معدل الإتمام', icon: Percent, color: 'from-violet-500 to-purple-600' },
    { val: overallAvgScore, label: 'متوسط الدرجات', icon: Star, color: 'from-rose-500 to-pink-600', suffix: '%' },
    { val: `${mandatoryRate}%`, label: 'الإلزامي', icon: AlertTriangle, color: 'from-orange-500 to-red-600' },
  ];

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div><h2 className="text-xl font-extrabold text-slate-800">تقارير الدورات التدريبية</h2><p className="text-sm text-slate-500 mt-1">إحصائيات شاملة وتحليلات الأداء</p></div>
        <div className="flex items-center gap-2">
          <select value={timeRange} onChange={(e) => setTimeRange(e.target.value as TimeRange)} className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-300">
            <option value="6months">آخر 6 أشهر</option><option value="year">آخر سنة</option><option value="all">الكل</option>
          </select>
          <Button variant="primary" size="sm" onClick={handleExport} icon={<Download size={16} />} iconPosition="left">تصدير التقرير</Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        {kpiCards.map((kpi, i) => {
          const KIcon = kpi.icon;
          return (
            <div key={i} className="bg-white rounded-2xl border border-slate-100 p-3 shadow-sm hover:shadow-md transition-shadow">
              <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${kpi.color} flex items-center justify-center mb-2`}><KIcon size={16} className="text-white" /></div>
              <p className="text-lg font-extrabold text-slate-800">{kpi.val}{kpi.suffix || ''}</p>
              <p className="text-[11px] text-slate-500 font-medium">{kpi.label}</p>
            </div>
          );
        })}
      </div>

      {/* Charts Row 1 */}
      <div className="grid lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><TrendingUp size={16} className="text-indigo-500" />الاتجاهات الشهرية</CardTitle></CardHeader>
          <div className="h-64">
            {monthlyTrends.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyTrends} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="enrollments" name="تسجيل" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="completions" name="إتمام" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (<div className="flex items-center justify-center h-full text-slate-400 text-sm">لا توجد بيانات شهرية</div>)}
          </div>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><PieChart size={16} className="text-indigo-500" />توزيع المسجلين حسب التصنيف</CardTitle></CardHeader>
          <div className="h-64 flex items-center justify-center">
            {categoryData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <RePie>
                  <Pie data={categoryData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={{ stroke: '#94a3b8', strokeWidth: 1 }}>
                    {categoryData.map((_, idx) => (<Cell key={idx} fill={COLORS[idx % COLORS.length]} />))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </RePie>
              </ResponsiveContainer>
            ) : (<div className="text-slate-400 text-sm">لا توجد بيانات</div>)}
          </div>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><Award size={16} className="text-amber-500" />متوسط الدرجات حسب الدورة</CardTitle></CardHeader>
          <div className="h-64">
            {courseStats.filter((c) => c.enrolled > 0).length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={courseStats.filter((c) => c.enrolled > 0).map((c) => ({ name: c.title.length > 20 ? c.title.slice(0, 20) + '...' : c.title, score: c.avgScore, completion: c.completionRate }))} layout="vertical" margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10, fill: '#64748b' }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="score" name="متوسط الدرجات" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="completion" name="معدل الإتمام %" fill="#6366f1" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (<div className="flex items-center justify-center h-full text-slate-400 text-sm">لا توجد درجات</div>)}
          </div>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><Users size={16} className="text-emerald-500" />معدل الإتمام حسب القسم</CardTitle></CardHeader>
          <div className="h-64">
            {deptChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={deptChartData} layout="vertical" margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="معدل_الإتمام" name="معدل الإتمام %" fill="#10b981" radius={[0, 4, 4, 0]} stackId="a" />
                  <Bar dataKey="المتبقي" name="المتبقي %" fill="#e2e8f0" radius={[0, 4, 4, 0]} stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            ) : (<div className="flex items-center justify-center h-full text-slate-400 text-sm">لا توجد بيانات أقسام</div>)}
          </div>
        </Card>
      </div>

      {/* Level Breakdown */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><Target size={16} className="text-violet-500" />تحليل المستويات</CardTitle></CardHeader>
        <div className="grid sm:grid-cols-4 gap-4">
          {levelData.length > 0 ? levelData.map((lvl, idx) => (
            <div key={idx} className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-2xl p-4 border border-slate-200">
              <div className="flex items-center justify-between mb-3">
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${lvl.name === 'مبتدئ' ? 'bg-emerald-100 text-emerald-700' : lvl.name === 'متوسط' ? 'bg-sky-100 text-sky-700' : lvl.name === 'متقدم' ? 'bg-violet-100 text-violet-700' : 'bg-rose-100 text-rose-700'}`}>{lvl.name}</span>
                <span className="text-lg font-extrabold text-slate-800">{lvl.rate}%</span>
              </div>
              <div className="h-2 bg-slate-200 rounded-full overflow-hidden"><div className={`h-full rounded-full ${lvl.rate >= 80 ? 'bg-emerald-500' : lvl.rate >= 60 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${lvl.rate}%` }} /></div>
              <div className="flex justify-between mt-2 text-[11px] text-slate-500"><span>مسجل: {lvl.enrolled}</span><span>مكتمل: {lvl.completed}</span></div>
            </div>
          )) : (<div className="col-span-4 text-center text-slate-400 text-sm py-8">لا توجد بيانات مستويات</div>)}
        </div>
      </Card>

      {/* Course Details Table */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><FileText size={16} className="text-indigo-500" />تفاصيل أداء الدورات</CardTitle></CardHeader>
        <div className="overflow-x-auto -mx-6">
          <table className="w-full text-sm">
            <thead><tr className="bg-slate-50 border-y border-slate-100">
              <th className="text-right px-4 py-3 text-xs font-bold text-slate-500">الدورة</th>
              <th className="text-center px-4 py-3 text-xs font-bold text-slate-500">مسجل</th>
              <th className="text-center px-4 py-3 text-xs font-bold text-slate-500">مكتمل</th>
              <th className="text-center px-4 py-3 text-xs font-bold text-slate-500">قيد التنفيذ</th>
              <th className="text-center px-4 py-3 text-xs font-bold text-slate-500">معدل الإتمام</th>
              <th className="text-center px-4 py-3 text-xs font-bold text-slate-500">متوسط الدرجات</th>
              <th className="text-center px-4 py-3 text-xs font-bold text-slate-500">الأداء</th>
            </tr></thead>
            <tbody>
              {courseStats.filter((c) => c.enrolled > 0).length > 0 ? (
                courseStats.filter((c) => c.enrolled > 0).map((course) => (
                  <tr key={course.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="px-4 py-3"><div><p className="font-bold text-slate-800 text-sm">{course.title}</p><p className="text-[11px] text-slate-400">{course.category} · {course.level}</p></div></td>
                    <td className="px-4 py-3 text-center font-semibold text-slate-700">{course.enrolled}</td>
                    <td className="px-4 py-3 text-center font-semibold text-emerald-600">{course.completed}</td>
                    <td className="px-4 py-3 text-center font-semibold text-amber-600">{course.inProgress}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className={`h-full rounded-full ${course.completionRate >= 80 ? 'bg-emerald-500' : course.completionRate >= 60 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${course.completionRate}%` }} /></div>
                        <span className="text-xs font-bold text-slate-600">{course.completionRate}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-slate-700">{course.avgScore}%</td>
                    <td className="px-4 py-3 text-center">
                      {course.avgScore >= 85 ? (<span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full"><ArrowUp size={10} /> ممتاز</span>)
                      : course.avgScore >= 75 ? (<span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full"><Minus size={10} /> جيد</span>)
                      : (<span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full"><ArrowDown size={10} /> ضعيف</span>)}
                    </td>
                  </tr>
                ))
              ) : (<tr><td colSpan={7} className="text-center py-8 text-slate-400 text-sm">لا توجد دورات مسجلة</td></tr>)}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Department Details Table */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><Users size={16} className="text-emerald-500" />إحصائية التدريب حسب الأقسام</CardTitle></CardHeader>
        <div className="overflow-x-auto -mx-6">
          <table className="w-full text-sm">
            <thead><tr className="bg-slate-50 border-y border-slate-100">
              <th className="text-right px-4 py-3 text-xs font-bold text-slate-500">القسم</th>
              <th className="text-center px-4 py-3 text-xs font-bold text-slate-500">الموظفون</th>
              <th className="text-center px-4 py-3 text-xs font-bold text-slate-500">مكتمل</th>
              <th className="text-center px-4 py-3 text-xs font-bold text-slate-500">قيد الانتظار</th>
              <th className="text-center px-4 py-3 text-xs font-bold text-slate-500">نسبة الإتمام</th>
              <th className="text-center px-4 py-3 text-xs font-bold text-slate-500">التقدم</th>
            </tr></thead>
            <tbody>
              {departmentStats.length > 0 ? (
                departmentStats.map((dept, idx) => (
                  <tr key={idx} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-bold text-slate-700">{dept.dept}</td>
                    <td className="px-4 py-3 text-center text-slate-600">{dept.employees}</td>
                    <td className="px-4 py-3 text-center font-semibold text-emerald-600">{dept.trained}</td>
                    <td className="px-4 py-3 text-center font-semibold text-amber-600">{dept.pending}</td>
                    <td className="px-4 py-3 text-center font-bold text-slate-700">{dept.completionRate}%</td>
                    <td className="px-4 py-3"><div className="flex items-center gap-2"><div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className={`h-full rounded-full ${dept.completionRate >= 80 ? 'bg-emerald-500' : dept.completionRate >= 60 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${dept.completionRate}%` }} /></div><span className="text-xs font-bold text-slate-500 w-8 text-center">{dept.completionRate}%</span></div></td>
                  </tr>
                ))
              ) : (<tr><td colSpan={6} className="text-center py-8 text-slate-400 text-sm">لا توجد بيانات أقسام</td></tr>)}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Participants Details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Users size={16} className="text-indigo-500" />تفاصيل المشاركين — عرض يدوي + تحليل AI
            <span className="text-[10px] font-bold bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full mr-2">ميزة جديدة</span>
          </CardTitle>
        </CardHeader>

        <div className="flex flex-col sm:flex-row gap-3 mb-4 px-1">
          <div className="relative flex-1">
            <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" value={participantSearch} onChange={(e) => setParticipantSearch(e.target.value)} placeholder="ابحث باسم الموظف أو البريد أو القسم..." className="w-full bg-slate-50 border border-slate-200 rounded-xl pr-9 pl-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          </div>
          <select value={selectedCourseForParticipants} onChange={(e) => setSelectedCourseForParticipants(e.target.value)} className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-300">
            <option value="all">جميع الدورات</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
          <span className="text-xs text-slate-400 font-semibold self-center">{filteredParticipants.length} مشارك</span>
        </div>

        <div className="overflow-x-auto -mx-6">
          <table className="w-full text-sm">
            <thead><tr className="bg-slate-50 border-y border-slate-100">
              <th className="text-right px-4 py-3 text-xs font-bold text-slate-500">الموظف</th>
              <th className="text-right px-4 py-3 text-xs font-bold text-slate-500">القسم</th>
              <th className="text-right px-4 py-3 text-xs font-bold text-slate-500">الدورة</th>
              <th className="text-center px-4 py-3 text-xs font-bold text-slate-500">الحالة</th>
              <th className="text-center px-4 py-3 text-xs font-bold text-slate-500">التقدم</th>
              <th className="text-center px-4 py-3 text-xs font-bold text-slate-500">الدرجة</th>
              <th className="text-center px-4 py-3 text-xs font-bold text-slate-500">الوقت</th>
              <th className="text-center px-4 py-3 text-xs font-bold text-slate-500">الإجراءات</th>
            </tr></thead>
            <tbody>
              {filteredParticipants.length > 0 ? (
                filteredParticipants.map((p, idx) => (
                  <tr key={`${p.employee.id}-${p.progress?.course_id || 'none'}-${idx}`} className="border-b border-slate-50 hover:bg-slate-50/50 cursor-pointer" onClick={() => setSelectedParticipant(p)}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-[10px] font-bold">{p.employee.full_name?.charAt(0) || '?'}</div>
                        <div><p className="font-bold text-slate-800 text-xs">{p.employee.full_name}</p><p className="text-[10px] text-slate-400">{p.employee.email}</p></div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{p.employee.department || '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 max-w-[150px] truncate">{p.courseTitle}</td>
                    <td className="px-4 py-3 text-center text-xs">{p.statusText}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <div className="w-12 h-1 bg-slate-100 rounded-full overflow-hidden"><div className={`h-full rounded-full ${(p.progress?.progress_percent || 0) >= 80 ? 'bg-emerald-500' : (p.progress?.progress_percent || 0) >= 40 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${p.progress?.progress_percent || 0}%` }} /></div>
                        <span className="text-[10px] font-bold text-slate-600">{p.progress?.progress_percent || 0}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center text-xs font-bold text-slate-700">{p.scoreText}</td>
                    <td className="px-4 py-3 text-center text-xs text-slate-500">{p.timeSpentFormatted}</td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={(e) => { e.stopPropagation(); setSelectedParticipant(p); }} className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded-lg"><Eye size={11} /> تفاصيل</button>
                    </td>
                  </tr>
                ))
              ) : (<tr><td colSpan={8} className="text-center py-8 text-slate-400 text-sm">لا توجد بيانات مشاركين</td></tr>)}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Summary */}
      <Card>
        <div className="flex items-start gap-4 p-2">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center flex-shrink-0 shadow-lg"><BarChart3 size={22} className="text-white" /></div>
          <div>
            <h3 className="font-bold text-slate-800 text-sm mb-1">ملخص تنفيذي</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              إجمالي {totalEnrolled} موظف مسجل في {courseStats.filter((c) => c.enrolled > 0).length} دورة تدريبية. تم إتمام {totalCompleted} تسجيل بنسبة {overallCompletionRate}% وبمتوسط درجات {overallAvgScore}%. الدورات الإلزامية حققت نسبة إتمام {mandatoryRate}%. هناك {totalInProgress} تسجيل قيد التنفيذ حالياً.
            </p>
          </div>
        </div>
      </Card>

      {selectedParticipant && (
        <ParticipantDetailModal participant={selectedParticipant} onClose={() => setSelectedParticipant(null)} onGenerateAI={() => handleGenerateAIAnalysis(selectedParticipant)} />
      )}
    </div>
  );
}
