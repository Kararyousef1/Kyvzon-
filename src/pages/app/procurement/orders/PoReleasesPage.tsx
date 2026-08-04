import { useEffect, useState } from 'react';
import Card from '../../../../shared/components/ui/Card';
import { purchaseOrderService, poReleaseService } from '../../../../services/sdk';
import { useUIStore } from '../../../../core/stores';

export default function PoReleasesPage() {
  const { addToast } = useUIStore();
  const [releases, setReleases] = useState<any[]>([]);
  const [pos, setPos] = useState<any[]>([]);

  useEffect(()=>{
    (async()=>{
      try {
        const blanketPos = await purchaseOrderService.findAll({ filters: { po_type: 'blanket' }, limit: 50 });
        setPos(blanketPos);
        const data = await poReleaseService.findAll({ orderBy: 'created_at', ascending: false, limit: 100 });
        setReleases(data);
      } catch(e:any){ addToast(e.message,'error'); }
    })();
  }, []);

  return (
    <div className="space-y-5 max-w-[1600px] mx-auto" dir="rtl">
      <div>
        <h1 className="text-2xl font-black">أوامر الإطار — Release Orders</h1>
        <p className="text-sm text-slate-500 mt-1">Blanket PO بسعر ثابت 12 شهر — تُسحب منه طلبيات صغيرة عند الحاجة — عبر SDK فقط</p>
      </div>

      <Card>
        <h3 className="font-bold mb-2">أوامر الإطار النشطة ({pos.length})</h3>
        <div className="space-y-2 max-h-[30vh] overflow-auto">
          {pos.map((po:any)=>(
            <div key={po.id} className="p-3 border rounded-xl text-sm flex justify-between">
              <div><span className="font-mono font-bold">{po.po_number}</span> • {po.supplier_id.slice(0,6)} • {po.total_amount?.toLocaleString()} {po.currency_code}</div>
              <div className="text-xs text-slate-400">سعر ثابت 12 شهر — {po.po_type}</div>
            </div>
          ))}
          {!pos.length && <div className="py-6 text-center text-slate-400 text-sm">لا أوامر إطار — أنشئ PO نوع blanket مع كمية إجمالية متوقعة 50,000 KG</div>}
        </div>
      </Card>

      <Card>
        <h3 className="font-bold mb-2">Release Orders — سحوبات ({releases.length})</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50"><tr><th className="p-2 text-right">Release</th><th className="p-2">PO الأب</th><th className="p-2">كمية</th><th className="p-2">تاريخ تسليم</th><th className="p-2">حالة</th></tr></thead>
            <tbody className="divide-y">
              {releases.map((r:any)=>(
                <tr key={r.id}>
                  <td className="p-2 font-mono font-bold">{r.release_number}</td>
                  <td className="p-2 font-mono text-xs">{r.po_id.slice(0,8)}</td>
                  <td className="p-2">{r.quantity}</td>
                  <td className="p-2">{r.delivery_date ? new Date(r.delivery_date).toLocaleDateString('ar-SA') : '-'}</td>
                  <td className="p-2"><span className="text-[10px] px-2 py-1 rounded-full bg-slate-100">{r.status}</span></td>
                </tr>
              ))}
              {!releases.length && <tr><td colSpan={5} className="p-10 text-center text-slate-400">لا سحوبات — مثال: أرسل لنا 2,000 KG الأسبوع الأول، 1,500 الأسبوع الثاني</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
