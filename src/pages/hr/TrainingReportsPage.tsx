/**
 * ════════════════════════════════════════════════════════════════
 *  TrainingReportsPage — تقارير التدريب (بوابة الموارد البشرية)
 *
 *  ★★★ أُعيدت كتابتها في جولة 0351. الأعطال المُصلَحة — كلها مُثبتة
 *  تشغيلياً على Postgres محلي قبل أي سطر كُتب هنا:
 *
 *  ① **خمسة أعمدة وهمية** تُقرأ في كل حساب:
 *       progress_percent · score · time_spent · last_access_at
 *       · courses.active
 *     الموجود فعلاً: `progress NUMERIC` و`courses.status`.
 *     مُقاس (موظفان بـ 100 و45): المتوسط الحقيقي 72.5 والصفحة تعرض 0%
 *     لكل مشارك — ومن أتمّ الدورة يظهر عند الصفر بشريط أحمر.
 *     و«الدورات النشطة» صفر أبداً لأن `active` معدوم.
 *  ② `handleExport` يقول «تم تحميل التقرير بصيغة PDF» ولا يُولّد ملفاً.
 *  ③ `timeRange` يُضبَط ولا يُقرأ — مُرشِّح زينة.
 *  ④ `toggleActive` يكتب `active` المعدوم ⇒ يفشل دائماً.
 *  ⑤ `deleteCourse` حذف نهائي يمحو سجلّات التقدّم بـCASCADE.
 *  ⑥ «تحليل AI» سلسلة `if` على أعمدة معدومة ⇒ كل الفروع تسقط.
 *  ⑦ عدّ الأقسام بنصّ حرّ، والقسم بلا موظفين يختفي.
 *
 *  ★ الصفحة لا تلمس Supabase — كل شيء عبر `trainingReportsService`.
 *  ★ ومن لم يلتحق بأي دورة يظهر في التقرير — وهو أهمّ ما فيه.
 * ════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Download, Users, TrendingUp, CheckCircle, Clock, AlertTriangle,
  Percent, PieChart, Search, Loader2, X, BookOpen, Archive, RefreshCw, Award,} from 'lucide-react';
import Card, { CardHeader, CardTitle } from '../../shared/components/ui/Card';
import Button from '../../shared/components/ui/Button';
import Badge from '../../shared/components/ui/Badge';
import { useUIStore } from '../../core/stores';
import {
  trainingReportsService,
  type TrainingCourseStat,
  type TrainingMonthPoint,
  type TrainingDeptStat,
  type TrainingParticipant,
} from '../../services/sdk/TrainingReportsService';
import { getErrorMessage } from '../../services/errors';
import { exportToStyledExcel } from '../../utils/exportToExcel';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart as RePie, Pie, Cell, Legend,
} from 'recharts';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
                '#ec4899', '#14b8a6', '#f97316'];

type TimeRange = '6months' | 'year' | 'all';

const RANGES: Record<TimeRange, { label: string; months: number | null }> = {
  '6months': { label: 'آخر 6 أشهر', months: 6 },
  year:      { label: 'آخر سنة',    months: 12 },
  all:       { label: 'كل الفترات', months: null },
};

const AR_MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو',
                   'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

const monthLabel = (iso: string): string => {
  if (!iso) return '—';
  const [y, m] = iso.split('-');
  return `${AR_MONTHS[Number(m) - 1] ?? m} ${y}`;
};

/** ثوانٍ ⇒ نصّ عربي. 0 تعني «لم يبدأ» لا «صفر ثانية». */
const fmtSeconds = (secs: number): string => {
  if (!secs) return '—';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return m > 0 ? `${h}س ${m}د` : `${h}س`;
  if (m > 0) return `${m}د`;
  return `${secs}ث`;
};

const fmtDate = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString('ar-IQ') : '—';

interface TooltipEntry { name?: string; value?: number | string; color?: string }
interface TooltipProps { active?: boolean; payload?: TooltipEntry[]; label?: string }

const CustomTooltip = ({ active, payload, label }: TooltipProps) => {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="bg-white border border-slate-200 shadow-xl rounded-xl p-3 text-xs" dir="rtl">
      <p className="font-bold text-slate-700 mb-1">{label}</p>
      {payload.map((e, i) => (
        <p key={i} style={{ color: e.color }}>
          {e.name}: <span className="font-bold">{e.value}</span>
        </p>
      ))}
    </div>
  );
};

// ════════════════════════════════════════════════════
//  نافذة تفاصيل المشارك
// ════════════════════════════════════════════════════

function ParticipantModal({ p, onClose }: {
  p: TrainingParticipant;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto"
      onClick={onClose}
      dir="rtl"
    >
      <div
        className="relative bg-white rounded-3xl p-6 max-w-xl w-full shadow-2xl border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-indigo-500 flex items-center justify-center text-white font-bold text-lg">
            {p.employeeName.charAt(0) || '؟'}
          </div>
          <div>
            <h3 className="text-lg font-extrabold text-slate-800">{p.employeeName}</h3>
            <p className="text-xs text-slate-500">{p.department}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
            <p className="text-xs text-slate-500 mb-1">الدورة</p>
            <p className="text-sm font-bold text-slate-800">{p.courseTitle}</p>
          </div>
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
            <p className="text-xs text-slate-500 mb-1">الحالة</p>
            <p className={`text-sm font-bold ${
              p.completed ? 'text-emerald-600'
              : p.progress > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
              {p.statusLabel}
            </p>
          </div>
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 col-span-2">
            <p className="text-xs text-slate-500 mb-1">التقدّم</p>
            {/* ★ العطل ①: `progress` الحقيقي — كان progress_percent المعدوم
                ⇒ الشريط 0% أحمر لكل مشارك مهما أنجز */}
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    p.progress >= 80 ? 'bg-emerald-500'
                    : p.progress >= 40 ? 'bg-amber-500' : 'bg-rose-500'}`}
                  style={{ width: `${Math.min(100, Math.max(0, p.progress))}%` }}
                />
              </div>
              <span className="text-sm font-bold text-slate-700">{p.progress}%</span>
            </div>
          </div>
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
            <p className="text-xs text-slate-500 mb-1">تاريخ البدء</p>
            <p className="text-sm font-bold text-slate-800">{fmtDate(p.startedAt)}</p>
          </div>
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
            <p className="text-xs text-slate-500 mb-1">تاريخ الإتمام</p>
            <p className="text-sm font-bold text-slate-800">{fmtDate(p.completedAt)}</p>
          </div>
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 col-span-2">
            <p className="text-xs text-slate-500 mb-1">اعتماد المشرف</p>
            <p className="text-sm font-bold text-slate-800">
              {p.approved ? 'معتمَد' : 'غير معتمَد'}
            </p>
          </div>
        </div>

        {/* ★★★ 0353: الدرجة والوقت وآخر وصول صارت أعمدة حقيقية.
            في 0351 أُسقط عرضها لأنها كانت معدومة — والآن تُعرض من مصدرها. */}
        <div className="grid grid-cols-2 gap-4 mt-4">
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
            <p className="text-xs text-slate-500 mb-1">درجة الاختبار</p>
            <p className="text-sm font-bold text-slate-800">
              {p.score === null
                ? <span className="text-slate-400">لم يُختبَر</span>
                : `${p.score}%`}
            </p>
          </div>
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
            <p className="text-xs text-slate-500 mb-1">وقت الدراسة</p>
            <p className="text-sm font-bold text-slate-800">{fmtSeconds(p.timeSpent)}</p>
          </div>
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 col-span-2">
            <p className="text-xs text-slate-500 mb-1">آخر وصول للمحتوى</p>
            <p className="text-sm font-bold text-slate-800">
              {p.lastAccessAt
                ? new Date(p.lastAccessAt).toLocaleString('ar-IQ')
                : <span className="text-slate-400">لم يُفتَح بعد</span>}
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="absolute top-4 left-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════
//  المكوّن الرئيسي
// ════════════════════════════════════════════════════

export default function TrainingReportsPage() {
  const { addToast } = useUIStore();
  const [timeRange, setTimeRange] = useState<TimeRange>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [courses, setCourses] = useState<TrainingCourseStat[]>([]);
  const [trend, setTrend] = useState<TrainingMonthPoint[]>([]);
  const [depts, setDepts] = useState<TrainingDeptStat[]>([]);
  const [participants, setParticipants] = useState<TrainingParticipant[]>([]);

  const [search, setSearch] = useState('');
  const [courseFilter, setCourseFilter] = useState<string>('all');
  const [selected, setSelected] = useState<TrainingParticipant | null>(null);

  // ★ العطل ③: النطاق يُحسب ويُمرَّر فعلاً إلى القاعدة
  const range = useMemo(() => {
    const months = RANGES[timeRange].months;
    if (months === null) return { from: undefined, to: undefined, months: 12 };
    const from = new Date();
    from.setMonth(from.getMonth() - months);
    return { from: from.toISOString(), to: new Date().toISOString(), months };
  }, [timeRange]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [c, t, d, p] = await Promise.all([
        trainingReportsService.courseStats(range.from, range.to),
        trainingReportsService.monthlyTrend(range.months),
        trainingReportsService.departmentStats(range.from, range.to),
        trainingReportsService.participants(courseFilter, search),
      ]);
      setCourses(c);
      setTrend(t);
      setDepts(d);
      setParticipants(p);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }, [range.from, range.to, range.months, courseFilter, search]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      await load();
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // ── المؤشرات ──────────────────────────────────────────────────
  const totals = useMemo(() => {
    const enrolled = courses.reduce((a, c) => a + c.enrolled, 0);
    const completed = courses.reduce((a, c) => a + c.completed, 0);
    const inProgress = courses.reduce((a, c) => a + c.inProgress, 0);
    const withEnroll = courses.filter((c) => c.enrolled > 0);
    // ★ العطل ①: متوسط التقدّم من `progress` الحقيقي — لا score المعدوم
    const avgProgress = withEnroll.length > 0
      ? Math.round(withEnroll.reduce((a, c) => a + c.avgProgress, 0) / withEnroll.length)
      : 0;
    // ★★★ 0353: متوسط الدرجات عاد — لكن على **المُختبَرين وحدهم**.
    //   `avgScore` تصل null من الدورات بلا مُختبَر، ونُقصيها من الحساب
    //   بدل تحويلها صفراً (ذلك يُعيد العطل الذي أصلحناه في 0351).
    const scored = courses.filter((c) => c.avgScore !== null && c.scoredCount > 0);
    const totalScored = scored.reduce((a, c) => a + c.scoredCount, 0);
    // متوسط موزون بعدد المُختبَرين — لا متوسط المتوسطات
    const avgScore = totalScored > 0
      ? Math.round(scored.reduce((a, c) => a + (c.avgScore ?? 0) * c.scoredCount, 0) / totalScored)
      : null;
    const totalHours = Math.round(courses.reduce((a, c) => a + c.totalTime, 0) / 3600);
    const mand = courses.filter((c) => c.mandatory);
    const mandEnrolled = mand.reduce((a, c) => a + c.enrolled, 0);
    const mandCompleted = mand.reduce((a, c) => a + c.completed, 0);
    return {
      enrolled, completed, inProgress, avgProgress,
      rate: enrolled > 0 ? Math.round((completed / enrolled) * 100) : 0,
      mandRate: mandEnrolled > 0 ? Math.round((mandCompleted / mandEnrolled) * 100) : 0,
      // ★ العطل ①: `status` الحقيقي — كان `active` المعدوم ⇒ صفر أبداً
      avgScore, totalScored, totalHours,
      active: courses.filter((c) => c.status === 'active').length,
      archived: courses.filter((c) => c.status === 'archived').length,
      notEnrolled: participants.filter((p) => p.courseId === null).length,
    };
  }, [courses, participants]);

  const categoryData = useMemo(() => {
    const map = new Map<string, number>();
    courses.forEach((c) => map.set(c.category, (map.get(c.category) || 0) + c.enrolled));
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .filter((d) => d.value > 0);
  }, [courses]);

  const trendData = useMemo(
    () => trend.map((t) => ({
      month: monthLabel(t.monthStart),
      'تسجيل': t.enrollments,
      'إتمام': t.completions,
    })),
    [trend],
  );

  // ── التصدير الحقيقي (العطل ②) ─────────────────────────────────
  const handleExport = () => {
    if (participants.length === 0) {
      addToast('لا بيانات لتصديرها', 'warning');
      return;
    }
    exportToStyledExcel(
      `تقرير_التدريب_${RANGES[timeRange].label}`,
      ['#', 'الموظف', 'القسم', 'الدورة', 'التقدّم %', 'الدرجة', 'وقت الدراسة',
       'الحالة', 'اعتماد المشرف', 'تاريخ البدء', 'تاريخ الإتمام'],
      participants.map((p, i) => [
        String(i + 1), p.employeeName, p.department, p.courseTitle,
        String(p.progress),
        // ★ «لم يُختبَر» لا «0» — الصفر في ملف Excel يُقرأ رسوباً
        p.score === null ? 'لم يُختبَر' : String(p.score),
        fmtSeconds(p.timeSpent),
        p.statusLabel,
        p.approved ? 'معتمَد' : 'غير معتمَد',
        fmtDate(p.startedAt), fmtDate(p.completedAt),
      ]),
    );
    addToast('تم تصدير التقرير', 'success');
  };

  const handleExportCourses = () => {
    if (courses.length === 0) {
      addToast('لا دورات لتصديرها', 'warning');
      return;
    }
    exportToStyledExcel(
      `إحصاءات_الدورات_${RANGES[timeRange].label}`,
      ['#', 'الدورة', 'التصنيف', 'المستوى', 'الحالة', 'إلزامية',
       'ملتحقون', 'مكتملون', 'قيد التنفيذ', 'متوسط التقدّم %', 'معدل الإتمام %',
       'متوسط الدرجة', 'عدد المُختبَرين', 'ساعات التدريب'],
      courses.map((c, i) => [
        String(i + 1), c.title, c.category, c.level, c.status,
        c.mandatory ? 'نعم' : 'لا',
        String(c.enrolled), String(c.completed), String(c.inProgress),
        String(c.avgProgress), String(c.completionRate),
        c.avgScore === null ? 'لم يُختبَر أحد' : String(c.avgScore),
        String(c.scoredCount),
        String(Math.round(c.totalTime / 3600)),
      ]),
    );
    addToast('تم تصدير إحصاءات الدورات', 'success');
  };

  // ── الأرشفة بدل الحذف (العطل ④+⑤) ─────────────────────────────
  const handleArchive = async (c: TrainingCourseStat) => {
    const next = c.status === 'archived' ? 'active' : 'archived';
    try {
      const res = await trainingReportsService.setCourseStatus(c.id, next);
      addToast(
        next === 'archived'
          ? `أُرشفت «${res.title}» — ${res.enrolled} سجلّ تقدّم محفوظ`
          : `أُعيد تفعيل «${res.title}»`,
        'success',
      );
      await load();
    } catch (err) {
      addToast('فشل تغيير حالة الدورة: ' + getErrorMessage(err), 'error');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]" dir="rtl">
        <div className="text-center">
          <Loader2 size={40} className="animate-spin text-indigo-600 mx-auto mb-4" />
          <p className="text-slate-500 font-semibold">جاري تحميل التقارير...</p>
        </div>
      </div>
    );
  }

  const kpis = [
    { val: totals.enrolled,          label: 'إجمالي الالتحاقات', icon: Users,         color: 'bg-blue-500' },
    { val: totals.completed,         label: 'مكتمل',             icon: CheckCircle,   color: 'bg-emerald-500' },
    { val: totals.inProgress,        label: 'قيد التنفيذ',        icon: Clock,         color: 'bg-amber-500' },
    { val: `${totals.rate}%`,        label: 'معدل الإتمام',       icon: Percent,       color: 'bg-violet-500' },
    { val: `${totals.avgProgress}%`, label: 'متوسط التقدّم',      icon: TrendingUp,    color: 'bg-teal-500' },
    { val: `${totals.mandRate}%`,    label: 'الإلزامي',           icon: AlertTriangle, color: 'bg-orange-500' },
    // ★★★ 0353: «—» لا صفر حين لم يُختبَر أحد. الصفر قياسٌ والغياب ليس قياساً.
    { val: totals.avgScore === null ? '—' : `${totals.avgScore}%`,
      label: 'متوسط الدرجات', icon: Award, color: 'bg-rose-500' },
    { val: `${totals.totalHours}س`, label: 'ساعات التدريب', icon: Clock, color: 'bg-sky-500' },
  ];

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      {/* ═══ الترويسة ═══ */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-800">تقارير الدورات التدريبية</h2>
          <p className="text-sm text-slate-500 mt-1">
            كل رقم محسوب في قاعدة البيانات — {RANGES[timeRange].label}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as TimeRange)}
            className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-600 outline-none focus:border-indigo-400"
          >
            {(Object.keys(RANGES) as TimeRange[]).map((k) => (
              <option key={k} value={k}>{RANGES[k].label}</option>
            ))}
          </select>
          <Button onClick={onRefresh} loading={refreshing} variant="secondary" size="sm"
                  icon={<RefreshCw size={15} />} iconPosition="left">
            تحديث
          </Button>
          <Button variant="primary" size="sm" onClick={handleExport}
                  icon={<Download size={16} />} iconPosition="left">
            تصدير التقرير
          </Button>
        </div>
      </div>

      {error && (
        <Card className="bg-rose-50 border-rose-200">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="text-rose-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-bold text-rose-800">تعذّر تحميل التقارير</p>
              <p className="text-xs text-rose-700 mt-1">{error}</p>
            </div>
          </div>
        </Card>
      )}

      {/* ═══ المؤشرات ═══ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((k, i) => {
          const Icon = k.icon;
          return (
            <div key={i} className="bg-white rounded-2xl border border-slate-100 p-3 shadow-sm">
              <div className={`w-8 h-8 rounded-xl ${k.color} flex items-center justify-center mb-2`}>
                <Icon size={16} className="text-white" />
              </div>
              <p className="text-lg font-extrabold text-slate-800">{k.val}</p>
              <p className="text-[11px] text-slate-500 font-medium">{k.label}</p>
            </div>
          );
        })}
      </div>

      {/* ═══ تنبيه من لم يلتحق ═══ */}
      {totals.notEnrolled > 0 && (
        <Card className="bg-amber-50 border-amber-200">
          <div className="flex items-center gap-3">
            <AlertTriangle size={20} className="text-amber-600 shrink-0" />
            <p className="text-sm text-amber-800">
              <strong>{totals.notEnrolled}</strong> موظفاً لم يلتحق بأي دورة تدريبية.
              {' '}الإصدار السابق كان يُخفيهم — وهم أهمّ ما في التقرير.
            </p>
          </div>
        </Card>
      )}

      {/* ═══ الرسوم ═══ */}
      <div className="grid lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <TrendingUp size={16} className="text-indigo-500" /> الاتجاه الشهري
            </CardTitle>
          </CardHeader>
          <div className="h-64">
            {trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Bar dataKey="تسجيل" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="إتمام" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400 text-sm">
                لا بيانات شهرية
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <PieChart size={16} className="text-indigo-500" /> الالتحاقات حسب التصنيف
            </CardTitle>
          </CardHeader>
          <div className="h-64 flex items-center justify-center">
            {categoryData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <RePie>
                  <Pie
                    data={categoryData} cx="50%" cy="50%"
                    innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value"
                    label={({ name, percent }: { name?: string; percent?: number }) =>
                      `${name} ${Math.round((percent ?? 0) * 100)}%`}
                  >
                    {categoryData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </RePie>
              </ResponsiveContainer>
            ) : (
              <div className="text-slate-400 text-sm">لا التحاقات في هذه المدة</div>
            )}
          </div>
        </Card>
      </div>

      {/* ═══ جدول الدورات ═══ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen size={18} className="text-indigo-600" /> الدورات
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="neutral">{totals.active} نشطة</Badge>
            {totals.archived > 0 && <Badge variant="warning">{totals.archived} مؤرشفة</Badge>}
            <Button size="xs" variant="outline" icon={<Download size={13} />}
                    onClick={handleExportCourses}>
              تصدير
            </Button>
          </div>
        </CardHeader>
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-sm text-right whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="p-3 font-bold">الدورة</th>
                <th className="p-3 font-bold">التصنيف</th>
                <th className="p-3 font-bold">ملتحقون</th>
                <th className="p-3 font-bold">مكتملون</th>
                <th className="p-3 font-bold">متوسط التقدّم</th>
                <th className="p-3 font-bold">معدل الإتمام</th>
                <th className="p-3 font-bold">متوسط الدرجة</th>
                <th className="p-3 font-bold">الحالة</th>
                <th className="p-3 font-bold">إجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {courses.map((c) => (
                <tr key={c.id} className={c.status === 'archived' ? 'bg-slate-50/60' : 'hover:bg-slate-50'}>
                  <td className="p-3 font-semibold text-slate-800">
                    {c.title}
                    {c.mandatory && <Badge variant="danger" size="sm" className="mr-2">إلزامية</Badge>}
                  </td>
                  <td className="p-3 text-slate-600">{c.category}</td>
                  <td className="p-3 text-slate-600">{c.enrolled}</td>
                  <td className="p-3 text-emerald-600 font-semibold">{c.completed}</td>
                  <td className="p-3">
                    {/* ★ العطل ①: من `progress` الحقيقي */}
                    {c.enrolled === 0 ? (
                      <span className="text-slate-300 text-xs">لا التحاقات</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              c.avgProgress >= 75 ? 'bg-emerald-500'
                              : c.avgProgress >= 40 ? 'bg-amber-500' : 'bg-rose-500'}`}
                            style={{ width: `${Math.min(100, Math.max(0, c.avgProgress))}%` }}
                          />
                        </div>
                        <span className="text-xs font-bold text-slate-600">{c.avgProgress}%</span>
                      </div>
                    )}
                  </td>
                  <td className="p-3">
                    {c.enrolled === 0
                      ? <span className="text-slate-300 text-xs">—</span>
                      : <Badge variant={c.completionRate >= 70 ? 'success'
                                       : c.completionRate >= 40 ? 'warning' : 'danger'} size="sm">
                          {c.completionRate}%
                        </Badge>}
                  </td>
                  <td className="p-3">
                    {/* ★ 0353: «لم يُختبَر أحد» ≠ «متوسطهم صفر» */}
                    {c.avgScore === null || c.scoredCount === 0 ? (
                      <span className="text-slate-300 text-xs">لم يُختبَر</span>
                    ) : (
                      <span className="text-xs font-bold text-slate-700">
                        {c.avgScore}%
                        <span className="text-[10px] text-slate-400 mr-1">
                          ({c.scoredCount})
                        </span>
                      </span>
                    )}
                  </td>
                  <td className="p-3">
                    <Badge variant={c.status === 'active' ? 'success'
                                  : c.status === 'archived' ? 'neutral' : 'warning'} size="sm">
                      {c.status === 'active' ? 'نشطة'
                       : c.status === 'archived' ? 'مؤرشفة' : 'معطّلة'}
                    </Badge>
                  </td>
                  <td className="p-3">
                    {/* ★ العطل ⑤: أرشفة لا حذف — سجلّات التقدّم تبقى */}
                    <Button size="xs" variant="outline" icon={<Archive size={13} />}
                            onClick={() => handleArchive(c)}>
                      {c.status === 'archived' ? 'إعادة تفعيل' : 'أرشفة'}
                    </Button>
                  </td>
                </tr>
              ))}
              {courses.length === 0 && (
                <tr><td colSpan={9} className="p-8 text-center text-slate-400">لا دورات مُعرَّفة</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ═══ جدول الأقسام ═══ */}
      <Card>
        <CardHeader><CardTitle>تدريب الأقسام</CardTitle></CardHeader>
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-sm text-right whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="p-3 font-bold">القسم</th>
                <th className="p-3 font-bold">الموظفون</th>
                <th className="p-3 font-bold">ملتحقون</th>
                <th className="p-3 font-bold">أتمّوا</th>
                <th className="p-3 font-bold">لم يتمّوا</th>
                <th className="p-3 font-bold">التغطية</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {depts.map((d) => (
                <tr key={d.departmentId} className="hover:bg-slate-50">
                  <td className="p-3 font-semibold text-slate-800">{d.departmentName}</td>
                  <td className="p-3 text-slate-600">{d.employees}</td>
                  <td className="p-3 text-slate-600">{d.enrolled}</td>
                  <td className="p-3 text-emerald-600 font-semibold">{d.trained}</td>
                  <td className="p-3 text-amber-600 font-semibold">{d.pending}</td>
                  <td className="p-3">
                    {d.employees === 0
                      ? <span className="text-slate-300 text-xs">لا موظفين</span>
                      : <Badge variant={d.completionRate >= 70 ? 'success'
                                       : d.completionRate >= 30 ? 'warning' : 'danger'} size="sm">
                          {d.completionRate}%
                        </Badge>}
                  </td>
                </tr>
              ))}
              {depts.length === 0 && (
                <tr><td colSpan={6} className="p-8 text-center text-slate-400">لا أقسام مُعرَّفة</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ═══ المشاركون ═══ */}
      <Card>
        <CardHeader>
          <CardTitle>المشاركون</CardTitle>
          <Badge variant="neutral">{participants.length} صفّ</Badge>
        </CardHeader>
        <div className="flex flex-wrap gap-3 mb-4">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="ابحث بالاسم أو القسم أو الدورة..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pr-10 pl-4 py-2.5 text-sm outline-none focus:border-indigo-400"
            />
          </div>
          <select
            value={courseFilter}
            onChange={(e) => setCourseFilter(e.target.value)}
            className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-semibold outline-none focus:border-indigo-400"
          >
            <option value="all">كل الدورات</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="p-3 font-bold">الموظف</th>
                <th className="p-3 font-bold">القسم</th>
                <th className="p-3 font-bold">الدورة</th>
                <th className="p-3 font-bold">التقدّم</th>
                <th className="p-3 font-bold">الدرجة</th>
                <th className="p-3 font-bold">الحالة</th>
                <th className="p-3 font-bold">تفاصيل</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {participants.slice(0, 100).map((p, i) => (
                <tr key={`${p.employeeId}-${p.courseId ?? 'none'}-${i}`}
                    className={p.courseId === null ? 'bg-amber-50/50' : 'hover:bg-slate-50'}>
                  <td className="p-3 font-semibold text-slate-800">{p.employeeName}</td>
                  <td className="p-3 text-slate-600">{p.department}</td>
                  <td className="p-3 text-slate-600">{p.courseTitle}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <div className="w-14 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            p.progress >= 80 ? 'bg-emerald-500'
                            : p.progress >= 40 ? 'bg-amber-500' : 'bg-rose-500'}`}
                          style={{ width: `${Math.min(100, Math.max(0, p.progress))}%` }}
                        />
                      </div>
                      <span className="text-xs font-bold text-slate-600">{p.progress}%</span>
                    </div>
                  </td>
                  <td className="p-3">
                    {p.score === null
                      ? <span className="text-slate-300 text-xs">—</span>
                      : <span className={`text-xs font-bold ${
                          p.score >= 60 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {p.score}%
                        </span>}
                  </td>
                  <td className="p-3">
                    <Badge variant={p.completed ? 'success'
                                  : p.courseId === null ? 'danger' : 'warning'} size="sm">
                      {p.statusLabel}
                    </Badge>
                  </td>
                  <td className="p-3">
                    <Button size="xs" variant="outline" onClick={() => setSelected(p)}>
                      عرض
                    </Button>
                  </td>
                </tr>
              ))}
              {participants.length === 0 && (
                <tr><td colSpan={7} className="p-8 text-center text-slate-400">
                  {search ? 'لا نتائج مطابقة للبحث' : 'لا مشاركين'}
                </td></tr>
              )}
            </tbody>
          </table>
          {participants.length > 100 && (
            <p className="text-xs text-slate-400 text-center py-3">
              يُعرَض أول 100 من {participants.length} — استعمل البحث للتضييق
            </p>
          )}
        </div>
      </Card>

      {selected && <ParticipantModal p={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
