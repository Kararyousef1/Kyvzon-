/**
 * L08 — التتبع والرؤية الحية
 *
 * كانت الصفحة تقرأ من logistics_telemetry مباشرةً — جدول ميت لا يكتب
 * إليه شيء. الآن تقرأ من logistics_live_vehicle_positions (0286):
 * آخر موقع لكل مركبة + حالة اتصال محسوبة.
 *
 * الجولة السادسة: leaflet + react-leaflet ثُبِّتا، والخريطة التفاعلية
 * حلّت محل روابط OpenStreetMap الخارجية. الجدول باقٍ تحتها لأن الخريطة
 * وحدها لا تصلح للمسح السريع ولا للنسخ ولا لقارئات الشاشة.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Gauge, Loader2, MapPin, Navigation,
  Radio, RefreshCw, Truck, WifiOff,
} from 'lucide-react';
import { useUIStore } from '../../../../core/stores';
import { getErrorMessage } from '../../../../services/errors';
import {
  movementTelemetryService,
  CONNECTION_STATUS_LABELS,
  type LiveVehiclePosition,
  type VehicleConnectionStatus,
} from '../../../../services/sdk/MovementTelemetryService';
import Card from '../../../../shared/components/ui/Card';
import Button from '../../../../shared/components/ui/Button';
import { MovementUnitNav } from '../shared/MovementUnitNav';
import { MovementMap, type MapPoint } from '../shared/MovementMap';

const STATUS_STYLE: Record<VehicleConnectionStatus, { badge: string; dot: string; pin: string }> = {
  moving:  { badge: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500', pin: '#059669' },
  stopped: { badge: 'bg-amber-50 text-amber-700',     dot: 'bg-amber-500',   pin: '#d97706' },
  offline: { badge: 'bg-slate-200 text-slate-700',    dot: 'bg-slate-500',   pin: '#64748b' },
  no_data: { badge: 'bg-slate-100 text-slate-400',    dot: 'bg-slate-300',   pin: '#cbd5e1' },
};

/** تحديث دوري — لا Realtime لكل نقطة GPS (يخنق الاتصال) */
const REFRESH_MS = 15000;

export default function LogisticsLiveTrackingPage() {
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(true);
  const [positions, setPositions] = useState<LiveVehiclePosition[]>([]);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await movementTelemetryService.findLivePositions();
      setPositions(data);
      setLastRefresh(new Date());
    } catch (err) {
      if (!silent) addToast(getErrorMessage(err), 'error');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { void loadData(); }, [loadData]);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(() => void loadData(true), REFRESH_MS);
    return () => clearInterval(timer);
  }, [autoRefresh, loadData]);

  const stats = useMemo(() => ({
    moving:  positions.filter((p) => p.connection_status === 'moving').length,
    stopped: positions.filter((p) => p.connection_status === 'stopped').length,
    offline: positions.filter((p) => p.connection_status === 'offline').length,
    noData:  positions.filter((p) => p.connection_status === 'no_data').length,
  }), [positions]);

  const offlineList = useMemo(
    () => positions.filter((p) => p.connection_status === 'offline'),
    [positions],
  );

  /* المركبات التي لها إحداثيات فقط تُرسم — بلا إحداثيات لا موضع على الخريطة */
  const mapPoints = useMemo<MapPoint[]>(
    () =>
      positions
        .filter((p) => p.latitude !== null && p.longitude !== null)
        .map((p) => ({
          id: p.vehicle_id,
          lat: Number(p.latitude),
          lng: Number(p.longitude),
          color: (STATUS_STYLE[p.connection_status] ?? STATUS_STYLE.no_data).pin,
          title: `${p.vehicle_code} — ${p.plate_number}`,
          subtitle: [
            CONNECTION_STATUS_LABELS[p.connection_status],
            p.speed_kmh !== null ? `${Number(p.speed_kmh).toFixed(0)} كم/س` : null,
            p.driver_name_ar,
            p.dispatch_code,
          ]
            .filter(Boolean)
            .join(' · '),
        })),
    [positions],
  );

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      <MovementUnitNav unit="logistics_tracking" />

      <div className="bg-gradient-to-br from-indigo-700 to-slate-900 rounded-2xl p-6 text-white flex items-center justify-between flex-wrap gap-4">
        <div>
          <p className="text-white/70 text-sm font-semibold">Logistics Control • L08</p>
          <h2 className="text-2xl font-extrabold mt-1 flex items-center gap-2">
            <Radio /> التتبع والرؤية الحية
          </h2>
          <p className="text-white/75 mt-2 text-sm">
            آخر موقع معروف لكل مركبة
            {lastRefresh && ` · آخر تحديث ${lastRefresh.toLocaleTimeString('ar-IQ')}`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => setAutoRefresh((v) => !v)}
            className={autoRefresh
              ? '!bg-emerald-500 !text-white hover:!bg-emerald-600 !border-none'
              : '!bg-white/10 !text-white hover:!bg-white/20 !border-none'}
          >
            {autoRefresh ? 'التحديث التلقائي مفعَّل' : 'التحديث التلقائي متوقف'}
          </Button>
          <Button
            onClick={() => void loadData()}
            className="!bg-white !text-indigo-900 hover:!bg-indigo-50 !border-none"
            icon={<RefreshCw size={16} />}
            iconPosition="left"
          >
            تحديث
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center"><Navigation size={20} /></div>
          <div><p className="text-2xl font-extrabold text-slate-900">{stats.moving}</p>
          <p className="text-xs text-slate-500">في حركة</p></div>
        </div></Card>
        <Card><div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center"><MapPin size={20} /></div>
          <div><p className="text-2xl font-extrabold text-slate-900">{stats.stopped}</p>
          <p className="text-xs text-slate-500">متوقفة</p></div>
        </div></Card>
        <Card><div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-200 text-slate-700 flex items-center justify-center"><WifiOff size={20} /></div>
          <div><p className="text-2xl font-extrabold text-slate-900">{stats.offline}</p>
          <p className="text-xs text-slate-500">خارج الاتصال</p></div>
        </div></Card>
        <Card><div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center"><Truck size={20} /></div>
          <div><p className="text-2xl font-extrabold text-slate-900">{stats.noData}</p>
          <p className="text-xs text-slate-500">بلا بيانات</p></div>
        </div></Card>
      </div>

      {offlineList.length > 0 && (
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="text-slate-600" size={18} />
            <h3 className="font-bold text-slate-900">مركبات انقطع اتصالها ({offlineList.length})</h3>
          </div>
          <p className="text-[11px] text-slate-400 mb-2">
            انقطاع الإشارة قد يكون بسبب منطقة تغطية ضعيفة — ليس بالضرورة عطلاً.
          </p>
          <div className="space-y-2">
            {offlineList.map((p) => (
              <div key={p.vehicle_id}
                className="flex items-center justify-between gap-3 p-3 rounded-xl border bg-slate-50 text-sm">
                <span><span className="font-bold">{p.vehicle_code}</span> — {p.plate_number}</span>
                <span className="text-xs text-slate-500 whitespace-nowrap">
                  آخر إشارة منذ {p.minutes_since_update} دقيقة
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card padding="none">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-bold text-slate-900 flex items-center gap-2">
            <MapPin size={18} className="text-indigo-600" /> الخريطة الحية
          </h3>
          <span className="text-[11px] text-slate-400">
            {mapPoints.length} من {positions.length} مركبة لها إحداثيات
          </span>
        </div>
        {mapPoints.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <MapPin className="mx-auto mb-2" size={28} />
            <p className="text-sm">لا مركبة بإحداثيات معروفة بعد</p>
            <p className="text-[11px] mt-1">
              تظهر المركبات على الخريطة فور وصول أول إشارة GPS.
            </p>
          </div>
        ) : (
          <div className="p-4">
            <MovementMap points={mapPoints} height={460} />
            <p className="text-[11px] text-slate-400 mt-2 text-center">
              خرائط © مساهمو OpenStreetMap · انقر أي علامة لتفاصيل المركبة
            </p>
          </div>
        )}
      </Card>

      <Card padding="none">
        {loading ? (
          <div className="py-20 flex items-center justify-center">
            <Loader2 className="animate-spin text-slate-400" size={30} />
          </div>
        ) : positions.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <Radio className="mx-auto mb-2" size={28} />
            <p className="text-sm">لا مركبات مسجَّلة بعد</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {['المركبة', 'اللوحة', 'الحالة', 'السرعة', 'الرحلة', 'السائق', 'آخر تحديث', 'الموقع'].map((h) => (
                    <th key={h} className="text-right py-3 px-4 text-xs font-bold text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {positions.map((p) => {
                  const tone = STATUS_STYLE[p.connection_status] ?? STATUS_STYLE.no_data;
                  return (
                    <tr key={p.vehicle_id} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="py-3 px-4 font-mono font-bold text-indigo-600">{p.vehicle_code}</td>
                      <td className="py-3 px-4 font-bold text-slate-800">{p.plate_number}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${tone.badge}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} />
                          {CONNECTION_STATUS_LABELS[p.connection_status]}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600">
                        {p.speed_kmh !== null ? (
                          <span className="inline-flex items-center gap-1">
                            <Gauge size={13} />{Number(p.speed_kmh).toFixed(0)} كم/س
                          </span>
                        ) : '—'}
                      </td>
                      <td className="py-3 px-4 text-slate-600">{p.dispatch_code ?? '—'}</td>
                      <td className="py-3 px-4 text-slate-600">{p.driver_name_ar ?? '—'}</td>
                      <td className="py-3 px-4 text-slate-500">
                        {p.minutes_since_update === null
                          ? '—'
                          : p.minutes_since_update === 0
                            ? 'الآن'
                            : `منذ ${p.minutes_since_update} د`}
                      </td>
                      <td className="py-3 px-4">
                        {p.latitude !== null && p.longitude !== null ? (
                          <a
                            href={`https://www.openstreetmap.org/?mlat=${p.latitude}&mlon=${p.longitude}#map=16/${p.latitude}/${p.longitude}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-bold text-indigo-600 hover:underline inline-flex items-center gap-1"
                          >
                            <MapPin size={13} />
                            {Number(p.latitude).toFixed(4)}, {Number(p.longitude).toFixed(4)}
                          </a>
                        ) : (
                          <span className="text-slate-300 text-xs">لا إحداثيات</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

    </div>
  );
}
