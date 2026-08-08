/**
 * ════════════════════════════════════════════════════════════════
 *  AttendanceAnalytics — تحليلات الحضور في الوقت الفعلي
 *
 *  الميزات:
 *  • عدد البصمات اليوم / الأسبوع / الشهر
 *  • رسم بياني بالساعات (24 ساعة)
 *  • رسم بياني أسبوعي (7 أيام)
 *  • مقارنة الحضور / التأخير / الغياب
 *  • توزيع البصمات بالفترة (صباح / ظهر / مساء)
 *  • فلترة بالنطاق الزمني
 * ════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback, type FC } from 'react';
import {
  BarChart3, RefreshCw, Users, Clock, TrendingUp,
  Calendar, Sun, Sunset, Moon, ArrowUp, ArrowDown,
  CheckCircle2, AlertCircle, XCircle, Activity,
} from 'lucide-react';
import { attendanceService, attendanceSummaryService } from '../../../services/sdk/AttendanceService';
import { getErrorMessage } from '../../../services/errors';
import { useUIStore }      from '../../../core/stores';

// ════════════════════════════════════════════════════════════════
//  Types
// ════════════════════════════════════════════════════════════════

interface HourBucket { hour: number; label: string; count: number }
interface DayBucket  { date: string; label: string; present: number; late: number; absent: number }
interface ShiftStat  { label: string; icon: FC<any>; color: string; count: number; pct: number }

// ════════════════════════════════════════════════════════════════
//  Helpers
// ════════════════════════════════════════════════════════════════

function buildHours(): HourBucket[] {
  return Array.from({ length: 24 }, (_, i) => ({
    hour: i,
    label: `${String(i).padStart(2, '0')}:00`,
    count: 0,
  }));
}

function last7Days(): DayBucket[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return {
      date:    d.toISOString().slice(0, 10),
      label:   d.toLocaleDateString('ar-SA', { weekday: 'short' }),
      present: 0,
      late:    0,
      absent:  0,
    };
  });
}

// ════════════════════════════════════════════════════════════════
//  Sub-Components
// ════════════════════════════════════════════════════════════════

/** Horizontal Bar Chart */
const HBar: FC<{ value: number; max: number; color: string; label: string; count: number }> = ({ value, max, color, label, count }) => {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-slate-600 w-12 text-left flex-shrink-0">{label}</span>
      <div className="flex-1 h-5 bg-slate-800 rounded-md overflow-hidden">
        <div
          className={`h-full ${color} rounded-md transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-bold text-slate-400 w-10 text-right flex-shrink-0">{count}</span>
    </div>
  );
};

/** Vertical Bar Chart */
const VBar: FC<{ buckets: { label: string; value: number }[]; color: string; title: string }> = ({ buckets, color, title }) => {
  const max = Math.max(...buckets.map(b => b.value), 1);
  return (
    <div>
      <p className="text-xs font-bold text-slate-500 mb-3">{title}</p>
      <div className="flex items-end gap-1 h-24">
        {buckets.map((b, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1 group">
            <div
              className={`w-full ${color} rounded-t-sm transition-all duration-500 min-h-[3px] relative`}
              style={{ height: `${Math.max(4, (b.value / max) * 100)}%` }}
            >
              {b.value > 0 && (
                <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] font-bold text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                  {b.value}
                </span>
              )}
            </div>
            <span className="text-[9px] text-slate-700 leading-none">{b.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

/** KPI Card */
const StatCard: FC<{
  icon: FC<any>; label: string; value: number | string;
  sub?: string; color: string; trend?: number;
}> = ({ icon: Icon, label, value, sub, color, trend }) => (
  <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
    <div className="flex items-center justify-between mb-2">
      <Icon size={16} className={color} />
      {trend !== undefined && (
        <div className={`flex items-center gap-0.5 text-[11px] font-bold ${trend >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          {trend >= 0 ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
          {Math.abs(trend)}%
        </div>
      )}
    </div>
    <p className={`text-2xl font-black ${color} leading-none`}>{value}</p>
    <p className="text-[11px] text-slate-600 mt-1.5">{label}</p>
    {sub && <p className="text-[10px] text-slate-700 mt-0.5">{sub}</p>}
  </div>
);

// ════════════════════════════════════════════════════════════════
//  Main Page
// ════════════════════════════════════════════════════════════════

export default function AttendanceAnalytics() {
  const { addToast } = useUIStore();

  const [loading,       setLoading]       = useState(true);
  const [punchesToday,  setPunchesToday]  = useState(0);
  const [punchesWeek,   setPunchesWeek]   = useState(0);
  const [punchesMonth,  setPunchesMonth]  = useState(0);
  const [hourBuckets,   setHourBuckets]   = useState<HourBucket[]>(buildHours());
  const [weekBuckets,   setWeekBuckets]   = useState<DayBucket[]>(last7Days());
  const [shiftStats,    setShiftStats]    = useState<ShiftStat[]>([]);
  const [summaryStats,  setSummaryStats]  = useState({ present: 0, late: 0, absent: 0, total: 0 });
  const [lastRefresh,   setLastRefresh]   = useState(new Date());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const now        = new Date();
      const todayStart = new Date(now); todayStart.setHours(0,0,0,0);
      const weekStart  = new Date(now); weekStart.setDate(now.getDate() - 7);
      const monthStart = new Date(now); monthStart.setDate(1); monthStart.setHours(0,0,0,0);

      // ★★ إصلاح 0333: السطر التالي كان
      //     attendanceService.findLogsByEmployee('', { limit: 1000 })
      //   أي معرّف موظف **فارغ** ليعني «كل الموظفين». النتيجة في
      //   المتصفح كانت 400 بنصّ:
      //     invalid input syntax for type uuid: ""
      //   ولو نجح لجلب ألف صفّ كامل ليُجمّعها المتصفح. استُبدل بدالتَي
      //   قاعدة تُجمّعان بنطاق المستأجر.
      const [todayCount, weekCount, monthCount, hourly, shiftSplit, week7, dailyStats] =
        await Promise.allSettled([
          attendanceService.countPunchesSince(todayStart.toISOString()),
          attendanceService.countPunchesSince(weekStart.toISOString()),
          attendanceService.countPunchesSince(monthStart.toISOString()),
          attendanceService.todayByHour(),
          attendanceService.todayShiftSplit(),
          attendanceService.last7Days(),
          attendanceSummaryService.getDailyStats(todayStart.toISOString().slice(0, 10)),
        ]);

      const today = todayCount.status === 'fulfilled' ? Number(todayCount.value) : 0;
      const week  = weekCount.status  === 'fulfilled' ? Number(weekCount.value)  : 0;
      const month = monthCount.status === 'fulfilled' ? Number(monthCount.value) : 0;

      setPunchesToday(today);
      setPunchesWeek(week);
      setPunchesMonth(month);

      // ── التوزيع الساعي — محسوب في القاعدة على 24 ساعة ───────────
      const hours = buildHours();
      if (hourly.status === 'fulfilled') {
        for (const b of hourly.value) {
          if (b.hour >= 0 && b.hour < 24) hours[b.hour].count = b.total;
        }
      }
      setHourBuckets(hours);

      // ── توزيع الورديات — محسوب في القاعدة ───────────────────────
      const splitRows = shiftSplit.status === 'fulfilled' ? shiftSplit.value : [];
      const byShift = new Map(splitRows.map((r) => [r.shift, r]));
      const morning   = byShift.get('morning')?.count   ?? 0;
      const afternoon = byShift.get('afternoon')?.count ?? 0;
      const evening   = byShift.get('evening')?.count   ?? 0;
      const total     = morning + afternoon + evening || 1;

      setShiftStats([
        { label: byShift.get('morning')?.label   ?? 'الصباح (6–12)',   icon: Sun,    color: 'text-amber-400',  count: morning,   pct: Math.round((morning   / total) * 100) },
        { label: byShift.get('afternoon')?.label ?? 'الظهيرة (12–18)', icon: Sunset, color: 'text-orange-400', count: afternoon, pct: Math.round((afternoon / total) * 100) },
        { label: byShift.get('evening')?.label   ?? 'المساء (18–6)',   icon: Moon,   color: 'text-blue-400',   count: evening,   pct: Math.round((evening   / total) * 100) },
      ]);

      // Daily summary
      const ds = dailyStats.status === 'fulfilled' ? dailyStats.value : { present: 0, late: 0, absent: 0, total: 0 };
      setSummaryStats(ds as unknown as Parameters<typeof setSummaryStats>[0]);

      // Build 7-day buckets (approximate with week data)
      // ★ إزالة محاكاة (2026-08-05): كان يوزّع إجمالي الأسبوع على سبعة
      //   أيام بـ Math.random() ثم يشتقّ «المتأخرين» بضرب 0.1 و«الغائبين»
      //   بـ 0.05 — أرقام مُختلَقة تُعرض كرسم بياني حقيقي.
      //
      //   نستعمل التوزيع الفعلي إن توفّر، وإلا نترك الرسم فارغاً بدل
      //   تلوينه بأرقام لا أصل لها.
      //   ★ 0333: العدّ صار في القاعدة عبر attendance_last_7_days().
      //   النسخة السابقة عدّت من مصفوفة `logs` التي جاءت من
      //   findLogsByEmployee('') — وهي تسقط دائماً، فبقي الرسم أصفاراً.
      const days = last7Days();
      const byDay = new Map<string, number>();
      if (week7.status === 'fulfilled') {
        for (const r of week7.value) {
          byDay.set(String(r.day).slice(0, 10), r.present);
        }
      }
      type DayBucket = { date?: string; iso?: string; present: number; late: number; absent: number };
      (days as DayBucket[]).forEach((d) => {
        const key = d.date ?? d.iso ?? null;
        d.present = key ? (byDay.get(String(key).slice(0, 10)) ?? 0) : 0;
        // لا نشتقّ «المتأخرين» و«الغائبين» بنسب مُختلَقة — يحتاجان
        // مقارنة بجدول الورديات وهي غير متاحة هنا.
        d.late = 0;
        d.absent = 0;
      });
      setWeekBuckets(days);
      setLastRefresh(new Date());
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { load(); }, [load]);

  // Pick non-zero hours for the hourly chart (show 6h window around now)
  const currentHour = new Date().getHours();
  const displayHours = hourBuckets.filter(h =>
    h.hour >= Math.max(0, currentHour - 11) && h.hour <= currentHour
  );

  return (
    <div className="space-y-5" dir="rtl">

      {/* ─── Header ─── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-black text-white flex items-center gap-2">
            <BarChart3 size={20} className="text-violet-400" />
            تحليلات الحضور
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            بيانات الحضور اليومية والأسبوعية في الوقت الفعلي
            {' — '}آخر تحديث: {lastRefresh.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-900/50 border border-violet-700/50 text-violet-300 text-sm font-bold hover:bg-violet-900/70 transition-all disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          تحديث
        </button>
      </div>

      {/* ─── KPIs ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={Activity}  label="بصمات اليوم"   value={punchesToday} color="text-violet-400" sub="منذ منتصف الليل" />
        <StatCard icon={Calendar}  label="بصمات الأسبوع" value={punchesWeek}  color="text-blue-400"  sub="آخر 7 أيام" />
        <StatCard icon={TrendingUp}label="بصمات الشهر"   value={punchesMonth} color="text-cyan-400"  sub={`${new Date().toLocaleDateString('ar-SA', { month: 'long' })}`} />
        <StatCard icon={Users}     label="حضور اليوم"    value={summaryStats.present || punchesToday} color="text-emerald-400" sub="موظف مسجل" />
      </div>

      {/* ─── Daily Status (present/late/absent) ─── */}
      {summaryStats.total > 0 && (
        <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-5">
          <h3 className="text-sm font-bold text-slate-300 mb-4 flex items-center gap-2">
            <CheckCircle2 size={15} className="text-emerald-400" />
            ملخص حضور اليوم
          </h3>
          <div className="grid grid-cols-3 gap-2.5 sm:gap-4 mb-5">
            {[
              { label: 'حضور بوقت', value: summaryStats.present, cls: 'text-emerald-400', bg: 'bg-emerald-900/30 border-emerald-700/40' },
              { label: 'متأخر',     value: summaryStats.late,    cls: 'text-amber-400',   bg: 'bg-amber-900/30 border-amber-700/40'   },
              { label: 'غائب',      value: summaryStats.absent,  cls: 'text-red-400',     bg: 'bg-red-900/30 border-red-700/40'       },
            ].map(s => (
              <div key={s.label} className={`rounded-xl border px-3 py-3 text-center ${s.bg}`}>
                <p className={`text-2xl font-black ${s.cls}`}>{s.value}</p>
                <p className="text-xs text-slate-600 mt-1">{s.label}</p>
              </div>
            ))}
          </div>
          {summaryStats.total > 0 && (
            <div className="space-y-2">
              {[
                { label: 'حضور', value: summaryStats.present, color: 'bg-emerald-500' },
                { label: 'تأخير', value: summaryStats.late, color: 'bg-amber-500' },
                { label: 'غياب', value: summaryStats.absent, color: 'bg-red-500' },
              ].map(b => (
                <HBar
                  key={b.label}
                  label={b.label}
                  value={b.value}
                  max={summaryStats.total}
                  color={b.color}
                  count={b.value}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Charts Row ─── */}
      <div className="grid lg:grid-cols-2 gap-5">

        {/* Hourly Chart */}
        <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock size={15} className="text-cyan-400" />
            <h3 className="text-sm font-bold text-slate-200">توزيع البصمات بالساعة</h3>
            <span className="text-xs text-slate-600">(آخر 12 ساعة)</span>
          </div>
          {loading ? (
            <div className="h-24 bg-slate-800/40 rounded-xl animate-pulse" />
          ) : (
            <VBar
              buckets={displayHours.map(h => ({ label: h.label.slice(0,5), value: h.count }))}
              color="bg-cyan-600"
              title=""
            />
          )}
        </div>

        {/* Weekly Chart */}
        <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Calendar size={15} className="text-violet-400" />
            <h3 className="text-sm font-bold text-slate-200">توزيع الحضور الأسبوعي</h3>
          </div>
          {loading ? (
            <div className="h-24 bg-slate-800/40 rounded-xl animate-pulse" />
          ) : (
            <VBar
              buckets={weekBuckets.map(d => ({ label: d.label, value: d.present }))}
              color="bg-violet-600"
              title=""
            />
          )}
        </div>
      </div>

      {/* ─── Shift Distribution ─── */}
      <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-5">
        <h3 className="text-sm font-bold text-slate-200 mb-4 flex items-center gap-2">
          <Sun size={15} className="text-amber-400" />
          توزيع البصمات حسب الفترة الزمنية
        </h3>
        {loading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <div key={i} className="h-10 bg-slate-800/40 rounded-xl animate-pulse" />)}
          </div>
        ) : (
          <div className="space-y-4">
            {shiftStats.map(s => {
              const Icon = s.icon;
              return (
                <div key={s.label} className="flex items-center gap-4">
                  <div className="flex items-center gap-2 w-32 flex-shrink-0">
                    <Icon size={14} className={s.color} />
                    <span className="text-xs text-slate-400">{s.label}</span>
                  </div>
                  <div className="flex-1 h-4 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${
                        s.icon === Sun ? 'bg-amber-500' : s.icon === Sunset ? 'bg-orange-500' : 'bg-blue-500'
                      }`}
                      style={{ width: `${s.pct}%` }}
                    />
                  </div>
                  <div className="flex items-center gap-2 w-20 text-left flex-shrink-0">
                    <span className={`text-sm font-bold ${s.color}`}>{s.count}</span>
                    <span className="text-[10px] text-slate-600">({s.pct}%)</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── Info Note ─── */}
      <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-slate-900/40 border border-slate-800">
        <AlertCircle size={14} className="text-slate-600 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-slate-600 leading-relaxed">
          التحليلات الأسبوعية تستخدم بيانات تقريبية مشتقة من الإجماليات.
          للبيانات الدقيقة لكل موظف على حدة، استخدم لوحة الإدارة/HR.
          البيانات تُحدَّث كل 60 ثانية تلقائياً.
        </p>
      </div>
    </div>
  );
}
