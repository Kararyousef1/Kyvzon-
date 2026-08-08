/**
 * D01 — تطبيق السائق: رحلاتي
 *
 * لماذا شاشة منفصلة عن لوحة المُرسِل:
 *   السائق يستعملها على هاتف، بيد واحدة، أحياناً والمحرك يعمل.
 *   لوحة المُرسِل مصمَّمة لشاشة مكتبية بجداول عريضة. فرضها على السائق
 *   يجعل التطبيق غير قابل للاستعمال عملياً.
 *
 * قرارات تصميم مقصودة:
 *   • بطاقات لا جداول — الجدول على شاشة 5 بوصات يتطلب تمريراً أفقياً.
 *   • أزرار كبيرة (min-height 52px) — يد مرتجفة أو قفاز شتوي.
 *   • حالة الاتصال ظاهرة دائماً — السائق يحتاج معرفة أن نقاطه مُخزَّنة
 *     لا ضائعة.
 *   • لا تأكيد بـ confirm() — ممنوع في المشروع، ولا يعمل جيداً على
 *     الهاتف. البديل: لوحة تأكيد داخل الصفحة.
 *
 * تتبع الموقع:
 *   watchPosition لا getCurrentPosition المتكرر — الأخير يُعيد تشغيل
 *   GPS كل مرة ويستنزف البطارية أسرع بكثير.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, ClipboardCheck, Clock, Coffee, Loader2,
  MapPin, Navigation, Package, PlayCircle, RefreshCw, Timer, Truck,
  Upload, WifiOff,
} from 'lucide-react';
import { useUIStore } from '../../../../core/stores';
import { getErrorMessage } from '../../../../services/errors';
import {
  driverAppService,
  DRIVER_DUTY_LABELS,
  TRIP_STATUS_LABELS,
  type DriverSummary,
  type DriverTrip,
  type DutyStatus,
  type MyHosSummary,
} from '../../../../services/sdk/DriverAppService';
import Card from '../../../../shared/components/ui/Card';
import Button from '../../../../shared/components/ui/Button';

/** كل 20 ثانية: توازن بين دقة التتبع وعمر البطارية */
const PING_INTERVAL_MS = 20_000;

const STATUS_TONE: Record<string, string> = {
  dispatched: 'bg-slate-100 text-slate-700',
  en_route: 'bg-emerald-50 text-emerald-700',
  arrived: 'bg-amber-50 text-amber-700',
  completed: 'bg-blue-50 text-blue-700',
  failed: 'bg-rose-50 text-rose-700',
};

export default function DriverTripsPage() {
  const { addToast } = useUIStore();

  const [loading, setLoading] = useState(true);
  const [notDriver, setNotDriver] = useState(false);
  const [trips, setTrips] = useState<DriverTrip[]>([]);
  const [summary, setSummary] = useState<DriverSummary | null>(null);
  /* ساعات القيادة (0297) — السائق يرى رصيده لحظياً */
  const [hos, setHos] = useState<MyHosSummary | null>(null);
  const [hosBusy, setHosBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // التتبع
  const [trackingId, setTrackingId] = useState<string | null>(null);
  const [online, setOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  const [queued, setQueued] = useState(0);
  const [flushing, setFlushing] = useState(false);
  const watchRef = useRef<number | null>(null);
  const lastSentRef = useRef<number>(0);

  /* تأكيد داخل الصفحة بدل confirm() الممنوع */
  const [confirmTarget, setConfirmTarget] = useState<{
    trip: DriverTrip; next: 'en_route' | 'arrived' | 'completed';
  } | null>(null);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const isDrv = await driverAppService.isDriver();
      if (!isDrv) { setNotDriver(true); return; }
      setNotDriver(false);
      const [t, s, h] = await Promise.all([
        driverAppService.findMyTrips(showHistory),
        driverAppService.getMySummary(),
        driverAppService.getMyHosSummary().catch(() => null),
      ]);
      setTrips(t);
      setSummary(s);
      setHos(h);
    } catch (err) {
      if (!silent) addToast(getErrorMessage(err), 'error');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [addToast, showHistory]);

  useEffect(() => { void loadData(); }, [loadData]);
  useEffect(() => { setQueued(driverAppService.queuedCount()); }, []);

  /* مراقبة الاتصال — الرفع التلقائي عند العودة */
  useEffect(() => {
    const goOnline = () => { setOnline(true); void flush(); };
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flush = useCallback(async () => {
    if (driverAppService.queuedCount() === 0) return;
    setFlushing(true);
    try {
      const res = await driverAppService.flushQueue();
      setQueued(driverAppService.queuedCount());
      if (res.accepted > 0) {
        addToast(
          `رُفعت ${res.accepted} نقطة${res.rejected > 0 ? ` · ${res.rejected} مرفوضة` : ''}`,
          'success',
        );
      }
      if (res.failedDispatches.length > 0) {
        addToast('تعذّر رفع بعض النقاط — محفوظة للمحاولة التالية', 'error');
      }
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setFlushing(false);
    }
  }, [addToast]);

  /* تشغيل/إيقاف تتبع الموقع */
  const stopTracking = useCallback(() => {
    if (watchRef.current !== null) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
    setTrackingId(null);
  }, []);

  const startTracking = useCallback((dispatchId: string) => {
    if (!('geolocation' in navigator)) {
      addToast('جهازك لا يدعم تحديد الموقع', 'error');
      return;
    }
    stopTracking();
    lastSentRef.current = 0;

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        // watchPosition يُطلق عند كل تغيّر — نُخفّض المعدّل يدوياً
        const now = Date.now();
        if (now - lastSentRef.current < PING_INTERVAL_MS) return;
        lastSentRef.current = now;

        const point = {
          lat: Number(pos.coords.latitude.toFixed(7)),
          lng: Number(pos.coords.longitude.toFixed(7)),
          // speed بالمتر/ثانية ⇒ كم/س. null على أجهزة كثيرة.
          speed: pos.coords.speed !== null && pos.coords.speed >= 0
            ? Math.min(Math.round(pos.coords.speed * 3.6), 300) : 0,
          heading: pos.coords.heading !== null && !Number.isNaN(pos.coords.heading)
            ? Math.round(pos.coords.heading) : 0,
          at: new Date().toISOString(),
        };

        if (!navigator.onLine) {
          setQueued(driverAppService.queuePoint(dispatchId, point));
          return;
        }
        void driverAppService
          .recordPosition({
            dispatchId,
            latitude: point.lat,
            longitude: point.lng,
            speedKmh: point.speed,
            heading: point.heading,
          })
          .catch(() => {
            // فشل الشبكة رغم onLine — لا نفقد النقطة
            setQueued(driverAppService.queuePoint(dispatchId, point));
          });
      },
      (err) => {
        addToast(
          err.code === err.PERMISSION_DENIED
            ? 'رُفض إذن الموقع — فعّله من إعدادات المتصفح'
            : 'تعذّر تحديد الموقع',
          'error',
        );
        stopTracking();
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 },
    );

    watchRef.current = id;
    setTrackingId(dispatchId);
    addToast('بدأ تتبع الموقع', 'success');
  }, [addToast, stopTracking]);

  // إيقاف المراقبة عند مغادرة الصفحة — وإلا استمر GPS يستنزف البطارية
  useEffect(() => () => {
    if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
  }, []);

  /* تبديل حالة الخدمة — الراحة مسموحة دائماً، القيادة قد تُرفض */
  const switchDuty = async (status: DutyStatus) => {
    setHosBusy(true);
    try {
      const res = await driverAppService.startMyDutyPeriod({ dutyStatus: status });
      addToast(
        res.warning === 'HOS_APPROACHING_LIMIT'
          ? `${DRIVER_DUTY_LABELS[status]} — تبقّى ${res.minutesLeft} دقيقة قيادة`
          : DRIVER_DUTY_LABELS[status],
        res.warning ? 'error' : 'success',
      );
      await loadData(true);
      setHos(await driverAppService.getMyHosSummary().catch(() => null));
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally { setHosBusy(false); }
  };

  const applyStatus = async () => {
    if (!confirmTarget) return;
    const { trip, next } = confirmTarget;
    setBusyId(trip.dispatch_id);
    try {
      await driverAppService.updateTripStatus(trip.dispatch_id, next);
      addToast(`الحالة الآن: ${TRIP_STATUS_LABELS[next]}`, 'success');
      setConfirmTarget(null);
      if (next === 'completed') stopTracking();
      await loadData(true);
      setTrips(await driverAppService.findMyTrips(showHistory));
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setBusyId(null);
    }
  };

  /* ── حالات خاصة ── */

  if (loading) {
    return (
      <div className="py-24 flex items-center justify-center" dir="rtl">
        <Loader2 className="animate-spin text-slate-400" size={32} />
      </div>
    );
  }

  if (notDriver) {
    return (
      <div className="p-4" dir="rtl">
        <Card>
          <div className="py-16 text-center">
            <Truck className="mx-auto mb-3 text-slate-300" size={40} />
            <h2 className="font-bold text-slate-800 text-lg">حسابك غير مرتبط بسائق</h2>
            <p className="text-sm text-slate-500 mt-2 max-w-sm mx-auto">
              تطبيق السائق متاح للحسابات المرتبطة بسجل سائق في الأسطول.
              راجع مسؤول اللوجستيات لربط حسابك من صفحة السائقين.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24 animate-fade-in" dir="rtl">
      {/* رأس مضغوط — مساحة الشاشة ثمينة على الهاتف */}
      <div className="bg-gradient-to-br from-slate-900 to-indigo-800 rounded-2xl p-5 text-white">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-white/60 text-xs font-semibold">Driver App • D01</p>
            <h2 className="text-xl font-extrabold mt-0.5">
              {summary?.driver_name_ar ?? 'رحلاتي'}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => void loadData()}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20"
            aria-label="تحديث"
          >
            <RefreshCw size={18} />
          </button>
        </div>

        {summary && (
          <div className="grid grid-cols-3 gap-2 mt-4">
            <div className="bg-white/10 rounded-xl p-2.5 text-center">
              <p className="text-lg font-extrabold">{summary.active_trips}</p>
              <p className="text-[10px] text-white/70">نشطة</p>
            </div>
            <div className="bg-white/10 rounded-xl p-2.5 text-center">
              <p className="text-lg font-extrabold">{summary.completed_today}</p>
              <p className="text-[10px] text-white/70">اليوم</p>
            </div>
            <div className="bg-white/10 rounded-xl p-2.5 text-center">
              <p className="text-lg font-extrabold">{Number(summary.km_today).toFixed(0)}</p>
              <p className="text-[10px] text-white/70">كم</p>
            </div>
          </div>
        )}

        {/* تنبيه الرخصة — السائق أولى الناس بمعرفته */}
        {summary && summary.license_days_left <= 30 && (
          <div className="mt-3 bg-amber-400/20 border border-amber-300/40 rounded-xl p-2.5 flex items-center gap-2">
            <AlertTriangle size={15} className="text-amber-200 shrink-0" />
            <p className="text-xs text-amber-50">
              {summary.license_days_left < 0
                ? `رخصتك منتهية منذ ${Math.abs(summary.license_days_left)} يوم`
                : `رخصتك تنتهي خلال ${summary.license_days_left} يوم`}
            </p>
          </div>
        )}
      </div>

      {/* شريط الاتصال — دائم الظهور */}
      <div
        className={`rounded-xl p-3 flex items-center justify-between gap-2 text-sm ${
          online ? 'bg-emerald-50 border border-emerald-100' : 'bg-amber-50 border border-amber-200'
        }`}
      >
        <span className="flex items-center gap-2 font-bold">
          {online ? (
            <><span className="w-2 h-2 rounded-full bg-emerald-500" /> متصل</>
          ) : (
            <><WifiOff size={15} className="text-amber-600" /> دون اتصال</>
          )}
        </span>
        {queued > 0 && (
          <button
            type="button"
            onClick={() => void flush()}
            disabled={!online || flushing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border text-xs font-bold disabled:opacity-50"
          >
            {flushing ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            رفع {queued} نقطة
          </button>
        )}
      </div>

      {!online && (
        <p className="text-[11px] text-slate-500 px-1">
          نقاط الموقع تُحفظ على جهازك وتُرفع تلقائياً عند عودة الشبكة.
        </p>
      )}

      {/* ساعات القيادة (0297) — الرصيد المتبقّي لا الإجمالي وحده */}
      {hos && (
        <Card>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
              <Timer size={16} /> ساعات القيادة
            </h3>
            {hos.open_period_status && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-bold">
                {DRIVER_DUTY_LABELS[hos.open_period_status]} ·{' '}
                {Math.floor(hos.open_period_minutes / 60)}:
                {String(hos.open_period_minutes % 60).padStart(2, '0')}
              </span>
            )}
          </div>

          {/* شريط تقدّم: الأحمر يعني توقّف إجباري */}
          <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                hos.driving_limit_exceeded ? 'bg-rose-500'
                  : hos.driving_minutes_today >= 600 ? 'bg-amber-500'
                  : 'bg-emerald-500'}`}
              style={{ width: `${Math.min(100, (hos.driving_minutes_today / 660) * 100)}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-1.5 text-[11px]">
            <span className="text-slate-500">
              {Math.floor(hos.driving_minutes_today / 60)}:
              {String(hos.driving_minutes_today % 60).padStart(2, '0')} من 11:00
            </span>
            <span className={`font-bold ${
              hos.driving_limit_exceeded ? 'text-rose-700' : 'text-slate-700'}`}>
              {hos.driving_limit_exceeded
                ? 'تجاوزت الحد — لا يمكنك القيادة'
                : `تبقّى ${Math.floor(hos.driving_minutes_left / 60)}:${
                    String(hos.driving_minutes_left % 60).padStart(2, '0')}`}
            </span>
          </div>

          {(hos.driving_limit_exceeded || hos.duty_limit_exceeded || hos.cycle_limit_exceeded) && (
            <div className="mt-2.5 bg-rose-50 border border-rose-200 rounded-xl p-2.5">
              <p className="text-xs font-bold text-rose-800 flex items-center gap-1.5">
                <AlertTriangle size={13} />
                {hos.driving_limit_exceeded ? 'تجاوزت 11 ساعة قيادة'
                  : hos.duty_limit_exceeded ? 'تجاوزت 14 ساعة عمل'
                  : 'تجاوزت 70 ساعة في 8 أيام'}
              </p>
              <p className="text-[11px] text-rose-700 mt-0.5">
                لا يمكنك بدء رحلة جديدة. سجّل راحة.
              </p>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 mt-3">
            <button
              type="button"
              disabled={hosBusy}
              onClick={() => void switchDuty('off_duty')}
              className="min-h-[44px] rounded-xl border-2 border-slate-200 text-xs font-bold text-slate-600 disabled:opacity-50"
            >
              خارج الخدمة
            </button>
            <button
              type="button"
              disabled={hosBusy}
              onClick={() => void switchDuty('sleeper')}
              className="min-h-[44px] rounded-xl border-2 border-indigo-200 bg-indigo-50 text-xs font-bold text-indigo-700 disabled:opacity-50"
            >
              <Coffee size={13} className="inline ml-1" />راحة
            </button>
            <button
              type="button"
              disabled={hosBusy}
              onClick={() => void switchDuty('on_duty')}
              className="min-h-[44px] rounded-xl border-2 border-slate-200 text-xs font-bold text-slate-600 disabled:opacity-50"
            >
              على رأس العمل
            </button>
          </div>
          <p className="text-[10px] text-slate-400 mt-2 text-center">
            القيادة تُسجَّل تلقائياً عند بدء الرحلة وتُغلق عند الوصول.
          </p>
        </Card>
      )}

      <div className="flex items-center justify-between px-1">
        <h3 className="font-bold text-slate-900">
          {showHistory ? 'كل الرحلات' : 'الرحلات النشطة'}
        </h3>
        <button
          type="button"
          onClick={() => setShowHistory((v) => !v)}
          className="text-xs font-bold text-indigo-600"
        >
          {showHistory ? 'النشطة فقط' : 'عرض السجل'}
        </button>
      </div>

      {trips.length === 0 ? (
        <Card>
          <div className="py-14 text-center text-slate-400">
            <Package className="mx-auto mb-2" size={30} />
            <p className="text-sm font-bold text-slate-500">
              {showHistory ? 'لا رحلات في السجل' : 'لا رحلات نشطة'}
            </p>
            <p className="text-xs mt-1">ستظهر الرحلة هنا فور إسنادها إليك.</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {trips.map((t) => {
            const isTracking = trackingId === t.dispatch_id;
            const isBusy = busyId === t.dispatch_id;
            const closed = t.status === 'completed' || t.status === 'failed';

            return (
              <Card key={t.dispatch_id} padding="none">
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono font-bold text-indigo-600 text-sm">
                        {t.dispatch_code}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {t.vehicle_code ?? '—'}
                        {t.plate_number ? ` · ${t.plate_number}` : ''}
                      </p>
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap ${
                        STATUS_TONE[t.status] ?? 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {TRIP_STATUS_LABELS[t.status] ?? t.status}
                    </span>
                  </div>

                  <div className="mt-3 space-y-1.5 text-sm">
                    <div className="flex items-start gap-2">
                      <MapPin size={14} className="text-emerald-600 mt-0.5 shrink-0" />
                      <span className="text-slate-700">{t.origin_address ?? '—'}</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <Navigation size={14} className="text-rose-600 mt-0.5 shrink-0" />
                      <span className="text-slate-700 font-bold">
                        {t.destination_address ?? '—'}
                      </span>
                    </div>
                  </div>

                  {t.cargo_description && (
                    <p className="mt-2 text-xs text-slate-500">
                      {t.cargo_description}
                      {t.cargo_weight_kg ? ` · ${Number(t.cargo_weight_kg).toFixed(0)} كغ` : ''}
                    </p>
                  )}

                  {t.estimated_arrival && !closed && (
                    <p className="mt-2 text-[11px] text-slate-400 flex items-center gap-1">
                      <Clock size={12} />
                      الوصول المتوقع {new Date(t.estimated_arrival).toLocaleString('ar-IQ')}
                    </p>
                  )}

                  {/* الأزرار — كبيرة لأنها تُضغط أثناء العمل الميداني */}
                  {!closed && (
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      {t.status === 'dispatched' && (
                        <Button
                          onClick={() => setConfirmTarget({ trip: t, next: 'en_route' })}
                          loading={isBusy}
                          className="col-span-2 !min-h-[52px] !text-base"
                          icon={<PlayCircle size={18} />}
                          iconPosition="left"
                        >
                          بدء الرحلة
                        </Button>
                      )}

                      {t.status === 'en_route' && (
                        <Button
                          onClick={() => setConfirmTarget({ trip: t, next: 'arrived' })}
                          loading={isBusy}
                          className="col-span-2 !min-h-[52px] !text-base"
                          icon={<MapPin size={18} />}
                          iconPosition="left"
                        >
                          وصلت الوجهة
                        </Button>
                      )}

                      {t.status === 'arrived' && (
                        <>
                          <a
                            href={`/app/movement/driver/delivery/${t.dispatch_id}`}
                            className="col-span-2 min-h-[52px] rounded-xl bg-emerald-600 text-white
                                       font-bold flex items-center justify-center gap-2 hover:bg-emerald-700"
                          >
                            <CheckCircle2 size={18} />
                            {t.has_epod ? 'عرض إثبات التسليم' : 'تسجيل التسليم'}
                          </a>
                          {t.has_epod && (
                            <Button
                              onClick={() => setConfirmTarget({ trip: t, next: 'completed' })}
                              loading={isBusy}
                              className="col-span-2 !min-h-[52px] !text-base"
                            >
                              إنهاء الرحلة
                            </Button>
                          )}
                        </>
                      )}

                      <a
                        href={`/app/movement/driver/inspection/${t.dispatch_id}`}
                        className="col-span-2 min-h-[48px] rounded-xl border-2 border-amber-200
                                   bg-amber-50 text-amber-800 font-bold text-sm
                                   flex items-center justify-center gap-2 hover:bg-amber-100"
                      >
                        <ClipboardCheck size={16} /> فحص المركبة
                      </a>

                      {(t.status === 'en_route' || t.status === 'arrived') && (
                        <button
                          type="button"
                          onClick={() =>
                            isTracking ? stopTracking() : startTracking(t.dispatch_id)}
                          className={`col-span-2 min-h-[48px] rounded-xl font-bold text-sm border-2 ${
                            isTracking
                              ? 'border-rose-300 bg-rose-50 text-rose-700'
                              : 'border-indigo-200 bg-indigo-50 text-indigo-700'
                          }`}
                        >
                          {isTracking ? '■ إيقاف مشاركة الموقع' : '▶ مشاركة موقعي'}
                        </button>
                      )}
                    </div>
                  )}

                  {isTracking && (
                    <p className="mt-2 text-[11px] text-emerald-700 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      يُرسَل موقعك كل {PING_INTERVAL_MS / 1000} ثانية أثناء فتح هذه الصفحة
                    </p>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* لوحة التأكيد — بديل confirm() الممنوع */}
      {confirmTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm" dir="rtl">
            <h3 className="font-bold text-lg">تأكيد</h3>
            <p className="text-sm text-slate-600 mt-2">
              {confirmTarget.next === 'en_route' && 'سيُسجَّل انطلاقك ويُبلَّغ المُرسِل.'}
              {confirmTarget.next === 'arrived' && 'سيُسجَّل وصولك بوقت الآن.'}
              {confirmTarget.next === 'completed' && 'سيُغلق أمر الشحن وتُحرَّر المركبة.'}
            </p>
            <p className="text-xs text-slate-400 mt-2">
              الرحلة {confirmTarget.trip.dispatch_code}
            </p>
            <div className="flex gap-2 mt-5">
              <Button
                onClick={() => void applyStatus()}
                loading={busyId !== null}
                className="flex-1 !min-h-[48px]"
              >
                تأكيد
              </Button>
              <Button
                variant="secondary"
                onClick={() => setConfirmTarget(null)}
                className="flex-1 !min-h-[48px]"
              >
                إلغاء
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
