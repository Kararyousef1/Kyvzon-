import { useCallback, useEffect, useState } from 'react';
import { MapPin, Plus, Navigation } from 'lucide-react';
import { useUIStore } from '../../../../core/stores';
import { logisticsRouteService } from '../../../../services/sdk/LogisticsRoutesService';
import type { LogisticsRouteRecord } from '../../../../shared/types/logistics-routes';
import Card from '../../../../shared/components/ui/Card';
import Button from '../../../../shared/components/ui/Button';
import { getErrorMessage } from '../../../../services/errors';

export default function LogisticsRoutePlanningPage() {
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(true);
  const [routes, setRoutes] = useState<LogisticsRouteRecord[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await logisticsRouteService.findAll({ orderBy: 'created_at', ascending: false });
      setRoutes(data || []);
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
          <p className="text-white/70 text-sm font-semibold">Logistics Control • L06</p>
          <h2 className="text-2xl font-extrabold mt-1 flex items-center gap-2"><Navigation /> تخطيط المسارات والتحسين</h2>
          <p className="text-white/75 mt-2 text-sm">تصميم وتحسين المسارات اللوجستية، المحطات، وحساب المسافات والأزمنة المتوقعة.</p>
        </div>
        <Button onClick={() => addToast('إضافة مسار جديد قيد التطوير', 'info')} className="!bg-white !text-indigo-900 hover:!bg-indigo-50 !border-none" icon={<Plus size={16} />} iconPosition="left">مسار جديد</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold"><Navigation size={20} /></div><div><p className="text-2xl font-extrabold text-slate-900">{routes.length}</p><p className="text-xs text-slate-500">إجمالي المسارات</p></div></div></Card>
        <Card><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold"><MapPin size={20} /></div><div><p className="text-2xl font-extrabold text-slate-900">{routes.filter(r=>r.status==='optimized').length}</p><p className="text-xs text-slate-500">مسارات محسّنة</p></div></div></Card>
        <Card><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold"><Navigation size={20} /></div><div><p className="text-2xl font-extrabold text-slate-900">{routes.filter(r=>r.status==='in_progress').length}</p><p className="text-xs text-slate-500">مسارات نشطة</p></div></div></Card>
      </div>

      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {['رمز المسار', 'اسم المسار', 'المسافة الكلية (كم)', 'المدة المقدرة (دقيقة)', 'الحالة'].map(h => <th key={h} className="text-right py-3 px-4 text-xs font-bold text-slate-500">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {routes.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-12 text-slate-400">لا توجد مسارات مسجلة.</td></tr>
              ) : routes.map(r => (
                <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="py-3 px-4 font-mono font-bold text-indigo-600">{r.route_code}</td>
                  <td className="py-3 px-4 font-bold text-slate-800">{r.route_name}</td>
                  <td className="py-3 px-4 font-mono font-bold text-slate-700">{r.total_distance_km} كم</td>
                  <td className="py-3 px-4 font-mono text-slate-600">{r.estimated_duration_min} دقيقة</td>
                  <td className="py-3 px-4">
                    {r.status === 'optimized' ? <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold">محسّن</span> :
                     r.status === 'in_progress' ? <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-bold">نشط</span> :
                     <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 text-xs font-bold">{r.status}</span>}
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
