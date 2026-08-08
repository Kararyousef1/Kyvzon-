/**
 * ════════════════════════════════════════════════════════════════
 *  IntegrationsPage — صحّة التكاملات وسجلّ الصادرات
 *
 *  المسار: /app/tech-portal/integrations
 *
 *  ★ الفجوة: التكاملات كانت بلا واجهة إطلاقاً. حين يتوقّف تكامل لا
 *    يعلم أحد إلا حين تختفي البيانات. و`error_message` جاهز في الجدول
 *    ولا شيء يقرؤه.
 *
 *  ★ الصادرات حدث أمني (من صدّر ماذا ومتى) وكانت بلا عرض فلا تُدقَّق.
 * ════════════════════════════════════════════════════════════════
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Plug, RefreshCw, Loader2, AlertTriangle, CheckCircle2,
  PauseCircle, Download, ArrowDownUp, ChevronDown, ChevronUp,
} from 'lucide-react';
import {
  techIntegrationsService,
  type IntegrationHealth,
  type IntegrationEvent,
  type ExportRecord,
  type ExportSummaryRow,
} from '../../../services/sdk/TechIntegrationsService';
import { getErrorMessage } from '../../../services/errors';
import { useUIStore } from '../../../core/stores';

const STATUS_LABEL: Record<string, string> = {
  active: 'نشط', paused: 'موقوف', archived: 'مؤرشف',
  received: 'وارد', reviewed: 'مُراجَع', converted: 'مُحوَّل',
  rejected: 'مرفوض', ignored: 'مُتجاهَل', failed: 'فاشل',
};

const DIRECTION_LABEL: Record<string, string> = {
  inbound: 'وارد', outbound: 'صادر', bidirectional: 'ثنائي',
};

function formatWhen(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ar', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

type Tab = 'integrations' | 'exports';

export default function IntegrationsPage() {
  const { addToast } = useUIStore();
  const [tab, setTab] = useState<Tab>('integrations');
  const [health, setHealth] = useState<IntegrationHealth[]>([]);
  const [events, setEvents] = useState<IntegrationEvent[]>([]);
  const [exports, setExports] = useState<ExportRecord[]>([]);
  const [expSummary, setExpSummary] = useState<ExportSummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [onlyFailed, setOnlyFailed] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [h, ev, ex, es] = await Promise.all([
        techIntegrationsService.integrationsHealth(),
        techIntegrationsService.integrationEvents({
          status: onlyFailed ? 'failed' : null,
          limit: 100,
        }),
        techIntegrationsService.exportLog({ limit: 100 }),
        techIntegrationsService.exportSummary(30),
      ]);
      setHealth(h);
      setEvents(ev);
      setExports(ex);
      setExpSummary(es);
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [onlyFailed, addToast]);

  useEffect(() => { void load(); }, [load]);

  const broken = health.filter((h) => !h.isHealthy).length;
  const totalExports = expSummary.reduce((s, r) => s + r.total, 0);

  return (
    <div dir="rtl" className="space-y-5">
      {/* الهيدر */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-950/60 border border-indigo-800 flex items-center justify-center">
            <Plug className="text-indigo-400" size={18} />
          </div>
          <div>
            <h1 className="text-lg font-black text-slate-100">التكاملات والصادرات</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              حالة الأنظمة المرتبطة بشركتك وسجلّ تصدير البيانات
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

      {/* التبويبات */}
      <div className="flex gap-2">
        {([
          ['integrations', 'التكاملات', <Plug key="i" size={14} />],
          ['exports', 'الصادرات', <Download key="e" size={14} />],
        ] as const).map(([id, label, icon]) => (
          <button
            key={id}
            onClick={() => setTab(id as Tab)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border transition-colors ${
              tab === id
                ? 'bg-indigo-950/60 text-indigo-300 border-indigo-700'
                : 'bg-slate-800/60 text-slate-400 border-slate-700 hover:text-slate-200'
            }`}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="p-12 flex justify-center">
          <Loader2 className="animate-spin text-indigo-500" size={26} />
        </div>
      ) : tab === 'integrations' ? (
        <>
          {/* حالة الموصّلات */}
          <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-slate-100">الموصّلات</h3>
              {health.length > 0 && (
                <span className={`text-xs font-bold px-3 py-1 rounded-full border ${
                  broken === 0
                    ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800'
                    : 'bg-red-950/60 text-red-300 border-red-800'
                }`}>
                  {broken === 0 ? 'كلها سليمة' : `${broken} تحتاج مراجعة`}
                </span>
              )}
            </div>

            {health.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">
                لا موصّلات تكامل مُعرَّفة لشركتك بعد.
              </p>
            ) : (
              <div className="space-y-2">
                {health.map((h) => (
                  <div key={h.connectorId} className="rounded-xl bg-slate-800/50 px-4 py-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {h.status !== 'active'
                          ? <PauseCircle size={15} className="text-slate-500 shrink-0" />
                          : h.isHealthy
                            ? <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
                            : <AlertTriangle size={15} className="text-red-400 shrink-0" />}
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-200 truncate">
                            {h.name}
                            <span className="text-[11px] text-slate-500 font-normal mr-2">
                              {h.code}
                            </span>
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {h.sourceSystem}
                            {' · '}{DIRECTION_LABEL[h.direction] ?? h.direction}
                            {' · '}آخر حدث {formatWhen(h.lastEventAt)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-xs shrink-0">
                        <span className={`px-2 py-0.5 rounded-md border text-[11px] font-bold ${
                          h.status === 'active'
                            ? 'bg-slate-900 text-slate-300 border-slate-700'
                            : 'bg-slate-900 text-slate-500 border-slate-800'
                        }`}>
                          {STATUS_LABEL[h.status] ?? h.status}
                        </span>
                        <span className="text-slate-400">{h.events24h} حدث/24س</span>
                        {h.failed24h > 0 && (
                          <span className="text-red-400 font-bold">{h.failed24h} فشل</span>
                        )}
                        {h.pendingReview > 0 && (
                          <span className="text-amber-400">{h.pendingReview} بانتظار المراجعة</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* الأحداث */}
          <div className="rounded-2xl border border-slate-700 bg-slate-900/60 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
              <h3 className="font-bold text-slate-100 flex items-center gap-2">
                <ArrowDownUp size={16} className="text-slate-500" />
                أحداث التكامل
              </h3>
              <button
                onClick={() => setOnlyFailed((v) => !v)}
                className={`text-xs font-bold px-3 py-1.5 rounded-xl border transition-colors ${
                  onlyFailed
                    ? 'bg-red-950/60 text-red-300 border-red-800'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
              >
                {onlyFailed ? 'الفاشلة فقط' : 'عرض الكل'}
              </button>
            </div>

            {events.length === 0 ? (
              <div className="p-10 text-center">
                <CheckCircle2 className="mx-auto text-emerald-700 mb-3" size={28} />
                <p className="text-sm text-slate-300 font-bold">
                  {onlyFailed ? 'لا أحداث فاشلة' : 'لا أحداث تكامل'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-800">
                {events.map((e) => (
                  <div key={e.id} className="px-5 py-3">
                    <button
                      onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                      className="w-full flex items-start justify-between gap-3 text-right"
                    >
                      <div className="min-w-0">
                        <p className="text-sm text-slate-200 font-medium">
                          {e.eventType}
                          <span className="text-[11px] text-slate-500 font-normal mr-2">
                            {e.connector}
                          </span>
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {STATUS_LABEL[e.status] ?? e.status}
                          {e.amount != null && ` · ${e.amount}`}
                          {' · '}{formatWhen(e.createdAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                          e.status === 'failed'
                            ? 'bg-red-950/60 text-red-300 border-red-800'
                            : e.status === 'received'
                              ? 'bg-amber-950/60 text-amber-300 border-amber-800'
                              : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}>
                          {STATUS_LABEL[e.status] ?? e.status}
                        </span>
                        {e.error && (
                          expanded === e.id
                            ? <ChevronUp size={14} className="text-slate-600" />
                            : <ChevronDown size={14} className="text-slate-600" />
                        )}
                      </div>
                    </button>

                    {expanded === e.id && e.error && (
                      <div className="mt-2 rounded-xl bg-red-950/20 border border-red-900/40 p-3">
                        <p className="text-xs text-red-300 break-words">{e.error}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          {/* ملخّص الصادرات */}
          {expSummary.length > 0 && (
            <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-5">
              <h3 className="font-bold text-slate-100 mb-3">
                ملخّص آخر 30 يوماً
                <span className="text-xs font-normal text-slate-500 mr-2">
                  {totalExports} عملية تصدير
                </span>
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {expSummary.slice(0, 8).map((r) => (
                  <div key={r.source} className="rounded-xl bg-slate-800/50 p-3">
                    <p className="text-lg font-black text-slate-100">{r.total}</p>
                    <p className="text-[11px] text-slate-400 truncate">{r.sourceAr}</p>
                    <p className="text-[10px] text-slate-600 mt-0.5">
                      {r.failed > 0 ? (
                        <span className="text-rose-400 font-bold">{r.failed} فاشلة</span>
                      ) : (
                        <span>{r.ready} جاهزة</span>
                      )}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* سجلّ الصادرات */}
          <div className="rounded-2xl border border-slate-700 bg-slate-900/60 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-800">
              <h3 className="font-bold text-slate-100 flex items-center gap-2">
                <Download size={16} className="text-slate-500" />
                سجلّ الصادرات
              </h3>
              <p className="text-[11px] text-slate-500 mt-1">
                تصدير البيانات حدث يُدقَّق: من صدّر ماذا ومتى.
              </p>
            </div>

            {exports.length === 0 ? (
              <div className="p-10 text-center">
                <Download className="mx-auto text-slate-700 mb-3" size={28} />
                <p className="text-sm text-slate-400 font-bold">لا صادرات مُسجَّلة</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-900">
                    <tr className="text-slate-400 text-xs">
                      <th className="text-right px-4 py-3 font-semibold">المصدر</th>
                      <th className="text-right px-4 py-3 font-semibold">المرجع</th>
                      <th className="text-right px-4 py-3 font-semibold">الحالة</th>
                      <th className="text-right px-4 py-3 font-semibold">المستخدم</th>
                      <th className="text-right px-4 py-3 font-semibold">الوقت</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {exports.map((x) => (
                      <tr key={x.id} className="hover:bg-slate-800/40">
                        <td className="px-4 py-3 text-slate-200 font-medium">{x.sourceAr}</td>
                        <td className="px-4 py-3 text-slate-400 text-xs">
                          {x.reference}
                          {x.records !== null && (
                            <span className="text-slate-600"> · {x.records} سجلّ</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <span
                            className={
                              x.status === 'failed'
                                ? 'text-rose-400 font-bold'
                                : x.status === 'ready'
                                  ? 'text-emerald-400'
                                  : 'text-amber-400'
                            }
                          >
                            {x.statusAr}
                          </span>
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
    </div>
  );
}
