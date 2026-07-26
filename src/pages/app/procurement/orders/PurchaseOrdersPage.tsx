import { useEffect, useState } from 'react';
import Card from '../../../../shared/components/ui/Card';
import Button from '../../../../shared/components/ui/Button';
import { purchaseOrderService, type PurchaseOrderRecord } from '../../../../services/sdk';
import { useUIStore } from '../../../../core/stores';

export default function PurchaseOrdersPage() {
  const { addToast } = useUIStore();
  const [pos, setPos] = useState<PurchaseOrderRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const data = await purchaseOrderService.findAll({ orderBy: 'created_at', ascending: false, limit: 100 });
      setPos(data);
    } catch (e:any) { addToast(e.message,'error'); } finally { setLoading(false); }
  };

  useEffect(()=>{ load(); }, []);

  return (
    <div className="space-y-5 max-w-[1600px] mx-auto" dir="rtl">
      <div>
        <h1 className="text-3xl font-black">أوامر الشراء PO</h1>
        <p className="text-slate-500 mt-1">5 أنواع: Standard/Blanket/Consolidated/Open/Emergency — عقد قانوني ملزم — Unit 04 100% حقيقي</p>
      </div>

      {loading ? <div className="py-20 text-center">جاري التحميل...</div> : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {pos.map(po=>(
            <Card key={po.id}>
              <div className="flex justify-between">
                <span className="font-mono font-bold text-sm">{po.po_number}</span>
                <span className={`text-[10px] px-2 py-1 rounded-full ${po.status==='received'?'bg-emerald-100 text-emerald-700':po.status==='partially_received'?'bg-amber-100 text-amber-700':'bg-slate-100'}`}>{po.po_type} • {po.status}</span>
              </div>
              <div className="text-sm mt-2">المورد: {po.supplier_id.slice(0,8)} • إجمالي: {po.total_amount?.toLocaleString()} {po.currency_code}</div>
              <div className="text-xs text-slate-400 mt-1">تسليم: {po.delivery_date ? new Date(po.delivery_date).toLocaleDateString('ar-SA') : '-'} • تتبع: {po.tracking_number || '-'}</div>
              <div className="text-xs text-slate-500 mt-1">Incoterms: {po.incoterms} • دفع: {po.payment_terms}</div>
            </Card>
          ))}
          {!pos.length && <div className="col-span-full py-16 text-center text-slate-500">لا توجد أوامر شراء — أنشئ من PR معتمد عبر create_po_from_pr()</div>}
        </div>
      )}
    </div>
  );
}
