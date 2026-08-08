/**
 * ════════════════════════════════════════════════════════════════
 *  AnalyticsPage — التحليلات والإحصاءات (بوابة الموارد البشرية)
 *
 *  ★★★ أُعيدت كتابتها في جولة 0349. الأعطال المُصلَحة — كلها مُثبتة
 *  تشغيلياً على Postgres محلي قبل أي سطر كُتب هنا:
 *
 *  ① ربط الصحة النفسية بالأقسام كان عبر `profiles.id === w.employee_id`
 *     و`wellness_entries.employee_id` مفتاح أجنبي على **`employees(id)`**.
 *     مُثبَت: صفر مطابقة مقابل مطابقتين. ⇒ «متوسط الصحة» صفر لكل قسم أبداً.
 *  ② «محلولة هذا الشهر» بـ`getMonth()` بلا سنة وعلى `updated_at`.
 *     مُثبَت: 2 بدل 1.
 *  ③ `satisfactionRate: 85` و`satisfactionScore: 85` ثوابت مُختلَقة.
 *  ④ `avgResolutionTime: 2.4` ثابت مُختلَق — يُحسب الآن من `closed_at`.
 *  ⑤ «تحليل المشاعر» و«اتجاه الصحة» كانا يرسمان **أقساماً** ويسمّيانها
 *     يوليو…ديسمبر. صارا سلسلتين زمنيتين حقيقيتين بالشهر.
 *  ⑥ معدل الحضور كان يحتسب `عطلة` و`مجاز` حضوراً. مُثبَت: 80% بدل 33%.
 *  ⑦ البلاغات المفتوحة كانت تعدّ المؤرشف.
 *  ⑧ تبويب «التحليل المتقدم بالذكاء الاصطناعي» كان `setTimeout(2500)`
 *     ثم ثوابت مكتوبة في الملف («دقة النموذج 91%» · «p-value < 0.05» ·
 *     «Random Forest» · «+12k سجل») تحت وسم «AI Powered».
 *     **أُزيل بالكامل** — لا نموذج ولا بيانات تدريب ولا استدلال.
 *     النتيجة الخاطئة أسوأ من غيابها.
 *
 *  ★ الصفحة لا تلمس Supabase — كل شيء عبر `hrAnalyticsService`.
 *  ★ كل رقم معروض له مصدر في القاعدة، وما لا مصدر له يُعرض «—».
 * ════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  hrAnalyticsService,
  EMPTY_OVERVIEW,
  type HrAnalyticsOverview,
  type HrDepartmentStat,
  type HrWellnessPoint,
  type HrIncidentPoint,
} from '../../services/sdk/HrAnalyticsService';
import Card, { CardHeader, CardTitle } from '../../shared/components/ui/Card';
import Badge from '../../shared/components/ui/Badge';
import Button from '../../shared/components/ui/Button';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, Legend,
} from 'recharts';
import { Loader, TrendingUp, RefreshCw, Info, AlertTriangle } from 'lucide-react';
import { getErrorMessage } from '../../services/errors';

// ════════════════════════════════════════════════════
//  أدوات التاريخ — النطاق يحمل سنته دائماً (العطل ②)
// ════════════════════════════════════════════════════

const toISO = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const RANGES = [
  { key: '30', label: 'آخر 30 يوماً', days: 30 },
  { key: '90', label: 'آخر 90 يوماً', days: 90 },
  { key: '365', label: 'آخر سنة', days: 365 },
] as const;

type RangeKey = (typeof RANGES)[number]['key'];

const AR_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

/** «2026-08-01» ⇒ «أغسطس 2026» — شهر حقيقي لا اسم قسم (العطل ⑤) */
const monthLabel = (iso: string): string => {
  if (!iso) return '—';
  const [y, m] = iso.split('-');
  const idx = Number(m) - 1;
  return `${AR_MONTHS[idx] ?? m} ${y}`;
};

export default function AnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rangeKey, setRangeKey] = useState<RangeKey>('30');

  const [overview, setOverview] = useState<HrAnalyticsOverview>(EMPTY_OVERVIEW);
  const [departments, setDepartments] = useState<HrDepartmentStat[]>([]);
  const [wellness, setWellness] = useState<HrWellnessPoint[]>([]);
  const [incidents, setIncidents] = useState<HrIncidentPoint[]>([]);

  const range = useMemo(() => {
    const days = RANGES.find((r) => r.key === rangeKey)?.days ?? 30;
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - days);
    return { from: toISO(from), to: toISO(to), days };
  }, [rangeKey]);

  const months = range.days > 180 ? 12 : 6;

  const load = useCallback(async () => {
    setError(null);
    try {
      const [ov, dep, well, inc] = await Promise.all([
        hrAnalyticsService.overview(range.from, range.to),
        hrAnalyticsService.departments(range.from, range.to),
        hrAnalyticsService.wellnessTrend(months),
        hrAnalyticsService.incidentTrend(months),
      ]);
      setOverview(ov);
      setDepartments(dep);
      setWellness(well);
      setIncidents(inc);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }, [range.from, range.to, months]);

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

  // ★ العطل ⑤: أشهر حقيقية من القاعدة — لا أقسام مُسمّاة بأسماء أشهر.
  const wellnessSeries = useMemo(
    () => wellness.map((p) => ({
      month: monthLabel(p.monthStart),
      score: p.avgScore,
      samples: p.samples,
    })),
    [wellness],
  );

  const incidentSeries = useMemo(
    () => incidents.map((p) => ({
      month: monthLabel(p.monthStart),
      opened: p.opened,
      closed: p.closed,
    })),
    [incidents],
  );

  const hasWellness = overview.wellnessSamples > 0;

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64 text-slate-500 gap-3">
        <Loader className="animate-spin" />
        <span className="font-medium text-sm">جاري تحميل التحليلات...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      {/* ═══ الترويسة ═══ */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-800">
            التحليلات والإحصاءات
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            كل رقم هنا محسوب من قاعدة البيانات — من {range.from} إلى {range.to}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-slate-50 border border-slate-100 rounded-xl p-1">
            {RANGES.map((r) => (
              <button
                key={r.key}
                onClick={() => setRangeKey(r.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  rangeKey === r.key
                    ? 'bg-white text-indigo-600 shadow-sm'
                    : 'text-slate-500 hover:bg-slate-100'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <Button
            onClick={onRefresh}
            loading={refreshing}
            variant="secondary"
            size="sm"
            icon={<RefreshCw size={15} />}
            iconPosition="left"
          >
            تحديث
          </Button>
        </div>
      </div>

      {error && (
        <Card className="bg-rose-50 border-rose-200">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="text-rose-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-bold text-rose-800">تعذّر تحميل التحليلات</p>
              <p className="text-xs text-rose-700 mt-1">{error}</p>
            </div>
          </div>
        </Card>
      )}

      {/* ═══ بطاقات الحضور ═══ */}
      {/* ★ العطل ⑥: المقام أيام العمل — العطلة والمجاز مستبعدان صراحةً */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-emerald-50 text-emerald-700 border-0">
          <p className="text-2xl font-extrabold">{overview.attendanceRate}%</p>
          <p className="text-xs font-bold mt-1">معدل الحضور</p>
          <p className="text-[11px] opacity-70 mt-1">
            {overview.presentDays} من {overview.workingDays} يوم عمل
          </p>
        </Card>
        <Card className="bg-rose-50 text-rose-700 border-0">
          <p className="text-2xl font-extrabold">{overview.absenteeismRate}%</p>
          <p className="text-xs font-bold mt-1">معدل الغياب</p>
          <p className="text-[11px] opacity-70 mt-1">{overview.absentDays} يوم غياب</p>
        </Card>
        <Card className="bg-amber-50 text-amber-700 border-0">
          <p className="text-2xl font-extrabold">{overview.lateRate}%</p>
          <p className="text-xs font-bold mt-1">معدل التأخير</p>
          <p className="text-[11px] opacity-70 mt-1">{overview.lateDays} يوم تأخير</p>
        </Card>
        <Card className="bg-slate-50 text-slate-700 border-0">
          <p className="text-2xl font-extrabold">
            {overview.holidayDays + overview.leaveDays}
          </p>
          <p className="text-xs font-bold mt-1">خارج أيام العمل</p>
          <p className="text-[11px] opacity-70 mt-1">
            {overview.holidayDays} عطلة · {overview.leaveDays} مجاز
          </p>
        </Card>
      </div>

      {/* ═══ بطاقات البلاغات والصحة ═══ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-blue-50 text-blue-700 border-0">
          {/* ★ العطل ④: محسوب من closed_at − created_at لا الثابت 2.4 */}
          <p className="text-2xl font-extrabold">
            {overview.resolvedInRange > 0 ? overview.avgResolutionDays : '—'}
          </p>
          <p className="text-xs font-bold mt-1">متوسط وقت الحل (أيام)</p>
          <p className="text-[11px] opacity-70 mt-1">
            {overview.resolvedInRange > 0
              ? `من ${overview.resolvedInRange} بلاغ مُغلق`
              : 'لا بلاغات مُغلقة في المدة'}
          </p>
        </Card>
        <Card className="bg-purple-50 text-purple-700 border-0">
          {/* ★ العطل ②: النطاق يحمل سنته — لا getMonth() */}
          <p className="text-2xl font-extrabold">{overview.resolvedInRange}</p>
          <p className="text-xs font-bold mt-1">بلاغات مُغلقة</p>
          <p className="text-[11px] opacity-70 mt-1">ضمن المدة المحددة</p>
        </Card>
        <Card className="bg-orange-50 text-orange-700 border-0">
          {/* ★ العطل ⑦: المؤرشف ليس مفتوحاً */}
          <p className="text-2xl font-extrabold">{overview.openIncidents}</p>
          <p className="text-xs font-bold mt-1">بلاغات مفتوحة</p>
          <p className="text-[11px] opacity-70 mt-1">غير المؤرشفة</p>
        </Card>
        <Card className="bg-teal-50 text-teal-700 border-0">
          {/* ★ العطل ①+③: مقياس حقيقي — ولا يُعرض رقم إن لم توجد عيّنة */}
          <p className="text-2xl font-extrabold">
            {hasWellness ? overview.wellnessScore : '—'}
          </p>
          <p className="text-xs font-bold mt-1">مؤشر الصحة النفسية</p>
          <p className="text-[11px] opacity-70 mt-1">
            {hasWellness
              ? `من ${overview.wellnessSamples} قياساً`
              : 'لا قياسات في المدة'}
          </p>
        </Card>
      </div>

      {/* ═══ بطاقات القوى العاملة ═══ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-slate-100">
          <p className="text-2xl font-extrabold text-slate-800">
            {overview.activeEmployees}
          </p>
          <p className="text-xs font-bold text-slate-500 mt-1">موظف نشط</p>
          <p className="text-[11px] text-slate-400 mt-1">
            من {overview.totalEmployees} إجمالاً
          </p>
        </Card>
        <Card className="border-slate-100">
          <p className="text-2xl font-extrabold text-slate-800">
            {overview.contractsExpiring}
          </p>
          <p className="text-xs font-bold text-slate-500 mt-1">عقود قريبة الانتهاء</p>
          <p className="text-[11px] text-slate-400 mt-1">حسب فترة التنبيه</p>
        </Card>
        <Card className="border-slate-100">
          <p className="text-2xl font-extrabold text-slate-800">
            {overview.criticalPositions}
          </p>
          <p className="text-xs font-bold text-slate-500 mt-1">مناصب عالية/حرجة</p>
          <p className="text-[11px] text-slate-400 mt-1">تحتاج خطة تعاقب</p>
        </Card>
        <Card className="border-slate-100">
          <p className="text-2xl font-extrabold text-slate-800">
            {overview.criticalPositions > 0 ? `${overview.successionCoverage}%` : '—'}
          </p>
          <p className="text-xs font-bold text-slate-500 mt-1">تغطية التعاقب</p>
          <p className="text-[11px] text-slate-400 mt-1">
            {overview.criticalPositions > 0 ? 'لها مرشّحون' : 'لا مناصب حرجة'}
          </p>
        </Card>
      </div>

      {/* ═══ الرسوم الزمنية ═══ */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* اتجاه البلاغات — بديل «تحليل المشاعر» المُصنَّع (العطل ⑤) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp size={18} className="text-indigo-600" />
              الوارد مقابل المُغلق
            </CardTitle>
            <Badge variant="neutral">{months} أشهر</Badge>
          </CardHeader>
          {incidentSeries.length === 0 ? (
            <p className="text-center py-16 text-sm text-slate-400">
              لا بيانات بلاغات في المدة
            </p>
          ) : (
            <div className="h-56 mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={incidentSeries} barSize={14}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }}
                         axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#94a3b8' }}
                         axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{
                    background: '#1e293b', border: 'none',
                    borderRadius: '10px', color: 'white', fontSize: '12px',
                  }} />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Bar dataKey="opened" name="وارد" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="closed" name="مُغلق" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* اتجاه الصحة — سلسلة زمنية حقيقية (العطل ⑤) */}
        <Card>
          <CardHeader>
            <CardTitle>مؤشر الصحة النفسية</CardTitle>
            <Badge variant="neutral">{months} أشهر</Badge>
          </CardHeader>
          {wellnessSeries.every((p) => p.samples === 0) ? (
            <p className="text-center py-16 text-sm text-slate-400">
              لا قياسات صحة نفسية مُسجّلة
            </p>
          ) : (
            <div className="h-56 mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={wellnessSeries}>
                  <defs>
                    <linearGradient id="wellGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }}
                         axisLine={false} tickLine={false} />
                  {/* ★ المجال 0..100 لا 50..100 — لئلا يُقصّ الانخفاض الحاد */}
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#94a3b8' }}
                         axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      background: '#1e293b', border: 'none',
                      borderRadius: '10px', color: 'white', fontSize: '12px',
                    }}
                    formatter={(value: number, _k: string, item: { payload?: { samples?: number } }) => [
                      item?.payload?.samples ? `${value} (${item.payload.samples} قياس)` : 'لا قياسات',
                      'المؤشر',
                    ]}
                  />
                  <Area type="monotone" dataKey="score" stroke="#10b981"
                        strokeWidth={2.5} fill="url(#wellGrad)" connectNulls={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      {/* ═══ جدول الأقسام ═══ */}
      <Card>
        <CardHeader>
          <CardTitle>إحصاءات الأقسام</CardTitle>
          <Badge variant="neutral">{departments.length} قسم</Badge>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                {['القسم', 'الموظفون', 'الحضور', 'أيام الغياب', 'البلاغات', 'مفتوحة', 'متوسط الصحة'].map((h) => (
                  <th key={h} className="text-right py-3 px-3 text-xs font-bold text-slate-500">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {departments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-400">
                    لا أقسام مُعرَّفة
                  </td>
                </tr>
              ) : departments.map((d) => (
                <tr key={d.departmentId} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="py-3 px-3 font-semibold text-slate-800">{d.departmentName}</td>
                  <td className="py-3 px-3 text-slate-600">{d.employeeCount}</td>
                  <td className="py-3 px-3">
                    {d.employeeCount === 0 ? (
                      <span className="text-slate-300">—</span>
                    ) : (
                      <Badge
                        variant={d.attendanceRate >= 90 ? 'success'
                          : d.attendanceRate >= 75 ? 'warning' : 'danger'}
                        size="sm"
                      >
                        {d.attendanceRate}%
                      </Badge>
                    )}
                  </td>
                  <td className="py-3 px-3 text-slate-600">{d.absentDays}</td>
                  <td className="py-3 px-3 text-slate-600">{d.incidentCount}</td>
                  <td className="py-3 px-3 font-semibold text-amber-600">{d.openCount}</td>
                  <td className="py-3 px-3">
                    {/* ★ العطل ①: كان صفراً لكل قسم أبداً. والآن إن لم توجد
                        عيّنة نعرض «—» لا صفراً — الصفر قياسٌ والغياب ليس قياساً. */}
                    {d.wellnessSamples === 0 ? (
                      <span className="text-slate-300 text-xs">لا قياسات</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              d.wellnessAvg >= 75 ? 'bg-emerald-500'
                                : d.wellnessAvg >= 60 ? 'bg-amber-500' : 'bg-rose-500'
                            }`}
                            style={{ width: `${Math.min(100, Math.max(0, d.wellnessAvg))}%` }}
                          />
                        </div>
                        <span className="text-xs font-bold text-slate-600">
                          {d.wellnessAvg}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          ({d.wellnessSamples})
                        </span>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ═══ ما لا يُعرض ولماذا ═══ */}
      {/* ★ العطل ③+⑧: كان هنا «معدل الرضا 85%» و«رادار مؤشرات الرضا»
          و«التحليل المتقدم بالذكاء الاصطناعي». لا مصدر لأيٍّ منها. */}
      <Card className="bg-slate-50 border-slate-200">
        <div className="flex items-start gap-3">
          <Info size={18} className="text-slate-500 mt-0.5 shrink-0" />
          <div className="space-y-2">
            <p className="text-sm font-bold text-slate-700">مقاييس غير معروضة — ولماذا</p>
            <ul className="text-xs text-slate-600 space-y-1.5 leading-relaxed">
              <li>
                <strong>معدل الرضا:</strong> كان يُعرض ثابتاً عند 85% في ثلاثة
                مواضع. لا استبيان رضا مربوطاً بالموظفين اليوم، فأُزيل بدل
                عرض رقم مُختلَق.
              </li>
              <li>
                <strong>تحليل المشاعر:</strong> كان يُحسب بمعادلة
                <code className="mx-1 px-1 bg-slate-200 rounded text-[10px]">
                  40 + عدد الموظفين × 2
                </code>
                ويُسمّي الأقسام بأسماء أشهر. استُبدل باتجاه البلاغات الحقيقي.
              </li>
              <li>
                <strong>التحليل التنبؤي:</strong> كان انتظاراً مُفتعَلاً مدّته
                ثانيتان ونصف، ثم أرقام ثابتة مكتوبة داخل الملف عن دقة نموذج
                ومستوى دلالة إحصائية. لا نموذج قائم ولا بيانات تدريب، فأُزيل:
                النتيجة الخاطئة أسوأ من غيابها.
              </li>
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
}
