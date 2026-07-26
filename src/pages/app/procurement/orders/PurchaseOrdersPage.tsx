import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Card from '../../../../shared/components/ui/Card';
import Button from '../../../../shared/components/ui/Button';
import Input from '../../../../shared/components/ui/Input';
import {
  poOtifAlertService,
  purchaseOrderService,
  purchaseRequisitionService,
  supplierService,
  type PurchaseOrderRecord,
  type PurchaseRequisitionRecord,
  type SupplierRecord,
} from '../../../../services/sdk';
import { useUIStore } from '../../../../core/stores';

type PoLineForm = { item_code: string; description: string; quantity: number; unit: string; unit_price: number };
const emptyLine = (): PoLineForm => ({ item_code: '', description: '', quantity: 1, unit: 'PCS', unit_price: 0 });

export default function PurchaseOrdersPage() {
  const { addToast } = useUIStore();
  const [pos, setPos] = useState<PurchaseOrderRecord[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [approvedPrs, setApprovedPrs] = useState<PurchaseRequisitionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [mode, setMode] = useState<'from_pr'|'manual'>('from_pr');
  const [form, setForm] = useState({ supplier_id: '', pr_id: '', po_type: 'standard', currency_code: 'SAR', delivery_date: '', delivery_location: '', incoterms: 'DDP', payment_terms: 'Net45', lines: [emptyLine()] });

  const load = async () => {
    setLoading(true);
    try {
      const [data, sups, prs] = await Promise.all([
        purchaseOrderService.findAll({ orderBy: 'created_at', ascending: false, limit: 100 }),
        supplierService.findApproved().catch(() => []),
        purchaseRequisitionService.findAll({ filters: { status: 'approved' }, orderBy: 'created_at', ascending: false, limit: 100 }).catch(() => []),
      ]);
      setPos(data); setSuppliers(sups); setApprovedPrs(prs);
    } catch (e:any) { addToast(e.message,'error'); } finally { setLoading(false); }
  };

  useEffect(()=>{ load(); }, []);

  const total = useMemo(() => form.lines.reduce((s,l)=>s + Number(l.quantity||0)*Number(l.unit_price||0),0), [form.lines]);
  const updateLine = (idx: number, patch: Partial<PoLineForm>) => { const lines=[...form.lines]; lines[idx]={...lines[idx],...patch}; setForm({...form, lines}); };

  const createPo = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (mode === 'from_pr') {
        if (!form.pr_id || !form.supplier_id) { addToast('اختر PR ومورداً', 'error'); return; }
        const id = await purchaseOrderService.createFromPr(form.pr_id, form.supplier_id, form.po_type);
        addToast(`تم إنشاء PO ${id.slice(0,8)} من PR`, 'success');
      } else {
        const lines = form.lines.filter(l => l.description.trim());
        if (!form.supplier_id || !lines.length) { addToast('اختر المورد وأدخل البنود', 'error'); return; }
        const id = await purchaseOrderService.createManual({
          supplier_id: form.supplier_id,
          po_type: form.po_type,
          currency_code: form.currency_code,
          delivery_date: form.delivery_date || undefined,
          delivery_location: form.delivery_location || undefined,
          incoterms: form.incoterms,
          payment_terms: form.payment_terms,
          lines,
        });
        addToast(`تم إنشاء PO يدوي ${id.slice(0,8)}`, 'success');
      }
      setShowCreate(false); setForm({ supplier_id: '', pr_id: '', po_type: 'standard', currency_code: 'SAR', delivery_date: '', delivery_location: '', incoterms: 'DDP', payment_terms: 'Net45', lines: [emptyLine()] }); await load();
    } catch (err:any) { addToast(err.message, 'error'); }
  };

  const sendPo = async (po: PurchaseOrderRecord) => {
    try { await purchaseOrderService.send(po.id, po.tracking_number || undefined); addToast('تم تعليم PO كمرسل للمورد', 'success'); await load(); }
    catch(e:any){ addToast(e.message,'error'); }
  };

  const detectLate = async () => {
    try { const count = await poOtifAlertService.detectLate(); addToast(`تم إنشاء ${count} تنبيهات OTIF`, 'success'); }
    catch(e:any){ addToast(e.message,'error'); }
  };

  return (
    <div className="space-y-5 max-w-[1600px] mx-auto" dir="rtl">
      <div className="flex justify-between items-center gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-black">أوامر الشراء PO</h1>
          <p className="text-slate-500 mt-1">منشئ PO من PR أو يدوياً، تتبع الإرسال والتسليم، وأنواع متعددة.</p>
        </div>
        <div className="flex gap-2"><Button variant="secondary" onClick={detectLate}>فحص تنبيهات OTIF</Button><Button onClick={()=>setShowCreate(true)}>إنشاء PO</Button></div>
      </div>

      {loading ? <div className="py-20 text-center">جاري التحميل...</div> : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {pos.map(po=>(
            <Card key={po.id}>
              <div className="flex justify-between">
                <span className="font-mono font-bold text-sm">{po.po_number}</span>
                <span className={`text-[10px] px-2 py-1 rounded-full ${po.status==='received'?'bg-emerald-100 text-emerald-700':po.status==='partially_received'?'bg-amber-100 text-amber-700':po.status==='sent'?'bg-blue-100 text-blue-700':'bg-slate-100'}`}>{po.po_type} • {po.status}</span>
              </div>
              <div className="text-sm mt-2">المورد: {suppliers.find(s=>s.id===po.supplier_id)?.legal_name || po.supplier_id.slice(0,8)} • إجمالي: {po.total_amount?.toLocaleString()} {po.currency_code}</div>
              <div className="text-xs text-slate-400 mt-1">تسليم: {po.delivery_date ? new Date(po.delivery_date).toLocaleDateString('ar-SA') : '-'} • تتبع: {po.tracking_number || '-'}</div>
              <div className="text-xs text-slate-500 mt-1">Incoterms: {po.incoterms} • دفع: {po.payment_terms}</div>
              <div className="flex gap-2 mt-4"><Link to={`/app/procurement/orders/purchase-orders/${po.id}`} className="flex-1"><Button variant="secondary" size="sm" fullWidth>تفاصيل</Button></Link>{po.status==='approved' && <Button size="sm" onClick={()=>sendPo(po)}>إرسال</Button>}</div>
            </Card>
          ))}
          {!pos.length && <div className="col-span-full py-16 text-center text-slate-500">لا توجد أوامر شراء</div>}
        </div>
      )}

      {showCreate && <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"><div className="bg-white rounded-2xl p-6 w-full max-w-4xl max-h-[92vh] overflow-auto"><h3 className="font-bold text-lg mb-4">إنشاء أمر شراء</h3><form onSubmit={createPo} className="space-y-4">
        <div className="flex gap-2"><Button type="button" variant={mode==='from_pr'?'primary':'secondary'} onClick={()=>setMode('from_pr')}>من PR معتمد</Button><Button type="button" variant={mode==='manual'?'primary':'secondary'} onClick={()=>setMode('manual')}>يدوي</Button></div>
        <div className="grid md:grid-cols-3 gap-3"><select required value={form.supplier_id} onChange={e=>setForm({...form,supplier_id:e.target.value})} className="border rounded-xl p-2.5 text-sm"><option value="">اختر المورد المعتمد</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.legal_name}</option>)}</select><select value={form.po_type} onChange={e=>setForm({...form,po_type:e.target.value})} className="border rounded-xl p-2.5 text-sm"><option value="standard">Standard</option><option value="blanket">Blanket</option><option value="consolidated">Consolidated</option><option value="open">Open</option><option value="emergency">Emergency</option></select><select value={form.currency_code} onChange={e=>setForm({...form,currency_code:e.target.value})} className="border rounded-xl p-2.5 text-sm"><option value="SAR">SAR</option><option value="USD">USD</option><option value="IQD">IQD</option></select></div>
        {mode==='from_pr' ? <select required value={form.pr_id} onChange={e=>setForm({...form,pr_id:e.target.value})} className="w-full border rounded-xl p-2.5 text-sm"><option value="">اختر PR معتمد</option>{approvedPrs.map(pr=><option key={pr.id} value={pr.id}>{pr.pr_number} — {pr.total_estimated} {pr.currency_code}</option>)}</select> : <div className="space-y-2"><div className="grid md:grid-cols-4 gap-3"><Input type="date" value={form.delivery_date} onChange={e=>setForm({...form,delivery_date:e.target.value})}/><Input placeholder="مكان التسليم" value={form.delivery_location} onChange={e=>setForm({...form,delivery_location:e.target.value})}/><select value={form.incoterms} onChange={e=>setForm({...form,incoterms:e.target.value})} className="border rounded-xl p-2.5 text-sm"><option value="DDP">DDP</option><option value="FOB">FOB</option><option value="CIF">CIF</option><option value="EXW">EXW</option><option value="FCA">FCA</option></select><select value={form.payment_terms} onChange={e=>setForm({...form,payment_terms:e.target.value})} className="border rounded-xl p-2.5 text-sm"><option value="Net15">Net15</option><option value="Net30">Net30</option><option value="Net45">Net45</option><option value="Net60">Net60</option><option value="2/10 Net45">2/10 Net45</option></select></div>{form.lines.map((l,i)=><div key={i} className="grid grid-cols-12 gap-2"><input placeholder="كود" value={l.item_code} onChange={e=>updateLine(i,{item_code:e.target.value})} className="col-span-2 border rounded-xl p-2 text-sm"/><input required placeholder="الوصف" value={l.description} onChange={e=>updateLine(i,{description:e.target.value})} className="col-span-4 border rounded-xl p-2 text-sm"/><input type="number" placeholder="كمية" value={l.quantity} onChange={e=>updateLine(i,{quantity:Number(e.target.value)})} className="col-span-2 border rounded-xl p-2 text-sm"/><input placeholder="وحدة" value={l.unit} onChange={e=>updateLine(i,{unit:e.target.value})} className="col-span-1 border rounded-xl p-2 text-sm"/><input type="number" placeholder="سعر" value={l.unit_price} onChange={e=>updateLine(i,{unit_price:Number(e.target.value)})} className="col-span-2 border rounded-xl p-2 text-sm"/><button type="button" onClick={()=>setForm({...form,lines:form.lines.filter((_,idx)=>idx!==i)})} className="col-span-1 text-red-600">✕</button></div>)}<Button type="button" variant="secondary" size="sm" onClick={()=>setForm({...form,lines:[...form.lines,emptyLine()]})}>+ بند</Button><div className="font-bold text-sm">الإجمالي قبل الضريبة: {total.toLocaleString()} {form.currency_code}</div></div>}
        <div className="flex gap-2"><Button type="submit" className="flex-1">إنشاء</Button><Button type="button" variant="secondary" className="flex-1" onClick={()=>setShowCreate(false)}>إلغاء</Button></div>
      </form></div></div>}
    </div>
  );
}
