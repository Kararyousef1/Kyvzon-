/**
 * ════════════════════════════════════════════════════════════════
 *  DataExportsPage — الصادرات وأحداث الناقلين
 *
 *  المسار: /app/tech-portal/data-exports
 *
 *  ═══ الأعطال المُثبَتة تشغيلياً (0332) ══════════════════════════
 *
 *  ① `tech_export_log` أعادت **0 صفاً** بينما خمس صادرات حقيقية في
 *     القاعدة للمستأجر نفسه. السبب: قرأت `export_logs` وحده وهو جدول
 *     تسجيل يدوي لا تكتب فيه مسارات التصدير الأربعة الفعلية.
 *
 *  ② صادرة `failed` كانت موجودة بلا سطح عرض: لا التقني يراها ولا
 *     طالبها يعلم أن تصديره سقط.
 *
 *  ③ صادرة `queued` منذ 30 ساعة — عالقة تبدو «في الطابور» إلى الأبد.
 *     العالق أخطر من الفاشل لأنه لا يُنبّه أحداً.
 *
 *  ④ حدثا ناقل شحن `processed=false` (أحدهما عمره 30 ساعة) بلا أي عرض.
 *
 *  ★ الصفحة لا تلمس Supabase مباشرة — كل شيء عبر TechIntegrationsService.
 *  ★ الدوال في القاعدة SECURITY INVOKER فتحترم RLS كل جدول: التقني يرى
 *    بيانات شركته وحدها، وصادرات المالية تحتاج عضوية كيان.
 * ════════════════════════════════════════════════════════════════
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Download, RefreshCw, Loader2, AlertTriangle, Truck,
  Clock, XCircle, CheckCircle2, PackageSearch, FileWarning,
} from 'lucide-react';
import {
  techIntegrationsService,
  type ExportRecord,
  type ExportSummaryRow,
  type ExportFailure,
  type CarrierWebhookEvent,
  type CarrierWebhookSummary,
  type ExportSource,
} from '../../../services/sdk/TechIntegrationsService';
import { getErrorMessage } from '../../../services/errors';
import { useUIStore } from '../../../core/stores';

/** عتبة اعتبار الصادرة عالقة — قابلة للتغيير من الواجهة */
const STUCK_PRESETS = [
  { hours: 1, label: 'ساعة' },
  { hours: 6, label: '6 ساعات' },
  { hours: 24, label: 'يوم' },
  { hours: 72, label: '3 أيام' },
] as const;

const SOURCE_OPTIONS: { value: ExportSource | ''; label: string }[] = [
  { value: '', label: 'كل المصادر' },
  { value: 'finance', label: 'تقارير المالية' },
  { value: 'inventory', label: 'تقارير المخزون' },
  { value: 'mrp_bom', label: 'شجرة المواد' },
  { value: 'mrp_mfg', label: 'تقارير التصنيع' },
  { value: 'legacy', label: 'تصدير مباشر' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'كل الحالات' },
  { value: 'ready', label: 'جاهز' },
  { value: 'failed', label: 'فشل' },
  { value: 'queued', label: 'في الطابور' },
  { value: 'processing', label: 'قيد المعالجة' },
  { value: 'generating', label: 'قيد التوليد' },
  { value: 'requested', label: 'مطلوب' },
  { value: 'cancelled', label: 'ملغى' },
  { value: 'expired', label: 'منتهٍ' },
];

function formatWhen(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ar', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

/** ساعات → نص عربي مقروء. القيمة تأتي محسوبة من القاعدة لا من المتصفح. */
function formatAge(hours: number): string {
  if (!Number.isFinite(hours) || hours < 0) return '—';
  if (hours < 1) return `${Math.round(hours * 60)} دقيقة`;
  if (hours < 48) return `${hours.toFixed(1)} ساعة`;
  return `${Math.floor(hours / 24)} يوم`;
}

function statusTone(status: string): string {
  if (status === 'failed') return 'text-rose-400';
  if (status === 'ready') return 'text-emerald-400';
  if (status === 'cancelled' || status === 'expired') return 'text-slate-500';
  return 'text-amber-400';
}

type Tab = 'exports' | 'failures' | 'carriers';

export default function DataExportsPage() {
  const { addToast } = useUIStore();
  const [tab, setTab] = useState<Tab>('exports');

  const [rows, setRows] = useState<ExportRecord[]>([]);
  const [summary, setSummary] = useState<ExportSummaryRow[]>([]);
  const [failures, setFailures] = useState<ExportFailure[]>([]);
  const [webhooks, setWebhooks] = useState<CarrierWebhookEvent[]>([]);
  const [carriers, setCarriers] = useState<CarrierWebhookSummary[]>([]);

  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<ExportSource | ''>('');
  const [status, setStatus] = useState('');
  const [stuckHours, setStuckHours] = useState<number>(6);
  const [onlyPending, setOnlyPending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, s, f, w, c] = await Promise.all([
        techIntegrationsService.exportLog({
          source: source === '' ? null : source,
          status: status === '' ? null : status,
          limit: 200,
        }),
        techIntegrationsService.exportSummary(30),
        techIntegrationsService.exportFailures(stuckHours),
        techIntegrationsService.carrierWebhooks({
          processed: onlyPending ? false : null,
          limit: 200,
        }),
        techIntegrationsService.webhookSummary(7),
      ]);
      setRows(r);
      setSummary(s);
      setFailures(f);
      setWebhooks(w);
      setCarriers(c);
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [source, status, stuckHours, onlyPending, addToast]);

  useEffect(() => { void load(); }, [load]);

  const totals = useMemo(() => {
    const total = summary.reduce((a, r) => a + r.total, 0);
    const failed = summary.reduce((a, r) => a + r.failed, 0);
    const pending = summary.reduce((a, r) => a + r.pending, 0);
    const stuck = failures.filter((f) => f.kind === 'stuck').length;
    const carrierPending = carriers.reduce((a, r) => a + r.pending, 0);
    return { total, failed, pending, stuck, carrierPending };
  }, [summary, failures, carriers]);

  /** أقدم حدث ناقل عالق — يأتي محسوباً من القاعدة */
  const oldestCarrier = useMemo(
    () => carriers.reduce((m, r) => (r.pending > 0 && r.oldestHours > m ? r.oldestHours : m), 0),
    [carriers],
  );

  return (
    <div dir="rtl" className="space-y-5">
      {/* ── الهيدر ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-950/60 border border-cyan-800 flex items-center justify-center">
            <Download className="text-cyan-400" size={18} />
          </div>
          <div>
            <h1 className="text-lg font-black text-slate-100">الصادرات وأحداث الناقلين</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              كل ما يخرج من بيانات شركتك، وكل ما يرد من ناقلي الشحن
            </p>
          </div>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm font-bold text-slate-200 hover:bg-slate-700 disabled:opacity-50"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          تحديث
        </button>
      </div>

      {/* ── بطاقات القياس ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Download size={14} className="text-slate-500" />
            <span className="text-[11px] text-slate-500 font-bold">صادرات 30 يوماً</span>
          </div>
          <p className="text-2xl font-black text-slate-100">{totals.total}</p>
        </div>

        <div
          className={`rounded-2xl border p-4 ${
            totals.failed > 0
              ? 'border-rose-800 bg-rose-950/30'
              : 'border-slate-700 bg-slate-900/60'
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <XCircle size={14} className={totals.failed > 0 ? 'text-rose-400' : 'text-slate-500'} />
            <span className="text-[11px] text-slate-500 font-bold">فاشلة</span>
          </div>
          <p className={`text-2xl font-black ${totals.failed > 0 ? 'text-rose-300' : 'text-slate-100'}`}>
            {totals.failed}
          </p>
        </div>

        <div
          className={`rounded-2xl border p-4 ${
            totals.stuck > 0
              ? 'border-amber-800 bg-amber-950/30'
              : 'border-slate-700 bg-slate-900/60'
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <Clock size={14} className={totals.stuck > 0 ? 'text-amber-400' : 'text-slate-500'} />
            <span className="text-[11px] text-slate-500 font-bold">
              عالقة أكثر من {STUCK_PRESETS.find((p) => p.hours === stuckHours)?.label ?? `${stuckHours} ساعة`}
            </span>
          </div>
          <p className={`text-2xl font-black ${totals.stuck > 0 ? 'text-amber-300' : 'text-slate-100'}`}>
            {totals.stuck}
          </p>
        </div>

        <div
          className={`rounded-2xl border p-4 ${
            totals.carrierPending > 0
              ? 'border-amber-800 bg-amber-950/30'
              : 'border-slate-700 bg-slate-900/60'
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <Truck size={14} className={totals.carrierPending > 0 ? 'text-amber-400' : 'text-slate-500'} />
            <span className="text-[11px] text-slate-500 font-bold">أحداث ناقلين معلّقة</span>
          </div>
          <p className={`text-2xl font-black ${totals.carrierPending > 0 ? 'text-amber-300' : 'text-slate-100'}`}>
            {totals.carrierPending}
          </p>
          {oldestCarrier > 0 && (
            <p className="text-[10px] text-amber-500/80 mt-0.5">
              أقدمها منذ {formatAge(oldestCarrier)}
            </p>
          )}
        </div>
      </div>

      {/* ── تنبيه المتعثّرات ── */}
      {failures.length > 0 && tab !== 'failures' && (
        <button
          onClick={() => setTab('failures')}
          className="w-full flex items-center gap-3 rounded-2xl border border-rose-800 bg-rose-950/30 px-5 py-3 text-right hover:bg-rose-950/50 transition"
        >
          <AlertTriangle className="text-rose-400 shrink-0" size={18} />
          <span className="text-sm text-rose-200 font-bold">
            {failures.length} صادرة متعثّرة تحتاج مراجعة
          </span>
          <span className="text-xs text-rose-400/70 mr-auto">عرض التفاصيل ←</span>
        </button>
      )}

      {/* ── التبويبات ── */}
      <div className="flex gap-1 border-b border-slate-800">
        {([
          { id: 'exports' as const, label: 'سجلّ الصادرات', icon: Download, count: rows.length },
          { id: 'failures' as const, label: 'المتعثّرة', icon: FileWarning, count: failures.length },
          { id: 'carriers' as const, label: 'أحداث الناقلين', icon: Truck, count: webhooks.length },
        ]).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold border-b-2 -mb-px transition ${
              tab === t.id
                ? 'border-cyan-500 text-cyan-300'
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            <t.icon size={14} />
            {t.label}
            <span className="text-[10px] bg-slate-800 rounded-full px-1.5 py-0.5 text-slate-400">
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="animate-spin text-slate-600" size={26} />
        </div>
      )}

      {/* ══ ① سجلّ الصادرات ══ */}
      {!loading && tab === 'exports' && (
        <>
          {/* ملخّص المصادر */}
          {summary.length > 0 && (
            <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-5">
              <h3 className="font-bold text-slate-100 mb-3 text-sm">
                ملخّص آخر 30 يوماً حسب المصدر
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {summary.map((r) => (
                  <button
                    key={r.source}
                    onClick={() => setSource(source === r.source ? '' : r.source)}
                    className={`rounded-xl p-3 text-right transition border ${
                      source === r.source
                        ? 'bg-cyan-950/40 border-cyan-700'
                        : 'bg-slate-800/50 border-transparent hover:border-slate-700'
                    }`}
                  >
                    <p className="text-lg font-black text-slate-100">{r.total}</p>
                    <p className="text-[11px] text-slate-400 truncate">{r.sourceAr}</p>
                    <div className="flex items-center gap-2 mt-1 text-[10px]">
                      {r.failed > 0 && <span className="text-rose-400 font-bold">{r.failed} فشل</span>}
                      {r.pending > 0 && <span className="text-amber-400">{r.pending} معلّق</span>}
                      {r.failed === 0 && r.pending === 0 && (
                        <span className="text-emerald-500/70">{r.ready} جاهز</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* المرشّحات */}
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={source}
              onChange={(e) => setSource(e.target.value as ExportSource | '')}
              className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200"
            >
              {SOURCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            {(source !== '' || status !== '') && (
              <button
                onClick={() => { setSource(''); setStatus(''); }}
                className="px-3 py-2 text-xs text-slate-400 hover:text-slate-200"
              >
                إزالة المرشّحات
              </button>
            )}
          </div>

          <div className="rounded-2xl border border-slate-700 bg-slate-900/60 overflow-hidden">
            {rows.length === 0 ? (
              <div className="p-12 text-center">
                <PackageSearch className="mx-auto text-slate-700 mb-3" size={30} />
                <p className="text-sm text-slate-400 font-bold">لا صادرات مطابقة</p>
                <p className="text-xs text-slate-600 mt-1">
                  {source !== '' || status !== ''
                    ? 'جرّب إزالة المرشّحات'
                    : 'لم تُطلب أي عملية تصدير بعد'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-900">
                    <tr className="text-slate-400 text-xs">
                      <th className="text-right px-4 py-3 font-semibold">المصدر</th>
                      <th className="text-right px-4 py-3 font-semibold">المرجع</th>
                      <th className="text-right px-4 py-3 font-semibold">الصيغة</th>
                      <th className="text-right px-4 py-3 font-semibold">الحالة</th>
                      <th className="text-right px-4 py-3 font-semibold">الطالب</th>
                      <th className="text-right px-4 py-3 font-semibold">وقت الطلب</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {rows.map((x) => (
                      <tr key={`${x.source}-${x.id}`} className="hover:bg-slate-800/40 align-top">
                        <td className="px-4 py-3 text-slate-200 font-medium whitespace-nowrap">
                          {x.sourceAr}
                        </td>
                        <td className="px-4 py-3 text-slate-400 text-xs max-w-[22rem]">
                          <span className="break-words">{x.reference}</span>
                          {x.records !== null && (
                            <span className="text-slate-600"> · {x.records} سجلّ</span>
                          )}
                          {x.error && (
                            <p className="text-[11px] text-rose-400/90 mt-1 break-words">
                              {x.error}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-xs uppercase">{x.format}</td>
                        <td className="px-4 py-3 text-xs whitespace-nowrap">
                          <span className={`font-bold ${statusTone(x.status)}`}>{x.statusAr}</span>
                          {x.completedAt && x.status === 'ready' && (
                            <p className="text-[10px] text-slate-600 mt-0.5">
                              اكتمل {formatWhen(x.completedAt)}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-300 text-xs">{x.userName}</td>
                        <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                          {formatWhen(x.requestedAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ══ ② المتعثّرة ══ */}
      {!loading && tab === 'failures' && (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-500 font-bold">تُعدّ عالقة بعد:</span>
            {STUCK_PRESETS.map((p) => (
              <button
                key={p.hours}
                onClick={() => setStuckHours(p.hours)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  stuckHours === p.hours
                    ? 'bg-cyan-950/60 text-cyan-300 border border-cyan-800'
                    : 'bg-slate-800 text-slate-400 border border-slate-700 hover:text-slate-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="rounded-2xl border border-slate-700 bg-slate-900/60 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-800">
              <h3 className="font-bold text-slate-100 flex items-center gap-2 text-sm">
                <FileWarning size={15} className="text-rose-500" />
                الصادرات المتعثّرة
              </h3>
              <p className="text-[11px] text-slate-500 mt-1">
                الفاشل معروف، أمّا العالق فيبدو «قيد المعالجة» إلى الأبد فلا ينتبه له أحد.
                الأقدم أولاً.
              </p>
            </div>

            {failures.length === 0 ? (
              <div className="p-12 text-center">
                <CheckCircle2 className="mx-auto text-emerald-700 mb-3" size={30} />
                <p className="text-sm text-slate-300 font-bold">لا صادرة متعثّرة</p>
                <p className="text-xs text-slate-600 mt-1">
                  لا فشل، ولا شيء عالق أكثر من{' '}
                  {STUCK_PRESETS.find((p) => p.hours === stuckHours)?.label ?? `${stuckHours} ساعة`}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-800">
                {failures.map((f) => (
                  <div key={`${f.source}-${f.id}`} className="px-5 py-4 hover:bg-slate-800/30">
                    <div className="flex items-start gap-3 flex-wrap">
                      <span
                        className={`shrink-0 px-2 py-0.5 rounded-lg text-[11px] font-bold ${
                          f.kind === 'failed'
                            ? 'bg-rose-950/60 text-rose-300 border border-rose-800'
                            : 'bg-amber-950/60 text-amber-300 border border-amber-800'
                        }`}
                      >
                        {f.kindAr}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-slate-200 font-bold break-words">
                          {f.reference}
                          <span className="text-xs font-normal text-slate-500 mr-2">
                            {f.sourceAr}
                          </span>
                        </p>
                        {f.error && (
                          <p className="text-xs text-rose-400/90 mt-1 break-words">{f.error}</p>
                        )}
                        {!f.error && f.kind === 'stuck' && (
                          <p className="text-xs text-amber-400/80 mt-1">
                            الحالة «{f.status}» لم تتغيّر منذ {formatAge(f.ageHours)} — راجع المعالج
                            الخلفي
                          </p>
                        )}
                        <p className="text-[11px] text-slate-600 mt-1">
                          طلبها {f.userName} · {formatWhen(f.requestedAt)}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-slate-500 font-mono">
                        {formatAge(f.ageHours)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* ══ ③ أحداث الناقلين ══ */}
      {!loading && tab === 'carriers' && (
        <>
          {carriers.length > 0 && (
            <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-5">
              <h3 className="font-bold text-slate-100 mb-3 text-sm">
                ملخّص آخر 7 أيام حسب الناقل
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {carriers.map((c) => (
                  <div
                    key={c.carrierId ?? 'deleted'}
                    className={`rounded-xl p-3 border ${
                      c.pending > 0
                        ? 'bg-amber-950/20 border-amber-900/60'
                        : 'bg-slate-800/50 border-transparent'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-bold text-slate-200 truncate">{c.carrier}</p>
                      {c.isActive === false && (
                        <span className="text-[10px] text-slate-500 shrink-0">معطّل</span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mb-2">{c.provider}</p>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-slate-400">{c.total} حدث</span>
                      <span className="text-emerald-500/80">{c.processed} معالَج</span>
                      {c.pending > 0 && (
                        <span className="text-amber-400 font-bold">{c.pending} معلّق</span>
                      )}
                    </div>
                    {c.pending > 0 && c.oldestHours > 0 && (
                      <p className="text-[10px] text-amber-500/70 mt-1">
                        أقدم عالق منذ {formatAge(c.oldestHours)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer w-fit">
            <input
              type="checkbox"
              checked={onlyPending}
              onChange={(e) => setOnlyPending(e.target.checked)}
              className="w-4 h-4 rounded bg-slate-800 border-slate-600"
            />
            غير المعالَجة فقط
          </label>

          <div className="rounded-2xl border border-slate-700 bg-slate-900/60 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-800">
              <h3 className="font-bold text-slate-100 flex items-center gap-2 text-sm">
                <Truck size={15} className="text-slate-500" />
                أحداث ناقلي الشحن الواردة
              </h3>
              <p className="text-[11px] text-slate-500 mt-1">
                غير المعالَج أولاً. الحدث العالق يعني أن تتبّع الشحنة توقّف عند العميل.
              </p>
            </div>

            {webhooks.length === 0 ? (
              <div className="p-12 text-center">
                <Truck className="mx-auto text-slate-700 mb-3" size={30} />
                <p className="text-sm text-slate-400 font-bold">لا أحداث ناقلين</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-900">
                    <tr className="text-slate-400 text-xs">
                      <th className="text-right px-4 py-3 font-semibold">الحالة</th>
                      <th className="text-right px-4 py-3 font-semibold">الناقل</th>
                      <th className="text-right px-4 py-3 font-semibold">رقم التتبّع</th>
                      <th className="text-right px-4 py-3 font-semibold">الحدث</th>
                      <th className="text-right px-4 py-3 font-semibold">الحمولة</th>
                      <th className="text-right px-4 py-3 font-semibold">منذ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {webhooks.map((w) => (
                      <tr key={w.id} className="hover:bg-slate-800/40">
                        <td className="px-4 py-3 whitespace-nowrap">
                          {w.processed ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
                              <CheckCircle2 size={12} /> معالَج
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] text-amber-400 font-bold">
                              <Clock size={12} /> معلّق
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-200 text-xs">
                          {w.carrier}
                          <span className="text-slate-600"> · {w.provider}</span>
                        </td>
                        <td className="px-4 py-3 text-slate-400 text-xs font-mono">{w.tracking}</td>
                        <td className="px-4 py-3 text-slate-300 text-xs">{w.event}</td>
                        <td className="px-4 py-3 text-xs">
                          {w.payloadKeys === 0 ? (
                            <span className="text-rose-400/80">فارغة</span>
                          ) : (
                            <span className="text-slate-500">{w.payloadKeys} حقل</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                          {formatAge(w.ageHours)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
