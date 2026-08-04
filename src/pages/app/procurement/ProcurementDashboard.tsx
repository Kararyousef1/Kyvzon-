import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, CheckCircle2, ClipboardList, Layers, Loader2,
  RefreshCw, ShieldCheck, Users, FileText,
} from 'lucide-react';
import {
  procurementFoundationService,
  type ProcurementFoundationCheckRecord,
  type ProcurementFoundationDashboardRecord,
} from '../../../services/sdk/Procurement/ProcurementFoundationService';
import { getErrorMessage } from '../../../services/errors';
import { useUIStore } from '../../../core/stores';
import { ProcurementUnitNav } from './shared/ProcurementUnitNav';

export default function ProcurementDashboard() {
  const { addToast } = useUIStore();
  const [dashboard, setDashboard] = useState<ProcurementFoundationDashboardRecord | null>(null);
  const [checks, setChecks] = useState<ProcurementFoundationCheckRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, c] = await Promise.all([
        procurementFoundationService.getDashboard(),
        procurementFoundationService.validate(),
      ]);
      setDashboard(d);
      setChecks(c);
    } catch (e) {
      addToast(`تعذر تحميل لوحة المشتريات: ${getErrorMessage(e)}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { void load(); }, [load]);

  const cards = [
    { label: 'موردون نشطون', value: dashboard?.active_suppliers ?? 0, sub: `من ${dashboard?.total_suppliers ?? 0} مورد`, icon: Users, cls: 'bg-amber-100 text-amber-600', to: '/app/procurement/suppliers' },
    { label: 'طلبات الشراء', value: dashboard?.total_requisitions ?? 0, sub: 'إجمالي الطلبات', icon: ClipboardList, cls: 'bg-blue-100 text-blue-600', to: '/app/procurement/requisitions' },
    { label: 'بانتظار الموافقة', value: dashboard?.pending_requisitions ?? 0, sub: 'تحتاج قراراً', icon: AlertTriangle, cls: 'bg-orange-100 text-orange-600', to: '/app/procurement/requisitions' },
    { label: 'طلبات معتمدة', value: dashboard?.approved_requisitions ?? 0, sub: 'جاهزة لأمر شراء', icon: CheckCircle2, cls: 'bg-emerald-100 text-emerald-600', to: '/app/procurement/requisitions' },
    { label: 'فئات الإنفاق', value: dashboard?.active_categories ?? 0, sub: 'فئات نشطة', icon: Layers, cls: 'bg-violet-100 text-violet-600', to: '/app/procurement/foundation/categories' },
    { label: 'قواعد الموافقة', value: dashboard?.active_approval_rules ?? 0, sub: 'قواعد نشطة', icon: ShieldCheck, cls: 'bg-cyan-100 text-cyan-600', to: '/app/procurement/foundation/approval-rules' },
  ];

  const errorCount = checks.filter(c => c.severity === 'error').length;

  return (
    <div className="space-y-5 max-w-[1600px] mx-auto" dir="rtl">
      <ProcurementUnitNav unit="main" />

      <div className="flex justify-between items-center gap-3 flex-wrap">
        <div>
          <p className="text-sm font-bold text-amber-700">Procure to Pay</p>
          <h1 className="text-3xl font-black">بوابة المشتريات</h1>
          <p className="text-slate-500 mt-2">
            من طلب الشراء حتى الدفع — كل المؤشرات محسوبة مباشرة من قاعدة البيانات.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="border rounded-xl px-4 py-2 font-bold hover:bg-slate-50 transition-colors"
        >
          <RefreshCw size={15} className="inline ml-1" />تحديث
        </button>
      </div>

      {loading ? (
        <div className="py-24 text-center">
          <Loader2 className="animate-spin mx-auto mb-3" />جارٍ تحميل المؤشرات…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            {cards.map(card => {
              const Icon = card.icon;
              return (
                <Link
                  key={card.label}
                  to={card.to}
                  className="bg-white border rounded-2xl p-4 hover:shadow-md hover:-translate-y-0.5 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-xl ${card.cls}`}><Icon size={18} /></div>
                    <div className="min-w-0">
                      <div className="text-2xl font-black">{Number(card.value).toLocaleString()}</div>
                      <div className="text-xs text-slate-500 truncate">{card.label}</div>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-2 truncate">{card.sub}</p>
                </Link>
              );
            })}
          </div>

          {checks.length > 0 && (
            <div className="bg-white border rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h2 className="font-black text-lg">جاهزية المشتريات</h2>
                <span className={`text-xs font-bold px-3 py-1 rounded-full border ${
                  errorCount > 0
                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}>
                  {checks.length} ملاحظة{errorCount > 0 ? ` — منها ${errorCount} حرجة` : ''}
                </span>
              </div>
              <div className="space-y-2">
                {checks.map(check => (
                  <div
                    key={check.check_code}
                    className={`border rounded-xl p-3 flex items-start gap-3 ${
                      check.severity === 'error' ? 'bg-rose-50 border-rose-200' : 'bg-amber-50 border-amber-200'
                    }`}
                  >
                    <AlertTriangle
                      size={17}
                      className={`shrink-0 mt-0.5 ${check.severity === 'error' ? 'text-rose-700' : 'text-amber-700'}`}
                    />
                    <div className="min-w-0 flex-1">
                      <span className="font-mono text-[11px] text-slate-500">{check.check_code}</span>
                      <p className="text-sm mt-1 text-slate-700">{check.message}</p>
                    </div>
                  </div>
                ))}
              </div>
              <Link
                to="/app/procurement/foundation"
                className="inline-block mt-3 text-sm font-bold text-amber-700 hover:underline"
              >
                <FileText size={14} className="inline ml-1" />
                افتح لوحة الأساس لمعالجة الملاحظات
              </Link>
            </div>
          )}

          <div className="bg-white border rounded-2xl p-5">
            <h2 className="font-black text-lg mb-3">سلسلة الشراء حتى الدفع</h2>
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              {[
                { label: 'طلب الشراء', to: '/app/procurement/requisitions' },
                { label: 'التوريد', to: '/app/procurement/sourcing' },
                { label: 'أمر الشراء', to: '/app/procurement/orders/purchase-orders' },
                { label: 'الاستلام', to: '/app/procurement/orders/goods-receipts' },
                { label: 'الفاتورة', to: '/app/procurement/invoices' },
              ].map((step, i, arr) => (
                <div key={step.label} className="flex items-center gap-2">
                  <Link
                    to={step.to}
                    className="px-3 py-1.5 rounded-lg bg-slate-100 border font-semibold text-slate-700 hover:bg-amber-50 hover:border-amber-300 transition-colors"
                  >
                    {step.label}
                  </Link>
                  {i < arr.length - 1 && <span className="text-slate-300">←</span>}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
