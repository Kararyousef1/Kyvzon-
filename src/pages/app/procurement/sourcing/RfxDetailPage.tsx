import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import Card from '../../../../shared/components/ui/Card';
import Button from '../../../../shared/components/ui/Button';
import { sourcingEventService, supplierBidService, supplierService, type SupplierBidRecord } from '../../../../services/sdk';
import { useUIStore } from '../../../../core/stores';

export default function RfxDetailPage() {
  const { id } = useParams();
  const { addToast } = useUIStore();
  const [event, setEvent] = useState<any>(null);
  const [bids, setBids] = useState<SupplierBidRecord[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [showBid, setShowBid] = useState(false);
  const [form, setForm] = useState({ supplier_id: '', total_price: 0, discount: 0, lead_time: 14 });

  const load = async () => {
    if (!id) return;
    try {
      const ev = await sourcingEventService.findById(id);
      setEvent(ev);
      const b = await supplierBidService.findByEvent(id);
      setBids(b);
      const sups = await supplierService.findApproved();
      setSuppliers(sups);
    } catch (e:any) { addToast(e.message,'error'); }
  };

  useEffect(()=>{ load(); }, [id]);

  const handleBid = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await supplierBidService.submit(id!, form.supplier_id, Number(form.total_price), 'SAR', Number(form.lead_time), Number(form.discount));
      addToast('تم تقديم العرض', 'success');
      setShowBid(false);
      await load();
    } catch (err:any) { addToast(err.message,'error'); }
  };

  if (!event) return <div className="p-10 text-center">جاري التحميل...</div>;

  // TCO calculation: effective_price already GENERATED, plus delivery performance mock? real from evaluations avg
  const tcoSorted = [...bids].sort((a,b)=>a.effective_price - b.effective_price);

  return (
    <div className="space-y-5 max-w-[1600px] mx-auto" dir="rtl">
      <div>
        <h1 className="text-2xl font-black">{event.event_number} — {event.title}</h1>
        <p className="text-slate-500 text-sm mt-1">نوع: {event.type} • حالة: {event.status} • إغلاق: {event.close_date ? new Date(event.close_date).toLocaleDateString('ar-SA') : '-'}</p>
      </div>

      <div className="flex justify-between items-center">
        <h3 className="font-bold">العروض ({bids.length}) — مقارنة TCO حقيقية (سعر فعلي بعد خصم + Lead Time + ISO)</h3>
        <Button onClick={()=>setShowBid(true)}>تقديم عرض</Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50"><tr><th className="p-2 text-right">المورد</th><th className="p-2">إجمالي</th><th className="p-2">خصم%</th><th className="p-2">سعر فعلي</th><th className="p-2">Lead Time</th><th className="p-2">ISO</th><th className="p-2">حالة</th></tr></thead>
            <tbody className="divide-y">
              {tcoSorted.map(b=>(
                <tr key={b.id}>
                  <td className="p-2 font-bold">{suppliers.find(s=>s.id===b.supplier_id)?.legal_name || b.supplier_id.slice(0,6)}</td>
                  <td className="p-2">{b.total_price.toLocaleString()}</td>
                  <td className="p-2">{b.discount_percent}%</td>
                  <td className="p-2 font-black text-emerald-700">{b.effective_price.toLocaleString()}</td>
                  <td className="p-2">{b.lead_time_days || '-'} يوم</td>
                  <td className="p-2">{(b as any).has_iso_certificate ? '✅' : '❌'}</td>
                  <td className="p-2"><span className="text-[10px] px-2 py-1 rounded-full bg-slate-100">{b.status}</span></td>
                </tr>
              ))}
              {!bids.length && <tr><td colSpan={7} className="p-10 text-center text-slate-500">لا عروض بعد — أفضل TCO سيظهر هنا</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="p-3 text-[11px] text-slate-400">TCO = total_price * (1 - discount%) — يُحسب GENERATED في DB. يُرتب تلقائياً بأقل سعر فعلي. سيتم إضافة تقييم فني/جودة/تسليم لاحقاً عبر bid_evaluations.</div>
      </Card>

      {showBid && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h3 className="font-bold mb-4">تقديم عرض جديد</h3>
            <form onSubmit={handleBid} className="space-y-3">
              <select required value={form.supplier_id} onChange={e=>setForm({...form, supplier_id:e.target.value})} className="w-full border rounded-xl p-2.5 text-sm">
                <option value="">اختر مورد معتمد</option>
                {suppliers.map(s=><option key={s.id} value={s.id}>{s.legal_name} ({s.supplier_code})</option>)}
              </select>
              <div className="grid grid-cols-2 gap-3">
                <input required type="number" step={0.01} placeholder="إجمالي السعر" value={form.total_price} onChange={e=>setForm({...form, total_price:Number(e.target.value)})} className="border rounded-xl p-2.5 text-sm" />
                <input type="number" step={0.1} placeholder="خصم %" value={form.discount} onChange={e=>setForm({...form, discount:Number(e.target.value)})} className="border rounded-xl p-2.5 text-sm" />
              </div>
              <input type="number" placeholder="Lead Time أيام" value={form.lead_time} onChange={e=>setForm({...form, lead_time:Number(e.target.value)})} className="w-full border rounded-xl p-2.5 text-sm" />
              <div className="flex gap-2">
                <Button type="submit" className="flex-1">إرسال</Button>
                <Button type="button" variant="secondary" className="flex-1" onClick={()=>setShowBid(false)}>إلغاء</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
