import { useEffect, useState } from 'react';
import Card from '../../../../shared/components/ui/Card';
import { spendForecastService } from '../../../../services/sdk';
import { useUIStore } from '../../../../core/stores';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

type SpendForecastRow = { id: string; period: string; category_code?: string | null; forecasted_amount: number; method?: string | null; created_at?: string | null };

export default function ForecastPage() {
  const { addToast } = useUIStore();
  const [forecasts, setForecasts] = useState<SpendForecastRow[]>([]);

  useEffect(()=>{
    (async()=>{
      try {
        const data = await spendForecastService.findAll({ orderBy: 'period', ascending: true, limit: 20 });
        setForecasts(data as SpendForecastRow[]);
      } catch(e:any){ addToast(e.message,'error'); }
    })();
  }, []);

  const handleForecast = async () => {
    try {
      const period = `Q${Math.ceil((new Date().getMonth()+1)/3)}-${new Date().getFullYear()+1}`;
      await spendForecastService.forecast(period, null);
      addToast('تم توليد تنبؤ','success');
      const data = await spendForecastService.findAll({ orderBy: 'period', ascending: true, limit: 20 });
      setForecasts(data as SpendForecastRow[]);
    } catch(e:any){ addToast(e.message,'error'); }
  };

  return (
    <div className="space-y-5 max-w-[1600px] mx-auto" dir="rtl">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-black">تنبؤ الإنفاق — Spend Forecasting</h1>
          <p className="text-sm text-slate-500 mt-1">توقع الإنفاق المستقبلي لتحسين التخطيط المالي — Q3 3.2M ±5% — من تقرير 07 — عبر SDK فقط</p>
        </div>
        <button onClick={handleForecast} className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-bold">توليد تنبؤ جديد</button>
      </div>

      <Card>
        <div className="h-[350px]">
          {forecasts.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={forecasts.map((f:any)=>({ period: f.period, forecast: Number(f.forecasted_amount), actual: Number(f.actual_amount||0) }))}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" fontSize={10} />
                <YAxis fontSize={10} />
                <Tooltip />
                <Bar dataKey="forecast" fill="#4f46e5" name="تنبؤ" />
                <Bar dataKey="actual" fill="#10b981" name="فعلي" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-slate-400 text-sm">لا تنبؤات — مثال: Q3 2026 3.2M ±5%, Q4 3.8M ±8%, السنة 12.9M ±6%</div>
          )}
        </div>

        <div className="overflow-x-auto mt-4">
          <table className="w-full text-xs">
            <thead className="bg-slate-50"><tr><th className="p-2 text-right">الفترة</th><th className="p-2">تنبؤ</th><th className="p-2">فعلي</th><th className="p-2">دقة %</th><th className="p-2">الطريقة</th></tr></thead>
            <tbody className="divide-y">
              {forecasts.map((f:any)=>(
                <tr key={f.id}><td className="p-2 font-mono">{f.period}</td><td className="p-2">{Number(f.forecasted_amount).toLocaleString()}</td><td className="p-2">{f.actual_amount ? Number(f.actual_amount).toLocaleString() : '-'}</td><td className="p-2">{f.accuracy_percent ? `${f.accuracy_percent}%` : '-'}</td><td className="p-2">{f.method}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
