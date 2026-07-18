import { useCallback, useEffect, useState } from 'react';
import { FileCheck, Loader2, Plus, RefreshCw, CheckCircle } from 'lucide-react';
import { revenueRecognitionService } from '../../../services/sdk/RevenueRecognitionService';
import { getErrorMessage } from '../../../services/errors';
import { useUIStore } from '../../../core/stores';

export default function RevenueRecognitionPage() {
  const { addToast } = useUIStore();
  const [contracts, setContracts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setContracts(await revenueRecognitionService.findActive() as any[]);
    } catch (e) {
      addToast(`تعذر التحميل: ${getErrorMessage(e)}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="p-6 md:p-8 space-y-6" dir="rtl">
      <div className="flex justify-between flex-wrap gap-3">
        <div>
          <p className="text-sm font-bold text-emerald-700">Revenue Recognition — Wave 3 (Beta) — Real SDK ✅</p>
          <h1 className="text-3xl font-black">الاعتراف بالإيرادات (IFRS 15)</h1>
          <p className="text-slate-500 mt-2">عقود + جداول اعتراف — revenue_contracts و revenue_recognition_schedules.</p>
        </div>
        <button onClick={() => void load()} className="border rounded-xl px-4 py-2 font-bold"><RefreshCw size={15} className="inline ml-1" />تحديث</button>
      </div>

      {loading ? <div className="py-24 text-center"><Loader2 className="animate-spin mx-auto mb-3" />جارٍ التحميل...</div> : (
        <div className="bg-white border rounded-2xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50"><tr><th className="p-3 text-right">رقم العقد</th><th className="p-3 text-right">العميل</th><th className="p-3 text-right">المبلغ</th><th className="p-3 text-right">الطريقة</th><th className="p-3 text-right">الحالة</th></tr></thead>
            <tbody className="divide-y">
              {contracts.map(c => <tr key={c.id}><td className="p-3 font-mono font-bold text-emerald-700">{c.contract_number || '—'}</td><td className="p-3">{c.customer_name || '—'}</td><td className="p-3 font-black">{Number(c.total_amount || 0).toLocaleString()}</td><td className="p-3"><span className="px-2 py-1 bg-amber-50 border border-amber-200 rounded-full text-xs font-bold">{c.recognition_method || '—'}</span></td><td className="p-3"><span className="px-2 py-1 bg-emerald-50 border border-emerald-200 rounded-full text-xs font-bold flex items-center gap-1 w-fit"><CheckCircle size={12} />{c.status}</span></td></tr>)}
              {!contracts.length && <tr><td colSpan={5} className="p-16 text-center text-slate-500"><FileCheck className="mx-auto mb-3 text-slate-300" />لا توجد عقود إيرادات — أنشئ من revenue_contracts.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
