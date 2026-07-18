import { useCallback, useEffect, useState } from 'react';
import { Building2, Loader2, RefreshCw, Layers } from 'lucide-react';
import { legalEntityService, type LegalEntityRecord } from '../../../services/sdk/FinanceFoundationService';
import { getErrorMessage } from '../../../services/errors';
import { useUIStore } from '../../../core/stores';

export default function MultiEntityPage() {
  const { addToast } = useUIStore();
  const [entities, setEntities] = useState<LegalEntityRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setEntities(await legalEntityService.findActive());
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
          <p className="text-sm font-bold text-blue-700">Multi-Entity — Wave 3 (Beta) — Real SDK ✅</p>
          <h1 className="text-3xl font-black">الكيانات المتعددة والتقارير الموحدة</h1>
          <p className="text-slate-500 mt-2">عرض كيانات قانونية، توحيد مالي، و elimination entries — أساس multi-entity IFRS.</p>
        </div>
        <button onClick={() => void load()} className="border rounded-xl px-4 py-2 font-bold"><RefreshCw size={15} className="inline ml-1" />تحديث</button>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-900">
        <p className="font-bold flex items-center gap-2"><Layers size={14} /> مبدأ IFRS:</p>
        <p className="mt-1 leading-relaxed">كل كيان له base_currency و fiscal_year و accounting_periods مستقلة. التوحيد يتم عبر consolidation snapshot + elimination entries.</p>
      </div>

      {loading ? <div className="py-24 text-center"><Loader2 className="animate-spin mx-auto mb-3" />جارٍ التحميل...</div> : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {entities.map(e => (
            <div key={e.id} className="bg-white border rounded-2xl p-5 hover:border-blue-300 transition">
              <div className="flex items-center gap-2"><Building2 size={18} className="text-blue-600" /><span className="font-mono font-bold text-sm">{e.code}</span><span className={`ml-auto text-xs px-2 py-1 rounded-full border ${e.status==='active' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-100 border-slate-200'}`}>{e.status}</span></div>
              <h3 className="font-black mt-3">{e.name_ar}</h3>
              <p className="text-xs text-slate-500 mt-1">{e.name_en || ''}</p>
              <div className="grid grid-cols-2 gap-2 mt-4 text-xs">
                <div className="bg-slate-50 border rounded-xl p-2"><p className="text-slate-400">العملة الأساسية</p><p className="font-bold mt-1">{e.base_currency_code}</p></div>
                <div className="bg-slate-50 border rounded-xl p-2"><p className="text-slate-400">الدولة</p><p className="font-bold mt-1">{e.country_code}</p></div>
              </div>
            </div>
          ))}
          {!entities.length && <div className="col-span-full bg-white border border-dashed rounded-2xl p-16 text-center text-slate-500"><Building2 className="mx-auto mb-3 text-slate-300" />لا توجد كيانات — أنشئ من Finance Setup.</div>}
        </div>
      )}
    </div>
  );
}
