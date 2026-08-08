/**
 * L12 — إعادة تشغيل مسار الرحلة
 *
 * لماذا هذه الصفحة موجودة:
 *   الجولة الخامسة بنت `findDispatchTrack` في الـ SDK وتركتها **بلا واجهة**.
 *   دالة لا تُستدعى من أي مكان هي دَين تقني لا ميزة. هذه الصفحة تُنهي ذلك.
 *
 * لماذا تُستعمَل get_dispatch_track (0287) لا القراءة الخام:
 *   المسافة التراكمية والفجوات الزمنية ورصد التوقفات محسوبة في الخادم.
 *   لو حُسبت هنا لتباعدت عن أي شاشة أخرى تحسبها بطريقتها.
 *
 * الاستعمال العملي: تحقيق الحوادث، التحقق من الانحراف عن المسار،
 * والنزاعات مع العملاء حول وقت التسليم.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Clock, Gauge, History, Loader2, MapPin,
  Pause, Play, Route, RotateCcw, SkipBack, SkipForward, Truck,
} from 'lucide-react';
import { useUIStore } from '../../../../core/stores';
import { getErrorMessage } from '../../../../services/errors';
import {
  movementTelemetryService,
  type DispatchTrackPoint,
  type DispatchTrackSummary,
  type TrackableDispatch,
} from '../../../../services/sdk/MovementTelemetryService';
import Card from '../../../../shared/components/ui/Card';
import Button from '../../../../shared/components/ui/Button';
import { MovementUnitNav } from '../shared/MovementUnitNav';
import { MovementMap, type MapPoint } from '../shared/MovementMap';

/** سرعات التشغيل — مضاعف للفاصل الأساسي */
const SPEEDS = [1, 2, 4, 8] as const;
const BASE_TICK_MS = 700;

export default function LogisticsTrackReplayPage() {
  const { addToast } = useUIStore();

  const [loadingList, setLoadingList] = useState(true);
  const [loadingTrack, setLoadingTrack] = useState(false);
  const [dispatches, setDispatches] = useState<TrackableDispatch[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [track, setTrack] = useState<DispatchTrackPoint[]>([]);
  const [summary, setSummary] = useState<DispatchTrackSummary | null>(null);

  // مؤشر إعادة التشغيل
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(2);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    try {
      const data = await movementTelemetryService.findTrackableDispatches();
      setDispatches(data);
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setLoadingList(false);
    }
  }, [addToast]);

  useEffect(() => { void loadList(); }, [loadList]);

  const loadTrack = useCallback(async (dispatchId: string) => {
    setLoadingTrack(true);
    setPlaying(false);
    try {
      // الاثنتان معاً: الملخّص لا يُشتق من النقاط في المتصفح
      const [points, sum] = await Promise.all([
        movementTelemetryService.getDispatchTrack(dispatchId),
        movementTelemetryService.getDispatchTrackSummary(dispatchId),
      ]);
      setTrack(points);
      setSummary(sum);
      setCursor(points.length > 0 ? points.length - 1 : 0);
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
      setTrack([]);
      setSummary(null);
    } finally {
      setLoadingTrack(false);
    }
  }, [addToast]);

  const selectDispatch = (id: string) => {
    setSelectedId(id);
    void loadTrack(id);
  };

  /* مؤقّت التشغيل — يتوقف تلقائياً عند آخر نقطة */
  useEffect(() => {
    if (!playing || track.length === 0) return;
    const timer = window.setInterval(() => {
      setCursor((c) => {
        if (c >= track.length - 1) {
          setPlaying(false);
          return c;
        }
        return c + 1;
      });
    }, BASE_TICK_MS / speed);
    return () => window.clearInterval(timer);
  }, [playing, speed, track.length]);

  /* النقاط حتى المؤشر — المسار «المقطوع» يُظهر ما جرى حتى تلك اللحظة */
  const visible = useMemo(() => track.slice(0, cursor + 1), [track, cursor]);

  const mapPoints = useMemo<MapPoint[]>(() => {
    if (visible.length === 0) return [];
    const last = visible.length - 1;
    return visible.map((p, i) => ({
      id: p.telemetry_id,
      lat: Number(p.latitude),
      lng: Number(p.longitude),
      // البداية خضراء · الموضع الحالي أحمر · التوقفات كهرمانية · الباقي رمادي فاتح
      color:
        i === last ? '#dc2626'
          : i === 0 ? '#059669'
          : p.is_stop ? '#d97706'
          : '#94a3b8',
      badge: i === last ? '●' : i === 0 ? '▲' : undefined,
      title:
        i === last ? 'الموضع الحالي'
          : i === 0 ? 'نقطة الانطلاق'
          : p.is_stop ? 'توقف' : `النقطة ${p.seq}`,
      subtitle: [
        new Date(p.recorded_at).toLocaleString('ar-IQ'),
        `${Number(p.speed_kmh).toFixed(0)} كم/س`,
        `تراكمي ${Number(p.cumulative_km).toFixed(2)} كم`,
      ].join(' · '),
    }));
  }, [visible]);

  const current = track[cursor] ?? null;
  const selected = dispatches.find((d) => d.dispatch_id === selectedId) ?? null;

  /* الفجوات الطويلة تعني انقطاع إشارة — والمسار المرسوم عبرها تخمين */
  const longGaps = useMemo(() => track.filter((p) => p.gap_minutes >= 15), [track]);

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      <MovementUnitNav unit="logistics_tracking" />

      <div className="bg-gradient-to-br from-slate-900 to-indigo-800 rounded-2xl p-6 text-white flex items-center justify-between flex-wrap gap-4">
        <div>
          <p className="text-white/70 text-sm font-semibold">Logistics Control • L12</p>
          <h2 className="text-2xl font-extrabold mt-1 flex items-center gap-2">
            <History /> إعادة تشغيل مسار الرحلة
          </h2>
          <p className="text-white/75 mt-2 text-sm">
            استعراض المسار الفعلي لأي رحلة نقطةً بنقطة — للتحقيق في الحوادث
            وتوثيق أوقات التسليم.
          </p>
        </div>
        <Button
          onClick={() => void loadList()}
          className="!bg-white !text-indigo-900 hover:!bg-indigo-50 !border-none"
          icon={<RotateCcw size={16} />}
          iconPosition="left"
        >
          تحديث القائمة
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ─── قائمة الرحلات ─── */}
        <Card padding="none" className="lg:col-span-1">
          <div className="p-4 border-b border-slate-100">
            <h3 className="font-bold text-slate-900 flex items-center gap-2">
              <Truck size={17} className="text-indigo-600" /> رحلات لها مسار مسجَّل
            </h3>
            <p className="text-[11px] text-slate-400 mt-1">
              تظهر هنا الرحلات التي وصلت منها إشارة GPS واحدة على الأقل.
            </p>
          </div>

          {loadingList ? (
            <div className="py-16 flex items-center justify-center">
              <Loader2 className="animate-spin text-slate-400" size={26} />
            </div>
          ) : dispatches.length === 0 ? (
            <div className="py-14 text-center text-slate-400 px-4">
              <Route className="mx-auto mb-2" size={26} />
              <p className="text-sm">لا رحلة بمسار مسجَّل</p>
              <p className="text-[11px] mt-1">
                تُسجَّل الإشارات عبر <code className="font-mono">record_vehicle_telemetry</code>{' '}
                من جهاز التتبع أو تطبيق السائق.
              </p>
            </div>
          ) : (
            <div className="max-h-[560px] overflow-auto divide-y divide-slate-50">
              {dispatches.map((d) => (
                <button
                  key={d.dispatch_id}
                  type="button"
                  onClick={() => selectDispatch(d.dispatch_id)}
                  className={`w-full text-right p-3.5 hover:bg-slate-50 transition ${
                    selectedId === d.dispatch_id ? 'bg-indigo-50 border-r-4 border-indigo-600' : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-bold text-indigo-600 text-sm">
                      {d.dispatch_code}
                    </span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-bold">
                      {d.ping_count} إشارة
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1">
                    {d.vehicle_code ?? '—'}
                    {d.plate_number ? ` · ${d.plate_number}` : ''}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {d.driver_name_ar ?? 'بلا سائق'}
                    {d.last_ping_at &&
                      ` · آخر إشارة ${new Date(d.last_ping_at).toLocaleString('ar-IQ')}`}
                  </p>
                </button>
              ))}
            </div>
          )}
        </Card>

        {/* ─── الخريطة والتشغيل ─── */}
        <div className="lg:col-span-2 space-y-6">
          {!selectedId ? (
            <Card>
              <div className="py-20 text-center text-slate-400">
                <MapPin className="mx-auto mb-3" size={32} />
                <p className="text-sm font-bold text-slate-500">اختر رحلة من القائمة</p>
                <p className="text-xs mt-1">سيُرسم مسارها الفعلي على الخريطة.</p>
              </div>
            </Card>
          ) : loadingTrack ? (
            <Card>
              <div className="py-24 flex items-center justify-center">
                <Loader2 className="animate-spin text-slate-400" size={30} />
              </div>
            </Card>
          ) : track.length === 0 ? (
            <Card>
              <div className="py-20 text-center text-slate-400">
                <AlertTriangle className="mx-auto mb-3" size={30} />
                <p className="text-sm">لا نقاط في مسار هذه الرحلة</p>
              </div>
            </Card>
          ) : (
            <>
              {/* ملخّص الرحلة — من الخادم لا محسوباً هنا */}
              {summary && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Card><div>
                    <p className="text-xl font-extrabold text-slate-900">{summary.total_km}</p>
                    <p className="text-[11px] text-slate-500">كم مقطوعة</p>
                  </div></Card>
                  <Card><div>
                    <p className="text-xl font-extrabold text-slate-900">{summary.duration_min}</p>
                    <p className="text-[11px] text-slate-500">دقيقة</p>
                  </div></Card>
                  <Card><div>
                    <p className="text-xl font-extrabold text-slate-900">{summary.max_speed_kmh}</p>
                    <p className="text-[11px] text-slate-500">أقصى سرعة كم/س</p>
                  </div></Card>
                  <Card><div>
                    <p className="text-xl font-extrabold text-slate-900">{summary.stop_count}</p>
                    <p className="text-[11px] text-slate-500">توقف مرصود</p>
                  </div></Card>
                </div>
              )}

              <Card padding="none">
                <div className="p-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
                  <h3 className="font-bold text-slate-900 flex items-center gap-2">
                    <Route size={17} className="text-indigo-600" />
                    مسار {selected?.dispatch_code}
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    النقطة {cursor + 1} من {track.length}
                  </span>
                </div>

                <div className="p-4">
                  <MovementMap points={mapPoints} connect height={430} />

                  {/* شريط التحكم */}
                  <div className="mt-4 space-y-3">
                    <input
                      type="range"
                      min={0}
                      max={Math.max(track.length - 1, 0)}
                      value={cursor}
                      onChange={(e) => { setPlaying(false); setCursor(Number(e.target.value)); }}
                      className="w-full accent-indigo-600"
                      aria-label="موضع إعادة التشغيل"
                    />

                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => { setPlaying(false); setCursor(0); }}
                          className="p-2 rounded-lg border hover:bg-slate-50 text-slate-600"
                          aria-label="إلى البداية"
                        >
                          <SkipBack size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            // من النهاية: التشغيل يبدأ من الأول لا يعلق
                            if (cursor >= track.length - 1) setCursor(0);
                            setPlaying((v) => !v);
                          }}
                          className="p-2.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
                          aria-label={playing ? 'إيقاف مؤقت' : 'تشغيل'}
                        >
                          {playing ? <Pause size={16} /> : <Play size={16} />}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setPlaying(false); setCursor(track.length - 1); }}
                          className="p-2 rounded-lg border hover:bg-slate-50 text-slate-600"
                          aria-label="إلى النهاية"
                        >
                          <SkipForward size={16} />
                        </button>

                        <div className="flex items-center gap-1 mr-2">
                          {SPEEDS.map((s) => (
                            <button
                              key={s}
                              type="button"
                              onClick={() => setSpeed(s)}
                              className={`px-2 py-1 rounded-lg text-[11px] font-bold border ${
                                speed === s
                                  ? 'bg-indigo-600 text-white border-indigo-600'
                                  : 'text-slate-600 hover:bg-slate-50'
                              }`}
                            >
                              ×{s}
                            </button>
                          ))}
                        </div>
                      </div>

                      {current && (
                        <div className="flex items-center gap-4 text-xs text-slate-600">
                          <span className="inline-flex items-center gap-1">
                            <Clock size={13} />
                            {new Date(current.recorded_at).toLocaleTimeString('ar-IQ')}
                          </span>
                          <span className="inline-flex items-center gap-1 font-mono">
                            <Gauge size={13} />
                            {Number(current.speed_kmh).toFixed(0)} كم/س
                          </span>
                          <span className="font-mono font-bold text-indigo-700">
                            {Number(current.cumulative_km).toFixed(2)} كم
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 flex items-center gap-4 text-[11px] text-slate-500 flex-wrap">
                    <span className="inline-flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block" /> الانطلاق
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-600 inline-block" /> توقف
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-600 inline-block" /> الموضع الحالي
                    </span>
                    <span className="mr-auto">خرائط © مساهمو OpenStreetMap</span>
                  </div>
                </div>
              </Card>

              {longGaps.length > 0 && (
                <Card>
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="text-amber-600" size={17} />
                    <h3 className="font-bold text-slate-900">
                      انقطاعات إشارة ({longGaps.length})
                    </h3>
                  </div>
                  <p className="text-[11px] text-slate-500 mb-3">
                    الخط المرسوم عبر فجوة طويلة <strong>تقدير</strong> لا مسار مُسجَّل —
                    المركبة قد تكون سلكت طريقاً آخر تماماً خلال الانقطاع.
                  </p>
                  <div className="space-y-1.5">
                    {longGaps.slice(0, 8).map((g) => (
                      <div
                        key={g.telemetry_id}
                        className="flex items-center justify-between text-xs p-2.5 rounded-lg bg-amber-50 border border-amber-100"
                      >
                        <span>عند النقطة {g.seq}</span>
                        <span className="font-bold text-amber-800">
                          انقطاع {g.gap_minutes} دقيقة
                        </span>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
