import { useCallback, useEffect, useState } from 'react';
import { Plus, Wrench } from 'lucide-react';
import { useUIStore } from '../../../../core/stores';
import { logisticsMaintenanceService } from '../../../../services/sdk/LogisticsFleetService';
import type { LogisticsMaintenanceRecord } from '../../../../shared/types/logistics-fleet';
import Card from '../../../../shared/components/ui/Card';
import Button from '../../../../shared/components/ui/Button';
import { getErrorMessage } from '../../../../services/errors';

export default function LogisticsMaintenancePage() {
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(true);
  const [maintenanceRecords, setMaintenanceRecords] = useState<LogisticsMaintenanceRecord[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await logisticsMaintenanceService.findAll({ orderBy: 'scheduled_date', ascending: true });
      setMaintenanceRecords(data || []);
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
          <p className="text-white/70 text-sm font-semibold">Logistics Control • L03</p>
          <h2 className="text-2xl font-extrabold mt-1 flex items-center gap-2"><Wrench /> جدول الصيانة والإصلاح</h2>
          <p className="text-white/75 mt-2 text-sm">متابعة أعمال الصيانة الدورية، الطارئة، وإصلاحات الأسطول وتكاليفها.</p>
        </div>
        <Button onClick={() => addToast('إضافة سجل صيانة جديد قيد التطوير', 'info')} className="!bg-white !text-indigo-900 hover:!bg-indigo-50 !border-none" icon={<Plus size={16} />} iconPosition="left">سجل صيانة</Button>
      </div>

      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {['نوع الصيانة', 'الوصف', 'التكلفة (د.ع)', 'تاريخ الجدولة', 'الحالة'].map(h => <th key={h} className="text-right py-3 px-4 text-xs font-bold text-slate-500">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {maintenanceRecords.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-12 text-slate-400">لا توجد سجلات صيانة حالية.</td></tr>
              ) : maintenanceRecords.map(m => (
                <tr key={m.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="py-3 px-4"><span className="px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold">{m.maintenance_type}</span></td>
                  <td className="py-3 px-4 font-bold text-slate-800">{m.description}</td>
                  <td className="py-3 px-4 font-mono font-bold text-slate-700">{m.cost.toLocaleString()} د.ع</td>
                  <td className="py-3 px-4 font-mono text-slate-600">{m.scheduled_date}</td>
                  <td className="py-3 px-4">
                    {m.status === 'scheduled' ? <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-bold">مجدولة</span> :
                     m.status === 'in_progress' ? <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-bold">قيد التنفيذ</span> :
                     m.status === 'completed' ? <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold">مكتملة</span> :
                     <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 text-xs font-bold">ملغاة</span>}
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
