import { useCallback, useEffect, useMemo, useState } from 'react';
import { MapPin, Plus, Navigation , X } from 'lucide-react';
import { useUIStore } from '../../../../core/stores';
import { logisticsRouteService } from '../../../../services/sdk/LogisticsRoutesService';
import type { LogisticsRouteRecord } from '../../../../shared/types/logistics-routes';
import Card from '../../../../shared/components/ui/Card';
import { MovementUnitNav } from '../shared/MovementUnitNav';
import Button from '../../../../shared/components/ui/Button';
import { getErrorMessage } from '../../../../services/errors';
import Input from '../../../../shared/components/ui/Input';
import {
  movementFoundationOperationsService,
  type RoutePlanResult,
  type RouteWaypoint,
} from '../../../../services/sdk/MovementFoundationOperationsService';
import type { MovementLocationRecord } from '../../../../shared/types/movement-foundation';
import { MovementMap, type MapPoint } from '../shared/MovementMap';

export default function LogisticsRoutePlanningPage() {
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPlan, setShowPlan] = useState(false);
  const [locations, setLocations] = useState<MovementLocationRecord[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [routeName, setRouteName] = useState('');
  const [avgSpeed, setAvgSpeed] = useState(45);
  const [result, setResult] = useState<RoutePlanResult | null>(null);
  /* محطات المسار بعد التحسين — تُقرأ من الصف المحفوظ لا تُحسب هنا */
  const [planned, setPlanned] = useState<RouteWaypoint[] | null>(null);
  const [routes, setRoutes] = useState<LogisticsRouteRecord[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const locs = await movementFoundationOperationsService.findRoutableLocations().catch(() => []);
      setLocations(locs);
      const data = await logisticsRouteService.findAll({ orderBy: 'created_at', ascending: false });
      setRoutes(data || []);
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { loadData(); }, [loadData]);

  /*
    التخطيط عبر RPC plan_optimized_route (0287).
    الخوارزمية: Nearest Neighbour ثم 2-opt فوق ناتجه.
    ⚠️ ما زالت heuristic لا أمثلية مضمونة، والمسافة جوّية لا طريق فعلي.
    النتيجة تُعرض بمراحلها الثلاث ليرى المستخدم أثر كل خطوة.
  */
  const toggleLocation = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  /* معاينة: النقاط بترتيب الاختيار الحالي — قبل التحسين */
  const previewPoints = useMemo<MapPoint[]>(
    () =>
      selectedIds
        .map((id, i) => {
          const l = locations.find((x) => x.id === id);
          if (!l || l.latitude === null || l.longitude === null) return null;
          return {
            id: l.id,
            lat: Number(l.latitude),
            lng: Number(l.longitude),
            badge: i + 1,
            title: l.name_ar,
            subtitle: `المحطة ${i + 1} بترتيب الاختيار`,
            color: i === 0 ? '#059669' : '#4338ca',
          } as MapPoint;
        })
        .filter((p): p is MapPoint => p !== null),
    [selectedIds, locations],
  );

  /* النتيجة: المسار المحسَّن كما خزّنه الخادم — لا إعادة حساب هنا */
  const plannedPoints = useMemo<MapPoint[]>(() => {
    if (!planned) return [];
    return planned
      .filter((w) => Number.isFinite(Number(w.lat)) && Number.isFinite(Number(w.lng)))
      .map((w) => ({
        id: String(w.location_id ?? w.seq),
        lat: Number(w.lat),
        lng: Number(w.lng),
        badge: Number(w.seq),
        title: String(w.name ?? ''),
        subtitle: Number(w.leg_km) > 0 ? `${Number(w.leg_km).toFixed(2)} كم من السابقة` : 'نقطة الانطلاق',
        color: Number(w.seq) === 1 ? '#059669' : '#4338ca',
      }));
  }, [planned]);

  const submitPlan = async () => {
    if (selectedIds.length < 2) {
      addToast('اختر موقعين على الأقل', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await movementFoundationOperationsService.planRoute({
        routeName, locationIds: selectedIds, avgSpeedKmh: avgSpeed,
      });
      setResult(res);
      addToast(`تم التخطيط — وفّرت ${res.saved_km} كم`, 'success');
      await loadData();
      // المحطات المرتَّبة من الصف المحفوظ: مصدر الحقيقة هو الخادم
      try {
        const saved = await logisticsRouteService.findById(res.route_id);
        const wp = (saved?.waypoints_json ?? []) as unknown as RouteWaypoint[];
        setPlanned(Array.isArray(wp) ? wp : null);
      } catch {
        setPlanned(null);   // فشل القراءة لا يُبطل التخطيط نفسه
      }
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      <MovementUnitNav unit="logistics_routes" />
      <div className="bg-gradient-to-br from-indigo-700 to-slate-900 rounded-2xl p-6 text-white flex items-center justify-between flex-wrap gap-4">
        <div>
          <p className="text-white/70 text-sm font-semibold">Logistics Control • L06</p>
          <h2 className="text-2xl font-extrabold mt-1 flex items-center gap-2"><Navigation /> تخطيط المسارات والتحسين</h2>
          <p className="text-white/75 mt-2 text-sm">تصميم وتحسين المسارات اللوجستية، المحطات، وحساب المسافات والأزمنة المتوقعة.</p>
        </div>
        <Button onClick={() => { setResult(null); setPlanned(null); setShowPlan(true); }} className="!bg-white !text-indigo-900 hover:!bg-indigo-50 !border-none" icon={<Plus size={16} />} iconPosition="left">مسار جديد</Button>
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

      {showPlan && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-3xl max-h-[92vh] overflow-auto" dir="rtl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">تخطيط مسار محسَّن</h3>
              <button type="button" onClick={() => setShowPlan(false)}
                className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
            </div>

            <div className="space-y-3">
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-600">اسم المسار *</label>
                  <Input value={routeName} onChange={(e) => setRouteName(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600">متوسط السرعة (كم/س)</label>
                  <Input type="number" value={avgSpeed}
                    onChange={(e) => setAvgSpeed(Number(e.target.value))} />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600">
                  المحطات ({selectedIds.length} مختارة — موقعان على الأقل)
                </label>
                {locations.length === 0 ? (
                  <p className="text-sm text-slate-400 py-4 text-center border border-dashed rounded-xl mt-1">
                    لا مواقع بإحداثيات. أضف مواقع بإحداثيات أولاً من وحدة الأساس.
                  </p>
                ) : (
                  <div className="mt-1 max-h-56 overflow-auto border rounded-xl divide-y">
                    {locations.map((l) => (
                      <label key={l.id}
                        className="flex items-center gap-2 p-2.5 text-sm hover:bg-slate-50 cursor-pointer">
                        <input type="checkbox" checked={selectedIds.includes(l.id)}
                          onChange={() => toggleLocation(l.id)} />
                        <span className="font-bold">{l.name_ar}</span>
                        <span className="text-[11px] text-slate-400 mr-auto font-mono">
                          {Number(l.latitude).toFixed(4)}, {Number(l.longitude).toFixed(4)}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {!result && previewPoints.length > 1 && (
                <div>
                  <p className="text-xs font-bold text-slate-600 mb-1.5">
                    معاينة بترتيب الاختيار (قبل التحسين)
                  </p>
                  <MovementMap points={previewPoints} connect height={260} polylineColor="#94a3b8" />
                </div>
              )}

              {result && (
                <div className="border border-emerald-200 bg-emerald-50 rounded-xl p-4">
                  <h4 className="font-bold text-slate-900 mb-2">نتيجة التحسين</h4>
                  <table className="w-full text-sm">
                    <tbody>
                      <tr><td className="py-1 text-slate-600">① بالترتيب المُدخَل (خط الأساس)</td>
                        <td className="py-1 font-bold font-mono">{result.naive_km} كم</td></tr>
                      <tr><td className="py-1 text-slate-600">② بعد أقرب جار (NN)</td>
                        <td className="py-1 font-bold font-mono text-indigo-700">{result.nn_km} كم</td></tr>
                      <tr><td className="py-1 text-slate-600">③ بعد 2-opt</td>
                        <td className="py-1 font-bold font-mono text-indigo-700">{result.two_opt_km} كم</td></tr>
                      <tr><td className="py-1 text-slate-600">④ بعد Or-opt (النهائي)</td>
                        <td className="py-1 font-bold font-mono text-emerald-700">{result.optimized_km} كم</td></tr>
                      <tr className="border-t border-emerald-200">
                        <td className="py-1 text-slate-600">مكسب Or-opt وحده</td>
                        <td className="py-1 font-bold font-mono text-emerald-700">
                          {Math.max(result.two_opt_km - result.optimized_km, 0).toFixed(2)} كم
                          {result.two_opt_km > 0 &&
                            ` (${Math.round(Math.max(result.two_opt_km - result.optimized_km, 0) / result.two_opt_km * 100)}%)`}
                        </td></tr>
                      <tr><td className="py-1 text-slate-600 font-bold">الوفر الإجمالي</td>
                        <td className="py-1 font-bold font-mono text-emerald-700">
                          {result.saved_km} كم
                          {result.naive_km > 0 && ` (${Math.round((result.saved_km / result.naive_km) * 100)}%)`}
                        </td></tr>
                      <tr><td className="py-1 text-slate-600">الزمن المقدَّر</td>
                        <td className="py-1 font-bold font-mono">{result.duration_min} دقيقة</td></tr>
                      <tr><td className="py-1 text-slate-600">عدد المحطات</td>
                        <td className="py-1 font-bold font-mono">{result.ordered_count}</td></tr>
                    </tbody>
                  </table>

                  {plannedPoints.length > 1 && (
                    <div className="mt-3">
                      <p className="text-xs font-bold text-slate-700 mb-1.5">
                        المسار النهائي على الخريطة
                      </p>
                      <MovementMap points={plannedPoints} connect height={300} polylineColor="#059669" />
                      <p className="text-[11px] text-slate-400 mt-1 text-center">
                        الأرقام = ترتيب الزيارة بعد التحسين · خرائط © مساهمو OpenStreetMap
                      </p>
                    </div>
                  )}

                  <p className="text-[11px] text-amber-700 mt-3 bg-amber-50 border border-amber-200 rounded-lg p-2">
                    ⚠️ الخوارزمية: أقرب جار (NN) ثم 2-opt و Or-opt بالتناوب حتى الاستقرار،
                    بمسافة Haversine — <strong>حل تقريبي لا أمثل</strong>. المسافة جوّية لا
                    مسافة طريق فعلية، ولا تراعي الازدحام ولا اتجاهات الطرق.
                  </p>
                </div>
              )}

              <p className="text-[11px] text-slate-400">
                المواقع بلا إحداثيات مستبعَدة. الحد الأقصى 50 محطة.
              </p>
            </div>

            <div className="flex gap-2 mt-5">
              <Button onClick={() => void submitPlan()} loading={saving} className="flex-1">
                {result ? 'إعادة التخطيط' : 'تخطيط وتحسين'}
              </Button>
              <Button variant="secondary" onClick={() => setShowPlan(false)} className="flex-1">إغلاق</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
