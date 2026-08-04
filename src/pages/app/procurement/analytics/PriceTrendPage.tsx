import { useEffect, useState } from 'react';
import Card from '../../../../shared/components/ui/Card';
import { priceTrendService } from '../../../../services/sdk';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useUIStore } from '../../../../core/stores';

type PriceHistoryRow = { valid_from: string; price: number; change_percent?: number | null };

export default function PriceTrendPage() {
  const { addToast } = useUIStore();
  const [trend, setTrend] = useState<any[]>([]);
  const [itemCode, setItemCode] = useState('STEEL-316L');

  useEffect(()=>{
    (async()=>{
      try {
        const data = await priceTrendService.findByItem(itemCode, 100);
        setTrend((data as PriceHistoryRow[]).map(r => ({
          date: new Date(r.valid_from).toLocaleDateString('ar-SA'),
          price: Number(r.price),
          change: Number(r.change_percent ?? 0),
        })));
      } catch(e:any){ addToast(e.message,'error'); }
    })();
  }, [itemCode]);

  return (
    <div className="space-y-5 max-w-[1600px] mx-auto" dir="rtl">
      <div>
        <h1 className="text-2xl font-black">اتجاه الأسعار — Price Trend Analysis</h1>
        <p className="text-sm text-slate-500 mt-1">متابعة سعر صفيحة الفولاذ كمثال — يناير 40.20 → يوليو 42.50 +5.7% — يُنصح بعقد إطار 12 شهر — من تقرير 07 — عبر SDK فقط</p>
      </div>

      <Card>
        <div className="flex gap-2 mb-4">
          <input value={itemCode} onChange={e=>setItemCode(e.target.value)} placeholder="كود الصنف — مثلاً STEEL-316L" className="border rounded-xl px-3 py-2 text-sm w-64" />
          <div className="text-xs text-slate-400 p-2">مثال التقرير: صفيحة فولاذ 316L — ASTM A240 — سماكة 2mm — يناير 40.20 → يوليو 42.50 (+5.7%)</div>
        </div>

        <div className="h-[350px]">
          {trend.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" fontSize={10} />
                <YAxis fontSize={10} />
                <Tooltip />
                <Line type="monotone" dataKey="price" stroke="#f59e0b" strokeWidth={2} dot />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-slate-400 text-sm">لا تاريخ أسعار — سيُملأ من PO/RFQ/عقود</div>
          )}
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50"><tr><th className="p-2 text-right">التاريخ</th><th className="p-2">السعر</th><th className="p-2">% تغير</th></tr></thead>
            <tbody className="divide-y">
              {trend.map((r:any,i:number)=>(
                <tr key={i}><td className="p-2">{r.date}</td><td className="p-2 font-mono">{r.price}</td><td className={`p-2 ${r.change>0 ? 'text-red-600' : r.change<0 ? 'text-emerald-600' : ''}`}>{r.change>0?'+':''}{r.change}%</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
