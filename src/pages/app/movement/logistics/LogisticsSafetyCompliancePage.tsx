/**
 * L13 — امتثال السلامة: HOS · DVIR
 *
 * لماذا شاشة واحدة للنظامين:
 *   المُرسِل يسأل سؤالاً واحداً قبل كل إسناد: «من يستطيع القيادة، وبأي
 *   مركبة؟» الجواب يحتاج الاثنين معاً. فصلهما في شاشتين يجبره على
 *   المقارنة يدوياً — وهو ما يؤدي للأخطاء التي بُني النظام لمنعها.
 *
 * المبدأ الحاكم: كل ما يُعرض هنا **مفروض في الخادم** أصلاً.
 * الشاشة تُظهر لماذا مُنع الإسناد، لا تقرّر المنع.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, ClipboardCheck, Clock, Loader2,
  RefreshCw, ShieldAlert, Truck, UserCheck, Wrench, X,
} from 'lucide-react';
import { useUIStore } from '../../../../core/stores';
import { getErrorMessage } from '../../../../services/errors';
import {
  movementSafetyComplianceService,
  COMPLIANCE_LABELS,
  DVIR_CHECKLIST,
  HOS_LIMITS,
  INSPECTION_TYPE_LABELS,
  SEVERITY_LABELS,
  VEHICLE_SAFETY_LABELS,
  type ComplianceStatus,
  type DefectSeverity,
  type DriverCompliance,
  type InspectionType,
  type VehicleDefect,
  type VehicleSafety,
  type VehicleSafetyStatus,
} from '../../../../services/sdk/MovementSafetyComplianceService';
import Card from '../../../../shared/components/ui/Card';
import Button from '../../../../shared/components/ui/Button';
import { MovementUnitNav } from '../shared/MovementUnitNav';

const COMPLIANCE_TONE: Record<ComplianceStatus, string> = {
  compliant: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  hos_warning: 'bg-amber-50 text-amber-700 border-amber-200',
  hos_violation: 'bg-rose-50 text-rose-700 border-rose-200',
  license_expiring: 'bg-amber-50 text-amber-700 border-amber-200',
  license_expired: 'bg-rose-50 text-rose-700 border-rose-200',
};

const VEHICLE_TONE: Record<VehicleSafetyStatus, string> = {
  compliant: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  grounded_defect: 'bg-rose-50 text-rose-700 border-rose-200',
  document_expired: 'bg-rose-50 text-rose-700 border-rose-200',
  never_inspected: 'bg-slate-100 text-slate-600 border-slate-200',
  inspection_overdue: 'bg-amber-50 text-amber-700 border-amber-200',
};

/** دقائق → «س:دد» */
const hm = (mins: number) => {
  const m = Math.max(0, Math.round(mins));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
};

export default function LogisticsSafetyCompliancePage() {
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [drivers, setDrivers] = useState<DriverCompliance[]>([]);
  const [vehicles, setVehicles] = useState<VehicleSafety[]>([]);
  const [tab, setTab] = useState<'drivers' | 'vehicles'>('drivers');

  /* نموذج الفحص */
  const [inspTarget, setInspTarget] = useState<VehicleSafety | null>(null);
  const [inspType, setInspType] = useState<InspectionType>('pre_trip');
  const [odometer, setOdometer] = useState('');
  const [signature, setSignature] = useState('');
  /* الحالة الافتراضية: كل بند سليم — الفاحص يُعلّم الاستثناء فقط */
  const [defects, setDefects] = useState<Record<string, DefectSeverity | null>>({});

  /* نموذج رفع الإيقاف */
  const [clearTarget, setClearTarget] = useState<VehicleSafety | null>(null);
  const [repairNotes, setRepairNotes] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [d, v] = await Promise.all([
        movementSafetyComplianceService.findDriverCompliance(),
        movementSafetyComplianceService.findVehicleSafety(),
      ]);
      setDrivers(d);
      setVehicles(v);
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { void loadData(); }, [loadData]);

  const stats = useMemo(() => ({
    hosViolations: drivers.filter((d) => d.compliance_status === 'hos_violation').length,
    hosWarnings: drivers.filter((d) => d.compliance_status === 'hos_warning').length,
    grounded: vehicles.filter((v) => v.safety_status === 'grounded_defect').length,
    uninspected: vehicles.filter(
      (v) => v.safety_status === 'never_inspected' || v.safety_status === 'inspection_overdue',
    ).length,
  }), [drivers, vehicles]);

  const openInspection = (v: VehicleSafety) => {
    setInspTarget(v);
    setInspType('pre_trip');
    setOdometer('');
    setSignature('');
    setDefects({});
  };

  const submitInspection = async () => {
    if (!inspTarget) return;
    setSaving(true);
    try {
      const list: VehicleDefect[] = Object.entries(defects)
        .filter(([, sev]) => sev !== null)
        .map(([code, sev]) => ({
          code,
          severity: sev as DefectSeverity,
          note: DVIR_CHECKLIST.find((c) => c.code === code)?.label,
        }));

      const res = await movementSafetyComplianceService.recordInspection({
        vehicleId: inspTarget.vehicle_id,
        inspectionType: inspType,
        defects: list,
        odometerKm: odometer === '' ? null : Number(odometer),
        signatureName: signature || null,
      });

      addToast(
        res.vehicle_grounded
          ? 'سُجِّل عيب حرج — أُوقفت المركبة تلقائياً'
          : 'سُجِّل الفحص',
        res.vehicle_grounded ? 'error' : 'success',
      );
      setInspTarget(null);
      await loadData();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally { setSaving(false); }
  };

  const submitClear = async () => {
    if (!clearTarget) return;
    setSaving(true);
    try {
      await movementSafetyComplianceService.clearDefects(clearTarget.vehicle_id, repairNotes);
      addToast('رُفع الإيقاف بعد الإصلاح', 'success');
      setClearTarget(null);
      setRepairNotes('');
      await loadData();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      <MovementUnitNav unit="logistics_drivers" />

      <div className="bg-gradient-to-br from-rose-700 to-slate-900 rounded-2xl p-6 text-white flex items-center justify-between flex-wrap gap-4">
        <div>
          <p className="text-white/70 text-sm font-semibold">Logistics Control • L13</p>
          <h2 className="text-2xl font-extrabold mt-1 flex items-center gap-2">
            <ShieldAlert /> امتثال السلامة — HOS و DVIR
          </h2>
          <p className="text-white/75 mt-2 text-sm">
            ساعات القيادة وفحص المركبات. تجاوز أي حد <strong>يمنع الإسناد
            تلقائياً</strong> على مستوى قاعدة البيانات.
          </p>
        </div>
        <Button
          onClick={() => void loadData()}
          className="!bg-white !text-rose-900 hover:!bg-rose-50 !border-none"
          icon={<RefreshCw size={16} />}
          iconPosition="left"
        >
          تحديث
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center">
            <Clock size={20} />
          </div>
          <div><p className="text-2xl font-extrabold text-slate-900">{stats.hosViolations}</p>
          <p className="text-xs text-slate-500">تجاوز ساعات</p></div>
        </div></Card>
        <Card><div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
            <AlertTriangle size={20} />
          </div>
          <div><p className="text-2xl font-extrabold text-slate-900">{stats.hosWarnings}</p>
          <p className="text-xs text-slate-500">يقترب من الحد</p></div>
        </div></Card>
        <Card><div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center">
            <Wrench size={20} />
          </div>
          <div><p className="text-2xl font-extrabold text-slate-900">{stats.grounded}</p>
          <p className="text-xs text-slate-500">موقوفة بعيب حرج</p></div>
        </div></Card>
        <Card><div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center">
            <ClipboardCheck size={20} />
          </div>
          <div><p className="text-2xl font-extrabold text-slate-900">{stats.uninspected}</p>
          <p className="text-xs text-slate-500">فحص متأخر</p></div>
        </div></Card>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTab('drivers')}
          className={`px-4 py-2 rounded-xl text-sm font-bold border ${
            tab === 'drivers' ? 'bg-rose-600 text-white border-rose-600' : 'text-slate-600'}`}
        >
          <UserCheck size={15} className="inline ml-1.5" />
          السائقون ({drivers.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('vehicles')}
          className={`px-4 py-2 rounded-xl text-sm font-bold border ${
            tab === 'vehicles' ? 'bg-rose-600 text-white border-rose-600' : 'text-slate-600'}`}
        >
          <Truck size={15} className="inline ml-1.5" />
          المركبات ({vehicles.length})
        </button>
      </div>

      {loading ? (
        <Card><div className="py-20 flex items-center justify-center">
          <Loader2 className="animate-spin text-slate-400" size={30} />
        </div></Card>
      ) : tab === 'drivers' ? (
        <Card padding="none">
          <div className="p-4 border-b border-slate-100">
            <h3 className="font-bold text-slate-900">ساعات القيادة والخدمة</h3>
            <p className="text-[11px] text-slate-500 mt-1">
              الحدود: {HOS_LIMITS.drivingMinutesPerDay / 60} ساعة قيادة ·{' '}
              {HOS_LIMITS.dutyMinutesPerDay / 60} ساعة عمل ·{' '}
              {HOS_LIMITS.drivingMinutesPer8Days / 60} ساعة في 8 أيام
            </p>
          </div>
          {drivers.length === 0 ? (
            <div className="py-14 text-center text-slate-400">
              <UserCheck className="mx-auto mb-2" size={28} />
              <p className="text-sm">لا سائقين مسجَّلين</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm whitespace-nowrap">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    {['السائق', 'الحالة', 'قيادة اليوم', 'عمل اليوم', '8 أيام', 'الفترة الجارية', 'الرخصة'].map((h) => (
                      <th key={h} className="text-right py-3 px-4 text-xs font-bold text-slate-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {drivers.map((d) => (
                    <tr key={d.driver_id} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="py-3 px-4 font-bold text-slate-800">{d.driver_name_ar}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${
                          COMPLIANCE_TONE[d.compliance_status]}`}>
                          {COMPLIANCE_LABELS[d.compliance_status]}
                        </span>
                      </td>
                      <td className={`py-3 px-4 font-mono font-bold ${
                        d.hos_driving_exceeded ? 'text-rose-700' : 'text-slate-700'}`}>
                        {hm(d.driving_minutes_today)}
                      </td>
                      <td className={`py-3 px-4 font-mono ${
                        d.hos_duty_exceeded ? 'text-rose-700 font-bold' : 'text-slate-600'}`}>
                        {hm(d.on_duty_minutes_today)}
                      </td>
                      <td className={`py-3 px-4 font-mono ${
                        d.hos_cycle_exceeded ? 'text-rose-700 font-bold' : 'text-slate-600'}`}>
                        {hm(d.driving_minutes_8days)}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600">
                        {d.open_period_status
                          ? `${d.open_period_status} · ${hm(d.open_period_minutes)}`
                          : '—'}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-500">
                        {d.license_days_left < 0
                          ? `منتهية منذ ${Math.abs(d.license_days_left)} يوم`
                          : `${d.license_days_left} يوم`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : (
        <Card padding="none">
          <div className="p-4 border-b border-slate-100">
            <h3 className="font-bold text-slate-900">سلامة المركبات (DVIR)</h3>
            <p className="text-[11px] text-slate-500 mt-1">
              العيب الحرج ينقل المركبة إلى <code className="font-mono">out_of_service</code> فوراً
              ويمنع أي إسناد حتى الإصلاح.
            </p>
          </div>
          {vehicles.length === 0 ? (
            <div className="py-14 text-center text-slate-400">
              <Truck className="mx-auto mb-2" size={28} />
              <p className="text-sm">لا مركبات مسجَّلة</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm whitespace-nowrap">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    {['المركبة', 'الحالة', 'آخر فحص', 'العيوب', 'وثائق منتهية', 'إجراءات'].map((h) => (
                      <th key={h} className="text-right py-3 px-4 text-xs font-bold text-slate-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {vehicles.map((v) => (
                    <tr key={v.vehicle_id} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="py-3 px-4">
                        <span className="font-mono font-bold text-indigo-600">{v.vehicle_code}</span>
                        <span className="text-slate-500 text-xs mr-2">{v.plate_number}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${
                          VEHICLE_TONE[v.safety_status]}`}>
                          {VEHICLE_SAFETY_LABELS[v.safety_status]}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-500">
                        {v.last_inspected_at
                          ? new Date(v.last_inspected_at).toLocaleDateString('ar-IQ')
                          : '—'}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600">{v.defect_count}</td>
                      <td className={`py-3 px-4 font-mono ${
                        v.expired_documents > 0 ? 'text-rose-700 font-bold' : 'text-slate-500'}`}>
                        {v.expired_documents}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => openInspection(v)}
                            className="px-2 py-1 rounded-lg border text-[11px] font-bold text-slate-600 hover:bg-slate-100"
                          >
                            <ClipboardCheck size={13} className="inline ml-1" />فحص
                          </button>
                          {v.has_critical_defect && (
                            <button
                              type="button"
                              onClick={() => { setClearTarget(v); setRepairNotes(''); }}
                              className="px-2 py-1 rounded-lg border border-emerald-200 bg-emerald-50 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100"
                            >
                              <CheckCircle2 size={13} className="inline ml-1" />رفع الإيقاف
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* نموذج الفحص */}
      {inspTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-2xl max-h-[92vh] overflow-auto" dir="rtl">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-bold text-lg">فحص المركبة (DVIR)</h3>
              <button type="button" onClick={() => setInspTarget(null)}
                className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
            </div>
            <p className="text-sm text-slate-500 mb-4">
              {inspTarget.vehicle_code} — {inspTarget.plate_number}
            </p>

            <div className="grid md:grid-cols-3 gap-3 mb-4">
              <div>
                <label className="text-xs font-bold text-slate-600">نوع الفحص</label>
                <select value={inspType}
                  onChange={(e) => setInspType(e.target.value as InspectionType)}
                  className="w-full border rounded-xl p-2.5 text-sm mt-1">
                  {(Object.keys(INSPECTION_TYPE_LABELS) as InspectionType[]).map((t) => (
                    <option key={t} value={t}>{INSPECTION_TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600">قراءة العداد</label>
                <input type="number" value={odometer}
                  onChange={(e) => setOdometer(e.target.value)}
                  className="w-full border rounded-xl p-2.5 text-sm mt-1" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600">اسم الفاحص</label>
                <input value={signature}
                  onChange={(e) => setSignature(e.target.value)}
                  className="w-full border rounded-xl p-2.5 text-sm mt-1" />
              </div>
            </div>

            <p className="text-xs font-bold text-slate-700 mb-2">
              بنود الفحص — البند بلا تحديد يُعدّ سليماً
            </p>
            <div className="border rounded-xl divide-y max-h-72 overflow-auto mb-4">
              {DVIR_CHECKLIST.map((item) => (
                <div key={item.code} className="flex items-center justify-between gap-2 p-2.5">
                  <span className="text-sm font-bold text-slate-700">{item.label}</span>
                  <div className="flex gap-1">
                    <button type="button"
                      onClick={() => setDefects((d) => ({ ...d, [item.code]: null }))}
                      className={`px-2 py-1 rounded-lg text-[11px] font-bold border ${
                        !defects[item.code]
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                          : 'text-slate-500'}`}>
                      سليم
                    </button>
                    {(['minor', 'major', 'critical'] as DefectSeverity[]).map((sev) => (
                      <button key={sev} type="button"
                        onClick={() => setDefects((d) => ({ ...d, [item.code]: sev }))}
                        className={`px-2 py-1 rounded-lg text-[11px] font-bold border ${
                          defects[item.code] === sev
                            ? sev === 'critical'
                              ? 'bg-rose-600 text-white border-rose-600'
                              : sev === 'major'
                                ? 'bg-amber-500 text-white border-amber-500'
                                : 'bg-slate-500 text-white border-slate-500'
                            : 'text-slate-500'}`}>
                        {SEVERITY_LABELS[sev].split(' —')[0]}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {Object.values(defects).includes('critical') && (
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 mb-4">
                <p className="text-sm font-bold text-rose-800 flex items-center gap-1.5">
                  <AlertTriangle size={15} /> تحذير: عيب حرج
                </p>
                <p className="text-xs text-rose-700 mt-1">
                  حفظ هذا الفحص سينقل المركبة إلى <strong>خارج الخدمة فوراً</strong>،
                  ويمنع إسنادها لأي رحلة حتى تسجيل إصلاح معتمَد.
                </p>
              </div>
            )}

            <div className="flex gap-2">
              <Button onClick={() => void submitInspection()} loading={saving} className="flex-1">
                حفظ الفحص
              </Button>
              <Button variant="secondary" onClick={() => setInspTarget(null)} className="flex-1">
                إلغاء
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* رفع الإيقاف */}
      {clearTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md" dir="rtl">
            <h3 className="font-bold text-lg mb-1">رفع الإيقاف بعد الإصلاح</h3>
            <p className="text-sm text-slate-500 mb-4">
              {clearTarget.vehicle_code} — {clearTarget.plate_number}
            </p>
            <label className="text-xs font-bold text-slate-600">
              وصف الإصلاح (إلزامي)
            </label>
            <textarea value={repairNotes} rows={3}
              onChange={(e) => setRepairNotes(e.target.value)}
              className="w-full border rounded-xl p-2.5 text-sm mt-1"
              placeholder="مثال: استُبدلت أقراص الفرامل واعتُمدت من الورشة" />
            <p className="text-[11px] text-slate-400 mt-2">
              يُسجَّل فحص نظيف جديد. <strong>سجل العيب الأصلي لا يُعدَّل ولا يُحذف</strong> —
              يبقى دليلاً تدقيقياً.
            </p>
            <div className="flex gap-2 mt-4">
              <Button onClick={() => void submitClear()} loading={saving} className="flex-1">
                تأكيد الإصلاح
              </Button>
              <Button variant="secondary" onClick={() => setClearTarget(null)} className="flex-1">
                إلغاء
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
