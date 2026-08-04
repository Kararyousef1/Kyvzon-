import { useCallback, useEffect, useState } from 'react';
import { MapPin, Plus } from 'lucide-react';
import { useUIStore } from '../../../../core/stores';
import { movementLocationService } from '../../../../services/sdk/MovementFoundationService';
import type { MovementLocationRecord } from '../../../../shared/types/movement-foundation';
import Card from '../../../../shared/components/ui/Card';
import Button from '../../../../shared/components/ui/Button';
import { getErrorMessage } from '../../../../services/errors';

export default function EmployeeMovementLocationsPage() {
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(true);
  const [locations, setLocations] = useState<MovementLocationRecord[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await movementLocationService.findAll({ orderBy: 'name_ar', ascending: true });
      setLocations(data || []);
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { loadData(); }, [loadData]);

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl p-6 text-white flex items-center justify-between flex-wrap gap-4">
        <div>
          <p className="text-white/70 text-sm font-semibold">Employee Movement • E00</p>
          <h2 className="text-2xl font-extrabold mt-1 flex items-center gap-2"><MapPin /> مواقع ونقاط التفتيش المعتمدة</h2>
          <p className="text-white/75 mt-2 text-sm">إدارة بوابات الخروج، المستودعات، والمواقع المسموحة للتنقل.</p>
        </div>
        <Button onClick={() => addToast('إضافة موقع جديد قيد التطوير', 'info')} className="!bg-white !text-indigo-700 hover:!bg-indigo-50 !border-none" icon={<Plus size={16} />} iconPosition="left">موقع جديد</Button>
      </div>

      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {['الرمز', 'اسم الموقع', 'النوع', 'الإحداثيات (Lat / Lng)', 'نصف القطر (متر)', 'الحالة'].map(h => <th key={h} className="text-right py-3 px-4 text-xs font-bold text-slate-500">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {locations.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-slate-400">لا توجد مواقع مسجلة.</td></tr>
              ) : locations.map(l => (
                <tr key={l.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="py-3 px-4 font-mono font-bold text-indigo-600">{l.code}</td>
                  <td className="py-3 px-4 font-bold text-slate-800">{l.name_ar}</td>
                  <td className="py-3 px-4"><span className="px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold">{l.location_type}</span></td>
                  <td className="py-3 px-4 font-mono text-slate-600">{l.latitude ?? '—'} / {l.longitude ?? '—'}</td>
                  <td className="py-3 px-4 font-bold text-slate-700">{l.radius_meters ?? 50} م</td>
                  <td className="py-3 px-4">{l.is_active ? <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold">نشط</span> : <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 text-xs font-bold">معطل</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
