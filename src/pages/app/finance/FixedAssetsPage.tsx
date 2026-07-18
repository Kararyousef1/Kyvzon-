import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Building2, Loader2, Plus, RefreshCw, Search, X, Calculator, Calendar } from 'lucide-react';
import { fixedAssetService } from '../../../services/sdk/FixedAssetService';
import { getErrorMessage } from '../../../services/errors';
import { useUIStore } from '../../../core/stores';

export default function FixedAssetsPage() {
  const { addToast } = useUIStore();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(false);
  const [q, setQ] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ asset_code: '', asset_name: '', asset_category: 'equipment', purchase_date: new Date().toISOString().slice(0,10), purchase_cost: '', useful_life_years: '5', status: 'active' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fixedAssetService.findActive() as any[];
      setRows(data);
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
      await (fixedAssetService as any).create({
        asset_code: form.asset_code.toUpperCase(),
        asset_name: form.asset_name,
        asset_category: form.asset_category,
        purchase_date: form.purchase_date,
        purchase_cost: Number(form.purchase_cost),
        useful_life_years: Number(form.useful_life_years),
        status: form.status,
        book_value: Number(form.purchase_cost),
      });
      addToast('تم إنشاء الأصل الثابت', 'success');
      setShow(false);
      setForm({ asset_code: '', asset_name: '', asset_category: 'equipment', purchase_date: new Date().toISOString().slice(0,10), purchase_cost: '', useful_life_years: '5', status: 'active' });
      await load();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const filtered = rows.filter(r => `${r.asset_code} ${r.asset_name}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="p-6 md:p-8 space-y-6" dir="rtl">
      <div className="flex justify-between flex-wrap gap-3">
        <div>
          <p className="text-sm font-bold text-violet-700">Fixed Assets — Wave 6 (Beta) — Real SDK ✅</p>
          <h1 className="text-3xl font-black">الأصول الثابتة والإهلاك</h1>
          <p className="text-slate-500 mt-2">أصول مع إهلاك، قيمة دفترية، وحياة إنتاجية — مرتبطة بـ depreciation_schedules.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => void load()} className="border rounded-xl px-4 py-2 font-bold"><RefreshCw size={15} className="inline ml-1" />تحديث</button>
          <button onClick={() => setShow(true)} className="bg-violet-600 text-white rounded-xl px-4 py-2 font-bold"><Plus size={15} className="inline ml-1" />أصل جديد</button>
        </div>
      </div>

      <label className="flex gap-2 border rounded-xl p-3 bg-white max-w-md"><Search size={16} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="بحث بالكود أو الاسم..." className="w-full outline-none" /></label>

      {loading ? <div className="py-24 text-center"><Loader2 className="animate-spin mx-auto mb-3" />جارٍ التحميل...</div> : (
        <div className="bg-white border rounded-2xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50"><tr><th className="p-3 text-right">الكود</th><th className="p-3 text-right">الاسم</th><th className="p-3 text-right">الفئة</th><th className="p-3 text-right">التكلفة</th><th className="p-3 text-right">القيمة الدفترية</th><th className="p-3 text-right">الحالة</th></tr></thead>
            <tbody className="divide-y">
              {filtered.map(r => <tr key={r.id}><td className="p-3 font-mono font-bold">{r.asset_code}</td><td className="p-3">{r.asset_name}</td><td className="p-3">{r.asset_category}</td><td className="p-3 font-black">{Number(r.purchase_cost).toLocaleString()}</td><td className="p-3">{Number(r.book_value ?? r.purchase_cost).toLocaleString()}</td><td className="p-3"><span className="px-2 py-1 bg-emerald-50 border border-emerald-200 rounded-full text-xs font-bold">{r.status}</span></td></tr>)}
              {!filtered.length && <tr><td colSpan={6} className="p-16 text-center text-slate-500"><Building2 className="mx-auto mb-3 text-slate-300" />لا توجد أصول — أنشئ أول أصل.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {show && <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4" onClick={() => !saving && setShow(false)}><form onSubmit={submit} onClick={e => e.stopPropagation()} className="w-full max-w-lg bg-white rounded-2xl p-6 space-y-3"><div className="flex justify-between"><h2 className="font-black text-xl">أصل ثابت جديد — SDK</h2><button type="button" onClick={() => setShow(false)}><X /></button></div><div className="grid grid-cols-2 gap-3"><input required placeholder="كود الأصل *" value={form.asset_code} onChange={e => setForm(f => ({ ...f, asset_code: e.target.value }))} className="border rounded-xl p-2.5" dir="ltr" /><select value={form.asset_category} onChange={e => setForm(f => ({ ...f, asset_category: e.target.value }))} className="border rounded-xl p-2.5"><option value="equipment">معدات</option><option value="vehicle">مركبة</option><option value="building">مبنى</option><option value="furniture">أثاث</option><option value="computer">حاسب</option></select></div><input required placeholder="اسم الأصل *" value={form.asset_name} onChange={e => setForm(f => ({ ...f, asset_name: e.target.value }))} className="w-full border rounded-xl p-2.5" /><div className="grid grid-cols-2 gap-3"><input required type="date" value={form.purchase_date} onChange={e => setForm(f => ({ ...f, purchase_date: e.target.value }))} className="border rounded-xl p-2.5" /><input required type="number" placeholder="التكلفة *" value={form.purchase_cost} onChange={e => setForm(f => ({ ...f, purchase_cost: e.target.value }))} className="border rounded-xl p-2.5" /></div><div className="grid grid-cols-2 gap-3"><input type="number" placeholder="العمر الإنتاجي سنوات" value={form.useful_life_years} onChange={e => setForm(f => ({ ...f, useful_life_years: e.target.value }))} className="border rounded-xl p-2.5" /><select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="border rounded-xl p-2.5"><option value="active">نشط</option><option value="disposed">مستبعد</option><option value="maintenance">صيانة</option></select></div><button disabled={saving} className="w-full bg-violet-600 text-white rounded-xl py-3 font-bold">{saving ? 'جارٍ الحفظ...' : 'حفظ عبر SDK'}</button></form></div>}
    </div>
  );
}
