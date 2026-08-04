import { useCallback, useEffect, useState } from 'react';
import { Fuel, Plus } from 'lucide-react';
import { useUIStore } from '../../../../core/stores';
import { logisticsFuelService } from '../../../../services/sdk/LogisticsEpodFuelService';
import type { LogisticsFuelLogRecord } from '../../../../shared/types/logistics-epod-fuel';
import Card from '../../../../shared/components/ui/Card';
import Button from '../../../../shared/components/ui/Button';
import { getErrorMessage } from '../../../../services/errors';

export default function LogisticsFuelPage() {
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(true);
  const [fuelLogs, setFuelLogs] = useState<LogisticsFuelLogRecord[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await logisticsFuelService.findAll({ orderBy: 'logged_at', ascending: false });
      setFuelLogs(data || []);
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { loadData(); }, [loadData]);

  const totalLiters = fuelLogs.reduce((acc, f) => acc + Number(f.liters), 0);
  const totalCost = fuelLogs.reduce((acc, f) => acc + Number(f.cost), 0);

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      <div className="bg-gradient-to-br from-indigo-700 to-slate-900 rounded-2xl p-6 text-white flex items-center justify-between flex-wrap gap-4">
        <div>
          <p className="text-white/70 text-sm font-semibold">Logistics Control • L04</p>
          <h2 className="text-2xl font-extrabold mt-1 flex items-center gap-2"><Fuel /> استهلاك الوقود والطاقة</h2>
          <p className="text-white/75 mt-2 text-sm">متابعة تعبئة الوقود، التكاليف، قراءات العدادات، وكفاءة استهلاك الأسطول.</p>
        </div>
        <Button onClick={() => addToast('تسجيل وقود جديد قيد التطوير', 'info')} className="!bg-white !text-indigo-900 hover:!bg-indigo-50 !border-none" icon={<Plus size={16} />} iconPosition="left">سجل وقود</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold"><Fuel size={20} /></div><div><p className="text-2xl font-extrabold text-slate-900">{totalLiters.toLocaleString()} لتر</p><p className="text-xs text-slate-500">إجمالي الوقود المستهلك</p></div></div></Card>
        <Card><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center font-bold"><Fuel size={20} /></div><div><p className="text-2xl font-extrabold text-slate-900">{totalCost.toLocaleString()} د.ع</p><p className="text-xs text-slate-500">إجمالي التكاليف المالية</p></div></div></Card>
        <Card><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold"><Fuel size={20} /></div><div><p className="text-2xl font-extrabold text-slate-900">{fuelLogs.length}</p><p className="text-xs text-slate-500">عمليات التعبئة المسجلة</p></div></div></Card>
      </div>

      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {['معرّف المركبة', 'كمية الوقود (لتر)', 'التكلفة الإجمالية (د.ع)', 'قراءة العداد (كم)', 'محطة التعبئة', 'وقت التسجيل'].map(h => <th key={h} className="text-right py-3 px-4 text-xs font-bold text-slate-500">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {fuelLogs.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-slate-400">لا توجد سجلات وقود مسجلة.</td></tr>
              ) : fuelLogs.map(f => (
                <tr key={f.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="py-3 px-4 font-mono font-bold text-indigo-600">{f.vehicle_id.substring(0, 12)}...</td>
                  <td className="py-3 px-4 font-bold text-slate-800">{f.liters} لتر</td>
                  <td className="py-3 px-4 font-mono font-bold text-slate-700">{f.cost.toLocaleString()} د.ع</td>
                  <td className="py-3 px-4 font-mono text-slate-600">{f.odometer_reading} كم</td>
                  <td className="py-3 px-4 text-slate-600">{f.station_name || '—'}</td>
                  <td className="py-3 px-4 font-mono text-slate-500">{new Date(f.logged_at).toLocaleString('ar-IQ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
