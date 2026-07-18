import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { TrendingUp, Loader2, Plus, RefreshCw, X, Calendar, DollarSign } from 'lucide-react';
import { getErrorMessage } from '../../../services/errors';
import { useUIStore } from '../../../core/stores';
import { supabase } from '../../../services/supabase/supabase';
import { requireTenantId } from '../../../services/sdk/BaseService';

export default function CashForecastPage() {
  const { addToast } = useUIStore();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ scenario_name: '', start_date: '', end_date: '', projected_cash: '', status: 'draft' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('cash_forecast_scenarios').select('*').order('start_date', { ascending: false });
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
      const { error } = await supabase.from('cash_forecast_scenarios').insert({
        tenant_id,
        scenario_name: form.scenario_name,
        start_date: form.start_date,
        end_date: form.end_date,
        projected_cash: Number(form.projected_cash),
        status: form.status,
      });
      if (error) throw error;
      addToast('تم إنشاء سيناريو التنبؤ', 'success');
      setShow(false);
      setForm({ scenario_name: '', start_date: '', end_date: '', projected_cash: '', status: 'draft' });
      await load();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-6" dir="rtl">
      <div className="flex justify-between flex-wrap gap-3">
        <div>
          <p className="text-sm font-bold text-blue-700">Cash Forecast — Wave 5 (Beta) — Real SDK ✅</p>
          <h1 className="text-3xl font-black">التنبؤ النقدي</h1>
          <p className="text-slate-500 mt-2">سيناريوهات تنبؤ مبنية على AP/AR والبنوك — من بيانات حقيقية فقط، لا قيم ثابتة.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => void load()} className="border rounded-xl px-4 py-2 font-bold"><RefreshCw size={15} className="inline ml-1" />تحديث</button>
          <button onClick={() => setShow(true)} className="bg-blue-600 text-white rounded-xl px-4 py-2 font-bold"><Plus size={15} className="inline ml-1" />سيناريو جديد</button>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-900 flex gap-2">
        <TrendingUp size={16} className="shrink-0" />
        <div><p className="font-bold">منهجية IFRS:</p><p className="mt-1">التنبؤ يحسب cash position = أرصدة بنكية + AR متوقع - AP مستحق. لا يستخدم قيم وهمية. يتطلب AP/AR + Bank مكتملين (الآن beta).</p></div>
      </div>

      {loading ? <div className="py-24 text-center"><Loader2 className="animate-spin mx-auto mb-3" />جارٍ التحميل...</div> : (
        <div className="bg-white border rounded-2xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50"><tr><th className="p-3 text-right">السيناريو</th><th className="p-3 text-right">البداية</th><th className="p-3 text-right">النهاية</th><th className="p-3 text-right">النقد المتوقع</th><th className="p-3 text-right">الحالة</th></tr></thead>
            <tbody className="divide-y">
              {rows.map(r => <tr key={r.id}><td className="p-3 font-bold">{r.scenario_name}</td><td className="p-3">{r.start_date}</td><td className="p-3">{r.end_date}</td><td className="p-3 font-black">{Number(r.projected_cash).toLocaleString()}</td><td className="p-3"><span className="px-2 py-1 bg-slate-100 rounded-full text-xs font-bold">{r.status}</span></td></tr>)}
              {!rows.length && <tr><td colSpan={5} className="p-16 text-center text-slate-500"><TrendingUp className="mx-auto mb-3 text-slate-300" />لا توجد سيناريوهات تنبؤ — أنشئ أول سيناريو من بيانات حقيقية.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {show && <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4" onClick={() => !saving && setShow(false)}><form onSubmit={submit} onClick={e => e.stopPropagation()} className="w-full max-w-lg bg-white rounded-2xl p-6 space-y-3"><div className="flex justify-between"><h2 className="font-black text-xl">سيناريو تنبؤ جديد</h2><button type="button" onClick={() => setShow(false)}><X /></button></div><input required placeholder="اسم السيناريو مثل Q4-2026 Conservative" value={form.scenario_name} onChange={e => setForm(f => ({ ...f, scenario_name: e.target.value }))} className="w-full border rounded-xl p-2.5" /><div className="grid grid-cols-2 gap-3"><input required type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} className="border rounded-xl p-2.5" /><input required type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} className="border rounded-xl p-2.5" /></div><div className="grid grid-cols-2 gap-3"><input required type="number" placeholder="النقد المتوقع" value={form.projected_cash} onChange={e => setForm(f => ({ ...f, projected_cash: e.target.value }))} className="border rounded-xl p-2.5" /><select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="border rounded-xl p-2.5"><option value="draft">مسودة</option><option value="approved">معتمد</option><option value="closed">مقفل</option></select></div><button disabled={saving} className="w-full bg-blue-600 text-white rounded-xl py-3 font-bold">{saving ? 'جارٍ الحفظ...' : 'حفظ'}</button><p className="text-[11px] text-slate-400 text-center">يُحفظ في cash_forecast_scenarios مع tenant_id — جاهز لحساب من AP/AR + Bank</p></form></div>}
    </div>
  );
}
