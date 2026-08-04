import { useCallback, useEffect, useState } from 'react';
import { Award, Plus, Users } from 'lucide-react';
import { useUIStore } from '../../../../core/stores';
import { logisticsDriverService } from '../../../../services/sdk/LogisticsFleetService';
import type { LogisticsDriverRecord } from '../../../../shared/types/logistics-fleet';
import Card from '../../../../shared/components/ui/Card';
import Button from '../../../../shared/components/ui/Button';
import { getErrorMessage } from '../../../../services/errors';

export default function LogisticsDriversPage() {
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(true);
  const [drivers, setDrivers] = useState<LogisticsDriverRecord[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await logisticsDriverService.findAll({ orderBy: 'driver_name_ar', ascending: true });
      setDrivers(data || []);
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
          <p className="text-white/70 text-sm font-semibold">Logistics Control • L02</p>
          <h2 className="text-2xl font-extrabold mt-1 flex items-center gap-2"><Users /> السائقون والامتثال المروري</h2>
          <p className="text-white/75 mt-2 text-sm">إدارة رخص القيادة، درجات السلامة، وحالة التواجد للسائقين.</p>
        </div>
        <Button onClick={() => addToast('إضافة سائق جديد قيد التطوير', 'info')} className="!bg-white !text-indigo-900 hover:!bg-indigo-50 !border-none" icon={<Plus size={16} />} iconPosition="left">سائق جديد</Button>
      </div>

      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {['اسم السائق', 'رقم الرخصة', 'فئة الرخصة', 'انتهاء الرخصة', 'درجة السلامة', 'الحالة'].map(h => <th key={h} className="text-right py-3 px-4 text-xs font-bold text-slate-500">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {drivers.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-slate-400">لا توجد بيانات للسائقين مسجلة.</td></tr>
              ) : drivers.map(d => (
                <tr key={d.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="py-3 px-4 font-bold text-slate-800">{d.driver_name_ar}</td>
                  <td className="py-3 px-4 font-mono text-indigo-600">{d.license_number}</td>
                  <td className="py-3 px-4"><span className="px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold">{d.license_class}</span></td>
                  <td className="py-3 px-4 font-mono text-slate-600">{d.license_expiry_date}</td>
                  <td className="py-3 px-4 font-bold text-emerald-700 flex items-center gap-1"><Award size={14} /> {d.safety_score}%</td>
                  <td className="py-3 px-4">
                    {d.status === 'active' ? <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold">نشط</span> :
                     d.status === 'on_trip' ? <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-bold">في رحلة</span> :
                     <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 text-xs font-bold">{d.status}</span>}
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
