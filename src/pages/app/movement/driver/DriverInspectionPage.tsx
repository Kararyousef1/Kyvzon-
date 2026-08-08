/**
 * D03 — تطبيق السائق: فحص المركبة (DVIR)
 *
 * لماذا السائق هو من يفحص:
 *   DVIR **معناه** أن من يقود المركبة هو من يوثّق حالتها قبل الانطلاق.
 *   سجلٌّ يملؤه موظف مكتبي بعد ساعات ليس توثيقاً بل ورقة شكلية بلا
 *   قيمة قانونية. 0296 بنى المنطق بدور logistics فقط — و 0297 أتاحه
 *   للسائق على مركبة رحلته وحدها.
 *
 * ما لا يستطيعه السائق عمداً:
 *   لا يرفع إيقاف مركبته بعد الإبلاغ عن عيب حرج — تضارب مصالح صريح.
 *   الشاشة تُفصح بذلك بدل ترك السائق يبحث عن زر غير موجود.
 *
 * العمل دون اتصال (0298):
 *   المرآب وساحة التحميل أماكن تغطيتها ضعيفة بطبيعتها. الفحص يُحفظ
 *   محلياً ويُرفع عند عودة الشبكة **بوقت تنفيذه الأصلي** لا وقت الرفع
 *   — وإلا انهار التسلسل الزمني وبطلت قيمة السجل كدليل.
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle, ArrowRight, CheckCircle2, ClipboardCheck, Loader2,
  Truck, Upload, WifiOff,
} from 'lucide-react';
import { useUIStore } from '../../../../core/stores';
import { getErrorMessage } from '../../../../services/errors';
import {
  driverAppService,
  type DefectSeverity,
  type DriverInspectionRow,
  type DriverTrip,
  type InspectionType,
} from '../../../../services/sdk/DriverAppService';
import { DVIR_CHECKLIST } from '../../../../services/sdk/MovementSafetyComplianceService';
import Card from '../../../../shared/components/ui/Card';
import Button from '../../../../shared/components/ui/Button';

const TYPE_LABELS: Record<InspectionType, string> = {
  pre_trip: 'قبل الرحلة',
  post_trip: 'بعد الرحلة',
  periodic: 'دوري',
};

const SEV_SHORT: Record<DefectSeverity, string> = {
  minor: 'بسيط',
  major: 'جوهري',
  critical: 'حرج',
};

export default function DriverInspectionPage() {
  const { dispatchId } = useParams<{ dispatchId: string }>();
  const navigate = useNavigate();
  const { addToast } = useUIStore();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [trip, setTrip] = useState<DriverTrip | null>(null);
  const [history, setHistory] = useState<DriverInspectionRow[]>([]);

  const [type, setType] = useState<InspectionType>('pre_trip');
  const [odometer, setOdometer] = useState('');
  const [signature, setSignature] = useState('');
  /* الافتراضي: كل بند سليم — الفاحص يُعلّم الاستثناء فقط */
  const [defects, setDefects] = useState<Record<string, DefectSeverity | null>>({});
  const [confirmCritical, setConfirmCritical] = useState(false);
  const [online, setOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  const [pending, setPending] = useState(0);

  const load = useCallback(async () => {
    if (!dispatchId) return;
    setLoading(true);
    try {
      const [all, insp] = await Promise.all([
        driverAppService.findMyTrips(true),
        driverAppService.findMyInspections(dispatchId).catch(() => []),
      ]);
      setTrip(all.find((t) => t.dispatch_id === dispatchId) ?? null);
      setHistory(insp);
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [dispatchId, addToast]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPending(driverAppService.queuedOperationsCount()); }, []);

  /* الرفع التلقائي عند عودة الشبكة */
  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      void driverAppService.syncOperations()
        .then((r) => {
          setPending(driverAppService.queuedOperationsCount());
          if (r.applied > 0) {
            addToast(`رُفعت ${r.applied} عملية مؤجَّلة`, 'success');
            void load();
          }
          if (r.failed > 0) {
            addToast(`تعذّر رفع ${r.failed} عملية`, 'error');
          }
        })
        .catch(() => { /* الطابور محفوظ — محاولة تالية */ });
    };
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [addToast, load]);

  const hasCritical = Object.values(defects).includes('critical');

  const submit = async () => {
    if (!dispatchId) return;
    if (hasCritical && !confirmCritical) {
      setConfirmCritical(true);
      return;
    }
    setSaving(true);
    try {
      const list = Object.entries(defects)
        .filter(([, sev]) => sev !== null)
        .map(([code, sev]) => ({
          code,
          severity: sev as DefectSeverity,
          note: DVIR_CHECKLIST.find((c) => c.code === code)?.label,
        }));

      /*
        معرّف ثابت + وقت التنفيذ: يُستعملان سواء رُفع الفحص الآن أو
        بعد ساعات. الخادم يرفض التكرار ويحترم الوقت الأصلي.
      */
      const clientUuid = driverAppService.newOperationId();
      const performedAt = new Date().toISOString();

      if (!navigator.onLine) {
        driverAppService.queueOperation({
          client_uuid: clientUuid,
          operation_type: 'inspection',
          dispatch_id: dispatchId,
          performed_at: performedAt,
          inspection_type: type,
          defects: list,
          odometer_km: odometer === '' ? null : Number(odometer),
          signature_name: signature || null,
        });
        setPending(driverAppService.queuedOperationsCount());
        addToast(
          hasCritical
            ? 'حُفظ العيب الحرج محلياً — سيُرفع عند عودة الشبكة'
            : 'حُفظ الفحص محلياً — سيُرفع عند عودة الشبكة',
          'success',
        );
        setConfirmCritical(false);
        setDefects({});
        return;
      }

      const res = await driverAppService.recordMyInspection({
        dispatchId,
        inspectionType: type,
        defects: list,
        odometerKm: odometer === '' ? null : Number(odometer),
        signatureName: signature || null,
        clientUuid,
        performedAt,
      });

      addToast(
        res.has_critical
          ? 'سُجِّل عيب حرج — أُبلِغ المُرسِل'
          : 'سُجِّل الفحص',
        res.has_critical ? 'error' : 'success',
      );
      setConfirmCritical(false);
      setDefects({});
      await load();
    } catch (err) {
      /* فشل الشبكة رغم onLine: نحفظ محلياً بدل ضياع العمل */
      const clientUuid = driverAppService.newOperationId();
      driverAppService.queueOperation({
        client_uuid: clientUuid,
        operation_type: 'inspection',
        dispatch_id: dispatchId,
        performed_at: new Date().toISOString(),
        inspection_type: type,
        defects: Object.entries(defects)
          .filter(([, sev]) => sev !== null)
          .map(([code, sev]) => ({ code, severity: sev as DefectSeverity })),
        odometer_km: odometer === '' ? null : Number(odometer),
        signature_name: signature || null,
      });
      setPending(driverAppService.queuedOperationsCount());
      addToast(`${getErrorMessage(err)} — حُفظ محلياً للرفع لاحقاً`, 'error');
      setConfirmCritical(false);
    } finally { setSaving(false); }
  };

  if (loading) {
    return (
      <div className="py-24 flex items-center justify-center" dir="rtl">
        <Loader2 className="animate-spin text-slate-400" size={32} />
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="p-4" dir="rtl">
        <Card>
          <div className="py-16 text-center text-slate-400">
            <Truck className="mx-auto mb-2" size={32} />
            <p className="text-sm font-bold text-slate-600">الرحلة غير موجودة</p>
            <p className="text-xs mt-1">قد تكون غير مُسنَدة إليك.</p>
            <Button onClick={() => navigate('/app/movement/driver/trips')} className="mt-4">
              العودة لرحلاتي
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-28 animate-fade-in" dir="rtl">
      <div className="bg-gradient-to-br from-amber-700 to-slate-900 rounded-2xl p-5 text-white">
        <button
          type="button"
          onClick={() => navigate('/app/movement/driver/trips')}
          className="text-white/70 text-xs flex items-center gap-1 mb-2"
        >
          <ArrowRight size={14} /> رحلاتي
        </button>
        <p className="text-white/60 text-xs font-semibold">Driver App • D03</p>
        <h2 className="text-xl font-extrabold mt-0.5 flex items-center gap-2">
          <ClipboardCheck /> فحص المركبة
        </h2>
        <p className="text-white/75 text-sm mt-1">
          {trip.vehicle_code ?? '—'}
          {trip.plate_number ? ` · ${trip.plate_number}` : ''}
        </p>
      </div>

      {(!online || pending > 0) && (
        <div className={`rounded-xl p-3 flex items-center justify-between gap-2 text-sm ${
          online ? 'bg-emerald-50 border border-emerald-100'
                 : 'bg-amber-50 border border-amber-200'}`}>
          <span className="flex items-center gap-2 font-bold">
            {online ? (
              <><span className="w-2 h-2 rounded-full bg-emerald-500" /> متصل</>
            ) : (
              <><WifiOff size={15} className="text-amber-600" /> دون اتصال</>
            )}
          </span>
          {pending > 0 && (
            <button
              type="button"
              disabled={!online}
              onClick={() => void driverAppService.syncOperations().then((r) => {
                setPending(driverAppService.queuedOperationsCount());
                addToast(
                  r.applied > 0 ? `رُفعت ${r.applied} عملية` : 'لا جديد',
                  r.failed > 0 ? 'error' : 'success',
                );
                void load();
              }).catch((e) => addToast(getErrorMessage(e), 'error'))}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border text-xs font-bold disabled:opacity-50"
            >
              <Upload size={13} /> رفع {pending} عملية
            </button>
          )}
        </div>
      )}

      {!online && (
        <p className="text-[11px] text-slate-500 px-1">
          الفحص يُحفظ على جهازك بوقته الأصلي ويُرفع تلقائياً عند عودة الشبكة.
        </p>
      )}

      <Card>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-bold text-slate-600">نوع الفحص</label>
            <div className="grid grid-cols-3 gap-2 mt-1.5">
              {(Object.keys(TYPE_LABELS) as InspectionType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`min-h-[48px] rounded-xl border-2 text-sm font-bold ${
                    type === t
                      ? 'border-amber-500 bg-amber-50 text-amber-800'
                      : 'border-slate-200 text-slate-600'}`}
                >
                  {TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-600">قراءة العداد</label>
              <input
                type="number"
                inputMode="numeric"
                value={odometer}
                onChange={(e) => setOdometer(e.target.value)}
                className="w-full border rounded-xl p-3 text-sm mt-1 min-h-[48px]"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600">اسمك</label>
              <input
                value={signature}
                onChange={(e) => setSignature(e.target.value)}
                className="w-full border rounded-xl p-3 text-sm mt-1 min-h-[48px]"
              />
            </div>
          </div>
        </div>
      </Card>

      <Card padding="none">
        <div className="p-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-900 text-sm">بنود الفحص</h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            البند بلا تحديد يُعدّ سليماً. العيب الحرج يوقف المركبة.
          </p>
        </div>
        <div className="divide-y">
          {DVIR_CHECKLIST.map((item) => (
            <div key={item.code} className="p-3">
              <p className="text-sm font-bold text-slate-700 mb-2">{item.label}</p>
              <div className="grid grid-cols-4 gap-1.5">
                <button
                  type="button"
                  onClick={() => setDefects((d) => ({ ...d, [item.code]: null }))}
                  className={`min-h-[44px] rounded-lg text-xs font-bold border-2 ${
                    !defects[item.code]
                      ? 'bg-emerald-50 border-emerald-400 text-emerald-700'
                      : 'border-slate-200 text-slate-500'}`}
                >
                  سليم
                </button>
                {(['minor', 'major', 'critical'] as DefectSeverity[]).map((sev) => (
                  <button
                    key={sev}
                    type="button"
                    onClick={() => setDefects((d) => ({ ...d, [item.code]: sev }))}
                    className={`min-h-[44px] rounded-lg text-xs font-bold border-2 ${
                      defects[item.code] === sev
                        ? sev === 'critical'
                          ? 'bg-rose-600 text-white border-rose-600'
                          : sev === 'major'
                            ? 'bg-amber-500 text-white border-amber-500'
                            : 'bg-slate-500 text-white border-slate-500'
                        : 'border-slate-200 text-slate-500'}`}
                  >
                    {SEV_SHORT[sev]}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {hasCritical && (
        <div className="bg-rose-50 border-2 border-rose-300 rounded-2xl p-4">
          <p className="font-bold text-rose-800 flex items-center gap-2">
            <AlertTriangle size={18} /> عيب حرج
          </p>
          <p className="text-sm text-rose-700 mt-1.5">
            حفظ هذا الفحص <strong>يوقف المركبة فوراً</strong> ويمنع إسنادها لأي
            رحلة جديدة. سيُبلَّغ المُرسِل.
          </p>
          <p className="text-xs text-rose-600 mt-2">
            لا تستطيع رفع الإيقاف بنفسك — يعتمده مسؤول اللوجستيات بعد الإصلاح.
          </p>
        </div>
      )}

      {history.length > 0 && (
        <Card padding="none">
          <div className="p-4 border-b border-slate-100">
            <h3 className="font-bold text-slate-900 text-sm">فحوصات هذه الرحلة</h3>
          </div>
          <div className="divide-y">
            {history.map((h) => (
              <div key={h.inspection_id} className="p-3 flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-slate-700">
                    {TYPE_LABELS[h.inspection_type] ?? h.inspection_type}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {new Date(h.inspected_at).toLocaleString('ar-IQ')}
                  </p>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                  h.has_critical
                    ? 'bg-rose-50 text-rose-700'
                    : h.defect_count > 0
                      ? 'bg-amber-50 text-amber-700'
                      : 'bg-emerald-50 text-emerald-700'}`}>
                  {h.has_critical ? 'عيب حرج'
                    : h.defect_count > 0 ? `${h.defect_count} عيب` : 'سليمة'}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="fixed bottom-0 inset-x-0 p-4 bg-white border-t">
        {confirmCritical ? (
          <div className="space-y-2">
            <p className="text-sm font-bold text-rose-800 text-center">
              تأكيد: سيتوقف تشغيل المركبة
            </p>
            <div className="flex gap-2">
              <Button onClick={() => void submit()} loading={saving}
                className="flex-1 !min-h-[52px] !bg-rose-600 hover:!bg-rose-700">
                نعم، أبلِغ عن العيب
              </Button>
              <Button variant="secondary" onClick={() => setConfirmCritical(false)}
                className="flex-1 !min-h-[52px]">
                تراجع
              </Button>
            </div>
          </div>
        ) : (
          <Button
            onClick={() => void submit()}
            loading={saving}
            className="w-full !min-h-[54px] !text-base"
            icon={<CheckCircle2 size={19} />}
            iconPosition="left"
          >
            حفظ الفحص
          </Button>
        )}
      </div>
    </div>
  );
}
