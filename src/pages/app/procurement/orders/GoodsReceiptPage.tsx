import { useEffect, useState } from 'react';
import Card from '../../../../shared/components/ui/Card';
import Button from '../../../../shared/components/ui/Button';
import { goodsReceiptService, type GoodsReceiptRecord } from '../../../../services/sdk';
import { useUIStore } from '../../../../core/stores';

export default function GoodsReceiptPage() {
  const { addToast } = useUIStore();
  const [grs, setGrs] = useState<GoodsReceiptRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const data = await goodsReceiptService.findAll({ orderBy: 'received_at', ascending: false, limit: 100 });
      setGrs(data);
    } catch (e:any) { addToast(e.message,'error'); } finally { setLoading(false); }
  };

  useEffect(()=>{ load(); }, []);

  return (
    <div className="space-y-5 max-w-[1600px] mx-auto" dir="rtl">
      <div>
        <h1 className="text-3xl font-black">استلام البضائع GR</h1>
        <p className="text-slate-500 mt-1">4 خطوات: استقبال فيزيائي → عد كميات → حجر صحي جودة → GR Posting يحدث المخزون — Unit 04</p>
      </div>

      {loading ? <div className="py-20 text-center">جاري التحميل...</div> : (
        <div className="space-y-3">
          {grs.map(gr=>(
            <Card key={gr.id} className="flex justify-between items-center">
              <div>
                <div className="font-mono font-bold text-sm">{gr.gr_number} • PO: {gr.po_id.slice(0,8)}</div>
                <div className="text-xs text-slate-500 mt-1">استلام: {new Date(gr.received_at).toLocaleString('ar-SA')} • طرود: {gr.total_packages || '-'} • ضرر: {gr.has_damage ? 'نعم' : 'لا'}</div>
                <div className="text-xs text-slate-400">إيصال شحن: {gr.delivery_note_number || '-'}</div>
              </div>
              <span className={`text-[10px] px-2 py-1 rounded-full ${gr.status==='posted'?'bg-emerald-100 text-emerald-700':gr.status==='quality_hold'?'bg-amber-100 text-amber-700':'bg-slate-100'}`}>{gr.status}</span>
            </Card>
          ))}
          {!grs.length && <Card className="py-16 text-center text-slate-500">لا توجد عمليات استلام — استخدم receive_goods() مع 4 خطوات</Card>}
        </div>
      )}
    </div>
  );
}
