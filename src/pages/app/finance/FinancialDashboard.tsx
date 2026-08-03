import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Building2, Calculator, FilePlus2, Landmark, Loader2, RefreshCw } from 'lucide-react';
import { legalEntityService, type LegalEntityRecord } from '../../../services/sdk/FinanceFoundationService';
import { generalLedgerService } from '../../../services/sdk/GeneralLedgerService';
import { financialReportService, type TrialBalanceRow } from '../../../services/sdk/FinancialReportService';
import type { JournalEntryRecord } from '../../../shared/types/sdk';
import { getErrorMessage } from '../../../services/errors';
import { useUIStore } from '../../../core/stores';
import { FinanceUnitNav } from './shared/FinanceUnitNav';

export default function FinancialDashboard() {
  const { addToast } = useUIStore();
  const [entities, setEntities] = useState<LegalEntityRecord[]>([]);
  const [entityId, setEntityId] = useState('');
  const [entries, setEntries] = useState<JournalEntryRecord[]>([]);
  const [trialBalance, setTrialBalance] = useState<TrialBalanceRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const entityRows = await legalEntityService.findActive();
      setEntities(entityRows);
      const selected = entityId || entityRows[0]?.id || '';
      if (!entityId && selected) setEntityId(selected);
      if (!selected) { setEntries([]); setTrialBalance([]); return; }
      const [entryRows, balanceRows] = await Promise.all([
        generalLedgerService.findAll({ filters: { legal_entity_id: selected }, orderBy: 'entry_date', ascending: false }),
        financialReportService.getTrialBalance(selected),
      ]);
      setEntries(entryRows); setTrialBalance(balanceRows);
    } catch (error) { addToast(`تعذر تحميل ملخص المالية: ${getErrorMessage(error)}`, 'error'); }
    finally { setLoading(false); }
  }, [addToast, entityId]);
  useEffect(() => { void load(); }, [load]);

  const kpis = useMemo(() => {
    const amountFor = (type: string) => trialBalance.filter(row => row.account_type === type).reduce((total, row) => total + Number(row.debit_balance) - Number(row.credit_balance), 0);
    const posted = entries.filter(entry => entry.status === 'posted').length;
    const drafts = entries.filter(entry => entry.status === 'draft').length;
    return [
      { label: 'صافي الأصول', value: amountFor('Asset'), icon: Landmark, hint: 'من ميزان المراجعة' },
      { label: 'صافي الالتزامات', value: Math.abs(amountFor('Liability')), icon: Building2, hint: 'من ميزان المراجعة' },
      { label: 'قيود منشورة', value: posted, icon: BookOpen, hint: 'حركات مرحّلة' },
      { label: 'مسودات تنتظر الترحيل', value: drafts, icon: FilePlus2, hint: 'لا تدخل التقارير' },
    ];
  }, [entries, trialBalance]);

  return <div className="space-y-5 max-w-[1600px] mx-auto" dir="rtl">
    <section className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4"><div><p className="text-sm font-bold text-emerald-700">Financial Core</p><h1 className="text-3xl md:text-4xl font-black text-slate-900 mt-1">ملخص الدفتر العام</h1><p className="text-slate-500 mt-2">كل المؤشرات أدناه محسوبة من قيود الكيان القانوني وميزان المراجعة، ولا تشمل المسودات.</p></div><div className="flex gap-2"><button onClick={() => void load()} className="px-4 py-2.5 border rounded-xl bg-white font-bold text-sm"><RefreshCw size={16} className="inline ml-1" />تحديث</button><Link to="/app/finance/setup" className="px-4 py-2.5 bg-slate-800 text-white rounded-xl font-bold text-sm">إعداد المالية</Link></div></section>
    <label className="flex items-center gap-2 bg-white border rounded-xl p-3 max-w-md"><Building2 size={17} className="text-slate-500" /><select value={entityId} onChange={event => setEntityId(event.target.value)} className="w-full outline-none font-bold"><option value="">اختر كياناً قانونياً</option>{entities.map(entity => <option value={entity.id} key={entity.id}>{entity.code} — {entity.name_ar} ({entity.base_currency_code})</option>)}</select></label>
    <FinanceUnitNav unit="main" />
    {loading ? <div className="py-24 text-center"><Loader2 className="animate-spin mx-auto mb-3" />جارٍ حساب المؤشرات…</div> : !entityId ? <Empty text="أنشئ أو اختر كياناً قانونياً لبدء العمل المالي." /> : <><section className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">{kpis.map(item => { const Icon = item.icon; return <div key={item.label} className="bg-white border rounded-2xl p-5 shadow-sm"><Icon className="text-emerald-600 mb-3" size={22} /><p className="text-2xl font-black">{typeof item.value === 'number' ? item.value.toLocaleString() : item.value}</p><p className="text-sm font-bold text-slate-700 mt-1">{item.label}</p><p className="text-xs text-slate-400 mt-1">{item.hint}</p></div>; })}</section><section className="grid lg:grid-cols-3 gap-4"><Link to="/app/finance/chart-of-accounts" className="p-5 bg-white border rounded-2xl hover:border-emerald-400"><BookOpen className="text-emerald-600" /><h2 className="font-black mt-3">دليل الحسابات</h2><p className="text-sm text-slate-500 mt-1">إدارة شجرة الحسابات القابلة للترحيل.</p></Link><Link to="/app/finance/journal-entries" className="p-5 bg-white border rounded-2xl hover:border-blue-400"><FilePlus2 className="text-blue-600" /><h2 className="font-black mt-3">قيود اليومية</h2><p className="text-sm text-slate-500 mt-1">مسودات، ترحيل ذرّي، وعكس لاحقاً.</p></Link><Link to="/app/finance/trial-balance" className="p-5 bg-white border rounded-2xl hover:border-violet-400"><Calculator className="text-violet-600" /><h2 className="font-black mt-3">ميزان المراجعة</h2><p className="text-sm text-slate-500 mt-1">أرصدة القيود المنشورة والمعكوسة.</p></Link></section><section className="bg-white border rounded-2xl overflow-hidden"><div className="p-5 border-b"><h2 className="font-black">آخر القيود</h2></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50"><tr><th className="p-3 text-right">الرقم</th><th className="p-3 text-right">التاريخ</th><th className="p-3 text-right">الوصف</th><th className="p-3 text-right">الحالة</th><th className="p-3 text-right">مدين / دائن</th></tr></thead><tbody className="divide-y">{entries.slice(0, 8).map(entry => <tr key={entry.id}><td className="p-3 font-mono font-bold text-emerald-700">{entry.entry_number}</td><td className="p-3">{entry.entry_date}</td><td className="p-3">{entry.description}</td><td className="p-3">{entry.status}</td><td className="p-3">{Number(entry.total_debit).toLocaleString()} / {Number(entry.total_credit).toLocaleString()}</td></tr>)}{!entries.length && <tr><td colSpan={5} className="text-center py-12 text-slate-500">لا توجد قيود لهذا الكيان حتى الآن.</td></tr>}</tbody></table></div></section></>}
  </div>;
}
function Empty({ text }: { text: string }) { return <div className="py-24 text-center text-slate-500">{text}</div>; }
