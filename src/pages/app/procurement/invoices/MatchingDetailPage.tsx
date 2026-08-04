import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import Card from '../../../../shared/components/ui/Card';
import Button from '../../../../shared/components/ui/Button';
import { supplierInvoiceService, matchingResultService, purchaseOrderService, goodsReceiptService } from '../../../../services/sdk';
import { useUIStore } from '../../../../core/stores';

type ExceptionAction = 'approve_tolerance' | 'request_credit_note' | 'request_revised_invoice' | 'dispute' | 'resolve' | 'cancel';
type SupplierInvoiceRecord = { id: string; invoice_number: string; po_id?: string | null; status: string; total_amount: number; currency_code?: string | null; duplicate_status?: string | null };
type MatchingResultRow = { id: string; status: string; total_variance?: number | null; price_variance?: number | null; qty_variance?: number | null; exception_reason?: string | null; gr_id?: string | null; match_type?: string | null };
type PurchaseOrderRecord = { id: string; po_number: string; total_before_tax?: number | null };
type GoodsReceiptRecord = { id: string; gr_number: string };

export default function MatchingDetailPage() {
  const { id } = useParams();
  const { addToast } = useUIStore();
  const [invoice, setInvoice] = useState<SupplierInvoiceRecord | null>(null);
  const [results, setResults] = useState<MatchingResultRow[]>([]);
  const [po, setPo] = useState<PurchaseOrderRecord | null>(null);
  const [gr, setGr] = useState<GoodsReceiptRecord | null>(null);
  const [exceptionAction, setExceptionAction] = useState<ExceptionAction | null>(null);
  const [exceptionNotes, setExceptionNotes] = useState('');
  const [payOpen, setPayOpen] = useState(false);
  const [payRef, setPayRef] = useState('');
  const [discounts, setDiscounts] = useState<any[]>([]);

  const load = async () => {
    if (!id) return;
    try {
      const inv = await supplierInvoiceService.findById(id);
      setInvoice(inv);
      const res = await matchingResultService.findByInvoice(id);
      setResults(res as MatchingResultRow[]);
      setDiscounts(await supplierInvoiceService.dynamicDiscountOptions(id).catch(() => []));
      if (inv?.po_id) setPo(await purchaseOrderService.findById(inv.po_id));
      const r = (res as MatchingResultRow[])[0];
      if (r?.gr_id) setGr(await goodsReceiptService.findById(r.gr_id));
    } catch (e:any) { addToast(e.message,'error'); }
  };
  useEffect(()=>{ load(); }, [id]);

  const openExceptionDialog = (action: ExceptionAction) => {
    if (!invoice) return;
    setExceptionNotes('');
    setExceptionAction(action);
  };

  const submitException = async () => {
    if (!invoice || !exceptionAction) return;
    if (!exceptionNotes.trim()) { addToast('ملاحظات الإجراء مطلوبة', 'error'); return; }
    try {
      await supplierInvoiceService.resolveException(invoice.id, exceptionAction, exceptionNotes.trim());
      addToast('تم تنفيذ إجراء الاستثناء', 'success');
      setExceptionAction(null);
      await load();
    }
    catch(e:any){ addToast(e.message,'error'); }
  };
  const approve = async () => { if (!invoice) return; try { await supplierInvoiceService.approveForPayment(invoice.id); addToast('تم اعتماد الدفع', 'success'); await load(); } catch(e:any){ addToast(e.message,'error'); } };
  const submitPayment = async () => {
    if (!invoice) return;
    if (!payRef.trim()) { addToast('مرجع الدفع مطلوب', 'error'); return; }
    try {
      await supplierInvoiceService.recordPayment(invoice.id, payRef.trim());
      addToast('تم تسجيل الدفع', 'success');
      setPayOpen(false); setPayRef('');
      await load();
    }
    catch(e:any){ addToast(e.message,'error'); }
  };

  if (!invoice) return <div className="p-10 text-center">جاري التحميل...</div>;
  const totalVar = results.reduce((s,r)=>s+Number(r.total_variance||0),0);
  const hasException = results.some(r=>r.status==='exception');

  return (
    <div className="space-y-5 max-w-[1600px] mx-auto" dir="rtl">
      <div className="flex justify-between items-start gap-3 flex-wrap"><div><h1 className="text-2xl font-black">مطابقة {invoice.invoice_number} — {invoice.total_amount?.toLocaleString()} {invoice.currency_code || 'SAR'}</h1><p className="text-sm text-slate-500 mt-1">PO: {po?.po_number || invoice.po_id?.slice(0,8)} • GR: {gr?.gr_number || 'لا يوجد (2-way)'} • حالة: {invoice.status}</p></div><div className="flex gap-2 flex-wrap">{hasException && <><Button size="sm" variant="secondary" onClick={()=>openExceptionDialog('request_credit_note')}>طلب Credit Note</Button><Button size="sm" variant="secondary" onClick={()=>openExceptionDialog('request_revised_invoice')}>فاتورة معدلة</Button><Button size="sm" variant="secondary" onClick={()=>openExceptionDialog('dispute')}>نزاع</Button><Button size="sm" onClick={()=>openExceptionDialog('resolve')}>حل واعتماد</Button></>}{['matched','tolerance'].includes(invoice.status)&&<Button size="sm" onClick={approve}>اعتماد الدفع</Button>}{invoice.status==='approved'&&<Button size="sm" onClick={()=>{ setPayRef(''); setPayOpen(true); }}>تسجيل دفع</Button>}</div></div>

      <div className="grid md:grid-cols-3 gap-4"><Card><div className="text-xs text-slate-500">PO قبل ضريبة</div><div className="text-lg font-bold">{po?.total_before_tax?.toLocaleString() || '-'}</div></Card><Card><div className="text-xs text-slate-500">GR مستلم</div><div className="text-lg font-bold">{gr ? 'موجود' : 'لا يوجد — 2-way فقط'}</div></Card><Card><div className={`text-xs ${hasException ? 'text-red-600' : 'text-emerald-600'}`}>نتيجة المطابقة</div><div className={`text-lg font-black ${hasException ? 'text-red-700' : 'text-emerald-700'}`}>{hasException ? 'استثناء يحتاج مراجعة' : 'مطابق/ضمن التسامح'}</div><div className="text-xs text-slate-400">إجمالي انحراف: {totalVar.toLocaleString()}</div></Card></div>

      <Card><h3 className="font-bold mb-3">مطابقة بند بند — PO × GR × Invoice</h3><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50"><tr><th className="p-2 text-right">البند</th><th className="p-2">فرق سعر</th><th className="p-2">% فرق سعر</th><th className="p-2">فرق كمية</th><th className="p-2">الحالة</th><th className="p-2">الاستثناء</th><th className="p-2">Tolerance</th></tr></thead><tbody className="divide-y">{results.map((r:any)=><tr key={r.id} className={r.status==='exception' ? 'bg-red-50' : r.status==='tolerance' ? 'bg-amber-50' : 'bg-emerald-50'}><td className="p-2 font-mono text-xs">{r.po_id?.slice(0,6) || '-'}</td><td className={`p-2 font-bold ${Math.abs(Number(r.price_variance))>0 ? 'text-red-600' : 'text-emerald-600'}`}>{Number(r.price_variance).toFixed(2)}</td><td className="p-2">{Number(r.price_variance_percent).toFixed(2)}%</td><td className={`p-2 ${Math.abs(Number(r.qty_variance))>0 ? 'text-red-600 font-bold' : ''}`}>{r.qty_variance}</td><td className="p-2"><span className={`text-[10px] px-2 py-1 rounded-full ${r.status==='matched'?'bg-emerald-100 text-emerald-700':r.status==='tolerance'?'bg-amber-100 text-amber-700':'bg-red-100 text-red-700'}`}>{r.status}</span></td><td className="p-2 text-xs">{r.exception_reason || '—'}</td><td className="p-2 text-xs">{r.tolerance_applied ? `نعم ${r.auto_approved ? 'auto' : 'يدوي'}` : 'لا'}</td></tr>)}{!results.length && <tr><td colSpan={7} className="p-10 text-center text-slate-400">لا نتائج مطابقة — شغل match_invoice أولاً</td></tr>}</tbody></table></div></Card>

      <Card><h3 className="font-bold mb-3">خيارات الخصم الديناميكي / الدفع المبكر</h3><div className="grid md:grid-cols-3 gap-3">{discounts.map((d:any,i)=><div key={i} className="p-3 border rounded-xl"><div className="font-bold">{d.option_label}</div><div className="text-sm text-slate-500">تاريخ: {new Date(d.pay_date).toLocaleDateString('ar-SA')}</div><div className="text-sm">المبلغ: <b>{Number(d.pay_amount).toLocaleString()}</b></div><div className="text-xs text-emerald-700">توفير: {Number(d.saving).toLocaleString()} ({d.discount_percent}%)</div></div>)}{!discounts.length&&<div className="text-slate-400">لا خيارات خصم</div>}</div></Card>

      {exceptionAction && <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" dir="rtl"><div className="bg-white rounded-2xl p-6 w-full max-w-md"><h3 className="font-black text-lg mb-2">معالجة استثناء المطابقة</h3><p className="text-sm text-slate-500 mb-4">الإجراء: <b>{exceptionAction}</b></p><label className="block text-xs font-bold text-slate-600 mb-1">ملاحظات الإجراء *</label><textarea rows={3} value={exceptionNotes} onChange={e=>setExceptionNotes(e.target.value)} placeholder="سبب القرار وتفاصيله — يُسجَّل في التدقيق" className="w-full border rounded-xl p-3" /><div className="flex gap-2 mt-4"><button type="button" onClick={submitException} className="flex-1 bg-amber-600 text-white rounded-xl py-2.5 font-bold hover:bg-amber-700">تأكيد</button><button type="button" onClick={()=>setExceptionAction(null)} className="flex-1 border rounded-xl py-2.5 font-bold hover:bg-slate-50">إلغاء</button></div></div></div>}

      {payOpen && <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" dir="rtl"><div className="bg-white rounded-2xl p-6 w-full max-w-md"><h3 className="font-black text-lg mb-2">تسجيل الدفع</h3><p className="text-sm text-slate-500 mb-4">{invoice.invoice_number}</p><label className="block text-xs font-bold text-slate-600 mb-1">مرجع الدفع *</label><input value={payRef} onChange={e=>setPayRef(e.target.value)} placeholder="رقم الحوالة أو الشيك" className="w-full border rounded-xl p-2.5" /><div className="flex gap-2 mt-4"><button type="button" onClick={submitPayment} className="flex-1 bg-emerald-600 text-white rounded-xl py-2.5 font-bold hover:bg-emerald-700">تأكيد الدفع</button><button type="button" onClick={()=>setPayOpen(false)} className="flex-1 border rounded-xl py-2.5 font-bold hover:bg-slate-50">إلغاء</button></div></div></div>}
    </div>
  );
}
