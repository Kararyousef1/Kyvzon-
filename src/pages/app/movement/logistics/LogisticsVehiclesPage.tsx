import { useCallback, useEffect, useState } from 'react';
import { Plus, Truck, Wrench, ShieldCheck, Fuel } from 'lucide-react';
import { useUIStore } from '../../../../core/stores';
import { logisticsVehicleService } from '../../../../services/sdk/LogisticsFleetService';
import type { LogisticsVehicleRecord } from '../../../../shared/types/logistics-fleet';
import Card from '../../../../shared/components/ui/Card';
import Button from '../../../../shared/components/ui/Button';
import { getErrorMessage } from '../../../../services/errors';

export default function LogisticsVehiclesPage() {
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(true);
  const [vehicles, setVehicles] = useState<LogisticsVehicleRecord[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await logisticsVehicleService.findAll({ orderBy: 'vehicle_code', ascending: true });
      setVehicles(data || []);
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { loadData(); }, [loadData]);

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      <div className="bg-gradient-to-br from-indigo-700 to-slate-900 rounded-2xl p-6 text-white flex items-center justify-between flex-wrap gap-4">
        <div>
          <p className="text-white/70 text-sm font-semibold">Logistics Control • L01</p>
          <h2 className="text-2xl font-extrabold mt-1 flex items-center gap-2"><Truck /> إدارة الأسطول والمركبات</h2>
          <p className="text-white/75 mt-2 text-sm">إدارة الشاحنات، المركبات، الأوزان القصوى، والسعات الاستيعابية وحالة الجاهزية.</p>
        </div>
        <Button onClick={() => addToast('إضافة مركبة جديدة قيد التطوير', 'info')} className="!bg-white !text-indigo-900 hover:!bg-indigo-50 !border-none" icon={<Plus size={16} />} iconPosition="left">مركبة جديدة</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold"><Truck size={20} /></div><div><p className="text-2xl font-extrabold text-slate-900">{vehicles.length}</p><p className="text-xs text-slate-500">إجمالي المركبات</p></div></div></Card>
        <Card><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold"><ShieldCheck size={20} /></div><div><p className="text-2xl font-extrabold text-slate-900">{vehicles.filter(v=>v.status==='available').length}</p><p className="text-xs text-slate-500">متاحة للرحلات</p></div></div></Card>
        <Card><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold"><Wrench size={20} /></div><div><p className="text-2xl font-extrabold text-slate-900">{vehicles.filter(v=>v.status==='maintenance').length}</p><p className="text-xs text-slate-500">تحت الصيانة</p></div></div></Card>
        <Card><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center font-bold"><Fuel size={20} /></div><div><p className="text-2xl font-extrabold text-slate-900">100%</p><p className="text-xs text-slate-500">كفاءة الأسطول</p></div></div></Card>
      </div>

      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {['رمز المركبة', 'رقم اللوحة', 'النوع والطراز', 'النوع اللوجستي', 'الحمولة القصوى', 'عداد الكيلومترات', 'الحالة'].map(h => <th key={h} className="text-right py-3 px-4 text-xs font-bold text-slate-500">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {vehicles.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-slate-400">لا توجد مركبات مسجلة في الأسطول.</td></tr>
              ) : vehicles.map(v => (
                <tr key={v.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="py-3 px-4 font-mono font-bold text-indigo-600">{v.vehicle_code}</td>
                  <td className="py-3 px-4 font-bold text-slate-800">{v.plate_number}</td>
                  <td className="py-3 px-4 text-slate-600">{v.make} {v.model} ({v.year})</td>
                  <td className="py-3 px-4"><span className="px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold">{v.vehicle_type}</span></td>
                  <td className="py-3 px-4 font-bold text-slate-700">{v.max_weight_kg} كغ</td>
                  <td className="py-3 px-4 font-mono text-slate-600">{v.current_mileage_km} كم</td>
                  <td className="py-3 px-4">
                    {v.status === 'available' ? <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold">متاحة</span> :
                     v.status === 'on_trip' ? <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-bold">في رحلة</span> :
                     v.status === 'maintenance' ? <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-bold">صيانة</span> :
                     <span className="px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 text-xs font-bold">خارج الخدمة</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
