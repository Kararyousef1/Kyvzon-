/**
 * ════════════════════════════════════════════════════════════════
 *  HRMovementAnalyticsPage — تحليلات البوابة وحركة الموظفين
 *
 *  ★★★ أُعيدت كتابتها في جولة 0350. الأعطال المُصلَحة — كلها مُثبتة
 *  تشغيلياً على Postgres محلي قبل أي سطر كُتب هنا:
 *
 *  ① **تسريب بين المستأجرين.** `NoTenantBaseService` كان يحذف
 *     `tenant_id` عند الإدراج، والسياسة تسمح بمرور `tenant_id IS NULL`
 *     ⇒ سجلّ زوّار شركةٍ مرئيّ لكل الشركات. مُثبَت بدور `authenticated`.
 *  ② `findVisitorLogs({ fromDate })` تُعلن المُعامل ولا تستعمله
 *     ⇒ مُرشِّح المدة بلا أثر على تبويب الزوّار. مُثبَت: 3 بدل 1.
 *  ③ التصدير يقرأ `v.visitor?.name/company/purpose/location` والجدول
 *     مسطّح ولا كائن `visitor` في أي استعلام. والعمودان company و
 *     location غير موجودين أصلاً ⇒ أربعة أعمدة فارغة أبداً.
 *  ④ أرشيف الوردية يُمرّر `fromDate` بلا حدّ أعلى ⇒ يُدرج حركات
 *     الورديات اللاحقة. مُثبَت: 2 بدل 1.
 *  ⑤ المخالفة تُشتقّ من نصّ `notes.includes('[مخالفة مسار 🚨]')`
 *     بينما العمود المنطقي `route_violation` موجود ومُهمَل.
 *  ⑥ `customer_email` عمود غير موجود ⇒ عمود فارغ في التصدير.
 *  ⑦ الصفحة كانت تفتح قناة Realtime مباشرة على Supabase باسم عالميّ
 *     `gatekeeper_alerts` بلا تمييز مستأجر.
 *  ⑧ `archiveSearch` يُقرأ من الحقل ولا يُرشِّح شيئاً.
 *  ⑨ الأرشيف يقرأ `session.session_name` و`gatekeeper_name` و
 *     `visitor_count` — **ثلاثة أعمدة غير موجودة** في المخطط (⇒ 0).
 *     و`session.session_name.includes(...)` يرمي استثناءً على undefined.
 *
 *  ★ الصفحة لا تلمس Supabase — كل شيء عبر `gatekeeperAnalyticsService`.
 * ════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  gatekeeperAnalyticsService,
  subscribeHandoverAlerts,
  type MovementAnalyticsRow,
  type VisitorAnalyticsRow,
  type SessionArchiveRow,
} from '../../services/sdk/GatekeeperAnalyticsService';
import { gatekeeperSessionService } from '../../services/sdk/GatekeeperService';
import { movementPermitService } from '../../services/sdk/MovementPermitService';
import { reviewService } from '../../services/sdk/ReviewService';
import Card, { CardHeader, CardTitle } from '../../shared/components/ui/Card';
import Button from '../../shared/components/ui/Button';
import {
  Download, Users, ArrowRightLeft, Calendar, BarChart3, Clock,
  Loader, Archive, Search, BellRing, Key, Star, MessageSquare, AlertTriangle,
} from 'lucide-react';
import { format } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useUIStore } from '../../core/stores';
import { getErrorMessage } from '../../services/errors';
import { exportToStyledExcel } from '../../utils/exportToExcel';

// ════════════════════════════════════════════════════
//  الأنواع المحلية
// ════════════════════════════════════════════════════

interface MovementPermitRecord {
  id: string;
  employee_id: string;
  employee_name?: string;
  department?: string;
  destination: string;
  purpose?: string;
  valid_from: string;
  valid_until: string;
  max_duration_minutes: number;
  status: 'approved' | 'used' | 'expired' | 'cancelled';
  used_at?: string;
}

interface CustomerReview {
  id: string;
  customer_name?: string;
  product_name?: string;
  rating: number;
  review_text?: string;
  created_at: string;
}

interface PendingSession {
  id: string;
  handover_status?: string;
  gatekeeper_id?: string;
  started_at: string;
}

type TimeFilter = 'today' | '7days' | '10days' | 'month' | 'year';
type TabKey =
  | 'movements' | 'visitors' | 'permits'
  | 'archive_visitors' | 'archive_movements' | 'reviews';

const RANGES: Record<TimeFilter, { label: string; from: () => Date }> = {
  today:  { label: 'اليوم',        from: () => { const d = new Date(); d.setHours(0,0,0,0); return d; } },
  '7days':{ label: 'آخر 7 أيام',   from: () => { const d = new Date(); d.setDate(d.getDate()-7); return d; } },
  '10days':{label: 'آخر 10 أيام',  from: () => { const d = new Date(); d.setDate(d.getDate()-10); return d; } },
  month:  { label: 'هذا الشهر',    from: () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); } },
  year:   { label: 'هذا العام',    from: () => { const d = new Date(); return new Date(d.getFullYear(), 0, 1); } },
};

/**
 * رمز مؤقت لتسليم المناوبة — بمولّد تشفيري.
 *
 * ★★ ثغرة أمنية مُصلَحة سابقاً (المرحلة 1) ومحفوظة هنا كما هي. كان:
 *      Math.floor(100 + Math.random() * 900).toString()
 *    ثلاث خانات = 900 احتمال · ومولّد غير تشفيري بذرته قابلة للاستنتاج.
 *    الرمز يفتح بوابة الشركة لحارس بديل — تخمينه دخول غير مصرّح به.
 *
 *    الآن ست خانات من `crypto.getRandomValues` مع طرح معياري
 *    (rejection sampling) يمنع انحياز `%`.
 */
function generateHandoverPin(): string {
  const MIN = 100000;
  const RANGE = 900000;
  const LIMIT = Math.floor(0xffffffff / RANGE) * RANGE;
  const buf = new Uint32Array(1);
  let v: number;
  do {
    crypto.getRandomValues(buf);
    v = buf[0];
  } while (v >= LIMIT);
  return String(MIN + (v % RANGE));
}

/** ثوانٍ ⇒ نصّ عربي. `null` تعني «لم يعد بعد» — لا صفراً. */
function formatDuration(secs: number | null): string {
  if (secs === null) return 'في الخارج ⏳';
  if (secs < 1) return 'أقل من ثانية';
  if (secs < 60) return `${secs} ثانية`;
  const mins = Math.floor(secs / 60);
  const rem = secs % 60;
  if (mins < 60) return rem > 0 ? `${mins} دقيقة و ${rem} ثانية` : `${mins} دقيقة`;
  const hours = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${hours} ساعة و ${m} دقيقة` : `${hours} ساعة`;
}

const fmt = (iso: string | null, fallback = '—'): string =>
  iso ? format(new Date(iso), 'yyyy/MM/dd hh:mm a') : fallback;

export default function HRMovementAnalyticsPage() {
  const { addToast } = useUIStore();
  const [activeTab, setActiveTab] = useState<TabKey>('movements');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('today');
  const [loading, setLoading] = useState(true);
  const [archiveSearch, setArchiveSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [movements, setMovements] = useState<MovementAnalyticsRow[]>([]);
  const [visitors, setVisitors] = useState<VisitorAnalyticsRow[]>([]);
  const [permits, setPermits] = useState<MovementPermitRecord[]>([]);
  const [reviews, setReviews] = useState<CustomerReview[]>([]);
  const [archive, setArchive] = useState<SessionArchiveRow[]>([]);
  const [pendingHandovers, setPendingHandovers] = useState<PendingSession[]>([]);
  const [pendingEndRequests, setPendingEndRequests] = useState<PendingSession[]>([]);

  const range = useMemo(() => {
    const from = RANGES[timeFilter].from();
    return { from: from.toISOString(), to: new Date().toISOString() };
  }, [timeFilter]);

  // ── تحميل البيانات ────────────────────────────────────────────
  const loadPending = useCallback(async () => {
    const [h, e] = await Promise.all([
      gatekeeperSessionService.findAll({
        filters: { is_active: true, handover_status: 'pending' },
      }).catch(() => []),
      gatekeeperSessionService.findAll({
        filters: { is_active: true, handover_status: 'pending_end' },
      }).catch(() => []),
    ]);
    setPendingHandovers((h || []) as unknown as PendingSession[]);
    setPendingEndRequests((e || []) as unknown as PendingSession[]);
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [mov, vis, per, rev, arc] = await Promise.all([
        gatekeeperAnalyticsService.movements(range.from, range.to),
        gatekeeperAnalyticsService.visitors(range.from, range.to),
        movementPermitService.findAll({ orderBy: 'created_at', ascending: false, limit: 500 })
          .catch(() => []),
        reviewService.findLatest(100).catch(() => []),
        gatekeeperAnalyticsService.sessionArchive(archiveSearch),
      ]);
      setMovements(mov);
      setVisitors(vis);
      setPermits((per || []) as unknown as MovementPermitRecord[]);
      setReviews((rev || []) as unknown as CustomerReview[]);
      setArchive(arc);
      await loadPending();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }, [range.from, range.to, archiveSearch, loadPending]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      await load();
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [load]);

  // ── الاشتراك اللحظي — عبر SDK ومحصور بالمستأجر (العطل ⑦) ──────
  useEffect(() => {
    const unsubscribe = subscribeHandoverAlerts((alert) => {
      addToast(
        alert.handoverStatus === 'pending'
          ? 'طلب تبديل طارئ من البوابة'
          : 'طلب إنهاء وردية مبكر من البوابة',
        'warning',
      );
      // ★ نُعيد القراءة من القاعدة بدل دفع صفّ الحدث في الحالة:
      //   المنطق القديم كان يُلحق كل حدث بلا تحقّق فيتكرّر الصفّ نفسه.
      void loadPending();
    });
    return unsubscribe;
  }, [addToast, loadPending]);

  // ── إجراءات ───────────────────────────────────────────────────
  const handleApproveHandover = async (session: PendingSession) => {
    const tempPin = generateHandoverPin();
    try {
      await gatekeeperSessionService.updateHandoverStatus(session.id, 'approved', tempPin);
      setPendingHandovers((prev) => prev.filter((s) => s.id !== session.id));
      addToast(`تمت الموافقة. الرمز المؤقت للحارس البديل: [ ${tempPin} ] — أخبره فوراً`, 'success');
    } catch (err) {
      addToast('فشل في الموافقة على الطلب: ' + getErrorMessage(err), 'error');
    }
  };

  const handleApproveEndShift = async (session: PendingSession) => {
    try {
      await gatekeeperSessionService.endSession(session.id);
      setPendingEndRequests((prev) => prev.filter((s) => s.id !== session.id));
      addToast('تمت الموافقة على إنهاء الوردية', 'success');
    } catch (err) {
      addToast('فشل في الموافقة على الطلب: ' + getErrorMessage(err), 'error');
    }
  };

  // ── التصدير ───────────────────────────────────────────────────
  const handleExport = () => {
    const label = RANGES[timeFilter].label;
    if (activeTab === 'movements') {
      exportToStyledExcel(
        `حركة_الموظفين_${label}`,
        ['#', 'الموظف', 'القسم', 'الوجهة', 'وقت الخروج', 'وقت العودة', 'المدة', 'مخالفة مسار', 'ملاحظات'],
        movements.map((m, i) => [
          String(i + 1), m.employeeName, m.department, m.destination,
          fmt(m.departureAt), fmt(m.returnedAt, 'في الخارج'),
          formatDuration(m.durationSecs),
          // ★ العطل ⑤: من العمود المنطقي لا من نصّ الملاحظة
          m.routeViolation ? 'يوجد تلاعب بالمسار' : 'ملتزم',
          m.notes || '',
        ]),
      );
    } else if (activeTab === 'visitors') {
      // ★ العطل ③: أعمدة مسطّحة حقيقية بدل v.visitor?.* المعدوم.
      //   وأُسقط عمودا «الشركة» و«الموقع» — لا وجود لهما في المخطط.
      exportToStyledExcel(
        `سجل_الزوار_${label}`,
        ['#', 'الزائر', 'الهاتف', 'رقم الهوية', 'الغرض', 'المضيف', 'وقت الدخول', 'وقت الخروج', 'المدة'],
        visitors.map((v, i) => [
          String(i + 1), v.visitorName, v.visitorPhone, v.idNumber,
          v.purpose, v.hostName, fmt(v.checkInTime),
          fmt(v.checkOutTime, 'لم يخرج'), formatDuration(v.durationSecs),
        ]),
      );
    } else if (activeTab === 'permits') {
      exportToStyledExcel(
        `تصاريح_الحركة_${label}`,
        ['#', 'الموظف', 'القسم', 'الوجهة', 'الغرض', 'من', 'إلى', 'المدة المسموحة', 'الحالة'],
        permits.map((p, i) => [
          String(i + 1), p.employee_name || '—', p.department || '—', p.destination,
          p.purpose || '—', fmt(p.valid_from), fmt(p.valid_until),
          `${p.max_duration_minutes} دقيقة`, p.status,
        ]),
      );
    } else if (activeTab === 'reviews') {
      // ★ العطل ⑥: أُسقط عمود «البريد الإلكتروني» — لا وجود له في المخطط
      exportToStyledExcel(
        `مراجعات_العملاء_${label}`,
        ['#', 'العميل', 'المنتج', 'التقييم', 'نص المراجعة', 'التاريخ'],
        reviews.map((r, i) => [
          String(i + 1), r.customer_name || '—', r.product_name || '—',
          `${r.rating} نجوم`, r.review_text || '', fmt(r.created_at),
        ]),
      );
    }
  };

  /** ★ العطل ④: الحركات محصورة بين بداية الوردية ونهايتها */
  const handleExportShift = async (session: SessionArchiveRow, kind: 'visitors' | 'movements') => {
    try {
      if (kind === 'movements') {
        const rows = await gatekeeperAnalyticsService.shiftMovements(session.id);
        if (rows.length === 0) { addToast('لا حركات في هذه الوردية', 'warning'); return; }
        exportToStyledExcel(
          `حركة_وردية_${fmt(session.startedAt, 'وردية')}`,
          ['#', 'الموظف', 'القسم', 'الوجهة', 'وقت الخروج', 'وقت العودة', 'المدة', 'مخالفة مسار'],
          rows.map((m, i) => [
            String(i + 1), m.employeeName, m.department, m.destination,
            fmt(m.departureAt), fmt(m.returnedAt, 'في الخارج'),
            formatDuration(m.durationSecs), m.routeViolation ? 'يوجد تلاعب' : 'ملتزم',
          ]),
        );
      } else {
        const all = await gatekeeperAnalyticsService.visitors(session.startedAt,
          session.endedAt || new Date().toISOString());
        const rows = all.filter((v) => v.sessionId === session.id);
        if (rows.length === 0) { addToast('لا زوّار في هذه الوردية', 'warning'); return; }
        exportToStyledExcel(
          `زوار_وردية_${fmt(session.startedAt, 'وردية')}`,
          ['#', 'الزائر', 'الهاتف', 'رقم الهوية', 'الغرض', 'المضيف', 'وقت الدخول', 'وقت الخروج'],
          rows.map((v, i) => [
            String(i + 1), v.visitorName, v.visitorPhone, v.idNumber,
            v.purpose, v.hostName, fmt(v.checkInTime), fmt(v.checkOutTime, 'لم يخرج'),
          ]),
        );
      }
      addToast('تم تصدير أرشيف الوردية', 'success');
    } catch (err) {
      addToast('فشل التصدير: ' + getErrorMessage(err), 'error');
    }
  };

  // ── الرسم البياني ─────────────────────────────────────────────
  const chartData = useMemo(() => {
    const src: { ts: string }[] =
      activeTab === 'movements' ? movements.map((m) => ({ ts: m.departureAt }))
      : activeTab === 'visitors' ? visitors.map((v) => ({ ts: v.checkInTime }))
      : [];
    const byDay = new Map<string, number>();
    for (const r of src) {
      if (!r.ts) continue;
      const key = format(new Date(r.ts), 'yyyy-MM-dd');
      byDay.set(key, (byDay.get(key) || 0) + 1);
    }
    return Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date: format(new Date(date), 'dd/MM'), count }));
  }, [activeTab, movements, visitors]);

  const tabBtn = (isActive: boolean, dark = false) =>
    `px-4 sm:px-5 py-2 rounded-xl font-bold text-sm transition-all flex items-center gap-2 ${
      isActive ? (dark ? 'bg-slate-800 text-white shadow-md' : 'bg-indigo-600 text-white shadow-md')
               : 'bg-white text-slate-500 hover:bg-slate-50'}`;

  const isArchive = activeTab === 'archive_visitors' || activeTab === 'archive_movements';
  const violations = movements.filter((m) => m.routeViolation).length;

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      {/* ═══ تنبيهات البوابة ═══ */}
      {pendingEndRequests.length > 0 && (
        <div className="bg-rose-50 border-2 border-rose-500 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Clock className="text-rose-600 w-8 h-8 shrink-0" />
            <div>
              <h3 className="font-extrabold text-rose-700">طلب إنهاء وردية مبكر</h3>
              <p className="text-rose-600 text-sm">
                وردية بدأت {fmt(pendingEndRequests[0].started_at)} — الحارس يطلب إنهاءها قبل وقتها.
              </p>
            </div>
          </div>
          <Button onClick={() => handleApproveEndShift(pendingEndRequests[0])} variant="danger"
                  icon={<Clock size={16} />} iconPosition="left">
            موافقة وإغلاق الوردية
          </Button>
        </div>
      )}
      {pendingHandovers.length > 0 && (
        <div className="bg-rose-50 border-2 border-rose-500 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <BellRing className="text-rose-600 w-8 h-8 shrink-0" />
            <div>
              <h3 className="font-extrabold text-rose-700">طلب استبدال طارئ</h3>
              <p className="text-rose-600 text-sm">
                وردية بدأت {fmt(pendingHandovers[0].started_at)} — الحارس يطلب بديلاً.
              </p>
            </div>
          </div>
          <Button onClick={() => handleApproveHandover(pendingHandovers[0])} variant="danger"
                  icon={<Key size={16} />} iconPosition="left">
            موافقة وتوليد رمز للبديل
          </Button>
        </div>
      )}

      {/* ═══ الترويسة ═══ */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-800 flex items-center gap-2">
            <BarChart3 className="text-indigo-600" /> تحليلات البوابة وحركة الموظفين
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            بيانات مستأجرك وحده — كل رقم محسوب في قاعدة البيانات
          </p>
        </div>
        {!isArchive && (
          <div className="flex items-center gap-2">
            <select
              value={timeFilter}
              onChange={(e) => setTimeFilter(e.target.value as TimeFilter)}
              className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold outline-none focus:border-indigo-400"
            >
              {(Object.keys(RANGES) as TimeFilter[]).map((k) => (
                <option key={k} value={k}>{RANGES[k].label}</option>
              ))}
            </select>
            <Button onClick={handleExport} variant="primary"
                    icon={<Download size={16} />} iconPosition="left">
              تصدير Excel
            </Button>
          </div>
        )}
      </div>

      {error && (
        <Card className="bg-rose-50 border-rose-200">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="text-rose-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-bold text-rose-800">تعذّر تحميل البيانات</p>
              <p className="text-xs text-rose-700 mt-1">{error}</p>
            </div>
          </div>
        </Card>
      )}

      {/* ═══ التبويبات ═══ */}
      <div className="flex gap-3 border-b border-slate-200 pb-4 flex-wrap">
        <button onClick={() => setActiveTab('movements')} className={tabBtn(activeTab === 'movements')}>
          <ArrowRightLeft size={16} /> حركة الموظفين
        </button>
        <button onClick={() => setActiveTab('visitors')} className={tabBtn(activeTab === 'visitors')}>
          <Users size={16} /> سجل الزوار
        </button>
        <button onClick={() => setActiveTab('permits')} className={tabBtn(activeTab === 'permits')}>
          <Key size={16} /> تصاريح الحركة
        </button>
        <button onClick={() => setActiveTab('archive_movements')} className={tabBtn(activeTab === 'archive_movements', true)}>
          <Archive size={16} /> أرشيف الموظفين
        </button>
        <button onClick={() => setActiveTab('archive_visitors')} className={tabBtn(activeTab === 'archive_visitors', true)}>
          <Archive size={16} /> أرشيف الزوار
        </button>
        <button onClick={() => setActiveTab('reviews')} className={tabBtn(activeTab === 'reviews')}>
          <Star size={16} /> مراجعات العملاء
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-20 text-slate-500 gap-3">
          <Loader className="animate-spin" /> جاري تحميل البيانات...
        </div>
      ) : isArchive ? (
        /* ═══ الأرشيف ═══ */
        <Card>
          <CardHeader>
            <CardTitle>
              {activeTab === 'archive_visitors' ? 'أرشيف زوّار البوابة' : 'أرشيف حركة الموظفين'}
            </CardTitle>
          </CardHeader>
          {/* ★ العطل ⑧: البحث يُرسَل إلى القاعدة ويُرشِّح فعلاً */}
          <div className="relative mb-4">
            <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="ابحث باسم الحارس أو بالتاريخ (2026-08-06)..."
              value={archiveSearch}
              onChange={(e) => setArchiveSearch(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pr-10 pl-4 py-2.5 text-sm outline-none focus:border-indigo-400"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right whitespace-nowrap">
              <thead className="bg-slate-800 text-white">
                <tr>
                  {/* ★ العطل ⑨: «اسم الوردية» عمود غير موجود — استُبدل
                      بالحارس والتوقيت وهما موجودان فعلاً */}
                  <th className="p-3 font-bold rounded-tr-xl">الحارس</th>
                  <th className="p-3 font-bold">البداية</th>
                  <th className="p-3 font-bold">الإغلاق</th>
                  <th className="p-3 font-bold">المدة</th>
                  <th className="p-3 font-bold">
                    {activeTab === 'archive_visitors' ? 'الزوّار' : 'الحركات'}
                  </th>
                  <th className="p-3 font-bold rounded-tl-xl">تصدير</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {archive.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-3 font-bold text-slate-700">{s.gatekeeperName}</td>
                    <td className="p-3 text-slate-500 font-mono text-xs">{fmt(s.startedAt)}</td>
                    <td className="p-3 text-slate-500 font-mono text-xs">{fmt(s.endedAt, 'غير محدد')}</td>
                    <td className="p-3 text-slate-600">{formatDuration(s.durationSecs)}</td>
                    <td className="p-3 font-bold text-indigo-600">
                      {activeTab === 'archive_visitors' ? s.visitorCount : s.movementCount}
                    </td>
                    <td className="p-3">
                      <Button
                        size="xs" variant="outline" icon={<Download size={14} />}
                        onClick={() => handleExportShift(
                          s, activeTab === 'archive_visitors' ? 'visitors' : 'movements')}
                      >
                        تحميل السجل
                      </Button>
                    </td>
                  </tr>
                ))}
                {archive.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400">
                      {archiveSearch ? 'لا نتائج مطابقة للبحث' : 'لا ورديات مغلقة في الأرشيف'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      ) : activeTab === 'permits' ? (
        /* ═══ التصاريح ═══ */
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key size={18} className="text-indigo-600" /> تصاريح الحركة
            </CardTitle>
          </CardHeader>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            {([
              ['approved',  'نشطة',    'emerald'],
              ['used',      'مستخدمة', 'blue'],
              ['expired',   'منتهية',  'amber'],
              ['cancelled', 'ملغاة',   'rose'],
            ] as const).map(([st, label, color]) => (
              <div key={st} className={`bg-${color}-50 rounded-xl p-3`}>
                <p className={`text-2xl font-extrabold text-${color}-700`}>
                  {permits.filter((p) => p.status === st).length}
                </p>
                <p className={`text-xs text-${color}-600`}>{label}</p>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-sm text-right whitespace-nowrap">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="p-3 font-bold">الموظف</th>
                  <th className="p-3 font-bold">الوجهة</th>
                  <th className="p-3 font-bold">الصلاحية حتى</th>
                  <th className="p-3 font-bold">المدة</th>
                  <th className="p-3 font-bold">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {permits.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-3 font-semibold text-slate-700">{p.employee_name || 'موظف'}</td>
                    <td className="p-3 text-slate-600">{p.destination}</td>
                    <td className="p-3 text-slate-500 font-mono text-xs">{fmt(p.valid_until)}</td>
                    <td className="p-3 text-slate-600">{p.max_duration_minutes} دقيقة</td>
                    <td className="p-3">
                      <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                        p.status === 'approved' ? 'bg-emerald-50 text-emerald-700'
                        : p.status === 'used' ? 'bg-blue-50 text-blue-700'
                        : 'bg-slate-100 text-slate-600'}`}>
                        {p.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {permits.length === 0 && (
                  <tr><td colSpan={5} className="p-8 text-center text-slate-400">لا تصاريح حركة</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      ) : activeTab === 'reviews' ? (
        /* ═══ المراجعات ═══ */
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare size={18} className="text-indigo-600" /> مراجعات وتقييمات العملاء
            </CardTitle>
          </CardHeader>
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-sm text-right whitespace-nowrap">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  {/* ★ العطل ⑥: أُسقط «البريد الإلكتروني» — لا عمود له */}
                  <th className="p-3 font-bold">العميل</th>
                  <th className="p-3 font-bold">المنتج</th>
                  <th className="p-3 font-bold">التقييم</th>
                  <th className="p-3 font-bold">المراجعة</th>
                  <th className="p-3 font-bold">التاريخ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reviews.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-3 font-semibold text-slate-700">{r.customer_name || '—'}</td>
                    <td className="p-3 text-slate-600 font-medium">{r.product_name || '—'}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star key={i} size={12}
                                className={i < r.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-200'} />
                        ))}
                      </div>
                    </td>
                    <td className="p-3 text-slate-500 max-w-xs truncate" title={r.review_text}>
                      {r.review_text}
                    </td>
                    <td className="p-3 text-slate-400 font-mono text-xs">{fmt(r.created_at)}</td>
                  </tr>
                ))}
                {reviews.length === 0 && (
                  <tr><td colSpan={5} className="p-8 text-center text-slate-400">لا مراجعات مسجّلة</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        /* ═══ الحركة والزوّار ═══ */
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-indigo-50 border-indigo-200">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-indigo-200 rounded-lg text-indigo-700"><Calendar size={18} /></div>
                <h3 className="font-bold text-indigo-900 text-sm">إجمالي السجلات</h3>
              </div>
              <p className="text-3xl font-extrabold text-indigo-700">
                {activeTab === 'movements' ? movements.length : visitors.length}
              </p>
            </Card>
            <Card className="bg-amber-50 border-amber-200">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-amber-200 rounded-lg text-amber-700"><Clock size={18} /></div>
                <h3 className="font-bold text-amber-900 text-sm">
                  {activeTab === 'movements' ? 'لم يعودوا بعد' : 'لم يخرجوا بعد'}
                </h3>
              </div>
              <p className="text-3xl font-extrabold text-amber-700">
                {activeTab === 'movements'
                  ? movements.filter((m) => m.returnedAt === null).length
                  : visitors.filter((v) => v.checkOutTime === null).length}
              </p>
            </Card>
            {activeTab === 'movements' && (
              <Card className="bg-rose-50 border-rose-200">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-rose-200 rounded-lg text-rose-700"><AlertTriangle size={18} /></div>
                  <h3 className="font-bold text-rose-900 text-sm">مخالفات مسار</h3>
                </div>
                {/* ★ العطل ⑤: من العمود المنطقي لا من نصّ الملاحظة */}
                <p className="text-3xl font-extrabold text-rose-700">{violations}</p>
              </Card>
            )}
          </div>

          <Card>
            <CardHeader><CardTitle>معدل الحركة حسب الأيام</CardTitle></CardHeader>
            {chartData.length === 0 ? (
              <p className="text-center py-16 text-sm text-slate-400">لا بيانات في هذه المدة</p>
            ) : (
              <div className="h-64 w-full mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                    <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '12px' }} />
                    <Bar dataKey="count" fill="#4f46e5" radius={[4, 4, 0, 0]} name="العدد" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader><CardTitle>أحدث السجلات</CardTitle></CardHeader>
            <div className="overflow-x-auto mt-4">
              <table className="w-full text-sm text-right whitespace-nowrap">
                <thead className="bg-slate-50 text-slate-500">
                  {activeTab === 'movements' ? (
                    <tr>
                      <th className="p-3 font-bold">الموظف</th>
                      <th className="p-3 font-bold">القسم</th>
                      <th className="p-3 font-bold">الوجهة</th>
                      <th className="p-3 font-bold">وقت الخروج</th>
                      <th className="p-3 font-bold">المدة</th>
                      <th className="p-3 font-bold">مخالفة مسار</th>
                    </tr>
                  ) : (
                    <tr>
                      {/* ★ العطل ③: أعمدة موجودة فعلاً */}
                      <th className="p-3 font-bold">الزائر</th>
                      <th className="p-3 font-bold">الهاتف</th>
                      <th className="p-3 font-bold">الغرض</th>
                      <th className="p-3 font-bold">المضيف</th>
                      <th className="p-3 font-bold">وقت الدخول</th>
                      <th className="p-3 font-bold">المدة</th>
                    </tr>
                  )}
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activeTab === 'movements' ? movements.slice(0, 20).map((m) => (
                    <tr key={m.id} className={m.routeViolation ? 'bg-rose-50' : 'hover:bg-slate-50'}>
                      <td className="p-3 font-semibold text-slate-700">{m.employeeName}</td>
                      <td className="p-3 text-slate-600">{m.department}</td>
                      <td className="p-3 text-slate-600">{m.destination}</td>
                      <td className="p-3 text-slate-500 font-mono text-xs">{fmt(m.departureAt)}</td>
                      <td className="p-3 text-slate-600">{formatDuration(m.durationSecs)}</td>
                      <td className="p-3">
                        {m.routeViolation
                          ? <span className="text-xs font-bold bg-rose-100 text-rose-700 px-2 py-1 rounded-md">مخالفة مسار</span>
                          : <span className="text-xs text-slate-400">—</span>}
                      </td>
                    </tr>
                  )) : visitors.slice(0, 20).map((v) => (
                    <tr key={v.id} className="hover:bg-slate-50">
                      <td className="p-3 font-semibold text-slate-700">{v.visitorName}</td>
                      <td className="p-3 text-slate-600 font-mono text-xs">{v.visitorPhone}</td>
                      <td className="p-3 text-slate-600">{v.purpose}</td>
                      <td className="p-3 text-slate-600">{v.hostName}</td>
                      <td className="p-3 text-slate-500 font-mono text-xs">{fmt(v.checkInTime)}</td>
                      <td className="p-3 text-slate-600">{formatDuration(v.durationSecs)}</td>
                    </tr>
                  ))}
                  {(activeTab === 'movements' ? movements.length : visitors.length) === 0 && (
                    <tr><td colSpan={6} className="p-6 text-center text-slate-400">لا بيانات في هذه المدة</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
