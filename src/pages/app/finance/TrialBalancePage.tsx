import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, Calculator, Download, Loader2, RefreshCw } from 'lucide-react';
import { legalEntityService, type LegalEntityRecord } from '../../../services/sdk/FinanceFoundationService';
import { financialReportService, type TrialBalanceRow } from '../../../services/sdk/FinancialReportService';
import { getErrorMessage } from '../../../services/errors';
import { useUIStore } from '../../../core/stores';
import { exportToStyledExcel } from '../../../utils/exportToExcel';
import { FinanceUnitNav } from './shared/FinanceUnitNav';

export default function TrialBalancePage() {
  const { addToast } = useUIStore();
  const [entities, setEntities] = useState<LegalEntityRecord[]>([]);
  const [entityId, setEntityId] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [rows, setRows] = useState<TrialBalanceRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const entityRows = await legalEntityService.findActive();
      setEntities(entityRows);
      const selected = entityId || entityRows[0]?.id || '';
      if (!entityId && selected) setEntityId(selected);
      setRows(selected ? await financialReportService.getTrialBalance(selected, fromDate || undefined, toDate || undefined) : []);
    } catch (error) { addToast(`تعذر تحميل ميزان المراجعة: ${getErrorMessage(error)}`, 'error'); }
    finally { setLoading(false); }
  }, [addToast, entityId, fromDate, toDate]);

  useEffect(() => { void load(); }, [load]);
  const totals = useMemo(() => rows.reduce((sum, row) => ({ debit: sum.debit + Number(row.debit_balance), credit: sum.credit + Number(row.credit_balance) }), { debit: 0, credit: 0 }), [rows]);
  const balanced = totals.debit === totals.credit;

  const exportReport = () => {
    exportToStyledExcel('ميزان_المراجعة', ['الرمز', 'الحساب', 'النوع', 'مدين', 'دائن'], rows.map(row => [row.account_code, row.account_name_ar || row.account_name, row.account_type, row.debit_balance, row.credit_balance]));
    addToast('تم تصدير ميزان المراجعة', 'success');
  };

  return <div className="space-y-5 max-w-[1600px] mx-auto" dir="rtl">
    <FinanceUnitNav unit="reporting" />
    <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4"><div><p className="text-sm font-bold text-violet-700">Financial Reporting</p><h1 className="text-3xl font-black mt-1">ميزان المراجعة</h1><p className="text-slate-500 mt-2">يعرض القيود المنشورة والمعكوسة فقط؛ لا تدخل المسودات في التقرير.</p></div><div className="flex gap-2"><button onClick={() => void load()} className="px-4 py-2.5 border rounded-xl font-bold text-sm"><RefreshCw size={16} className="inline ml-1" />تحديث</button><button onClick={exportReport} disabled={!rows.length} className="px-4 py-2.5 bg-violet-600 text-white rounded-xl font-bold text-sm disabled:opacity-50"><Download size={16} className="inline ml-1" />تصدير</button></div></div>
    <div className="grid md:grid-cols-3 gap-3"><label className="bg-white border rounded-xl p-3 flex gap-2 items-center"><Building2 size={17} /><select className="w-full outline-none font-bold" value={entityId} onChange={event => setEntityId(event.target.value)}>{entities.map(entity => <option value={entity.id} key={entity.id}>{entity.code} — {entity.name_ar}</option>)}</select></label><label className="bg-white border rounded-xl p-3 text-sm">من <input type="date" className="mr-2 outline-none" value={fromDate} onChange={event => setFromDate(event.target.value)} /></label><label className="bg-white border rounded-xl p-3 text-sm">إلى <input type="date" className="mr-2 outline-none" value={toDate} onChange={event => setToDate(event.target.value)} /></label></div>
    {loading ? <div className="py-24 text-center"><Loader2 className="animate-spin mx-auto mb-3" />جارٍ حساب ميزان المراجعة…</div> : <section className="bg-white border rounded-2xl overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50"><tr><th className="text-right p-4">الرمز</th><th className="text-right p-4">الحساب</th><th className="text-right p-4">النوع</th><th className="text-right p-4">مدين</th><th className="text-right p-4">دائن</th></tr></thead><tbody className="divide-y">{rows.map(row => <tr key={row.account_id}><td className="p-4 font-mono font-bold text-violet-700">{row.account_code}</td><td className="p-4">{row.account_name_ar || row.account_name}</td><td className="p-4">{row.account_type}</td><td className="p-4">{Number(row.debit_balance).toLocaleString()}</td><td className="p-4">{Number(row.credit_balance).toLocaleString()}</td></tr>)}{!rows.length && <tr><td colSpan={5} className="p-16 text-center text-slate-500">لا توجد حركات منشورة في الفترة المحددة.</td></tr>}</tbody><tfoot className={balanced ? 'bg-emerald-50 font-black' : 'bg-rose-50 font-black text-rose-800'}><tr><td colSpan={3} className="p-4">الإجمالي {balanced ? '— متوازن' : '— غير متوازن'}</td><td className="p-4">{totals.debit.toLocaleString()}</td><td className="p-4">{totals.credit.toLocaleString()}</td></tr></tfoot></table></div></section>}
    <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-900"><Calculator size={16} className="inline ml-1" />هذا التقرير ناتج من RPC خادمي معزول حسب الكيان القانوني، وليس من قيم واجهة ثابتة.</div>
  </div>;
}
