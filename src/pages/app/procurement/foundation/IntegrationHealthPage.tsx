import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, ArrowDownToLine, ArrowUpFromLine, BellRing,
  CheckCircle2, Landmark, Loader2, RefreshCw,
} from 'lucide-react';
import {
  procurementIntegrationService,
  procurementNotificationService,
  type GrInventoryStatusRecord,
  type IntegrationHealthRecord,
  type InvoiceApStatusRecord,
  type NotificationDispatchStatusRecord,
  type NotificationJobResult,
  type RtvInventoryStatusRecord,
} from '../../../../services/sdk/Procurement/ProcurementIntegrationService';
import { getErrorMessage } from '../../../../services/errors';
import { useUIStore } from '../../../../core/stores';
import { ProcurementUnitNav } from '../shared/ProcurementUnitNav';

const SEVERITY: Record<string, { bg: string; text: string; label: string }> = {
  error: { bg: 'bg-rose-50 border-rose-200', text: 'text-rose-700', label: 'خطأ' },
  warning: { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', label: 'تحذير' },
  info: { bg: 'bg-sky-50 border-sky-200', text: 'text-sky-700', label: 'معلومة' },
};

const JOB_LABELS: Record<string, string> = {
  contract_renewal: 'تجديد العقود',
  pr_approval_reminder: 'تذكير موافقات الطلبات',
  supplier_doc_expiry: 'انتهاء وثائق الموردين',
  po_otif_alert: 'تنبيهات تأخر التسليم',
};

const DISPATCH_HEALTH: Record<string, { bg: string; text: string; label: string }> = {
  healthy: { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', label: 'يعمل اليوم' },
  stale: { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', label: 'متأخر' },
  not_running: { bg: 'bg-rose-50 border-rose-200', text: 'text-rose-700', label: 'متوقف' },
};

type Tab = 'health' | 'receipts' | 'returns' | 'invoices';

export default function IntegrationHealthPage() {
  const { addToast } = useUIStore();
  const [tab, setTab] = useState<Tab>('health');
  const [health, setHealth] = useState<IntegrationHealthRecord[]>([]);
  const [receipts, setReceipts] = useState<GrInventoryStatusRecord[]>([]);
  const [returns, setReturns] = useState<RtvInventoryStatusRecord[]>([]);
  const [invoices, setInvoices] = useState<InvoiceApStatusRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notifResult, setNotifResult] = useState<NotificationJobResult[] | null>(null);
  const [dispatchStatus, setDispatchStatus] = useState<NotificationDispatchStatusRecord[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [h, g, r, i, d] = await Promise.all([
        procurementIntegrationService.checkHealth(),
        procurementIntegrationService.findGrInventoryStatus(),
        procurementIntegrationService.findRtvInventoryStatus(),
        procurementIntegrationService.findInvoiceApStatus(),
        procurementNotificationService.findDispatchStatus(),
      ]);
      setHealth(h); setReceipts(g); setReturns(r); setInvoices(i); setDispatchStatus(d);
    } catch (e) {
      addToast(`تعذر تحميل حالة التكامل: ${getErrorMessage(e)}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { void load(); }, [load]);

  const retryReceipt = async (grId: string) => {
    setBusyId(grId);
    try {
      const res = await procurementIntegrationService.postGoodsReceiptToInventory(grId);
      const r = res[0];
      addToast(`تم الترحيل: ${r?.posted_lines ?? 0} سطر${r?.skipped_lines ? ` — تُخطّي ${r.skipped_lines}` : ''}`, 'success');
      await load();
    } catch (e) { addToast(getErrorMessage(e), 'error'); }
    finally { setBusyId(null); }
  };

  const retryReturn = async (rtvId: string) => {
    setBusyId(rtvId);
    try {
      await procurementIntegrationService.postRtvToInventory(rtvId);
      addToast('تم خصم المرتجع من المخزون', 'success');
      await load();
    } catch (e) { addToast(getErrorMessage(e), 'error'); }
    finally { setBusyId(null); }
  };

  const retryInvoice = async (invoiceId: string) => {
    setBusyId(invoiceId);
    try {
      await procurementIntegrationService.postInvoiceToAp({ invoiceId });
      addToast('تم ترحيل الفاتورة إلى الذمم الدائنة', 'success');
      await load();
    } catch (e) { addToast(getErrorMessage(e), 'error'); }
    finally { setBusyId(null); }
  };

  const runNotifications = async () => {
    setBusyId('notifications');
    try {
      const res = await procurementNotificationService.runDaily();
      setNotifResult(res);
      const total = res.reduce((s, r) => s + Number(r.notifications || 0), 0);
      addToast(total > 0 ? `تم إرسال ${total} إشعاراً` : 'لا إشعارات جديدة اليوم', 'success');
    } catch (e) { addToast(getErrorMessage(e), 'error'); }
    finally { setBusyId(null); }
  };

  const errorCount = health.filter(h => h.severity === 'error').length;
  const pendingReceipts = receipts.filter(r => !r.is_posted_to_inventory).length;
  const pendingReturns = returns.filter(r => !r.is_deducted_from_inventory).length;
  const pendingInvoices = invoices.filter(r => !r.is_posted_to_ap).length;

  const TABS: { key: Tab; label: string; badge: number }[] = [
    { key: 'health', label: 'صحة التكامل', badge: health.length },
    { key: 'receipts', label: 'الاستلامات ← المخزون', badge: pendingReceipts },
    { key: 'returns', label: 'المرتجعات ← المخزون', badge: pendingReturns },
    { key: 'invoices', label: 'الفواتير ← المالية', badge: pendingInvoices },
  ];

  return (
    <div className="space-y-5 max-w-[1600px] mx-auto" dir="rtl">
      <ProcurementUnitNav unit="foundation" />

      <div className="flex justify-between items-center gap-3 flex-wrap">
        <div>
          <p className="text-sm font-bold text-amber-700">Procurement Integration</p>
          <h1 className="text-3xl font-black">صحة التكامل والإشعارات</h1>
          <p className="text-slate-500 mt-2">
            متابعة وصول الاستلامات والمرتجعات للمخزون، والفواتير للمالية — مع إعادة المحاولة عند الفشل.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void runNotifications()}
            disabled={busyId === 'notifications'}
            className="bg-amber-600 text-white rounded-xl px-4 py-2 font-bold hover:bg-amber-700 disabled:opacity-50 transition-colors"
          >
            <BellRing size={15} className="inline ml-1" />
            {busyId === 'notifications' ? 'جارٍ الإرسال…' : 'تشغيل الإشعارات اليومية'}
          </button>
          <button
            type="button"
            onClick={() => void load()}
            className="border rounded-xl px-4 py-2 font-bold hover:bg-slate-50 transition-colors"
          >
            <RefreshCw size={15} className="inline ml-1" />تحديث
          </button>
        </div>
      </div>

      {/*
        حالة الجدولة التلقائية — تكشف توقّف cron بصمت.
        الزر أعلاه يشغّل الإشعارات يدوياً لهذا المستأجر فقط؛ أما الجدولة
        اليومية لكل المستأجرين فتتم عبر Edge Function
        `procurement-daily-notifications` بصلاحية service_role.
      */}
      <div className="bg-white border rounded-2xl p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <h3 className="font-bold text-sm">حالة الجدولة التلقائية</h3>
          <span className="text-[11px] text-slate-400">
            المصدر: procurement_notification_dispatch_status
          </span>
        </div>
        {dispatchStatus.length === 0 ? (
          <div className="border border-rose-200 bg-rose-50 rounded-xl p-4 text-sm text-rose-700">
            <AlertTriangle size={15} className="inline ml-1" />
            لم يُسجَّل أي إرسال إشعارات بعد. إن كانت الجدولة مُعدَّة، تحقق من
            تشغيل الوظيفة <span className="font-mono text-xs">procurement-daily-notifications</span> ومن
            ضبط <span className="font-mono text-xs">CRON_SECRET</span>.
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {dispatchStatus.map(d => {
              const tone = DISPATCH_HEALTH[d.dispatch_health] ?? DISPATCH_HEALTH.not_running;
              return (
                <div key={d.notification_kind} className={`border rounded-xl p-3 ${tone.bg}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-600 font-bold">
                      {JOB_LABELS[d.notification_kind] ?? d.notification_kind}
                    </span>
                    <span className={`text-[11px] font-black ${tone.text}`}>{tone.label}</span>
                  </div>
                  <div className="font-black text-lg mt-1">{d.dispatched_today} اليوم</div>
                  <div className="text-[11px] text-slate-500">
                    آخر إرسال: {d.last_dispatch_date ?? '—'}
                    {d.days_since_last !== null && d.days_since_last > 0
                      ? ` (منذ ${d.days_since_last} يوماً)`
                      : ''}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    الإجمالي التراكمي: {d.total_dispatched}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {notifResult && (
        <div className="bg-white border rounded-2xl p-4">
          <h3 className="font-bold mb-2 text-sm">نتيجة تشغيل الإشعارات</h3>
          <div className="grid sm:grid-cols-3 gap-3">
            {notifResult.map(j => (
              <div key={j.job} className="border rounded-xl p-3 bg-slate-50">
                <div className="text-xs text-slate-500">{JOB_LABELS[j.job] ?? j.job}</div>
                <div className="font-black text-lg">{j.notifications}</div>
                <div className="text-[11px] text-slate-400">{j.entities} كياناً</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {TABS.map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-xl font-bold text-sm border transition-colors ${
              tab === t.key ? 'bg-amber-600 text-white border-amber-600' : 'bg-white hover:bg-slate-50'
            }`}
          >
            {t.label}
            {t.badge > 0 && (
              <span className={`mr-2 text-[10px] px-1.5 py-0.5 rounded-full ${
                tab === t.key ? 'bg-white/25' : 'bg-rose-100 text-rose-700'
              }`}>{t.badge}</span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-24 text-center"><Loader2 className="animate-spin mx-auto mb-3" />جارٍ التحميل…</div>
      ) : (
        <>
          {tab === 'health' && (
            <div className="bg-white border rounded-2xl p-5">
              {health.length === 0 ? (
                <div className="py-12 text-center text-slate-500">
                  <CheckCircle2 className="mx-auto mb-3 text-emerald-500" size={32} />
                  كل الجسور سليمة — لا فجوات مكتشفة.
                </div>
              ) : (
                <>
                  <p className={`text-sm font-bold mb-3 ${errorCount > 0 ? 'text-rose-700' : 'text-amber-700'}`}>
                    {health.length} ملاحظة{errorCount > 0 ? ` — منها ${errorCount} حرجة` : ''}
                  </p>
                  <div className="space-y-2">
                    {health.map(h => {
                      const st = SEVERITY[h.severity] ?? SEVERITY.info;
                      return (
                        <div key={h.check_code} className={`border rounded-xl p-3 flex items-start gap-3 ${st.bg}`}>
                          <AlertTriangle size={17} className={`${st.text} shrink-0 mt-0.5`} />
                          <div className="flex-1 min-w-0">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${st.text} bg-white/70`}>{st.label}</span>
                            <span className="font-mono text-[11px] text-slate-500 mr-2">{h.check_code}</span>
                            <p className="text-sm mt-1 text-slate-700">{h.message}</p>
                          </div>
                          <span className="text-lg font-black text-slate-600">{h.affected_count}</span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {tab === 'receipts' && (
            <div className="bg-white border rounded-2xl overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="p-3 text-right">الاستلام</th>
                    <th className="p-3 text-right">أمر الشراء</th>
                    <th className="p-3 text-right">المستودع</th>
                    <th className="p-3">السطور</th>
                    <th className="p-3">غير مرتبطة</th>
                    <th className="p-3">الكمية</th>
                    <th className="p-3">المخزون</th>
                    <th className="p-3">إجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {receipts.map(r => (
                    <tr key={r.gr_id}>
                      <td className="p-3 font-mono font-bold">{r.gr_number}</td>
                      <td className="p-3">{r.po_number || '—'}</td>
                      <td className="p-3">{r.warehouse_code || <span className="text-slate-400">غير محدد</span>}</td>
                      <td className="p-3 text-center">{r.line_count}</td>
                      <td className="p-3 text-center">
                        {r.unlinked_line_count > 0
                          ? <span className="text-amber-700 font-bold">{r.unlinked_line_count}</span>
                          : <span className="text-slate-400">0</span>}
                      </td>
                      <td className="p-3 text-center">{Number(r.accepted_quantity).toLocaleString()}</td>
                      <td className="p-3 text-center">
                        {r.is_posted_to_inventory
                          ? <ArrowDownToLine size={16} className="inline text-emerald-600" />
                          : <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-rose-50 text-rose-700">لم يُرحَّل</span>}
                      </td>
                      <td className="p-3 text-center">
                        {!r.is_posted_to_inventory && (
                          <button
                            type="button"
                            onClick={() => void retryReceipt(r.gr_id)}
                            disabled={busyId === r.gr_id}
                            className="text-blue-700 font-bold text-xs hover:underline disabled:opacity-50"
                          >
                            {busyId === r.gr_id ? '…' : 'ترحيل الآن'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!receipts.length && <tr><td colSpan={8} className="p-12 text-center text-slate-500">لا استلامات.</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'returns' && (
            <div className="bg-white border rounded-2xl overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="p-3 text-right">المرتجع</th>
                    <th className="p-3 text-right">أمر الشراء</th>
                    <th className="p-3">الكمية</th>
                    <th className="p-3 text-right">السبب</th>
                    <th className="p-3">الخصم</th>
                    <th className="p-3 text-right">الخطأ</th>
                    <th className="p-3">إجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {returns.map(r => (
                    <tr key={r.rtv_id}>
                      <td className="p-3 font-mono font-bold">{r.rtv_number}</td>
                      <td className="p-3">{r.po_number || '—'}</td>
                      <td className="p-3 text-center">{Number(r.quantity).toLocaleString()}</td>
                      <td className="p-3">{r.reason}</td>
                      <td className="p-3 text-center">
                        {r.is_deducted_from_inventory
                          ? <ArrowUpFromLine size={16} className="inline text-emerald-600" />
                          : <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-rose-50 text-rose-700">لم يُخصم</span>}
                      </td>
                      <td className="p-3 text-[11px] text-rose-600 max-w-xs truncate" title={r.inventory_post_error || ''}>
                        {r.inventory_post_error || '—'}
                      </td>
                      <td className="p-3 text-center">
                        {!r.is_deducted_from_inventory && (
                          <button
                            type="button"
                            onClick={() => void retryReturn(r.rtv_id)}
                            disabled={busyId === r.rtv_id}
                            className="text-blue-700 font-bold text-xs hover:underline disabled:opacity-50"
                          >
                            {busyId === r.rtv_id ? '…' : 'خصم الآن'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!returns.length && <tr><td colSpan={7} className="p-12 text-center text-slate-500">لا مرتجعات.</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'invoices' && (
            <div className="bg-white border rounded-2xl overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="p-3 text-right">الفاتورة</th>
                    <th className="p-3 text-right">المورد</th>
                    <th className="p-3">المبلغ</th>
                    <th className="p-3">الحالة</th>
                    <th className="p-3 text-right">فاتورة AP</th>
                    <th className="p-3 text-right">الخطأ</th>
                    <th className="p-3">إجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {invoices.map(r => (
                    <tr key={r.invoice_id}>
                      <td className="p-3 font-mono font-bold">{r.invoice_number}</td>
                      <td className="p-3">{r.supplier_name || '—'}</td>
                      <td className="p-3 text-center">{Number(r.total_amount).toLocaleString()}</td>
                      <td className="p-3 text-center">
                        <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100">{r.invoice_status}</span>
                      </td>
                      <td className="p-3">
                        {r.is_posted_to_ap
                          ? <span className="text-emerald-700 font-bold"><Landmark size={13} className="inline ml-1" />{r.ap_invoice_number}</span>
                          : <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-rose-50 text-rose-700">لم تُرحَّل</span>}
                      </td>
                      <td className="p-3 text-[11px] text-rose-600 max-w-xs truncate" title={r.ap_post_error || ''}>
                        {r.ap_post_error || '—'}
                      </td>
                      <td className="p-3 text-center">
                        {!r.is_posted_to_ap && ['approved', 'paid'].includes(r.invoice_status) && (
                          <button
                            type="button"
                            onClick={() => void retryInvoice(r.invoice_id)}
                            disabled={busyId === r.invoice_id}
                            className="text-blue-700 font-bold text-xs hover:underline disabled:opacity-50"
                          >
                            {busyId === r.invoice_id ? '…' : 'ترحيل الآن'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!invoices.length && <tr><td colSpan={7} className="p-12 text-center text-slate-500">لا فواتير.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
