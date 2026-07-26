import { useEffect, useState } from 'react';
import Card from '../../../../shared/components/ui/Card';
import Button from '../../../../shared/components/ui/Button';
import Input from '../../../../shared/components/ui/Input';
import { goodsReceiptService, poLineItemService, purchaseOrderService, type GoodsReceiptRecord, type PoLineItemRecord, type PurchaseOrderRecord } from '../../../../services/sdk';
import { useUIStore } from '../../../../core/stores';

type ReceiveLine = { po_line_item_id: string; received_qty: number; accepted_qty: number; lot_number: string; expiry_date: string; location: string };

export default function GoodsReceiptPage() {
  const { addToast } = useUIStore();
  const [grs, setGrs] = useState<GoodsReceiptRecord[]>([]);
  const [pos, setPos] = useState<PurchaseOrderRecord[]>([]);
  const [poLines, setPoLines] = useState<PoLineItemRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showReceive, setShowReceive] = useState(false);
  const [form, setForm] = useState({ po_id: '', delivery_note_number: '', total_packages: 1, has_damage: false, damage_notes: '', items: [] as ReceiveLine[] });

  const load = async () => {
    setLoading(true);
    try {
      const [data, poRows] = await Promise.all([
        goodsReceiptService.findAll({ orderBy: 'received_at', ascending: false, limit: 100 }),
        purchaseOrderService.findAll({ orderBy: 'delivery_date', ascending: true, limit: 200 }),
      ]);
      setGrs(data);
      setPos(poRows.filter(p => ['approved','sent','acknowledged','shipped','partially_received'].includes(p.status)));
    } catch (e:any) { addToast(e.message,'error'); } finally { setLoading(false); }
  };

  useEffect(()=>{ load(); }, []);

  const selectPo = async (poId: string) => {
    setForm({ ...form, po_id: poId, items: [] });
    if (!poId) { setPoLines([]); return; }
    try {
      const lines = await poLineItemService.findByPo(poId);
      setPoLines(lines);
      setForm(f => ({ ...f, po_id: poId, items: lines.filter(l => Number(l.pending_quantity) > 0).map(l => ({ po_line_item_id: l.id, received_qty: Number(l.pending_quantity), accepted_qty: Number(l.pending_quantity), lot_number: '', expiry_date: '', location: '' })) }));
    } catch (e:any) { addToast(e.message,'error'); }
  };

  const updateLine = (idx: number, patch: Partial<ReceiveLine>) => { const items=[...form.items]; items[idx]={...items[idx],...patch}; setForm({...form, items}); };

  const submitReceive = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const items = form.items.filter(i => i.received_qty > 0);
      if (!form.po_id || !items.length) { addToast('اختر PO وأدخل كميات الاستلام', 'error'); return; }
      const grId = await goodsReceiptService.receive(form.po_id, form.delivery_note_number, Number(form.total_packages), form.has_damage, form.damage_notes, items.map(i => ({ ...i, expiry_date: i.expiry_date || undefined, lot_number: i.lot_number || undefined, location: i.location || undefined })));
      addToast(`تم تسجيل GR ${grId.slice(0,8)} وإرساله للجودة`, 'success');
      setShowReceive(false); setForm({ po_id: '', delivery_note_number: '', total_packages: 1, has_damage: false, damage_notes: '', items: [] }); setPoLines([]); await load();
    } catch (err:any) { addToast(err.message,'error'); }
  };

  const decideIqc = async (gr: GoodsReceiptRecord, status: 'approved'|'rejected'|'partial') => {
    const notes = window.prompt('ملاحظات قرار الجودة') || '';
    try { await goodsReceiptService.decideIqc(gr.id, status, notes); addToast('تم تحديث قرار الجودة', 'success'); await load(); }
    catch(e:any){ addToast(e.message,'error'); }
  };

  const postGr = async (gr: GoodsReceiptRecord) => {
    try { await goodsReceiptService.post(gr.id); addToast('تم ترحيل GR وتحديث المخزون', 'success'); await load(); }
    catch(e:any){ addToast(e.message,'error'); }
  };

  return (
    <div className="space-y-5 max-w-[1600px] mx-auto" dir="rtl">
      <div className="flex justify-between items-center gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-black">استلام البضائع GR</h1>
          <p className="text-slate-500 mt-1">استقبال فيزيائي → عد كميات/لوت → IQC → GR Posting وتحديث مخزون.</p>
        </div>
        <Button onClick={()=>setShowReceive(true)}>تسجيل استلام</Button>
      </div>

      {loading ? <div className="py-20 text-center">جاري التحميل...</div> : (
        <div className="space-y-3">
          {grs.map(gr=>(
            <Card key={gr.id} className="flex justify-between items-center gap-4 flex-wrap">
              <div>
                <div className="font-mono font-bold text-sm">{gr.gr_number} • PO: {gr.po_id.slice(0,8)}</div>
                <div className="text-xs text-slate-500 mt-1">استلام: {new Date(gr.received_at).toLocaleString('ar-SA')} • طرود: {gr.total_packages || '-'} • ضرر: {gr.has_damage ? 'نعم' : 'لا'}</div>
                <div className="text-xs text-slate-400">إيصال شحن: {gr.delivery_note_number || '-'}</div>
              </div>
              <div className="flex gap-2 items-center flex-wrap"><span className={`text-[10px] px-2 py-1 rounded-full ${gr.status==='posted'?'bg-emerald-100 text-emerald-700':gr.status==='quality_hold'?'bg-amber-100 text-amber-700':'bg-slate-100'}`}>{gr.status}</span>{gr.status==='quality_hold' && <><Button size="sm" variant="secondary" onClick={()=>decideIqc(gr,'approved')}>IQC قبول</Button><Button size="sm" variant="secondary" className="!bg-red-50 !text-red-700" onClick={()=>decideIqc(gr,'rejected')}>IQC رفض</Button><Button size="sm" onClick={()=>postGr(gr)}>Posting</Button></>}</div>
            </Card>
          ))}
          {!grs.length && <Card className="py-16 text-center text-slate-500">لا توجد عمليات استلام</Card>}
        </div>
      )}

      {showReceive && <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"><div className="bg-white rounded-2xl p-6 w-full max-w-5xl max-h-[92vh] overflow-auto"><h3 className="font-bold text-lg mb-4">تسجيل استلام بضائع</h3><form onSubmit={submitReceive} className="space-y-4">
        <div className="grid md:grid-cols-4 gap-3"><select required value={form.po_id} onChange={e=>selectPo(e.target.value)} className="border rounded-xl p-2.5 text-sm"><option value="">اختر PO قابل للاستلام</option>{pos.map(p=><option key={p.id} value={p.id}>{p.po_number} — {p.status}</option>)}</select><Input placeholder="رقم إيصال الشحن" value={form.delivery_note_number} onChange={e=>setForm({...form,delivery_note_number:e.target.value})}/><Input type="number" placeholder="عدد الطرود" value={form.total_packages} onChange={e=>setForm({...form,total_packages:Number(e.target.value)})}/><label className="border rounded-xl p-2.5 text-sm"><input type="checkbox" checked={form.has_damage} onChange={e=>setForm({...form,has_damage:e.target.checked})}/> يوجد ضرر</label></div>
        {form.has_damage && <textarea className="w-full border rounded-xl p-3 text-sm" placeholder="وصف الضرر والصور/الملاحظات" value={form.damage_notes} onChange={e=>setForm({...form,damage_notes:e.target.value})}/>}        
        <div className="space-y-2"><h4 className="font-bold">بنود الاستلام</h4>{form.items.map((it,idx)=>{ const line=poLines.find(l=>l.id===it.po_line_item_id); return <div key={it.po_line_item_id} className="p-3 border rounded-2xl bg-slate-50 space-y-2"><div className="font-bold text-sm">{line?.item_code || '-'} — {line?.description}</div><div className="grid md:grid-cols-5 gap-2"><Input type="number" placeholder="مستلم" value={it.received_qty} onChange={e=>updateLine(idx,{received_qty:Number(e.target.value)})}/><Input type="number" placeholder="مقبول" value={it.accepted_qty} onChange={e=>updateLine(idx,{accepted_qty:Number(e.target.value)})}/><Input placeholder="Lot" value={it.lot_number} onChange={e=>updateLine(idx,{lot_number:e.target.value})}/><Input type="date" value={it.expiry_date} onChange={e=>updateLine(idx,{expiry_date:e.target.value})}/><Input placeholder="الموقع" value={it.location} onChange={e=>updateLine(idx,{location:e.target.value})}/></div></div>})}{!form.items.length && <div className="text-center text-slate-400 py-6">اختر PO لعرض بنوده المفتوحة</div>}</div>
        <div className="flex gap-2"><Button type="submit" className="flex-1">حفظ وإرسال للجودة</Button><Button type="button" variant="secondary" className="flex-1" onClick={()=>setShowReceive(false)}>إلغاء</Button></div>
      </form></div></div>}
    </div>
  );
}
