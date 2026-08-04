import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import Card from '../../../../shared/components/ui/Card';
import Button from '../../../../shared/components/ui/Button';
import { purchaseOrderService, poLineItemService, goodsReceiptService, rtvService, type PurchaseOrderRecord, type PoLineItemRecord } from '../../../../services/sdk';
import { useUIStore } from '../../../../core/stores';

type RtvReason = 'quality_rejected' | 'over_delivery' | 'damaged' | 'wrong_item' | 'expired' | 'other';
type GoodsReceiptRow = { id: string; gr_number: string; status: string; received_at?: string | null };

export default function PoDetailPage() {
  const { id } = useParams();
  const { addToast } = useUIStore();
  const [po, setPo] = useState<PurchaseOrderRecord | null>(null);
  const [lines, setLines] = useState<PoLineItemRecord[]>([]);
  const [grs, setGrs] = useState<GoodsReceiptRow[]>([]);
  const [statusTarget, setStatusTarget] = useState<string | null>(null);
  const [trackingInput, setTrackingInput] = useState('');
  const [rtvGrId, setRtvGrId] = useState<string | null>(null);
  const [rtvForm, setRtvForm] = useState<{ qty: string; reason: RtvReason; details: string; lot: string }>({ qty: '1', reason: 'quality_rejected', details: '', lot: '' });

  useEffect(()=>{
    if (!id) return;
    (async()=>{
      try {
        const p = await purchaseOrderService.findById(id);
        if (p) setPo(p);
        const l = await poLineItemService.findByPo(id);
        setLines(l);
        const g = await goodsReceiptService.findAll({ filters: { po_id: id }, limit: 20 });
        setGrs(g);
      } catch(e:any){ addToast(e.message,'error'); }
    })();
  }, [id]);

  const openStatusDialog = (status: string) => {
    if (!po) return;
    setTrackingInput(po.tracking_number || '');
    setStatusTarget(status);
  };

  const confirmStatus = async () => {
    if (!po || !statusTarget) return;
    try {
      await purchaseOrderService.updateTracking(po.id, statusTarget, trackingInput.trim() || undefined);
      addToast('تم تحديث حالة PO', 'success');
      setStatusTarget(null);
      const p = await purchaseOrderService.findById(po.id);
      if (p) setPo(p);
    } catch (e:any) { addToast(e.message, 'error'); }
  };

  const openRtvDialog = (grId: string) => {
    setRtvForm({ qty: '1', reason: 'quality_rejected', details: '', lot: '' });
    setRtvGrId(grId);
  };

  const submitRtv = async () => {
    if (!po || !rtvGrId) return;
    const qty = Number(rtvForm.qty);
    if (!Number.isFinite(qty) || qty <= 0) { addToast('الكمية يجب أن تكون أكبر من صفر', 'error'); return; }
    if (!rtvForm.details.trim()) { addToast('تفاصيل الإعادة مطلوبة', 'error'); return; }
    try {
      await rtvService.createRtv(rtvGrId, po.id, qty, rtvForm.reason, rtvForm.details.trim(), rtvForm.lot.trim() || undefined);
      addToast('تم إنشاء RTV وتحديث المخزون الخارج', 'success');
      setRtvGrId(null);
    } catch (e:any) { addToast(e.message, 'error'); }
  };

  if (!po) return <div className="p-10 text-center">جاري التحميل...</div>;

  const totalOrdered = lines.reduce((s,l)=>s+Number(l.quantity),0);
  const totalReceived = lines.reduce((s,l)=>s+Number(l.received_quantity),0);
  const pending = totalOrdered - totalReceived;

  return (
    <div className="space-y-5 max-w-[1600px] mx-auto" dir="rtl">
      <div className="flex justify-between items-start gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black">{po.po_number} — {po.po_type}</h1>
          <p className="text-sm text-slate-500 mt-1">حالة: {po.status} • مورد: {po.supplier_id.slice(0,8)} • تسليم: {po.delivery_date ? new Date(po.delivery_date).toLocaleDateString('ar-SA') : '-'} • تتبع: {po.tracking_number || '-'}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {po.status === 'approved' && <Button size="sm" onClick={() => openStatusDialog('sent')}>إرسال للمورد</Button>}
          {po.status === 'sent' && <Button size="sm" onClick={() => openStatusDialog('acknowledged')}>تأكيد المورد</Button>}
          {['sent','acknowledged'].includes(po.status) && <Button size="sm" variant="secondary" onClick={() => openStatusDialog('shipped')}>تم الشحن</Button>}
          {po.status === 'received' && <Button size="sm" variant="secondary" onClick={() => openStatusDialog('closed')}>إغلاق PO</Button>}
        </div>
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
            <div key={gr.id} className="p-3 border rounded-xl flex justify-between items-center gap-3 text-sm">
              <div><span className="font-mono font-bold">{gr.gr_number}</span> • {new Date(gr.received_at).toLocaleString('ar-SA')} • طرود: {gr.total_packages || '-'} • ضرر: {gr.has_damage ? 'نعم' : 'لا'}</div>
              <div className="flex gap-2 items-center">
                <span className={`text-[10px] px-2 py-1 rounded-full ${gr.status==='posted'?'bg-emerald-100 text-emerald-700':gr.status==='quality_hold'?'bg-amber-100 text-amber-700':'bg-slate-100'}`}>{gr.status}</span>
                <Button size="xs" variant="secondary" onClick={() => openRtvDialog(gr.id)}>RTV</Button>
              </div>
            </div>
          ))}
          {!grs.length && <div className="py-6 text-center text-slate-400 text-sm">لا توجد عمليات استلام — استخدم receive_goods() مع 4 خطوات: مطابقة PO مع إيصال شحن + فحص أضرار + عد كميات + تسجيل Lot Numbers</div>}
        </div>
      </Card>

      {statusTarget && <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" dir="rtl"><div className="bg-white rounded-2xl p-6 w-full max-w-md"><h3 className="font-black text-lg mb-2">تحديث حالة أمر الشراء</h3><p className="text-sm text-slate-500 mb-4">الحالة الجديدة: <b>{statusTarget}</b></p><label className="block text-xs font-bold text-slate-600 mb-1">رقم التتبع (اختياري)</label><input value={trackingInput} onChange={e=>setTrackingInput(e.target.value)} className="w-full border rounded-xl p-2.5" placeholder="رقم الشحنة أو البوليصة" /><div className="flex gap-2 mt-4"><button type="button" onClick={confirmStatus} className="flex-1 bg-amber-600 text-white rounded-xl py-2.5 font-bold hover:bg-amber-700">تأكيد</button><button type="button" onClick={()=>setStatusTarget(null)} className="flex-1 border rounded-xl py-2.5 font-bold hover:bg-slate-50">إلغاء</button></div></div></div>}

      {rtvGrId && <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" dir="rtl"><div className="bg-white rounded-2xl p-6 w-full max-w-md"><h3 className="font-black text-lg mb-2">إرجاع بضاعة للمورد (RTV)</h3><p className="text-sm text-slate-500 mb-4">سيُخصم المرتجع من المخزون ويُسجَّل في التدقيق.</p><div className="space-y-3"><div><label className="block text-xs font-bold text-slate-600 mb-1">الكمية *</label><input type="number" min={0} step="any" value={rtvForm.qty} onChange={e=>setRtvForm({...rtvForm, qty:e.target.value})} className="w-full border rounded-xl p-2.5" /></div><div><label className="block text-xs font-bold text-slate-600 mb-1">سبب الإعادة *</label><select value={rtvForm.reason} onChange={e=>setRtvForm({...rtvForm, reason:e.target.value as RtvReason})} className="w-full border rounded-xl p-2.5 bg-white"><option value="quality_rejected">رفض الجودة</option><option value="over_delivery">توريد زائد</option><option value="damaged">تالف</option><option value="wrong_item">صنف خاطئ</option><option value="expired">منتهي الصلاحية</option><option value="other">أخرى</option></select></div><div><label className="block text-xs font-bold text-slate-600 mb-1">التفاصيل *</label><textarea rows={2} value={rtvForm.details} onChange={e=>setRtvForm({...rtvForm, details:e.target.value})} className="w-full border rounded-xl p-2.5" /></div><div><label className="block text-xs font-bold text-slate-600 mb-1">رقم الدفعة Lot</label><input value={rtvForm.lot} onChange={e=>setRtvForm({...rtvForm, lot:e.target.value})} className="w-full border rounded-xl p-2.5" /></div></div><div className="flex gap-2 mt-4"><button type="button" onClick={submitRtv} className="flex-1 bg-rose-600 text-white rounded-xl py-2.5 font-bold hover:bg-rose-700">تأكيد الإرجاع</button><button type="button" onClick={()=>setRtvGrId(null)} className="flex-1 border rounded-xl py-2.5 font-bold hover:bg-slate-50">إلغاء</button></div></div></div>}
    </div>
  );
}
