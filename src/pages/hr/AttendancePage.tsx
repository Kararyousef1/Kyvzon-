/**
 * ════════════════════════════════════════════════════════════════
 *  hr/AttendancePage — لوحة الحضور اليومي (أُعيدت كتابتها في 0346)
 * ════════════════════════════════════════════════════════════════
 *
 *  ★★★ ما كان قبل 0346 — ثلاثة أعطال مستقلّة، كلٌّ منها كافٍ وحده
 *    لجعل الجدول فارغاً أبداً (مُثبتة تشغيلياً على Postgres):
 *
 *    ① البحث عن `punch_type === 'check_in'` بشرطة سفلية، والقيد
 *      يسمح بـ`'check-in'` بشرطة. إدراج القيمة الأولى **مرفوض**
 *      من القاعدة ⇒ لا صفّ يمكن أن يطابق ⇒ الحالة «غائب» للجميع.
 *
 *    ② `KioskPage` — الكاتب الوحيد — لا يمرّر `punch_type` فيُطبَّق
 *      `DEFAULT 'check-in'`. بصمات الخروج في القاعدة = **0**.
 *
 *    ③ `filters: { punch_time: todayStart }` تصير `.eq()` أي مساواة
 *      للحظة 00:00:00.000 ⇒ صفر صفوف. و`todayEnd` مُحتسب ولا يُستعمل.
 *
 *    ④ عمودا «مدة الاستراحات» و«موقع الاستراحة» ثابتان `0` و`''`
 *      رغم وجود `employee_breaks` يملؤه الحارس والمشرف.
 *
 *    ⑤ لا منتقي تاريخ · لا بحث · لا ترشيح · لا ملخّص.
 *
 *    ⑥ `full_name_ar || 'بدون اسم'` — والمحفّز 0317 يملأ
 *      `first_name`/`last_name` فقط ⇒ «بدون اسم» في كل صفّ.
 *
 *  الحسابات كلها انتقلت إلى القاعدة (`hr_daily_attendance`)، حيث
 *  أسماء الأعمدة تُفحَص عند تطبيق المايجريشن بدل أن تُنتج صمتاً.
 * ════════════════════════════════════════════════════════════════
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Clock, Download, LogIn, LogOut, Loader, Search, X,
  ChevronRight, ChevronLeft, Users, Coffee, LogOut as LeftIcon,
  UserX, Timer, MapPin,
} from 'lucide-react';
import { format, addDays, parseISO } from 'date-fns';
import { ar } from 'date-fns/locale';
import Card from '../../shared/components/ui/Card';
import Badge from '../../shared/components/ui/Badge';
import Button from '../../shared/components/ui/Button';
import { useUIStore } from '../../core/stores';
import { departmentService } from '../../services/sdk/DepartmentService';
import { techMetricsService, type DeviceHealth } from '../../services/sdk/TechMetricsService';
import {
  hrAttendanceBoardService,
  type DailyAttendanceRow,
  type DailyAttendanceSummary,
  type DailyAttendanceStatus,
} from '../../services/sdk/HrAttendanceBoardService';

/** الحالات الأربع — تُشتقّ في القاعدة */
const STATUS_STYLE: Record<DailyAttendanceStatus, 'success' | 'warning' | 'primary' | 'neutral'> = {
  'مداوم':       'success',
  'في استراحة':  'warning',
  'منصرف':       'primary',
  'غائب':        'neutral',
};

const STATUS_OPTIONS: DailyAttendanceStatus[] = [
  'مداوم', 'في استراحة', 'منصرف', 'غائب',
];

/** دقائق ⇒ «7س 40د» */
function fmtMinutes(m: number): string {
  if (!m || m <= 0) return '—';
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r}د`;
  if (r === 0) return `${h}س`;
  return `${h}س ${r}د`;
}

const fmtTime = (iso: string | null) =>
  iso ? format(parseISO(iso), 'hh:mm a') : null;

interface DeptOption { id: string; name: string }

export default function AttendancePage() {
  const { addToast } = useUIStore();
  const [loading, setLoading]   = useState(true);
  const [rows, setRows]         = useState<DailyAttendanceRow[]>([]);
  const [summary, setSummary]   = useState<DailyAttendanceSummary | null>(null);
  const [depts, setDepts]       = useState<DeptOption[]>([]);
  const [deviceHealth, setDeviceHealth] = useState<DeviceHealth[]>([]);

  // ★★ 0346: لم يكن ثمة منتقي تاريخ إطلاقاً — الصفحة تعرض اليوم فقط
  const [day, setDay]           = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [deptId, setDeptId]     = useState<string>('');
  const [status, setStatus]     = useState<DailyAttendanceStatus | ''>('');
  const [search, setSearch]     = useState('');
  const [debounced, setDebounced] = useState('');

  // ★ نؤخّر البحث كي لا نُطلق استعلاماً لكل حرف
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    departmentService.findAll()
      .then((d) => setDepts(
        (d || []).map((x: { id: string; name_ar: string }) => ({
          id: x.id, name: x.name_ar,
        })),
      ))
      .catch(() => { /* الأقسام اختيارية للترشيح */ });
    void techMetricsService.devicesHealth().then(setDeviceHealth).catch(() => setDeviceHealth([]));
  }, []);

  const fetchBoard = useCallback(async () => {
    setLoading(true);
    try {
      const [board, sum] = await Promise.all([
        hrAttendanceBoardService.board({
          date: day,
          departmentId: deptId || null,
          status: status || null,
          search: debounced || null,
          limit: 500,
        }),
        // ★★ الملخّص لا يتأثّر بالبحث ولا بترشيح الحالة: «حاضر 12 من
        //   200» يجب ألّا تتغيّر لأن المستخدم كتب حرفاً في البحث.
        hrAttendanceBoardService.summary(day, deptId || null),
      ]);
      setRows(board);
      setSummary(sum);
    } catch {
      addToast('تعذّر تحميل سجلّات الحضور', 'error');
    } finally {
      setLoading(false);
    }
  }, [day, deptId, status, debounced, addToast]);

  useEffect(() => { fetchBoard(); }, [fetchBoard]);

  const shiftDay = (delta: number) =>
    setDay(format(addDays(parseISO(day), delta), 'yyyy-MM-dd'));

  const isToday = day === format(new Date(), 'yyyy-MM-dd');
  const hasFilters = Boolean(deptId || status || search);

  /**
   * ★★ 0346: «تصدير تقرير اليوم PDF» كان `window.print()` بعد إشعار
   *   يقول «جاري تجهيز PDF». الآن تصدير CSV حقيقيّ.
   *   ★ BOM لازم كي تفتح Excel العربية بترميز صحيح.
   */
  const exportCsv = () => {
    if (rows.length === 0) {
      addToast('لا توجد صفوف للتصدير', 'warning');
      return;
    }
    const head = ['الرمز','الموظف','القسم','الحالة','الدخول','الخروج',
                  'دقائق العمل','دقائق الاستراحة','عدد الاستراحات','الوجهة'];
    const esc = (v: string | number | null) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const body = rows.map((r) => [
      r.employeeCode, r.fullName, r.department, r.status,
      fmtTime(r.checkIn) ?? '', fmtTime(r.checkOut) ?? '',
      r.workedMinutes, r.breakMinutes, r.breakCount, r.destination ?? '',
    ].map(esc).join(','));
    const csv = '\uFEFF' + [head.join(','), ...body].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance-${day}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    addToast(`صُدِّر ${rows.length} صفّاً`, 'success');
  };

  const cards = useMemo(() => ([
    { label: 'الإجمالي',    value: summary?.total   ?? 0, icon: Users,    color: 'text-slate-700',   bg: 'bg-slate-50' },
    { label: 'حاضر',        value: summary?.present ?? 0, icon: LogIn,    color: 'text-emerald-700', bg: 'bg-emerald-50' },
    { label: 'في استراحة',  value: summary?.onBreak ?? 0, icon: Coffee,   color: 'text-amber-700',   bg: 'bg-amber-50' },
    { label: 'منصرف',       value: summary?.left    ?? 0, icon: LeftIcon, color: 'text-indigo-700',  bg: 'bg-indigo-50' },
    { label: 'غائب',        value: summary?.absent  ?? 0, icon: UserX,    color: 'text-rose-700',    bg: 'bg-rose-50' },
  ]), [summary]);

  return (
    <div className="space-y-5 animate-fade-in" dir="rtl">
      {/* ── الترويسة ── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-extrabold text-slate-800 flex items-center gap-2">
            <Clock className="text-indigo-600" /> سجلّات الحضور والانصراف
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            حركة الموظفين ليوم{' '}
            <span className="font-bold text-slate-700">
              {format(parseISO(day), 'EEEE d MMMM yyyy', { locale: ar })}
            </span>
          </p>
        </div>
        <Button icon={<Download size={15} />} iconPosition="left" onClick={exportCsv}>
          تصدير CSV
        </Button>
      </div>

      {/* ── بطاقات الملخّص (لم تكن موجودة) ── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {cards.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className={`${bg} rounded-2xl p-4 border border-slate-100`}>
            <div className="flex items-center gap-2 mb-1">
              <Icon size={14} className={color} />
              <p className="text-xs font-bold text-slate-500">{label}</p>
            </div>
            <p className={`text-2xl font-extrabold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {deviceHealth.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className="font-bold text-slate-800">صحة أجهزة البصمة</h3>
            <span className={`text-xs font-bold px-2 py-1 rounded-full ${
              deviceHealth.some((device) => device.isStale)
                ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
              {deviceHealth.filter((device) => device.isStale).length} متأخر
            </span>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {deviceHealth.map((device) => (
              <div key={device.deviceId} className={`rounded-xl border p-3 ${
                device.isStale ? 'border-red-200 bg-red-50/50' : 'border-slate-100 bg-slate-50'}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold text-slate-800">{device.name}</p>
                  <span className={`w-2.5 h-2.5 rounded-full ${
                    !device.isActive ? 'bg-slate-400' : device.isStale ? 'bg-red-500' : 'bg-emerald-500'}`} />
                </div>
                <p className="text-xs text-slate-500 mt-1">{device.location ?? 'موقع غير محدد'}</p>
                <p className="text-xs text-slate-600 mt-2">
                  {device.minutesBehind == null ? 'لم يزامن قط' : `آخر مزامنة قبل ${device.minutesBehind} دقيقة`}
                  {' · '}{device.punchesToday} بصمة اليوم
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {summary && summary.avgMinutes > 0 ? (
        <div className="flex items-center gap-2 text-sm text-slate-600 bg-slate-50 rounded-xl px-4 py-2.5 border border-slate-100">
          <Timer size={15} className="text-slate-400" />
          متوسط ساعات العمل للحاضرين:
          <span className="font-bold text-slate-800">{fmtMinutes(summary.avgMinutes)}</span>
          {summary.firstIn ? (
            <span className="text-xs text-slate-400">
              · أبكر دخول {fmtTime(summary.firstIn)}
            </span>
          ) : null}
          {summary.lastOut ? (
            <span className="text-xs text-slate-400">
              · آخر خروج {fmtTime(summary.lastOut)}
            </span>
          ) : null}
        </div>
      ) : null}

      {/* ── أدوات الترشيح (لم تكن موجودة) ── */}
      <Card>
        <div className="p-4 flex flex-wrap items-center gap-3">
          {/* التاريخ */}
          <div className="flex items-center gap-1 bg-slate-50 rounded-xl border border-slate-200">
            <button
              type="button" onClick={() => shiftDay(-1)}
              aria-label="اليوم السابق"
              className="p-2 hover:bg-slate-100 rounded-r-xl"
            >
              <ChevronRight size={16} className="text-slate-600" />
            </button>
            <input
              type="date" value={day} max={format(new Date(), 'yyyy-MM-dd')}
              onChange={(e) => e.target.value && setDay(e.target.value)}
              className="bg-transparent px-2 py-2 text-sm outline-none font-medium text-slate-700"
            />
            <button
              type="button" onClick={() => shiftDay(1)}
              disabled={isToday}
              aria-label="اليوم التالي"
              className="p-2 hover:bg-slate-100 rounded-l-xl disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={16} className="text-slate-600" />
            </button>
          </div>

          {/* البحث */}
          <div className="relative flex-1 min-w-[200px]">
            <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search" value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث بالاسم أو الرمز الوظيفي..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pr-9 pl-3 py-2 text-sm outline-none focus:border-indigo-400"
            />
          </div>

          {/* القسم */}
          <select
            value={deptId} onChange={(e) => setDeptId(e.target.value)}
            aria-label="ترشيح بالقسم"
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400"
          >
            <option value="">كل الأقسام</option>
            {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>

          {/* الحالة */}
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as DailyAttendanceStatus | '')}
            aria-label="ترشيح بالحالة"
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400"
          >
            <option value="">كل الحالات</option>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>

          {hasFilters ? (
            <button
              type="button"
              onClick={() => { setDeptId(''); setStatus(''); setSearch(''); }}
              className="flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-700 px-2 py-2"
            >
              <X size={13} /> مسح الترشيح
            </button>
          ) : null}
        </div>
      </Card>

      {/* ── الجدول ── */}
      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-right py-4 px-4 font-bold text-slate-500">الموظف</th>
                <th className="text-right py-4 px-4 font-bold text-slate-500">الحالة</th>
                <th className="text-right py-4 px-4 font-bold text-slate-500">الدخول</th>
                <th className="text-right py-4 px-4 font-bold text-slate-500">الخروج</th>
                <th className="text-right py-4 px-4 font-bold text-slate-500">ساعات العمل</th>
                <th className="text-right py-4 px-4 font-bold text-slate-500">الاستراحات</th>
                <th className="text-right py-4 px-4 font-bold text-slate-500">الوجهة الحالية</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-16 text-slate-500">
                    <Loader className="animate-spin mx-auto mb-3" />
                    جاري تحميل سجلّات الحضور...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400">
                    {hasFilters
                      ? 'لا توجد نتائج مطابقة للترشيح'
                      : 'لا توجد بيانات موظفين لهذا اليوم'}
                  </td>
                </tr>
              ) : rows.map((r, i) => (
                <tr
                  key={r.employeeId}
                  className={`border-b border-slate-50 hover:bg-slate-50/80 transition-colors ${
                    i % 2 === 0 ? '' : 'bg-slate-50/30'
                  }`}
                >
                  <td className="py-4 px-4">
                    <p className="font-bold text-slate-800">{r.fullName}</p>
                    <p className="text-xs text-slate-500">
                      {r.department}
                      {r.employeeCode ? ` · ${r.employeeCode}` : ''}
                    </p>
                  </td>
                  <td className="py-4 px-4">
                    <Badge variant={STATUS_STYLE[r.status]} size="sm">{r.status}</Badge>
                  </td>
                  <td className="py-4 px-4 font-mono text-slate-600">
                    {r.checkIn ? (
                      <span className="flex items-center gap-1.5">
                        <LogIn size={14} className="text-emerald-500" /> {fmtTime(r.checkIn)}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="py-4 px-4 font-mono text-slate-600">
                    {r.checkOut ? (
                      <span className="flex items-center gap-1.5">
                        <LogOut size={14} className="text-rose-500" /> {fmtTime(r.checkOut)}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="py-4 px-4 text-slate-700 font-medium">
                    {fmtMinutes(r.workedMinutes)}
                  </td>
                  <td className="py-4 px-4 text-slate-600">
                    {r.breakCount > 0 ? (
                      <span>
                        {fmtMinutes(r.breakMinutes)}
                        <span className="text-xs text-slate-400"> ({r.breakCount})</span>
                      </span>
                    ) : '—'}
                  </td>
                  <td className="py-4 px-4">
                    {r.destination ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium bg-amber-50 text-amber-700 px-2 py-1 rounded-lg">
                        <MapPin size={11} /> {r.destination}
                      </span>
                    ) : <span className="text-slate-400">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && rows.length > 0 ? (
          <div className="px-4 py-3 border-t border-slate-100 text-xs text-slate-500">
            {rows.length} صفّ
            {summary && rows.length < summary.total
              ? ` من ${summary.total} (مُرشَّح)`
              : ''}
          </div>
        ) : null}
      </Card>
    </div>
  );
}
