import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Card from '../../../../shared/components/ui/Card';
import Button from '../../../../shared/components/ui/Button';
import Input from '../../../../shared/components/ui/Input';
import { poLineItemService, purchaseOrderService, supplierInvoiceService, supplierService, type PoLineItemRecord, type PurchaseOrderRecord, type SupplierInvoiceRecord, type SupplierRecord } from '../../../../services/sdk';
import { useUIStore } from '../../../../core/stores';

type InvLine = { po_line_item_id: string; item_code: string; description: string; quantity: number; unit_price: number; tax_rate: number };
const emptyLine = (): InvLine => ({ po_line_item_id: '', item_code: '', description: '', quantity: 1, unit_price: 0, tax_rate: 15 });

export default function InvoicesPage() {
  const { addToast } = useUIStore();
  const [invs, setInvs] = useState<SupplierInvoiceRecord[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [pos, setPos] = useState<PurchaseOrderRecord[]>([]);
  const [poLines, setPoLines] = useState<PoLineItemRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ supplier_id: '', po_id: '', invoice_number: '', invoice_date: new Date().toISOString().slice(0,10), currency_code: 'SAR', payment_due_date: '', payment_terms: 'Net45', bank_account: '', source: 'manual' as const, tax_rate: 15, lines: [emptyLine()] });

  const amountBeforeTax = useMemo(() => form.lines.reduce((s,l)=>s + Number(l.quantity||0)*Number(l.unit_price||0), 0), [form.lines]);

  const load = async () => {
    setLoading(true);
    try {
      const [data, sups, poRows] = await Promise.all([
        supplierInvoiceService.findAll({ orderBy: 'invoice_date', ascending: false, limit: 100 }),
        supplierService.findApproved().catch(()=>[]),
        purchaseOrderService.findAll({ orderBy: 'created_at', ascending: false, limit: 200 }).catch(()=>[]),
      ]);
      setInvs(data); setSuppliers(sups); setPos(poRows);
    } catch(e:any){ addToast(e.message,'error'); } finally { setLoading(false); }
  };
  useEffect(()=>{ load(); }, []);

  const selectPo = async (poId: string) => {
    setForm({...form, po_id: poId});
    if (!poId) { setPoLines([]); return; }
    try {
      const po = pos.find(p=>p.id===poId);
      const lines = await poLineItemService.findByPo(poId);
      setPoLines(lines);
      setForm(f=>({ ...f, po_id: poId, supplier_id: po?.supplier_id || f.supplier_id, currency_code: po?.currency_code || f.currency_code, lines: lines.map(l=>({ po_line_item_id: l.id, item_code: l.item_code || '', description: l.description, quantity: Number(l.received_quantity || l.quantity), unit_price: Number(l.unit_price), tax_rate: Number(f.tax_rate) })) }));
    } catch(e:any){ addToast(e.message,'error'); }
  };

  const updateLine = (idx:number, patch: Partial<InvLine>) => { const lines=[...form.lines]; lines[idx]={...lines[idx],...patch}; setForm({...form, lines}); };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const lines = form.lines.filter(l=>l.description && Number(l.quantity)>0);
      if (!form.supplier_id || !form.invoice_number || !lines.length) { addToast('أدخل المورد ورقم الفاتورة والبنود', 'error'); return; }
      const id = await supplierInvoiceService.createWithLines({
        supplier_id: form.supplier_id,
        po_id: form.po_id || null,
        invoice_number: form.invoice_number,
        invoice_date: form.invoice_date,
        amount_before_tax: amountBeforeTax,
        tax_rate: Number(form.tax_rate),
        currency_code: form.currency_code,
        payment_due_date: form.payment_due_date || null,
        payment_terms: form.payment_terms,
        bank_account: form.bank_account,
        source: form.source,
        lines: lines.map(l=>({ po_line_item_id: l.po_line_item_id || undefined, item_code: l.item_code || undefined, description: l.description, quantity: Number(l.quantity), unit_price: Number(l.unit_price), tax_rate: Number(l.tax_rate) })),
      });
      addToast(`تم إنشاء الفاتورة ${id.slice(0,8)}`, 'success');
      setShowCreate(false); setForm({ supplier_id: '', po_id: '', invoice_number: '', invoice_date: new Date().toISOString().slice(0,10), currency_code: 'SAR', payment_due_date: '', payment_terms: 'Net45', bank_account: '', source: 'manual', tax_rate: 15, lines: [emptyLine()] }); setPoLines([]); await load();
    } catch(e:any){ addToast(e.message,'error'); }
  };

  const handleMatch = async (id: string) => {
    try {
      const results = await supplierInvoiceService.match(id);
      const exceptions = results.filter((r:any)=>r.status==='exception').length;
      addToast(exceptions ? `تمت المطابقة — ${exceptions} استثناء يحتاج مراجعة` : 'تمت المطابقة تلقائياً — matched', exceptions ? 'warning' : 'success');
      await load();
    } catch(e:any){ addToast(e.message,'error'); }
  };

  const approve = async (id: string) => { try { await supplierInvoiceService.approveForPayment(id); addToast('تم اعتماد الدفع', 'success'); await load(); } catch(e:any){ addToast(e.message,'error'); } };
  const pay = async (id: string) => { const ref = window.prompt('مرجع الدفع') || ''; if (!ref) return; try { await supplierInvoiceService.recordPayment(id, ref); addToast('تم تسجيل الدفع', 'success'); await load(); } catch(e:any){ addToast(e.message,'error'); } };

  return (
    <div className="space-y-5 max-w-[1600px] mx-auto" dir="rtl">
      <div className="flex justify-between items-center gap-3 flex-wrap">
        <div><h1 className="text-3xl font-black">الفواتير والمطابقة الثلاثية</h1><p className="text-slate-500 mt-1">استلام فواتير يدوي/بوابة/OCR + كشف تكرار + 3-Way Matching + اعتماد دفع.</p></div>
        <Button onClick={()=>setShowCreate(true)}>فاتورة جديدة</Button>
      </div>

      {loading ? <div className="py-20 text-center">جاري التحميل...</div> : <div className="space-y-3">{invs.map(inv=><Card key={inv.id} className="flex justify-between items-center gap-4 flex-wrap"><div><div className="font-mono font-bold text-sm">{inv.invoice_number} • {inv.total_amount?.toLocaleString()} {inv.currency_code || 'SAR'}</div><div className="text-xs text-slate-500 mt-1">مورد: {suppliers.find(s=>s.id===inv.supplier_id)?.legal_name || inv.supplier_id.slice(0,8)} • PO: {inv.po_id?.slice(0,8) || 'بدون PO'} • مصدر: {inv.source}</div><div className="text-xs text-slate-400">تاريخ: {new Date(inv.invoice_date).toLocaleDateString('ar-SA')} • استحقاق: {inv.payment_due_date ? new Date(inv.payment_due_date).toLocaleDateString('ar-SA') : '-'}</div></div><div className="flex items-center gap-2 flex-wrap"><span className={`text-[10px] px-2 py-1 rounded-full ${inv.status==='matched'||inv.status==='approved'||inv.status==='paid'?'bg-emerald-100 text-emerald-700':inv.status==='exception'||inv.status==='disputed'?'bg-red-100 text-red-700':inv.status==='tolerance'?'bg-amber-100 text-amber-700':'bg-slate-100'}`}>{inv.status}</span><span className={`text-[10px] px-2 py-1 rounded-full ${inv.duplicate_status==='clean'?'bg-emerald-50 text-emerald-600':'bg-red-50 text-red-600'}`}>{inv.duplicate_status}</span><Button size="sm" onClick={()=>handleMatch(inv.id)}>مطابقة</Button><Link to={`/app/procurement/invoices/${inv.id}/matching`}><Button size="sm" variant="secondary">تفاصيل</Button></Link>{['matched','tolerance'].includes(inv.status)&&<Button size="sm" onClick={()=>approve(inv.id)}>اعتماد دفع</Button>}{inv.status==='approved'&&<Button size="sm" onClick={()=>pay(inv.id)}>تسجيل دفع</Button>}</div></Card>)}{!invs.length && <Card className="py-16 text-center text-slate-500">لا فواتير</Card>}</div>}

      {showCreate && <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"><div className="bg-white rounded-2xl p-6 w-full max-w-5xl max-h-[92vh] overflow-auto"><h3 className="font-bold text-lg mb-4">فاتورة مورد جديدة</h3><form onSubmit={handleCreate} className="space-y-4"><div className="grid md:grid-cols-4 gap-3"><select required value={form.supplier_id} onChange={e=>setForm({...form,supplier_id:e.target.value})} className="border rounded-xl p-2.5 text-sm"><option value="">المورد</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.legal_name}</option>)}</select><select value={form.po_id} onChange={e=>selectPo(e.target.value)} className="border rounded-xl p-2.5 text-sm"><option value="">بدون PO / اختر PO</option>{pos.map(p=><option key={p.id} value={p.id}>{p.po_number} — {p.status}</option>)}</select><Input required placeholder="رقم الفاتورة" value={form.invoice_number} onChange={e=>setForm({...form,invoice_number:e.target.value})}/><Input type="date" value={form.invoice_date} onChange={e=>setForm({...form,invoice_date:e.target.value})}/></div><div className="grid md:grid-cols-5 gap-3"><Input type="date" placeholder="تاريخ الاستحقاق" value={form.payment_due_date} onChange={e=>setForm({...form,payment_due_date:e.target.value})}/><select value={form.payment_terms} onChange={e=>setForm({...form,payment_terms:e.target.value})} className="border rounded-xl p-2.5 text-sm"><option value="Net45">Net45</option><option value="2/10 Net45">2/10 Net45</option><option value="1/10 Net45">1/10 Net45</option><option value="Net30">Net30</option></select><Input placeholder="IBAN/حساب بنكي" value={form.bank_account} onChange={e=>setForm({...form,bank_account:e.target.value})}/><Input type="number" placeholder="ضريبة %" value={form.tax_rate} onChange={e=>setForm({...form,tax_rate:Number(e.target.value)})}/><div className="border rounded-xl p-2.5 text-sm bg-slate-50 font-bold">قبل الضريبة: {amountBeforeTax.toLocaleString()}</div></div><div className="space-y-2"><div className="font-bold text-sm">البنود</div>{form.lines.map((l,i)=><div key={i} className="grid grid-cols-12 gap-2"><select value={l.po_line_item_id} onChange={e=>{ const pl=poLines.find(x=>x.id===e.target.value); updateLine(i,{po_line_item_id:e.target.value,item_code:pl?.item_code||l.item_code,description:pl?.description||l.description,unit_price:Number(pl?.unit_price||l.unit_price),quantity:Number(pl?.received_quantity||pl?.quantity||l.quantity)}); }} className="col-span-3 border rounded-xl p-2 text-sm"><option value="">PO Line</option>{poLines.map(pl=><option key={pl.id} value={pl.id}>{pl.item_code||'-'} — {pl.description}</option>)}</select><input className="col-span-2 border rounded-xl p-2 text-sm" placeholder="كود" value={l.item_code} onChange={e=>updateLine(i,{item_code:e.target.value})}/><input required className="col-span-3 border rounded-xl p-2 text-sm" placeholder="وصف" value={l.description} onChange={e=>updateLine(i,{description:e.target.value})}/><input type="number" className="col-span-1 border rounded-xl p-2 text-sm" placeholder="كمية" value={l.quantity} onChange={e=>updateLine(i,{quantity:Number(e.target.value)})}/><input type="number" className="col-span-2 border rounded-xl p-2 text-sm" placeholder="سعر" value={l.unit_price} onChange={e=>updateLine(i,{unit_price:Number(e.target.value)})}/><button type="button" className="col-span-1 text-red-600" onClick={()=>setForm({...form,lines:form.lines.filter((_,idx)=>idx!==i)})}>✕</button></div>)}<Button type="button" size="sm" variant="secondary" onClick={()=>setForm({...form,lines:[...form.lines,emptyLine()]})}>+ بند</Button></div><div className="flex gap-2"><Button type="submit" className="flex-1">حفظ الفاتورة</Button><Button type="button" variant="secondary" className="flex-1" onClick={()=>setShowCreate(false)}>إلغاء</Button></div></form></div></div>}
    </div>
  );
}
