import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, Loader2, RefreshCw } from 'lucide-react';
import { accountingPeriodService, fiscalYearService, legalEntityService, type AccountingPeriodRecord, type FiscalYearRecord, type LegalEntityRecord } from '../../../services/sdk/FinanceFoundationService';
import { getErrorMessage } from '../../../services/errors';
import { useUIStore } from '../../../core/stores';

export default function AccountingPeriodsPage() {
  const { addToast } = useUIStore();
  const [entities, setEntities] = useState<LegalEntityRecord[]>([]);
  const [entityId, setEntityId] = useState('');
  const [years, setYears] = useState<FiscalYearRecord[]>([]);
  const [yearId, setYearId] = useState('');
  const [periods, setPeriods] = useState<AccountingPeriodRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await legalEntityService.findActive(); setEntities(rows);
      const entity = entityId || rows[0]?.id || ''; if (!entityId && entity) setEntityId(entity);
      const fiscal = entity ? await fiscalYearService.findForEntity(entity) : []; setYears(fiscal);
      const selectedYear = yearId || fiscal[0]?.id || ''; if (!yearId && selectedYear) setYearId(selectedYear);
      setPeriods(selectedYear ? await accountingPeriodService.findForFiscalYear(selectedYear) : []);
    } catch (error) { addToast(`تعذر تحميل الفترات: ${getErrorMessage(error)}`, 'error'); } finally { setLoading(false); }
  }, [addToast, entityId, yearId]);
  useEffect(() => { void load(); }, [load]);
  const changeStatus = async (period: AccountingPeriodRecord, status: 'open' | 'soft_closed' | 'closed') => {
    const reason = prompt(`سبب تغيير الفترة ${period.name} إلى ${status}:`); if (!reason?.trim()) return;
    try { await accountingPeriodService.setStatus(period.id, status, reason.trim()); addToast('تم تحديث الفترة وتسجيل السبب في التدقيق المالي', 'success'); await load(); }
    catch (error) { addToast(`تعذر تحديث الفترة: ${getErrorMessage(error)}`, 'error'); }
  };
  return <div className="space-y-5 max-w-[1600px] mx-auto" dir="rtl"><div className="flex justify-between flex-wrap gap-3"><div><p className="text-sm font-bold text-rose-700">Financial Controls</p><h1 className="text-3xl font-black">الفترات المحاسبية</h1><p className="text-slate-500 mt-2">يستلزم كل تغيير سبباً ويسجل في سجل التدقيق. لا يمكن الترحيل إلا في فترة مفتوحة.</p></div><button onClick={() => void load()} className="border rounded-xl px-4 py-2.5 font-bold"><RefreshCw size={15} className="inline ml-1" />تحديث</button></div><div className="grid md:grid-cols-2 gap-3"><select value={entityId} onChange={e => { setEntityId(e.target.value); setYearId(''); }} className="border rounded-xl p-3 bg-white font-bold"><option value="">اختر كياناً</option>{entities.map(e => <option key={e.id} value={e.id}>{e.code} — {e.name_ar}</option>)}</select><select value={yearId} onChange={e => setYearId(e.target.value)} className="border rounded-xl p-3 bg-white font-bold"><option value="">اختر سنة مالية</option>{years.map(y => <option key={y.id} value={y.id}>{y.name} ({y.start_date})</option>)}</select></div>{loading ? <div className="py-24 text-center"><Loader2 className="animate-spin mx-auto mb-3" />جارٍ تحميل الفترات…</div> : <div className="bg-white border rounded-2xl overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50"><tr><th className="p-4 text-right">الفترة</th><th className="p-4 text-right">التاريخ</th><th className="p-4 text-right">الحالة</th><th className="p-4">إجراء</th></tr></thead><tbody className="divide-y">{periods.map(p => <tr key={p.id}><td className="p-4 font-bold">{p.name}</td><td className="p-4">{p.start_date} — {p.end_date}</td><td className="p-4">{p.status}</td><td className="p-4"><div className="flex gap-2 justify-center">{p.status === 'open' && <><button onClick={() => void changeStatus(p, 'soft_closed')} className="text-amber-700 font-bold">إقفال مرن</button><button onClick={() => void changeStatus(p, 'closed')} className="text-rose-700 font-bold">إقفال نهائي</button></>}{p.status === 'soft_closed' && <><button onClick={() => void changeStatus(p, 'open')} className="text-emerald-700 font-bold">فتح</button><button onClick={() => void changeStatus(p, 'closed')} className="text-rose-700 font-bold">إقفال نهائي</button></>}{p.status === 'closed' && <button onClick={() => void changeStatus(p, 'open')} className="text-blue-700 font-bold">إعادة فتح</button>}</div></td></tr>)}{!periods.length && <tr><td colSpan={4} className="p-16 text-center text-slate-500"><CalendarClock className="mx-auto mb-3 text-slate-300" />لا توجد فترات لهذا الاختيار.</td></tr>}</tbody></table></div>}</div>;
}
