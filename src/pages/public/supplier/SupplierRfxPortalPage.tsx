import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../../services/supabase/supabase';
import Button from '../../../shared/components/ui/Button';
import Input from '../../../shared/components/ui/Input';

export default function SupplierRfxPortalPage() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [data, setData] = useState<any>(null);
  const [bid, setBid] = useState({ total_price: 0, currency_code: 'SAR', lead_time_days: 14, discount_percent: 0 });
  const [question, setQuestion] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const { data, error: fnError } = await supabase.functions.invoke('procurement-supplier-rfx', { body: { action: 'verify', token } });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      setData(data);
      const existing = data?.bids?.[0];
      if (existing) setBid({ total_price: existing.total_price || 0, currency_code: existing.currency_code || 'SAR', lead_time_days: existing.lead_time_days || 14, discount_percent: existing.discount_percent || 0 });
    } catch (e: any) { setError(e.message || 'تعذر فتح دعوة RFx'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [token]);

  const submitBid = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError('');
    try {
      const { data: res, error: fnError } = await supabase.functions.invoke('procurement-supplier-rfx', { body: { action: 'submit_bid', token, ...bid } });
      if (fnError) throw fnError;
      if (res?.error) throw new Error(res.error);
      setDone(true); await load();
    } catch (e: any) { setError(e.message || 'تعذر تقديم العرض'); }
    finally { setSaving(false); }
  };

  const ask = async () => {
    if (!question.trim()) return;
    setSaving(true); setError('');
    try {
      const { data: res, error: fnError } = await supabase.functions.invoke('procurement-supplier-rfx', { body: { action: 'ask_question', token, question } });
      if (fnError) throw fnError;
      if (res?.error) throw new Error(res.error);
      setQuestion(''); await load();
    } catch (e: any) { setError(e.message || 'تعذر إرسال السؤال'); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="min-h-screen grid place-items-center bg-slate-50" dir="rtl">جاري فتح دعوة RFx...</div>;
  if (error && !data) return <div className="min-h-screen grid place-items-center bg-slate-50 p-6" dir="rtl"><div className="bg-white border rounded-2xl p-8 max-w-md text-center"><h1 className="font-black text-xl text-red-700">تعذر فتح الدعوة</h1><p className="text-sm text-slate-500 mt-2">{error}</p></div></div>;

  const event = data?.event || {};
  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4" dir="rtl">
      <div className="max-w-6xl mx-auto space-y-5">
        <div className="bg-white border rounded-3xl p-6 shadow-sm">
          <h1 className="text-3xl font-black">{event.event_number} — {event.title}</h1>
          <p className="text-slate-500 mt-1">نوع الحدث: {event.type} • الإغلاق: {event.close_date ? new Date(event.close_date).toLocaleString('ar-SA') : '-'}</p>
          <p className="text-xs text-slate-400 mt-1">المورد: {data?.supplier?.legal_name}</p>
          {error && <div className="mt-3 bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">{error}</div>}
          {done && <div className="mt-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl p-3 text-sm">تم تقديم العرض بنجاح.</div>}
        </div>

        <div className="grid lg:grid-cols-3 gap-5">
          <section className="lg:col-span-2 bg-white border rounded-3xl p-6 shadow-sm">
            <h2 className="font-black text-xl mb-3">بنود الطلب والمتطلبات</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50"><tr><th className="p-2 text-right">الصنف</th><th className="p-2">الوصف</th><th className="p-2">الكمية</th><th className="p-2">الوحدة</th></tr></thead>
                <tbody className="divide-y">{(data?.lines||[]).map((l:any)=><tr key={l.id}><td className="p-2 font-mono">{l.item_code||'-'}</td><td className="p-2">{l.description}</td><td className="p-2 text-center">{l.quantity}</td><td className="p-2 text-center">{l.unit}</td></tr>)}{!(data?.lines||[]).length&&<tr><td colSpan={4} className="p-8 text-center text-slate-400">لا بنود ظاهرة</td></tr>}</tbody>
              </table>
            </div>
          </section>

          <section className="bg-white border rounded-3xl p-6 shadow-sm">
            <h2 className="font-black text-xl mb-3">تقديم العرض</h2>
            <form onSubmit={submitBid} className="space-y-3">
              <Input required type="number" step={0.01} placeholder="إجمالي السعر" value={bid.total_price} onChange={e=>setBid({...bid,total_price:Number(e.target.value)})}/>
              <select value={bid.currency_code} onChange={e=>setBid({...bid,currency_code:e.target.value})} className="w-full border rounded-xl p-2.5 text-sm"><option value="SAR">SAR</option><option value="USD">USD</option><option value="IQD">IQD</option></select>
              <Input type="number" placeholder="Lead Time أيام" value={bid.lead_time_days} onChange={e=>setBid({...bid,lead_time_days:Number(e.target.value)})}/>
              <Input type="number" step={0.1} placeholder="خصم %" value={bid.discount_percent} onChange={e=>setBid({...bid,discount_percent:Number(e.target.value)})}/>
              <Button type="submit" loading={saving} fullWidth>إرسال العرض</Button>
            </form>
          </section>
        </div>

        <section className="bg-white border rounded-3xl p-6 shadow-sm">
          <h2 className="font-black text-xl mb-3">الأسئلة والإجابات</h2>
          <div className="flex gap-2 mb-4"><Input placeholder="اكتب سؤالاً للمشتريات" value={question} onChange={e=>setQuestion(e.target.value)} /><Button type="button" onClick={ask} loading={saving}>إرسال سؤال</Button></div>
          <div className="space-y-2">{(data?.questions||[]).map((q:any)=><div key={q.id} className="p-3 border rounded-xl"><div className="font-bold">س: {q.question}</div><div className="text-sm text-slate-600 mt-1">ج: {q.answer || 'بانتظار الإجابة'}</div></div>)}{!(data?.questions||[]).length&&<div className="py-8 text-center text-slate-400">لا توجد أسئلة</div>}</div>
        </section>
      </div>
    </div>
  );
}
