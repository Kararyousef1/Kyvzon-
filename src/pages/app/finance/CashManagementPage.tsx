import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Wallet, Loader2, Plus, RefreshCw, Search, X, Landmark, DollarSign } from 'lucide-react';
import { bankAccountService, type BankAccountRecord } from '../../../services/sdk/BankStatementImportService';
import { currencyService, type CurrencyRecord } from '../../../services/sdk/FinanceFoundationService';
import { getErrorMessage } from '../../../services/errors';
import { useUIStore } from '../../../core/stores';

export default function CashManagementPage() {
  const { addToast } = useUIStore();
  const [accounts, setAccounts] = useState<BankAccountRecord[]>([]);
  const [currencies, setCurrencies] = useState<CurrencyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(false);
  const [q, setQ] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ account_name: '', account_number: '', bank_name: '', currency: 'IQD', balance: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [acc, curr] = await Promise.all([bankAccountService.findAll({ orderBy: 'account_name' }) as any, currencyService.findActive()]);
      setAccounts(acc || []);
      setCurrencies(curr);
    } catch (e) {
      addToast(`تعذر التحميل: ${getErrorMessage(e)}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { void load(); }, [load]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await (bankAccountService as any).create({
        account_name: form.account_name,
        account_number: form.account_number,
        bank_name: form.bank_name,
        currency: form.currency,
        balance: Number(form.balance) || 0,
        is_active: true,
      });
      addToast('تم إنشاء الحساب البنكي', 'success');
      setShow(false);
      setForm({ account_name: '', account_number: '', bank_name: '', currency: 'IQD', balance: '' });
      await load();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const total = accounts.reduce((s, a) => s + Number(a.balance || 0), 0);
  const filtered = accounts.filter(a => `${a.account_name} ${a.bank_name} ${a.account_number}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-5 max-w-[1600px] mx-auto" dir="rtl">
      <div className="flex justify-between flex-wrap gap-3">
        <div>
          <p className="text-sm font-bold text-emerald-700">Cash Management — Wave 5 (Beta) — Real SDK ✅</p>
          <h1 className="text-3xl font-black">إدارة النقد والبنوك</h1>
          <p className="text-slate-500 mt-2">حسابات بنكية ونقدية مع أرصدة، عملات، وحالة — أساس التسوية والتنبؤ.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => void load()} className="border rounded-xl px-4 py-2 font-bold"><RefreshCw size={15} className="inline ml-1" />تحديث</button>
          <button onClick={() => setShow(true)} className="bg-emerald-600 text-white rounded-xl px-4 py-2 font-bold"><Plus size={15} className="inline ml-1" />حساب جديد</button>
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <div className="bg-white border rounded-2xl p-5"><p className="text-xs text-slate-500">إجمالي الأرصدة</p><p className="text-2xl font-black mt-1">{total.toLocaleString()} IQD</p><p className="text-[11px] text-emerald-600 mt-1">من {accounts.length} حساب</p></div>
        <label className="bg-white border rounded-xl p-3 flex gap-2 items-center"><Search size={16} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="بحث باسم البنك أو الحساب..." className="w-full outline-none" /></label>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm text-emerald-900 flex gap-2"><Wallet size={16} className="shrink-0" /><span>الأرصدة هنا دفترية — التسوية الحقيقية في BankStatementImport + Reconciliation.</span></div>
      </div>

      {loading ? <div className="py-24 text-center"><Loader2 className="animate-spin mx-auto mb-3" />جارٍ التحميل...</div> : (
        <div className="bg-white border rounded-2xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50"><tr><th className="p-3 text-right">البنك</th><th className="p-3 text-right">الحساب</th><th className="p-3 text-right">الرقم</th><th className="p-3 text-right">العملة</th><th className="p-3 text-right">الرصيد</th></tr></thead>
            <tbody className="divide-y">
              {filtered.map(a => <tr key={a.id}><td className="p-3 font-bold">{a.bank_name}</td><td className="p-3">{a.account_name}</td><td className="p-3 font-mono text-xs">{a.account_number}</td><td className="p-3">{a.currency}</td><td className="p-3 font-black">{Number(a.balance).toLocaleString()}</td></tr>)}
              {!filtered.length && <tr><td colSpan={5} className="p-16 text-center text-slate-500"><Landmark className="mx-auto mb-3 text-slate-300" />لا توجد حسابات بنكية — أنشئ أول حساب عبر SDK.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {show && <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4" onClick={() => !saving && setShow(false)}><form onSubmit={submit} onClick={e => e.stopPropagation()} className="w-full max-w-lg bg-white rounded-2xl p-6 space-y-3"><div className="flex justify-between items-center gap-3 flex-wrap"><h2 className="font-black text-xl">حساب بنكي جديد</h2><button type="button" onClick={() => setShow(false)}><X /></button></div><div className="grid grid-cols-2 gap-3"><input required placeholder="اسم البنك *" value={form.bank_name} onChange={e => setForm(f => ({ ...f, bank_name: e.target.value }))} className="border rounded-xl p-2.5" /><input required placeholder="اسم الحساب *" value={form.account_name} onChange={e => setForm(f => ({ ...f, account_name: e.target.value }))} className="border rounded-xl p-2.5" /></div><input required placeholder="رقم الحساب *" value={form.account_number} onChange={e => setForm(f => ({ ...f, account_number: e.target.value }))} className="w-full border rounded-xl p-2.5" dir="ltr" /><div className="grid grid-cols-2 gap-3"><select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} className="border rounded-xl p-2.5">{currencies.map(c => <option key={c.code}>{c.code}</option>)}</select><input type="number" placeholder="الرصيد" value={form.balance} onChange={e => setForm(f => ({ ...f, balance: e.target.value }))} className="border rounded-xl p-2.5" /></div><button disabled={saving} className="w-full bg-emerald-600 text-white rounded-xl py-3 font-bold">{saving ? 'جارٍ الحفظ...' : 'حفظ عبر SDK'}</button></form></div>}
    </div>
  );
}
