import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { FolderKanban, Loader2, Plus, RefreshCw, X, Search } from 'lucide-react';
import { supabase } from '../../../services/supabase/supabase';
import { requireTenantId } from '../../../services/sdk/BaseService';
import { getErrorMessage } from '../../../services/errors';
import { useUIStore } from '../../../core/stores';

export default function ProjectAccountingPage() {
  const { addToast } = useUIStore();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ code: '', name_ar: '', status: 'active' });
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('finance_projects').select('*').order('code');
      if (error) throw error;
      setRows(data || []);
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
      const tenant_id = requireTenantId();
      const legal_entity_id = (await supabase.from('legal_entities').select('id').eq('tenant_id', tenant_id).limit(1).single()).data?.id;
      if (!legal_entity_id) throw new Error('لا يوجد كيان قانوني — أنشئ من Finance Setup');
      const { error } = await supabase.from('finance_projects').insert({
        tenant_id,
        legal_entity_id,
        code: form.code.toUpperCase(),
        name_ar: form.name_ar,
        status: form.status,
      });
      if (error) throw error;
      addToast('تم إنشاء المشروع', 'success');
      setShow(false);
      setForm({ code: '', name_ar: '', status: 'active' });
      await load();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const filtered = rows.filter(r => `${r.code} ${r.name_ar}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-5 max-w-[1600px] mx-auto" dir="rtl">
      <div className="flex justify-between flex-wrap gap-3">
        <div>
          <p className="text-sm font-bold text-violet-700">Project Accounting — Wave 3 (Beta) — Real SDK ✅</p>
          <h1 className="text-3xl font-black">محاسبة المشاريع</h1>
          <p className="text-slate-500 mt-2">مشاريع + مراكز تكلفة + تخصيص تكاليف — من finance_projects و cost_centers.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => void load()} className="border rounded-xl px-4 py-2 font-bold"><RefreshCw size={15} className="inline ml-1" />تحديث</button>
          <button onClick={() => setShow(true)} className="bg-violet-600 text-white rounded-xl px-4 py-2 font-bold"><Plus size={15} className="inline ml-1" />مشروع جديد</button>
        </div>
      </div>

      <label className="flex gap-2 border rounded-xl p-3 bg-white max-w-md"><Search size={16} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="بحث بالكود أو الاسم..." className="w-full outline-none" /></label>

      {loading ? <div className="py-24 text-center"><Loader2 className="animate-spin mx-auto mb-3" />جارٍ التحميل...</div> : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(r => (
            <div key={r.id} className="bg-white border rounded-2xl p-5">
              <div className="flex items-center gap-2"><FolderKanban size={18} className="text-violet-600" /><span className="font-mono font-bold text-sm">{r.code}</span><span className={`ml-auto text-xs px-2 py-1 rounded-full border ${r.status==='active' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-100'}`}>{r.status}</span></div>
              <h3 className="font-black mt-3">{r.name_ar}</h3>
              <p className="text-xs text-slate-400 mt-2">{new Date(r.created_at).toLocaleDateString('ar-EG')}</p>
            </div>
          ))}
          {!filtered.length && <div className="col-span-full bg-white border border-dashed rounded-2xl p-16 text-center text-slate-500"><FolderKanban className="mx-auto mb-3 text-slate-300" />لا توجد مشاريع — أنشئ أول مشروع.</div>}
        </div>
      )}

      {show && <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4" onClick={() => !saving && setShow(false)}><form onSubmit={submit} onClick={e => e.stopPropagation()} className="w-full max-w-lg bg-white rounded-2xl p-6 space-y-3"><div className="flex justify-between items-center gap-3 flex-wrap"><h2 className="font-black text-xl">مشروع جديد</h2><button type="button" onClick={() => setShow(false)}><X /></button></div><div className="grid grid-cols-2 gap-3"><input required placeholder="كود المشروع *" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} className="border rounded-xl p-2.5" dir="ltr" /><select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="border rounded-xl p-2.5"><option value="active">نشط</option><option value="on_hold">معلق</option><option value="closed">مقفل</option></select></div><input required placeholder="اسم المشروع بالعربية *" value={form.name_ar} onChange={e => setForm(f => ({ ...f, name_ar: e.target.value }))} className="w-full border rounded-xl p-2.5" /><button disabled={saving} className="w-full bg-violet-600 text-white rounded-xl py-3 font-bold">{saving ? 'جارٍ الحفظ...' : 'حفظ'}</button></form></div>}
    </div>
  );
}
