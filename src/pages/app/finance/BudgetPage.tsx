import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Calculator, Loader2, Plus, RefreshCw, Search, X, TrendingUp, BarChart3 } from 'lucide-react';
import { budgetService, type BudgetRecord } from '../../../services/sdk/BudgetService';
import { getErrorMessage } from '../../../services/errors';
import { useUIStore } from '../../../core/stores';

export default function BudgetPage() {
  const { addToast } = useUIStore();
  const [budgets, setBudgets] = useState<BudgetRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(false);
  const [q, setQ] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ budget_name: '', fiscal_year: new Date().getFullYear(), start_date: '', end_date: '', status: 'draft' as const });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await budgetService.findAll({ orderBy: 'fiscal_year', ascending: false });
      setBudgets(rows as any);
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
      await (budgetService as any).create({
        budget_name: form.budget_name,
        fiscal_year: Number(form.fiscal_year),
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        status: form.status,
      });
      addToast('تم إنشاء الموازنة', 'success');
      setShow(false);
      setForm({ budget_name: '', fiscal_year: new Date().getFullYear(), start_date: '', end_date: '', status: 'draft' });
      await load();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const filtered = budgets.filter(b => b.budget_name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-5 max-w-[1600px] mx-auto" dir="rtl">
      <div className="flex justify-between flex-wrap gap-3">
        <div>
          <p className="text-sm font-bold text-indigo-700">Budget — Wave 6 (Beta) — Real SDK ✅</p>
          <h1 className="text-3xl font-black">الموازنات</h1>
          <p className="text-slate-500 mt-2">إدارة الموازنات السنوية مع حالات draft/approved/closed — مرتبطة بـ budget_lines و variance.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => void load()} className="border rounded-xl px-4 py-2 font-bold"><RefreshCw size={15} className="inline ml-1" />تحديث</button>
          <button onClick={() => setShow(true)} className="bg-indigo-600 text-white rounded-xl px-4 py-2 font-bold"><Plus size={15} className="inline ml-1" />موازنة جديدة</button>
        </div>
      </div>

      <label className="flex gap-2 border rounded-xl p-3 bg-white max-w-md"><Search size={16} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="بحث باسم الموازنة..." className="w-full outline-none" /></label>

      {loading ? <div className="py-24 text-center"><Loader2 className="animate-spin mx-auto mb-3" />جارٍ التحميل عبر SDK...</div> : (
        <div className="bg-white border rounded-2xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50"><tr><th className="p-3 text-right">الاسم</th><th className="p-3 text-right">السنة</th><th className="p-3 text-right">البداية</th><th className="p-3 text-right">النهاية</th><th className="p-3 text-right">الحالة</th><th className="p-3 text-right">إجراءات</th></tr></thead>
            <tbody className="divide-y">
              {filtered.map(b => <tr key={b.id}><td className="p-3 font-bold">{b.budget_name}</td><td className="p-3 font-mono">{b.fiscal_year}</td><td className="p-3">{b.start_date || '—'}</td><td className="p-3">{b.end_date || '—'}</td><td className="p-3"><span className="px-2 py-1 bg-slate-100 rounded-full text-xs font-bold">{b.status}</span></td><td className="p-3"><button className="text-indigo-600 text-xs font-bold flex gap-1"><BarChart3 size={12} /> تباين</button></td></tr>)}
              {!filtered.length && <tr><td colSpan={6} className="p-16 text-center text-slate-500"><Calculator className="mx-auto mb-3 text-slate-300" />لا توجد موازنات — أنشئ أول موازنة عبر SDK حقيقي.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {show && <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4" onClick={() => !saving && setShow(false)}><form onSubmit={submit} onClick={e => e.stopPropagation()} className="w-full max-w-lg bg-white rounded-2xl p-6 space-y-3"><div className="flex justify-between items-center gap-3 flex-wrap"><h2 className="font-black text-xl">موازنة جديدة — SDK</h2><button type="button" onClick={() => setShow(false)}><X /></button></div><input required placeholder="اسم الموازنة *" value={form.budget_name} onChange={e => setForm(f => ({ ...f, budget_name: e.target.value }))} className="w-full border rounded-xl p-2.5" /><div className="grid grid-cols-2 gap-3"><input required type="number" placeholder="السنة المالية" value={form.fiscal_year} onChange={e => setForm(f => ({ ...f, fiscal_year: Number(e.target.value) }))} className="border rounded-xl p-2.5" /><select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as any }))} className="border rounded-xl p-2.5"><option value="draft">مسودة</option><option value="approved">معتمدة</option><option value="closed">مقفلة</option></select></div><div className="grid grid-cols-2 gap-3"><input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} className="border rounded-xl p-2.5" /><input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} className="border rounded-xl p-2.5" /></div><button disabled={saving} className="w-full bg-indigo-600 text-white rounded-xl py-3 font-bold">{saving ? 'جارٍ الحفظ...' : 'حفظ عبر SDK'}</button><p className="text-[11px] text-slate-400 text-center">يُحفظ في budgets مع tenant_id تلقائي + RLS</p></form></div>}
    </div>
  );
}
