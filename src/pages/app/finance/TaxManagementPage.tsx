import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { BadgePercent, Loader2, Plus, RefreshCw, Search, X, ShieldCheck, AlertTriangle } from 'lucide-react';
import { taxService, type TaxCodeRecord } from '../../../services/sdk/TaxService';
import { getErrorMessage } from '../../../services/errors';
import { useUIStore } from '../../../core/stores';

export default function TaxManagementPage() {
  const { addToast } = useUIStore();
  const [rows, setRows] = useState<TaxCodeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(false);
  const [q, setQ] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ code: '', name: '', rate: '', is_active: true });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await taxService.findActive());
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
      await taxService.createWithValidation({
        code: form.code.toUpperCase(),
        name: form.name,
        rate: Number(form.rate),
        is_active: form.is_active,
      } as any);
      addToast('تم إنشاء كود الضريبة — configuration فقط', 'success');
      setShow(false);
      setForm({ code: '', name: '', rate: '', is_active: true });
      await load();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const filtered = rows.filter(r => `${r.code} ${r.name}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="p-6 md:p-8 space-y-6" dir="rtl">
      <div className="flex justify-between flex-wrap gap-3">
        <div>
          <p className="text-sm font-bold text-amber-700 flex items-center gap-2"><ShieldCheck size={14} /> Tax Configuration — Wave 6 (Beta) — لا حسابات مفترضة</p>
          <h1 className="text-3xl font-black">الضرائب (Configuration)</h1>
          <p className="text-slate-500 mt-2">الضرائب العراقية بصيغة configuration قابلة للاعتماد قانونياً — النسب والتواريخ من مستشار ضريبي، لا حساب مفترض.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => void load()} className="border rounded-xl px-4 py-2 font-bold"><RefreshCw size={15} className="inline ml-1" />تحديث</button>
          <button onClick={() => setShow(true)} className="bg-amber-600 text-white rounded-xl px-4 py-2 font-bold"><Plus size={15} className="inline ml-1" />كود ضريبي</button>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900 flex gap-2">
        <AlertTriangle size={16} className="shrink-0 mt-0.5" />
        <div><p className="font-bold">مبدأ عدم الافتراض:</p><p className="mt-1 leading-relaxed">لا يتم احتساب ضريبة تلقائياً في القيود حتى يعتمد المستشار الضريبي العراقي الأكواد والنسب وتواريخ السريان. هذه الشاشة هي configuration فقط.</p></div>
      </div>

      <label className="flex gap-2 border rounded-xl p-3 bg-white max-w-md"><Search size={16} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="بحث بالكود أو الاسم..." className="w-full outline-none" /></label>

      {loading ? <div className="py-24 text-center"><Loader2 className="animate-spin mx-auto mb-3" />جارٍ التحميل...</div> : (
        <div className="bg-white border rounded-2xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50"><tr><th className="p-3 text-right">الكود</th><th className="p-3 text-right">الاسم</th><th className="p-3 text-right">النسبة</th><th className="p-3 text-right">نشط</th></tr></thead>
            <tbody className="divide-y">
              {filtered.map(r => <tr key={r.id}><td className="p-3 font-mono font-bold">{r.code}</td><td className="p-3">{r.name}</td><td className="p-3 font-black">{(Number(r.rate)*100).toFixed(2)}%</td><td className="p-3">{r.is_active ? '✅' : '—'}</td></tr>)}
              {!filtered.length && <tr><td colSpan={4} className="p-16 text-center text-slate-500"><BadgePercent className="mx-auto mb-3 text-slate-300" />لا توجد أكواد ضريبية — أنشئ أول كود configuration.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {show && <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4" onClick={() => !saving && setShow(false)}><form onSubmit={submit} onClick={e => e.stopPropagation()} className="w-full max-w-lg bg-white rounded-2xl p-6 space-y-3"><div className="flex justify-between"><h2 className="font-black text-xl">كود ضريبي جديد — Configuration</h2><button type="button" onClick={() => setShow(false)}><X /></button></div><div className="grid grid-cols-2 gap-3"><input required placeholder="الكود مثل VAT-15" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} className="border rounded-xl p-2.5" dir="ltr" /><input required type="number" step="0.0001" min="0" max="1" placeholder="النسبة 0.15 = 15%" value={form.rate} onChange={e => setForm(f => ({ ...f, rate: e.target.value }))} className="border rounded-xl p-2.5" dir="ltr" /></div><input required placeholder="الاسم مثل ضريبة القيمة المضافة 15% (معتمد من مستشار)" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full border rounded-xl p-2.5" /><button disabled={saving} className="w-full bg-amber-600 text-white rounded-xl py-3 font-bold">{saving ? 'جارٍ الحفظ...' : 'حفظ كـ configuration'}</button><p className="text-[11px] text-slate-400 text-center">يُحفظ في tax_codes مع rate NUMERIC(5,4) — لا يُستخدم في حساب تلقائي حتى الاعتماد القانوني</p></form></div>}
    </div>
  );
}
