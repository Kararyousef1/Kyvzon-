import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../../services/supabase/supabase';

export default function SupplierDockPortalPage() {
  const { token = '' } = useParams();
  const [state, setState] = useState<Record<string, unknown> | null>(null);
  const [form, setForm] = useState({ dock_id: '', scheduled_start: '', scheduled_end: '', package_count: '0', special_requirements: '' });
  const [message, setMessage] = useState<string>('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.functions.invoke('inventory-supplier-dock-portal', { body: { action: 'verify', token } })
      .then(({ data }) => setState(data || {}))
      .catch((e) => setMessage(e instanceof Error ? e.message : String(e)));
  }, [token]);

  const book = async () => {
    setBusy(true); setMessage('');
    try {
      const { data, error } = await supabase.functions.invoke('inventory-supplier-dock-portal', { body: { action: 'book', token, ...form, package_count: Number(form.package_count || 0) } });
      if (error || data?.error) throw new Error(data?.error || error?.message || 'فشل الحجز');
      setMessage('تم حجز الرصيف بنجاح. رقم الموعد: ' + data.appointment_id);
    } catch (e) { setMessage(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const docks = Array.isArray(state?.docks) ? state.docks as Array<Record<string, unknown>> : [];
  return (
    <div className="min-h-screen bg-slate-50 p-6" dir="rtl">
      <div className="max-w-3xl mx-auto bg-white border rounded-3xl p-6 shadow-sm space-y-5">
        <div><h1 className="text-2xl font-black">حجز موعد رصيف الاستلام</h1><p className="text-slate-500 mt-1">بوابة الموردين — Dock Scheduling</p></div>
        {state?.error ? <div className="p-4 rounded-xl bg-red-50 text-red-700">{String(state.error)}</div> : (
          <div className="grid gap-3">
            <label className="text-sm font-bold">الرصيف
              <select value={form.dock_id} onChange={(e)=>setForm({...form,dock_id:e.target.value})} className="w-full border rounded-xl p-2 mt-1">
                <option value="">أي رصيف متاح</option>
                {docks.map((d)=><option key={String(d.id)} value={String(d.id)}>{String(d.dock_code)} — {String(d.dock_type)}</option>)}
              </select>
            </label>
            <div className="grid md:grid-cols-2 gap-3">
              <label className="text-sm font-bold">البداية<input type="datetime-local" value={form.scheduled_start} onChange={(e)=>setForm({...form,scheduled_start:e.target.value})} className="w-full border rounded-xl p-2 mt-1" /></label>
              <label className="text-sm font-bold">النهاية<input type="datetime-local" value={form.scheduled_end} onChange={(e)=>setForm({...form,scheduled_end:e.target.value})} className="w-full border rounded-xl p-2 mt-1" /></label>
            </div>
            <label className="text-sm font-bold">عدد الطرود<input type="number" value={form.package_count} onChange={(e)=>setForm({...form,package_count:e.target.value})} className="w-full border rounded-xl p-2 mt-1" /></label>
            <label className="text-sm font-bold">متطلبات خاصة<textarea value={form.special_requirements} onChange={(e)=>setForm({...form,special_requirements:e.target.value})} className="w-full border rounded-xl p-2 mt-1" rows={3} /></label>
            <button disabled={busy} onClick={book} className="bg-indigo-600 text-white rounded-xl py-3 font-bold">{busy ? 'جاري الحجز...' : 'تأكيد الحجز'}</button>
          </div>
        )}
        {message && <div className="p-4 rounded-xl bg-slate-100 text-slate-700 text-sm">{message}</div>}
      </div>
    </div>
  );
}
