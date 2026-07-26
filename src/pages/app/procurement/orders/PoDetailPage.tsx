import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import Card from '../../../../shared/components/ui/Card';
import { purchaseOrderService, poLineItemService, goodsReceiptService, type PurchaseOrderRecord, type PoLineItemRecord } from '../../../../services/sdk';
import { useUIStore } from '../../../../core/stores';

export default function PoDetailPage() {
  const { id } = useParams();
  const { addToast } = useUIStore();
  const [po, setPo] = useState<PurchaseOrderRecord | null>(null);
  const [lines, setLines] = useState<PoLineItemRecord[]>([]);
  const [grs, setGrs] = useState<any[]>([]);

  useEffect(()=>{
    if (!id) return;
    (async()=>{
      try {
        const p = await purchaseOrderService.findById(id);
        setPo(p as any);
        const l = await poLineItemService.findByPo(id);
        setLines(l);
        const g = await goodsReceiptService.findAll({ filters: { po_id: id }, limit: 20 });
        setGrs(g);
      } catch(e:any){ addToast(e.message,'error'); }
    })();
  }, [id]);

  if (!po) return <div className="p-10 text-center">جاري التحميل...</div>;

  const totalOrdered = lines.reduce((s,l)=>s+Number(l.quantity),0);
  const totalReceived = lines.reduce((s,l)=>s+Number(l.received_quantity),0);
  const pending = totalOrdered - totalReceived;

  return (
    <div className="space-y-5 max-w-[1600px] mx-auto" dir="rtl">
      <div>
        <h1 className="text-2xl font-black">{po.po_number} — {po.po_type}</h1>
        <p className="text-sm text-slate-500 mt-1">حالة: {po.status} • مورد: {po.supplier_id.slice(0,8)} • تسليم: {po.delivery_date ? new Date(po.delivery_date).toLocaleDateString('ar-SA') : '-'} • تتبع: {po.tracking_number || '-'}</p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Card><div className="text-xs text-slate-500">إجمالي قبل ضريبة</div><div className="text-xl font-bold">{po.total_before_tax?.toLocaleString()} {po.currency_code}</div></Card>
        <Card><div className="text-xs text-slate-500">ضريبة {po.tax_rate}%</div><div className="text-xl font-bold">{po.tax_amount?.toLocaleString()}</div></Card>
        <Card><div className="text-xs text-slate-500">الإجمالي الكلي</div><div className="text-xl font-black">{po.total_amount?.toLocaleString()} {po.currency_code}</div></Card>
      </div>

      <Card>
        <h3 className="font-bold mb-3">دورة حياة أمر الشراء (من التقرير 04)</h3>
        <div className="flex items-center gap-2 text-xs overflow-x-auto">
          {['draft','approved','sent','acknowledged','shipped','partially_received','received','closed'].map((st,i)=>(
            <div key={st} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold ${po.status===st ? 'bg-indigo-600 text-white' : ['draft','approved','sent','acknowledged','shipped','partially_received','received','closed'].indexOf(po.status) >= i ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100'}`}>{i+1}</div>
              <span className={po.status===st ? 'font-bold text-indigo-600' : ''}>{st}</span>
              {i<7 && <div className="w-6 h-0.5 bg-slate-200" />}
            </div>
          ))}
        </div>
        <div className="mt-4 grid md:grid-cols-3 gap-3 text-xs">
          <div className="p-3 bg-slate-50 rounded-xl">شروط: Incoterms {po.incoterms} • دفع {po.payment_terms} {po.early_discount_percent ? `• خصم مبكر ${po.early_discount_percent}% خلال ${10} أيام` : ''} • غرامة تأخير {po.late_penalty_percent_per_week}%/أسبوع</div>
          <div className="p-3 bg-slate-50 rounded-xl">تتبع: {po.tracking_number || '—'} • {po.delivery_location || 'مستودع رئيسي'}</div>
          <div className="p-3 bg-slate-50 rounded-xl">PR مرتبط: {po.pr_id?.slice(0,8) || '—'} • جهة اتصال: {po.contact_name || '-'} {po.contact_email || ''}</div>
        </div>
      </Card>

      <Card>
        <h3 className="font-bold mb-3">بنود الأمر — تتبع استلام (Ordered vs Received vs Pending)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50"><tr><th className="p-2 text-right">الصنف</th><th className="p-2">الكمية المطلوبة</th><th className="p-2">المستلمة</th><th className="p-2">المتبقية</th><th className="p-2">سعر الوحدة</th><th className="p-2">الإجمالي</th></tr></thead>
            <tbody className="divide-y">
              {lines.map(l=>(
                <tr key={l.id}>
                  <td className="p-2"><div className="font-bold">{l.item_code || '-'}</div><div className="text-xs text-slate-500">{l.description}</div></td>
                  <td className="p-2 font-mono">{l.quantity}</td>
                  <td className="p-2 font-mono text-emerald-700">{l.received_quantity}</td>
                  <td className="p-2 font-mono text-amber-700">{l.pending_quantity}</td>
                  <td className="p-2">{l.unit_price}</td>
                  <td className="p-2 font-bold">{l.total_price}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex gap-4 text-xs">
          <span>إجمالي مطلوب: <b>{totalOrdered}</b></span>
          <span className="text-emerald-700">مستلم: <b>{totalReceived}</b></span>
          <span className="text-amber-700">متبقي: <b>{pending}</b></span>
        </div>
      </Card>

      <Card>
        <h3 className="font-bold mb-3">عمليات استلام GR ({grs.length}) — 4 خطوات: dock → عد كميات → حجر صحي جودة → Posting</h3>
        <div className="space-y-2">
          {grs.map((gr:any)=>(
            <div key={gr.id} className="p-3 border rounded-xl flex justify-between text-sm">
              <div><span className="font-mono font-bold">{gr.gr_number}</span> • {new Date(gr.received_at).toLocaleString('ar-SA')} • طرود: {gr.total_packages || '-'} • ضرر: {gr.has_damage ? 'نعم' : 'لا'}</div>
              <span className={`text-[10px] px-2 py-1 rounded-full ${gr.status==='posted'?'bg-emerald-100 text-emerald-700':gr.status==='quality_hold'?'bg-amber-100 text-amber-700':'bg-slate-100'}`}>{gr.status}</span>
            </div>
          ))}
          {!grs.length && <div className="py-6 text-center text-slate-400 text-sm">لا توجد عمليات استلام — استخدم receive_goods() مع 4 خطوات: مطابقة PO مع إيصال شحن + فحص أضرار + عد كميات + تسجيل Lot Numbers</div>}
        </div>
      </Card>
    </div>
  );
}
