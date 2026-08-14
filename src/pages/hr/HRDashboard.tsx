import { useState, useEffect } from 'react';
import {
  AlertCircle, CheckCircle, Clock, ArrowUp, ArrowDown,
  Users, Star, Activity, FileText, Monitor, Calendar,
  Loader, TrendingUp, Heart, Zap, RefreshCw, ChevronLeft,
  Bell, Shield, BarChart2
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useUIStore } from '../../core/stores';
import { incidentService } from '../../services/sdk/IncidentService';
import { reviewService } from '../../services/sdk/ReviewService';
import { hrDashboardService } from '../../services/sdk/HrDashboardService';
import type {
  HrDepartmentStat, HrMonthlyPoint, HrWellnessPoint,
} from '../../services/sdk/HrDashboardService';
import Card, { CardHeader, CardTitle } from '../../shared/components/ui/Card';
import Badge from '../../shared/components/ui/Badge';
import Button from '../../shared/components/ui/Button';
import HrApprovalInbox from '../../shared/components/dashboard/HrApprovalInbox';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
  AreaChart, Area, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, Legend
} from 'recharts';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

const MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

// ── مؤشر دائري ──────────────────────────────────────────────
function CircleGauge({ value, color, size = 80 }: { value: number; color: string; size?: number }) {
  const r = (size - 12) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (value / 100) * circ;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#f1f5f9" strokeWidth={8} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={8}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 1s ease' }} />
    </svg>
  );
}

// ── بطاقة مؤشر ──────────────────────────────────────────────
interface KPICardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  color: string;
  bg: string;
  trend?: string;
  trendUp?: boolean;
  suffix?: string;
}

function KPICard({ label, value, icon: Icon, color, bg, trend, trendUp, suffix = '' }: KPICardProps) {
  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm relative overflow-hidden">
      <div className="absolute top-0 left-0 w-20 h-20 rounded-br-[60px] opacity-10" style={{ background: color }} />
      <div className="flex items-start justify-between mb-3 relative z-10">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm" style={{ background: bg }}>
          <Icon size={18} color={color} />
        </div>
        {trend && (
          <Badge variant={trendUp ? 'success' : 'danger'} size="sm" className="font-bold flex items-center gap-1">
            {trendUp ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
            <span>{trend}</span>
          </Badge>
        )}
      </div>
      <p className="text-3xl font-extrabold text-slate-900 leading-none relative z-10">
        {value}{suffix}
      </p>
      <p className="text-xs text-slate-500 mt-2 relative z-10">{label}</p>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
//  أنواع بيانات اللوحة
//
//  ★ المرحلة 1: كانت ثماني مصفوفات معلَنة `[] as any[]` — أكبر تجمّع
//    لـ`as any` في البوابتين. كل بنية أدناه مُستخرَجة من الكود الذي
//    يبنيها ومن الحقول التي تقرؤها الواجهة فعلاً، لا من تخمين.
// ════════════════════════════════════════════════════════════════

/**
 * نقطة في الرسم الشهري.
 *
 * ★★★ 0345: كانت تُبنى في المتصفح بـ`getMonth()` وحده — يُهمل السنة،
 *   فبلاغ مارس 2024 يُحتسب ضمن مارس 2026. صارت تُحسب في القاعدة
 *   بحدود زمنية حقيقية، و`label` يُشتقّ من (سنة، شهر) معاً.
 */
interface MonthlyTrendPoint extends Omit<HrMonthlyPoint, 'month'> {
  /** تسمية العرض — تشمل السنة حين يعبر النطاق حدّها */
  month: string;
  monthNum: number;
}

/** فئة بلاغات مع نسبتها */
interface CategorySlice {
  category: string; count: number; percentage: number;
}

/** مستوى خطورة مع لونه */
interface SeveritySlice {
  severity: string; count: number; color: string;
}

/**
 * إحصاءات قسم.
 *
 * ★★★ 0345: كانت تُجمَّع في المتصفح بعمودين غير موجودين
 *   (`w.mood_score` ⇒ NaN) ومعرّف من جدول آخر (`reported_by` هو
 *   `profiles.id` لا `employees.id` ⇒ صفر بلاغات لكل قسم).
 *   الوسيطان `wellnessTotal/Count` لم يعودا لازمين — القاعدة تُعيد
 *   المتوسط جاهزاً محسوباً على **الموظفين** لا الإدخالات.
 */
interface DepartmentStat extends HrDepartmentStat {
  fullMark: number;
}

/**
 * نقطة في اتجاه الصحة النفسية (7 أيام).
 *
 * ★★ `score` قد يكون `null` = «لا بيانات». الصفحة كانت تكتب صفراً
 *   فتُظهر عطلة نهاية الأسبوع كانهيار نفسي في الرسم.
 */
interface WellnessPoint extends HrWellnessPoint { day: string; }

/** بلاغ حديث مُثرًى بمُبلِّغه */
interface RecentIncident {
  id: string;
  title?: string;
  status?: string;
  severity?: string;
  created_at?: string;
  reported_by?: string;
  reporter?: { full_name?: string; full_name_ar?: string } | undefined;
}

/** مراجعة عميل حديثة */
interface RecentReview {
  customer_name?: string;
  product_name?: string;
  review_text?: string;
  rating: number;
}

export default function HRDashboard() {
  const navigate = useNavigate();
  const { addToast } = useUIStore();
  const [loading,   setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview'|'problems'|'wellness'>('overview');

  const [data, setData] = useState({
    totalEmployees:    0,
    activeEmployees:   0,
    wellnessScore:     0,
    /** ★ عدد الإدخالات خلف المتوسط — رقمٌ بلا سياق يُضلّل */
    wellnessSamples:   0,
    resolvedThisMonth: 0,
    pending:           0,
    inProgress:        0,
    /** ★★ الحرجة **المفتوحة** لا كل الحرجة (مؤشّر إنذار لا عدّاد) */
    criticalOpen:      0,
    /**
     * ★★★ بديل `escalated`: قيد CHECK على incidents.status يسمح بـ
     *   pending·in_progress·resolved·closed فقط، فبطاقة «مُصعَّدة»
     *   كانت تعرض صفراً إلى الأبد. «غير مُسنَدة» حالة حقيقية.
     */
    unassigned:        0,
    monthlyTrend:      [] as MonthlyTrendPoint[],
    categoryBreakdown: [] as CategorySlice[],
    departmentStats:   [] as DepartmentStat[],
    severityBreakdown: [] as SeveritySlice[],
    wellnessTrend:     [] as WellnessPoint[],
    recentIncidents:   [] as RecentIncident[],
    topDepartments:    [] as DepartmentStat[],
    recentReviews:     [] as RecentReview[],
  });

  const fetchData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      /**
       * ★★★ 0345: كانت اللوحة تجلب **كل** موظفي الشركة وكل بلاغاتها
       *   وكل إدخالات العافية إلى المتصفح ثم تُجمّعها هناك — بأعمدة
       *   خاطئة أنتجت أصفاراً وNaN. الآن أربعة استدعاءات محسوبة في
       *   القاعدة، والأعمدة مُتحقَّق منها عند تطبيق المايجريشن.
       */
      const [sum, depts, monthly, wellness, incs, reviews] = await Promise.all([
        hrDashboardService.summary(),
        hrDashboardService.departments(20),
        hrDashboardService.monthlyTrend(6),
        hrDashboardService.wellnessTrend(7),
        // البلاغات الحديثة للعرض فقط — بحدّ صريح لا جلب كامل
        // ★★★★ عطلٌ بلّغ عنه المستخدم (2026-08-08):
        //   TypeError: incList.forEach is not a function
        //   `hrInbox()` تُعيد صفحةً `{ rows, total }` لا مصفوفة، والفحصُ
        //   الشرطيّ `incidentService.hrInbox ? …` كان يفحص **وجود الدالة**
        //   لا شكلَ ناتجها، فمرّ الكائنُ إلى `incList.forEach` فانفجرت
        //   اللوحة كاملةً. نستخرج `rows` صراحةً.
        incidentService.hrInbox({ limit: 5 }).then((p) => p.rows),
        reviewService.findLatest(5).catch(() => []),
      ]);

      // ── الاتجاه الشهري: التسمية من (سنة، شهر) معاً ──
      const spansYears = monthly.some((x) => x.year !== monthly[0]?.year);
      const monthlyTrend: MonthlyTrendPoint[] = monthly.map((m) => ({
        year: m.year,
        monthNum: m.month,
        problems: m.problems,
        resolved: m.resolved,
        critical: m.critical,
        // ★ نُظهر السنة حين يعبر النطاق حدّها — «يناير» مرّتين في رسم
        //   واحد بلا تمييز يُربك القارئ.
        month: spansYears
          ? `${MONTHS[m.month - 1]} ${String(m.year).slice(2)}`
          : MONTHS[m.month - 1],
      }));

      // ── الأقسام ──
      const departmentStats: DepartmentStat[] = depts.map((d) => ({
        ...d, fullMark: 100,
      }));

      // ── اتجاه العافية ──
      const wellnessTrend: WellnessPoint[] = wellness.map((w) => ({
        ...w,
        day: format(new Date(w.date), 'EEE', { locale: ar }),
      }));

      // ── التوزيع بالفئات وبالخطورة (من البلاغات المعروضة) ──
      // ★ `incs` مصفوفةٌ الآن يقيناً — لكنّ الحارس يبقى: أيُّ تغييرٍ
      //   لاحقٍ في شكل الناتج يُعطي قائمةً فارغةً لا انهياراً.
      const incList: RecentIncident[] = Array.isArray(incs)
        ? (incs as RecentIncident[])
        : [];
      const catLabels: Record<string, string> = {
        technical: 'تقني', hr: 'موارد بشرية', management: 'إدارة',
        workplace: 'بيئة عمل', salary: 'رواتب', safety: 'سلامة', other: 'أخرى',
      };
      const catMap: Record<string, number> = {};
      incList.forEach((i) => {
        const c = (i as { category?: string }).category || 'other';
        catMap[c] = (catMap[c] || 0) + 1;
      });
      const categoryBreakdown: CategorySlice[] = Object.entries(catMap)
        .map(([cat, count]) => ({
          category: catLabels[cat] || cat,
          count,
          percentage: Math.round((count / (incList.length || 1)) * 100),
        }))
        .sort((a, b) => b.count - a.count);

      const sevMap = { critical: 0, high: 0, medium: 0, low: 0 };
      incList.forEach((i) => {
        const sv = i.severity as keyof typeof sevMap | undefined;
        if (sv && sevMap[sv] !== undefined) sevMap[sv]++;
      });
      const severityBreakdown: SeveritySlice[] = [
        { severity: 'حرج',   count: sevMap.critical, color: '#ef4444' },
        { severity: 'عالٍ',  count: sevMap.high,     color: '#f97316' },
        { severity: 'متوسط', count: sevMap.medium,   color: '#f59e0b' },
        { severity: 'منخفض', count: sevMap.low,      color: '#10b981' },
      ];

      setData({
        totalEmployees:  sum.totalEmployees,
        // ★★★ is_active لا status — كان صفراً دائماً
        activeEmployees: sum.activeEmployees,
        // ★★★ wellness_entries.score لا mood_score — كان NaN
        wellnessScore:   sum.wellnessScore,
        wellnessSamples: sum.wellnessSamples,
        resolvedThisMonth: sum.resolvedThisMonth,
        pending:      sum.pending,
        inProgress:   sum.inProgress,
        criticalOpen: sum.criticalOpen,
        // ★★★ بديل بطاقة 'escalated' التي يمنعها قيد CHECK
        unassigned:   sum.unassigned,
        monthlyTrend,
        categoryBreakdown,
        departmentStats,
        severityBreakdown,
        wellnessTrend,
        recentIncidents: incList.slice(0, 5),
        topDepartments: [...departmentStats]
          .filter((d) => d.wellnessCount > 0)
          .sort((a, b) => b.wellnessAvg - a.wellnessAvg)
          .slice(0, 5),
        recentReviews: (reviews || []) as RecentReview[],
      });
    } catch (err) {
      console.error('فشل تحميل لوحة الموارد:', err);
      addToast('تعذّر تحميل لوحة الموارد البشرية', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <div className="w-11 h-11 border-4 border-slate-200 border-t-emerald-500 rounded-full animate-spin" />
      <p className="text-slate-500 font-medium font-['Tajawal',sans-serif]">جاري تحميل لوحة الموارد البشرية...</p>
    </div>
  );

  const tabs = [
    { id: 'overview',  label: 'نظرة عامة',    icon: BarChart2 },
    { id: 'problems',  label: 'المشاكل',       icon: AlertCircle },
    { id: 'wellness',  label: 'الصحة النفسية', icon: Heart },
  ] as const;

  return (
    <div className="space-y-5 sm:space-y-6 animate-fade-in" dir="rtl">

      {/* ── البانر الرئيسي ── */}
      <div className="bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-600 rounded-2xl sm:rounded-3xl p-5 sm:p-6 relative overflow-hidden">
        <div className="absolute -top-10 -left-10 w-48 h-48 rounded-full bg-white/5" />
        <div className="absolute -bottom-16 right-[10%] w-64 h-64 rounded-full bg-white/5" />
        <div className="relative z-10">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <p className="text-white/70 text-sm font-medium">لوحة الموارد البشرية</p>
              <h2 className="text-white text-2xl sm:text-3xl font-extrabold mt-1 mb-2">نظرة عامة على المؤسسة</h2>
              <p className="text-white/60 text-xs sm:text-sm">
                آخر تحديث: {format(new Date(), 'HH:mm · d MMMM', { locale: ar })}
              </p>
            </div>
            <button onClick={() => fetchData(true)}
              className="flex items-center justify-center gap-2 bg-white/15 border border-white/20 rounded-xl px-4 py-2.5 text-white text-sm font-bold hover:bg-white/25 transition-all w-full sm:w-auto"
            >
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
              تحديث البيانات
            </button>
          </div>

          {/* مؤشرات البانر */}
          <div className="grid grid-cols-2 lg:flex lg:flex-wrap gap-3 mt-6">
            {[
              { label: 'إجمالي الموظفين',  value: data.totalEmployees,   suffix: '' },
              { label: 'الموظفون النشطون', value: data.activeEmployees,  suffix: '' },
              { label: 'صحة المؤسسة',      value: data.wellnessScore,    suffix: '%' },
              /* ★★★ 0345: كانت «معدل الرضا 85%» — ثابت مكتوب يدوياً
                 يُعرض كأنه مؤشّر مُقاس، بلا أي مصدر. استُبدل بعدد
                 العيّنات خلف متوسط العافية: رقمٌ حقيقي يمنح المتوسط
                 سياقه (82 من 3 عيّنات ≠ 82 من 300). */
              { label: 'عيّنات القياس',     value: data.wellnessSamples,  suffix: '' },
            ].map(({ label, value, suffix }, i) => (
              <div key={i} className="bg-white/10 rounded-xl p-3 sm:p-4 border border-white/15 backdrop-blur-sm flex-1 min-w-[120px]">
                <p className="text-white/70 text-xs sm:text-sm font-medium mb-1">{label}</p>
                <p className="text-white text-2xl sm:text-3xl font-extrabold leading-none">
                  {value}{suffix}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* سلسلة موافقات الإجازات/الأذونات (للمدير المباشر) */}
      <HrApprovalInbox />

      {/* ── الإجراءات السريعة ── */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'فريق العمل',    icon: Users,     color: 'from-blue-500 to-indigo-600',   path: '/app/hr/team' },
          { label: 'التحليلات',     icon: Activity,  color: 'from-purple-500 to-violet-600', path: '/app/hr/analytics' },
          { label: 'التقارير',      icon: FileText,  color: 'from-emerald-500 to-teal-600',  path: '/app/hr/reports' },
          { label: 'سجل الحضور',   icon: Calendar,  color: 'from-amber-500 to-orange-600',  path: '/app/hr/attendance' },
        ].map(({ label, icon: Icon, color, path }, i) => (
          <button key={i} onClick={() => navigate(path)}
            className="bg-white border border-slate-100 rounded-2xl p-3 sm:p-4 flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-3 card-hover w-full transition-all">
            <div className={`bg-gradient-to-br ${color} w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-md`}>
              <Icon size={17} color="white" />
            </div>
            <span className="text-xs sm:text-sm font-bold text-slate-700">{label}</span>
          </button>
        ))}
      </div>

      {/* ── تبويبات ── */}
      <div className="flex gap-2 bg-slate-50 border border-slate-100 rounded-2xl p-1.5 overflow-x-auto hide-scrollbar">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className={`flex-1 min-w-[120px] flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all duration-200 ${
              activeTab === id ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
            }`}>
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {/* ══ تبويب: نظرة عامة ══ */}
      {activeTab === 'overview' && (
        <div className="space-y-5 sm:space-y-6 animate-fade-in">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {/* ★★★ 0345: الاتجاهات "+2"·"-1"·"+5"·"-2" كانت **ثوابت
                مكتوبة يدوياً** تُعرض كأنها تغيّر مُقاس عن فترة سابقة.
                أُزيلت: مؤشّر كاذب أسوأ من غياب المؤشّر. */}
            <KPICard label="في الانتظار"     value={data.pending}           icon={Clock}       color="#f59e0b" bg="#fef3c7" />
            <KPICard label="قيد المعالجة"     value={data.inProgress}        icon={Activity}    color="#6366f1" bg="#eef2ff" />
            <KPICard label="حُلّت هذا الشهر"  value={data.resolvedThisMonth} icon={CheckCircle} color="#10b981" bg="#d1fae5" />
            {/* ★★ الحرجة **المفتوحة**: عدّ المُغلقة ضمن إنذار يجعل
                الرقم يرتفع أبداً ولا ينخفض مهما عولجت. */}
            <KPICard label="حرجة مفتوحة"      value={data.criticalOpen}      icon={AlertCircle} color="#ef4444" bg="#fee2e2" />
            {/* ★★★ كانت «مُصعَّدة لـ HR» تعدّ status==='escalated' —
                قيمة يمنعها قيد CHECK ⇒ صفر إلى الأبد. */}
            <KPICard label="بلا مُسنَد"        value={data.unassigned}        icon={TrendingUp}  color="#8b5cf6" bg="#ede9fe" />
          </div>

          {/* الرسوم البيانية */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* الاتجاه الشهري */}
            <Card>
              <CardHeader>
                <CardTitle>📈 الاتجاه الشهري للمشاكل</CardTitle>
                <Badge variant="info" dot>6 أشهر</Badge>
              </CardHeader>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.monthlyTrend}>
                    <defs>
                      <linearGradient id="gProblems" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gResolved" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#10b981" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: '#1e293b', border: 'none', borderRadius: '10px', color: 'white', fontSize: '12px' }} />
                    <Area type="monotone" dataKey="problems" stroke="#6366f1" strokeWidth={2} fill="url(#gProblems)" name="مرفوعة" />
                    <Area type="monotone" dataKey="resolved" stroke="#10b981" strokeWidth={2} fill="url(#gResolved)" name="محلولة" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="flex gap-4 mt-2 justify-center">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-sm bg-indigo-500" />
                  <span className="text-xs text-slate-500 font-medium">مرفوعة</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
                  <span className="text-xs text-slate-500 font-medium">محلولة</span>
                </div>
              </div>
            </Card>

            {/* توزيع الفئات */}
            <Card>
              <CardHeader><CardTitle>🗂️ توزيع المشاكل بالفئات</CardTitle></CardHeader>
              <div className="flex flex-col sm:flex-row items-center gap-6 mt-4">
                <div className="w-32 h-32 sm:w-40 sm:h-40 flex-shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={data.categoryBreakdown} cx="50%" cy="50%" innerRadius={35} outerRadius={58} dataKey="count" paddingAngle={3}>
                        {data.categoryBreakdown.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v, _, p) => [v, p.payload.category]} contentStyle={{ background: '#1e293b', border: 'none', borderRadius: '10px', color: 'white', fontSize: '12px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 w-full flex flex-col gap-2.5">
                  {data.categoryBreakdown.slice(0, 5).map((cat, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="text-xs font-semibold text-slate-600 flex-1 truncate">{cat.category}</span>
                      <div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div style={{ height: '100%', width: `${cat.percentage}%`, background: COLORS[i % COLORS.length], borderRadius: '3px' }} />
                      </div>
                      <span className="text-xs font-bold text-slate-800 w-8 text-left">{cat.percentage}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>

          {/* توزيع الخطورة */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {data.severityBreakdown.map((item, i) => (
              <div key={i} className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm text-center flex flex-col items-center border-t-4" style={{ borderTopColor: item.color }}>
                <div className="relative inline-block mb-2">
                  <CircleGauge value={data.totalEmployees > 0 ? Math.round((item.count / (data.totalEmployees || 1)) * 100) : 0} color={item.color} size={64} />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-lg font-extrabold text-slate-900">{item.count}</span>
                  </div>
                </div>
                <p className="text-xs text-slate-500 font-semibold">{item.severity}</p>
              </div>
            ))}
          </div>

          {/* أحدث مراجعات العملاء */}
          <Card className="mt-5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Star size={18} className="text-amber-500" /> أحدث مراجعات العملاء</CardTitle>
              <Button size="xs" variant="outline" onClick={() => navigate('/app/hr/movement-analysis')}>سجل المراجعات الكامل</Button>
            </CardHeader>
            <div className="flex flex-col gap-2.5 mt-4">
              {data.recentReviews.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <Star size={32} className="mx-auto mb-2 opacity-40" />
                  <p className="text-sm">لا توجد مراجعات حتى الآن</p>
                </div>
              ) : data.recentReviews.map((rev, i) => (
                <div key={i} className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 sm:p-4 bg-slate-50 hover:bg-slate-100 rounded-2xl transition-colors border border-slate-100">
                  <div className="flex-1 min-w-0">
                     <p className="font-bold text-sm text-slate-800">{rev.customer_name} <span className="text-xs text-slate-500 font-normal mx-1">• {rev.product_name}</span></p>
                     <p className="text-sm text-slate-600 mt-1 truncate">{rev.review_text}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 bg-white px-3 py-1.5 rounded-full shadow-sm">
                    {[1, 2, 3, 4, 5].map(s => <Star key={s} style={s <= rev.rating ? { fill: '#fbbf24' } : {}} size={12} className={s <= rev.rating ? 'text-amber-400' : 'text-slate-200'} />)}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* ══ تبويب: المشاكل ══ */}
      {activeTab === 'problems' && (
        <div className="space-y-5 sm:space-y-6 animate-fade-in">
          {/* رسم بياني أعمدة */}
          <Card>
            <CardHeader>
              <CardTitle>📊 مشاكل الأشهر الستة</CardTitle>
              <Button size="xs" variant="ghost" onClick={() => navigate('/app/hr/problems')}>عرض الكل</Button>
            </CardHeader>
            <div className="h-60 sm:h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.monthlyTrend} barSize={14}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: '#1e293b', border: 'none', borderRadius: '10px', color: 'white', fontSize: '12px' }} />
                  <Legend iconType="circle" iconSize={8} />
                  <Bar dataKey="problems" fill="#6366f1" radius={[4,4,0,0]} name="مرفوعة" />
                  <Bar dataKey="resolved" fill="#10b981" radius={[4,4,0,0]} name="محلولة" />
                  <Bar dataKey="critical" fill="#ef4444" radius={[4,4,0,0]} name="حرجة" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* آخر الحوادث */}
          <Card>
            <CardHeader>
              <CardTitle>🗂️ آخر الحوادث المرفوعة</CardTitle>
              <Button size="xs" variant="outline" onClick={() => navigate('/app/hr/problems')}>عرض الكل</Button>
            </CardHeader>
            <div className="flex flex-col gap-2.5">
              {data.recentIncidents.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <AlertCircle size={32} className="mx-auto mb-2 opacity-40" />
                  <p className="text-sm">لا توجد حوادث</p>
                </div>
              ) : data.recentIncidents.map((inc, i) => (
                <div key={i} onClick={() => navigate(`/app/hr/problems/${inc.id}`)}
                  className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 sm:p-4 bg-slate-50 hover:bg-slate-100 rounded-2xl cursor-pointer transition-colors group">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      inc.severity === 'critical' ? 'bg-red-100' : inc.severity === 'high' ? 'bg-orange-100' : 'bg-amber-100'
                    }`}>
                      <AlertCircle size={18} className={inc.severity === 'critical' ? 'text-red-500' : inc.severity === 'high' ? 'text-orange-500' : 'text-amber-500'} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm text-slate-800 truncate group-hover:text-indigo-600 transition-colors">
                        {inc.title}
                      </p>
                      <p className="text-xs text-slate-500 mt-1 truncate">
                        {inc.reporter?.full_name || inc.reporter?.full_name_ar || 'مجهول'} · {inc.created_at ? format(new Date(inc.created_at), 'dd MMM', { locale: ar }) : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 self-end sm:self-auto flex-shrink-0">
                    <span style={{
                      padding: '4px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 600,
                      background: inc.status === 'resolved' ? '#d1fae5' : inc.status === 'in_progress' ? '#dbeafe' : '#fef3c7',
                      color:      inc.status === 'resolved' ? '#065f46' : inc.status === 'in_progress' ? '#1e40af' : '#92400e',
                    }}>
                      {inc.status === 'pending' ? 'في الانتظار' : inc.status === 'in_progress' ? 'قيد المعالجة' : inc.status === 'resolved' ? 'محلولة' : 'مغلقة'}
                    </span>
                    <ChevronLeft size={16} className="text-slate-400 group-hover:text-indigo-500 transition-colors" />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* ══ تبويب: الصحة النفسية ══ */}
      {activeTab === 'wellness' && (
        <div className="space-y-5 sm:space-y-6 animate-fade-in">
          {/* مؤشر الصحة الكلي */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <Card className="lg:col-span-1">
              <CardTitle className="text-center sm:text-right">💚 مؤشر صحة المؤسسة</CardTitle>
              <div className="flex flex-col items-center mt-6">
                <div className="relative mb-4">
                  <CircleGauge value={data.wellnessScore} color={data.wellnessScore >= 75 ? '#10b981' : data.wellnessScore >= 50 ? '#f59e0b' : '#ef4444'} size={120} />
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-3xl font-extrabold text-slate-900">{data.wellnessScore}</span>
                    <span className="text-xs text-slate-500 font-bold">/ 100</span>
                  </div>
                </div>
                <Badge variant={data.wellnessScore >= 75 ? 'success' : data.wellnessScore >= 50 ? 'warning' : 'danger'} className="text-sm font-bold px-4 py-1.5">
                  {data.wellnessScore >= 75 ? 'ممتاز 🌟' : data.wellnessScore >= 50 ? 'متوسط ⚠️' : 'يحتاج تدخل 🆘'}
                </Badge>
              </div>
            </Card>

            {/* اتجاه الصحة 7 أيام */}
            <Card className="lg:col-span-2">
              <CardHeader><CardTitle>📅 اتجاه الصحة النفسية (7 أيام)</CardTitle></CardHeader>
              <div className="h-44 sm:h-52 w-full mt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.wellnessTrend}>
                    <defs>
                      <linearGradient id="gWell" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#10b981" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: '#1e293b', border: 'none', borderRadius: '10px', color: 'white', fontSize: '12px' }} />
                    <Area type="monotone" dataKey="score" stroke="#10b981" strokeWidth={2.5} fill="url(#gWell)" name="المؤشر" dot={{ fill: '#10b981', r: 4 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          {/* صحة الأقسام */}
          <Card>
            <CardHeader>
              <CardTitle>🏢 صحة الأقسام</CardTitle>
              <Button size="xs" variant="ghost" onClick={() => navigate('/app/hr/analytics')}>التفاصيل</Button>
            </CardHeader>
            <div className="flex flex-col gap-3">
              {data.departmentStats.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-sm">لا توجد بيانات للأقسام بعد</div>
              ) : data.departmentStats.map((dept, i) => (
                <div key={i} className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 bg-slate-50 rounded-2xl">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center font-bold text-indigo-700 flex-shrink-0">
                    {dept.name?.charAt(0)}
                  </div>
                  <div className="flex-1 w-full">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm font-bold text-slate-800">{dept.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500">{dept.employeeCount} موظف</span>
                        <Badge variant={dept.wellnessAvg >= 75 ? 'success' : dept.wellnessAvg >= 50 ? 'warning' : 'danger'} size="sm" className="font-bold">
                          {dept.wellnessAvg}%
                        </Badge>
                      </div>
                    </div>
                    <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                      <div style={{
                        height: '100%', borderRadius: '99px',
                        width: `${dept.wellnessAvg}%`,
                        background: dept.wellnessAvg >= 75 ? '#10b981' : dept.wellnessAvg >= 50 ? '#f59e0b' : '#ef4444',
                        transition: 'width 1s ease',
                      }} />
                    </div>
                  </div>
                  </div>
                  <span className="text-xs text-slate-500 flex-shrink-0 self-end sm:self-auto">{dept.problemCount} مشكلة مرفوعة</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}