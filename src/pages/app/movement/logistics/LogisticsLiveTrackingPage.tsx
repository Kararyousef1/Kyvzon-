import { useCallback, useEffect, useState } from 'react';
import { Compass, Radio } from 'lucide-react';
import { useUIStore } from '../../../../core/stores';
import { logisticsTelemetryService } from '../../../../services/sdk/LogisticsRoutesService';
import type { LogisticsTelemetryRecord } from '../../../../shared/types/logistics-routes';
import Card from '../../../../shared/components/ui/Card';
import { getErrorMessage } from '../../../../services/errors';

export default function LogisticsLiveTrackingPage() {
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(true);
  const [telemetry, setTelemetry] = useState<LogisticsTelemetryRecord[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await logisticsTelemetryService.findAll({ orderBy: 'recorded_at', ascending: false });
      setTelemetry(data || []);
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
          <p className="text-white/70 text-sm font-semibold">Logistics Control • L08</p>
          <h2 className="text-2xl font-extrabold mt-1 flex items-center gap-2"><Radio /> التتبع والرؤية الحية للأسطول</h2>
          <p className="text-white/75 mt-2 text-sm">متابعة إحداثيات المركبات، السرعات، واتجاهات الحركة على الخريطة في الوقت الفعلي.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold"><Radio size={20} /></div><div><p className="text-2xl font-extrabold text-slate-900">{telemetry.length}</p><p className="text-xs text-slate-500">إشارات القياس الحية المسجلة</p></div></div></Card>
        <Card><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold"><Compass size={20} /></div><div><p className="text-2xl font-extrabold text-slate-900">متصل</p><p className="text-xs text-slate-500">حالة الخريطة التفاعلية (Leaflet / OSM)</p></div></div></Card>
      </div>

      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {['معرّف المركبة', 'الإحداثيات (Lat / Lng)', 'السرعة (كم/س)', 'الاتجاه', 'وقت التسجيل'].map(h => <th key={h} className="text-right py-3 px-4 text-xs font-bold text-slate-500">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {telemetry.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-12 text-slate-400">لا توجد إشارات تتبع حية مسجلة حالياً.</td></tr>
              ) : telemetry.map(t => (
                <tr key={t.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="py-3 px-4 font-mono font-bold text-indigo-600">{t.vehicle_id.substring(0, 12)}...</td>
                  <td className="py-3 px-4 font-mono text-slate-600">{t.latitude}, {t.longitude}</td>
                  <td className="py-3 px-4 font-bold text-slate-800">{t.speed_kmh} كم/س</td>
                  <td className="py-3 px-4 font-mono text-slate-500">{t.heading ?? 0}°</td>
                  <td className="py-3 px-4 font-mono text-slate-500">{new Date(t.recorded_at).toLocaleString('ar-IQ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
