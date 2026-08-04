import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, ClipboardList, Layers, Loader2,
  RefreshCw, ShieldCheck, ShoppingCart, Users, FileText,
} from 'lucide-react';
import {
  procurementFoundationService,
  type ProcurementFoundationCheckRecord,
  type ProcurementFoundationDashboardRecord,
} from '../../../../services/sdk/Procurement/ProcurementFoundationService';
import { getErrorMessage } from '../../../../services/errors';
import { useUIStore } from '../../../../core/stores';
import { ProcurementUnitNav } from '../shared/ProcurementUnitNav';

const SEVERITY_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  error: { bg: 'bg-rose-50 border-rose-200', text: 'text-rose-700', label: 'خطأ' },
  warning: { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', label: 'تحذير' },
  info: { bg: 'bg-sky-50 border-sky-200', text: 'text-sky-700', label: 'معلومة' },
};

export default function FoundationDashboardPage() {
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
      addToast(`تعذر تحميل لوحة الأساس: ${getErrorMessage(e)}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { void load(); }, [load]);

  const cards = [
    { label: 'موردون نشطون', value: dashboard?.active_suppliers ?? 0, sub: `من ${dashboard?.total_suppliers ?? 0}`, icon: Users, color: 'amber' },
    { label: 'طلبات شراء', value: dashboard?.total_requisitions ?? 0, sub: `${dashboard?.pending_requisitions ?? 0} بانتظار الموافقة`, icon: ClipboardList, color: 'blue' },
    { label: 'طلبات معتمدة', value: dashboard?.approved_requisitions ?? 0, sub: 'جاهزة للتحويل لأمر شراء', icon: CheckCircle2, color: 'emerald' },
    { label: 'فئات الإنفاق', value: dashboard?.active_categories ?? 0, sub: 'فئات نشطة', icon: Layers, color: 'violet' },
    { label: 'قواعد الموافقة', value: dashboard?.active_approval_rules ?? 0, sub: 'قواعد نشطة', icon: ShieldCheck, color: 'cyan' },
    { label: 'السياسات', value: dashboard?.active_policies ?? 0, sub: 'سياسات مفعّلة', icon: FileText, color: 'rose' },
  ];

  const colorMap: Record<string, string> = {
    amber: 'bg-amber-100 text-amber-600',
    blue: 'bg-blue-100 text-blue-600',
    emerald: 'bg-emerald-100 text-emerald-600',
    violet: 'bg-violet-100 text-violet-600',
    cyan: 'bg-cyan-100 text-cyan-600',
    rose: 'bg-rose-100 text-rose-600',
  };

  const errorCount = checks.filter(c => c.severity === 'error').length;

  return (
    <div className="space-y-5 max-w-[1600px] mx-auto" dir="rtl">
      <ProcurementUnitNav unit="foundation" />

      <div className="flex justify-between items-center gap-3 flex-wrap">
        <div>
          <p className="text-sm font-bold text-amber-700">Procurement Foundation</p>
          <h1 className="text-3xl font-black">الأساس ولوحة التحكم</h1>
          <p className="text-slate-500 mt-2">
            المؤشرات محسوبة مباشرة من قاعدة البيانات، وفحص الجاهزية يكشف الفجوات قبل التشغيل.
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
          <Loader2 className="animate-spin mx-auto mb-3" />
          جارٍ تحميل المؤشرات…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            {cards.map(card => {
              const Icon = card.icon;
              return (
                <div key={card.label} className="bg-white border rounded-2xl p-4">
                  <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-xl ${colorMap[card.color]}`}>
                      <Icon size={18} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-2xl font-black">{Number(card.value).toLocaleString()}</div>
                      <div className="text-xs text-slate-500 truncate">{card.label}</div>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-2 truncate">{card.sub}</p>
                </div>
              );
            })}
          </div>

          <div className="bg-white border rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h2 className="font-black text-lg">فحص جاهزية المشتريات</h2>
              {checks.length === 0 ? (
                <span className="text-xs font-bold px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  لا توجد ملاحظات
                </span>
              ) : (
                <span className={`text-xs font-bold px-3 py-1 rounded-full border ${
                  errorCount > 0
                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}>
                  {checks.length} ملاحظة{errorCount > 0 ? ` — منها ${errorCount} حرجة` : ''}
                </span>
              )}
            </div>

            {checks.length === 0 ? (
              <div className="py-10 text-center text-slate-500">
                <CheckCircle2 className="mx-auto mb-3 text-emerald-500" size={32} />
                إعداد المشتريات سليم — لا فجوات مكتشفة.
              </div>
            ) : (
              <div className="space-y-2">
                {checks.map(check => {
                  const style = SEVERITY_STYLE[check.severity] ?? SEVERITY_STYLE.info;
                  return (
                    <div key={check.check_code} className={`border rounded-xl p-3 flex items-start gap-3 ${style.bg}`}>
                      <AlertTriangle size={17} className={`${style.text} shrink-0 mt-0.5`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${style.text} bg-white/70`}>
                            {style.label}
                          </span>
                          <span className="font-mono text-[11px] text-slate-500">{check.check_code}</span>
                        </div>
                        <p className="text-sm mt-1 text-slate-700">{check.message}</p>
                      </div>
                      {check.affected_count > 0 && (
                        <span className="text-sm font-black text-slate-600 shrink-0">
                          {check.affected_count}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-white border rounded-2xl p-5">
            <h2 className="font-black text-lg mb-3 flex items-center gap-2">
              <ShoppingCart size={18} className="text-amber-600" />
              سلسلة المشتريات
            </h2>
            <p className="text-sm text-slate-500 mb-3">
              كل وحدة تُغذّي التي تليها. استخدم شريط الوحدات أعلى الصفحة للتنقل.
            </p>
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              {['طلب الشراء', 'التوريد', 'أمر الشراء', 'الاستلام', 'الفاتورة', 'الدفع'].map((step, i, arr) => (
                <div key={step} className="flex items-center gap-2">
                  <span className="px-3 py-1.5 rounded-lg bg-slate-100 border font-semibold text-slate-700">
                    {step}
                  </span>
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
