/**
 * L01 — الأسطول والمركبات
 *
 * كانت الصفحة قراءة فقط وزر «مركبة جديدة» يعرض «قيد التطوير».
 * الآن: إنشاء فعلي عبر RPC create_fleet_vehicle (0283) بكل قواعد
 * التحقق، وتغيير حالة بسبب إلزامي، وتحديث عداد يمنع التراجع.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText, Fuel, Gauge, Loader2, Plus, ShieldCheck, Truck, Wrench, X } from 'lucide-react';
import { useUIStore } from '../../../../core/stores';
import { logisticsVehicleService } from '../../../../services/sdk/LogisticsFleetService';
import {
  logisticsFleetOperationsService,
  type FuelType,
  type VehicleStatus,
  type VehicleType,
} from '../../../../services/sdk/LogisticsFleetOperationsService';
import type { LogisticsVehicleRecord } from '../../../../shared/types/logistics-fleet';
import Card from '../../../../shared/components/ui/Card';
import Button from '../../../../shared/components/ui/Button';
import Input from '../../../../shared/components/ui/Input';
import { getErrorMessage } from '../../../../services/errors';
import { MovementUnitNav } from '../shared/MovementUnitNav';
import {
  movementOperationsExtrasService,
  type VehicleDocument,
} from '../../../../services/sdk/MovementOperationsExtrasService';

const VEHICLE_TYPES: { value: VehicleType; label: string }[] = [
  { value: 'truck', label: 'شاحنة' },
  { value: 'van', label: 'فان' },
  { value: 'pickup', label: 'بيك أب' },
  { value: 'heavy_transport', label: 'نقل ثقيل' },
  { value: 'forklift', label: 'رافعة شوكية' },
  { value: 'car', label: 'سيارة' },
];

const FUEL_TYPES: { value: FuelType; label: string }[] = [
  { value: 'diesel', label: 'ديزل' },
  { value: 'gasoline', label: 'بنزين' },
  { value: 'electric', label: 'كهربائية' },
  { value: 'hybrid', label: 'هجينة' },
];

const STATUS_STYLE: Record<VehicleStatus, { cls: string; label: string }> = {
  available:      { cls: 'bg-emerald-50 text-emerald-700', label: 'متاحة' },
  on_trip:        { cls: 'bg-blue-50 text-blue-700',       label: 'في رحلة' },
  maintenance:    { cls: 'bg-amber-50 text-amber-700',     label: 'صيانة' },
  out_of_service: { cls: 'bg-rose-50 text-rose-700',       label: 'خارج الخدمة' },
};

const EMPTY_FORM = {
  plateNumber: '', make: '', model: '',
  year: new Date().getFullYear(),
  vehicleType: 'truck' as VehicleType,
  fuelType: 'diesel' as FuelType,
  maxWeightKg: 0, maxVolumeCbm: 0, currentMileageKm: 0,
};

export default function LogisticsVehiclesPage() {
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [vehicles, setVehicles] = useState<LogisticsVehicleRecord[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  // تغيير الحالة — سبب إلزامي (لا confirm/prompt)
  const [statusTarget, setStatusTarget] = useState<LogisticsVehicleRecord | null>(null);
  const [nextStatus, setNextStatus] = useState<VehicleStatus>('out_of_service');
  const [statusReason, setStatusReason] = useState('');

  // تحديث العداد
  const [mileageTarget, setMileageTarget] = useState<LogisticsVehicleRecord | null>(null);
  const [newMileage, setNewMileage] = useState<number>(0);

  /* وثائق المركبة (0294) — الوثيقة المنتهية تمنع الإسناد فعلياً */
  const [docsTarget, setDocsTarget] = useState<LogisticsVehicleRecord | null>(null);
  const [docs, setDocs] = useState<VehicleDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docForm, setDocForm] = useState({ docType: 'insurance', expiryDate: '', url: '' });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await logisticsVehicleService.findAll({
        orderBy: 'vehicle_code', ascending: true,
      });
      setVehicles(data || []);
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { void loadData(); }, [loadData]);

  const stats = useMemo(() => ({
    total: vehicles.length,
    available: vehicles.filter((v) => v.status === 'available').length,
    maintenance: vehicles.filter((v) => v.status === 'maintenance').length,
    onTrip: vehicles.filter((v) => v.status === 'on_trip').length,
  }), [vehicles]);

  const readiness = stats.total === 0 ? 0 : Math.round((stats.available / stats.total) * 1000) / 10;

  const submitCreate = async () => {
    setSaving(true);
    try {
      await logisticsFleetOperationsService.createVehicle(form);
      addToast('تمت إضافة المركبة — الرمز يُولَّد تلقائياً', 'success');
      setShowCreate(false);
      setForm(EMPTY_FORM);
      await loadData();
    } catch (err) {
      // رسائل قاعدة البيانات صريحة: DUPLICATE_PLATE_NUMBER · INVALID_VEHICLE_YEAR …
      addToast(getErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const submitStatus = async () => {
    if (!statusTarget) return;
    setSaving(true);
    try {
      await logisticsFleetOperationsService.setVehicleStatus(
        statusTarget.id, nextStatus, statusReason,
      );
      addToast('تم تغيير حالة المركبة وتسجيل السبب في التدقيق', 'success');
      setStatusTarget(null);
      setStatusReason('');
      await loadData();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const submitMileage = async () => {
    if (!mileageTarget) return;
    setSaving(true);
    try {
      const delta = await logisticsFleetOperationsService.updateMileage(
        mileageTarget.id, newMileage,
      );
      addToast(`تم تحديث العداد — المسافة المقطوعة ${delta} كم`, 'success');
      setMileageTarget(null);
      await loadData();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const openDocs = async (v: LogisticsVehicleRecord) => {
    setDocsTarget(v);
    setDocForm({ docType: 'insurance', expiryDate: '', url: '' });
    setDocsLoading(true);
    try {
      setDocs(await movementOperationsExtrasService.findVehicleDocuments(v.id));
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setDocsLoading(false);
    }
  };

  const submitDoc = async () => {
    if (!docsTarget) return;
    if (!docForm.expiryDate) { addToast('تاريخ الانتهاء مطلوب', 'error'); return; }
    setSaving(true);
    try {
      await movementOperationsExtrasService.upsertVehicleDocument({
        vehicleId: docsTarget.id,
        docType: docForm.docType,
        expiryDate: docForm.expiryDate,
        documentUrl: docForm.url || null,
      });
      addToast('حُفظت الوثيقة', 'success');
      setDocs(await movementOperationsExtrasService.findVehicleDocuments(docsTarget.id));
      setDocForm({ docType: 'insurance', expiryDate: '', url: '' });
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      <MovementUnitNav unit="logistics_fleet" />

      <div className="bg-gradient-to-br from-indigo-700 to-slate-900 rounded-2xl p-6 text-white flex items-center justify-between flex-wrap gap-4">
        <div>
          <p className="text-white/70 text-sm font-semibold">Logistics Control • L01</p>
          <h2 className="text-2xl font-extrabold mt-1 flex items-center gap-2">
            <Truck /> إدارة الأسطول والمركبات
          </h2>
          <p className="text-white/75 mt-2 text-sm">
            الشاحنات والسعات وحالة الجاهزية — مع تدقيق كامل لكل تغيير.
          </p>
        </div>
        <Button
          onClick={() => setShowCreate(true)}
          className="!bg-white !text-indigo-900 hover:!bg-indigo-50 !border-none"
          icon={<Plus size={16} />}
          iconPosition="left"
        >
          مركبة جديدة
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center"><Truck size={20} /></div>
          <div><p className="text-2xl font-extrabold text-slate-900">{stats.total}</p>
          <p className="text-xs text-slate-500">إجمالي المركبات</p></div>
        </div></Card>
        <Card><div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center"><ShieldCheck size={20} /></div>
          <div><p className="text-2xl font-extrabold text-slate-900">{stats.available}</p>
          <p className="text-xs text-slate-500">متاحة للرحلات</p></div>
        </div></Card>
        <Card><div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center"><Wrench size={20} /></div>
          <div><p className="text-2xl font-extrabold text-slate-900">{stats.maintenance}</p>
          <p className="text-xs text-slate-500">تحت الصيانة</p></div>
        </div></Card>
        <Card><div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center"><Fuel size={20} /></div>
          <div><p className="text-2xl font-extrabold text-slate-900">{readiness}%</p>
          <p className="text-xs text-slate-500">جاهزية الأسطول</p></div>
        </div></Card>
      </div>

      <Card padding="none">
        {loading ? (
          <div className="py-20 flex items-center justify-center">
            <Loader2 className="animate-spin text-slate-400" size={30} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {['رمز المركبة', 'رقم اللوحة', 'النوع والطراز', 'الفئة', 'الحمولة القصوى', 'العداد', 'الحالة', 'إجراءات'].map((h) => (
                    <th key={h} className="text-right py-3 px-4 text-xs font-bold text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {vehicles.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-12 text-slate-400">
                    لا توجد مركبات مسجلة — ابدأ بإضافة مركبة.
                  </td></tr>
                ) : vehicles.map((v) => {
                  const tone = STATUS_STYLE[v.status as VehicleStatus] ?? STATUS_STYLE.available;
                  return (
                    <tr key={v.id} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="py-3 px-4 font-mono font-bold text-indigo-600">{v.vehicle_code}</td>
                      <td className="py-3 px-4 font-bold text-slate-800">{v.plate_number}</td>
                      <td className="py-3 px-4 text-slate-600">{v.make} {v.model} ({v.year})</td>
                      <td className="py-3 px-4">
                        <span className="px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold">
                          {VEHICLE_TYPES.find((t) => t.value === v.vehicle_type)?.label ?? v.vehicle_type}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-700">{v.max_weight_kg} كغ</td>
                      <td className="py-3 px-4 font-mono text-slate-600">{v.current_mileage_km} كم</td>
                      <td className="py-3 px-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${tone.cls}`}>{tone.label}</span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => { setMileageTarget(v); setNewMileage(Number(v.current_mileage_km)); }}
                            className="px-2 py-1 rounded-lg border text-xs font-bold text-slate-600 hover:bg-slate-100"
                          >
                            <Gauge size={13} className="inline ml-1" />العداد
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setStatusTarget(v);
                              setNextStatus(v.status === 'available' ? 'out_of_service' : 'available');
                              setStatusReason('');
                            }}
                            className="px-2 py-1 rounded-lg border text-xs font-bold text-slate-600 hover:bg-slate-100"
                          >
                            الحالة
                          </button>
                          <button
                            type="button"
                            onClick={() => void openDocs(v)}
                            className="px-2 py-1 rounded-lg border text-xs font-bold text-slate-600 hover:bg-slate-100"
                          >
                            <FileText size={13} className="inline ml-1" />الوثائق
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* وثائق المركبة (0294) */}
      {docsTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-2xl max-h-[92vh] overflow-auto" dir="rtl">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-bold text-lg">وثائق المركبة</h3>
              <button type="button" onClick={() => setDocsTarget(null)}
                className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
            </div>
            <p className="text-sm text-slate-500 mb-1">
              {docsTarget.vehicle_code} — {docsTarget.plate_number}
            </p>
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 mb-4">
              ⚠️ الوثيقة المنتهية <strong>تمنع إسناد المركبة لأي رحلة</strong> تلقائياً،
              وتُولّد تنبيهاً في الإشعارات اليومية.
            </p>

            {docsLoading ? (
              <div className="py-10 flex items-center justify-center">
                <Loader2 className="animate-spin text-slate-400" size={24} />
              </div>
            ) : docs.length === 0 ? (
              <p className="text-sm text-slate-400 py-6 text-center border border-dashed rounded-xl">
                لا وثائق مسجَّلة لهذه المركبة.
              </p>
            ) : (
              <div className="space-y-2 mb-4">
                {docs.map((d) => {
                  const days = Math.ceil(
                    (new Date(d.expiry_date).getTime() - Date.now()) / 86400000);
                  const tone = days < 0 ? 'bg-rose-50 border-rose-200 text-rose-800'
                    : days <= 30 ? 'bg-amber-50 border-amber-200 text-amber-800'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-800';
                  return (
                    <div key={d.id}
                      className={`flex items-center justify-between gap-3 p-3 rounded-xl border text-sm ${tone}`}>
                      <span className="font-bold">{d.doc_type}</span>
                      <span className="text-xs">
                        {d.expiry_date}
                        {' · '}
                        {days < 0 ? `منتهية منذ ${Math.abs(days)} يوم`
                          : days === 0 ? 'تنتهي اليوم'
                          : `${days} يوم متبقٍّ`}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="border-t pt-4 space-y-3">
              <h4 className="font-bold text-sm text-slate-800">إضافة / تجديد وثيقة</h4>
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-600">نوع الوثيقة</label>
                  <select value={docForm.docType}
                    onChange={(e) => setDocForm({ ...docForm, docType: e.target.value })}
                    className="w-full border rounded-xl p-2.5 text-sm mt-1">
                    <option value="insurance">تأمين</option>
                    <option value="registration">تسجيل</option>
                    <option value="inspection">فحص فني</option>
                    <option value="permit">إجازة نقل</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600">تاريخ الانتهاء *</label>
                  <Input type="date" value={docForm.expiryDate}
                    onChange={(e) => setDocForm({ ...docForm, expiryDate: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600">رابط الوثيقة (اختياري)</label>
                <Input value={docForm.url}
                  onChange={(e) => setDocForm({ ...docForm, url: e.target.value })} />
              </div>
              <p className="text-[11px] text-slate-400">
                نوع واحد لكل مركبة — إعادة الحفظ تُجدّد الوثيقة القائمة لا تُنشئ ثانية.
                لا تُقبل وثيقة منتهية سلفاً.
              </p>
              <div className="flex gap-2">
                <Button onClick={() => void submitDoc()} loading={saving} className="flex-1">حفظ</Button>
                <Button variant="secondary" onClick={() => setDocsTarget(null)} className="flex-1">إغلاق</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* نموذج إنشاء مركبة */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-3xl max-h-[92vh] overflow-auto" dir="rtl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">مركبة جديدة</h3>
              <button type="button" onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-slate-700">
                <X size={20} />
              </button>
            </div>

            <div className="grid md:grid-cols-3 gap-3">
              <Input required placeholder="رقم اللوحة *" value={form.plateNumber}
                onChange={(e) => setForm({ ...form, plateNumber: e.target.value })} />
              <Input required placeholder="الصانع *" value={form.make}
                onChange={(e) => setForm({ ...form, make: e.target.value })} />
              <Input required placeholder="الطراز *" value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })} />

              <Input type="number" placeholder="سنة الصنع *" value={form.year}
                onChange={(e) => setForm({ ...form, year: Number(e.target.value) })} />
              <select value={form.vehicleType} className="border rounded-xl p-2.5 text-sm"
                onChange={(e) => setForm({ ...form, vehicleType: e.target.value as VehicleType })}>
                {VEHICLE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <select value={form.fuelType} className="border rounded-xl p-2.5 text-sm"
                onChange={(e) => setForm({ ...form, fuelType: e.target.value as FuelType })}>
                {FUEL_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>

              <Input type="number" placeholder="أقصى حمولة (كغ)" value={form.maxWeightKg}
                onChange={(e) => setForm({ ...form, maxWeightKg: Number(e.target.value) })} />
              <Input type="number" placeholder="أقصى حجم (م³)" value={form.maxVolumeCbm}
                onChange={(e) => setForm({ ...form, maxVolumeCbm: Number(e.target.value) })} />
              <Input type="number" placeholder="قراءة العداد (كم)" value={form.currentMileageKm}
                onChange={(e) => setForm({ ...form, currentMileageKm: Number(e.target.value) })} />
            </div>

            <p className="text-[11px] text-slate-400 mt-3">
              رمز المركبة يُولَّد تلقائياً. رقم اللوحة يجب ألا يتكرر داخل الشركة.
            </p>

            <div className="flex gap-2 mt-5">
              <Button onClick={() => void submitCreate()} loading={saving} className="flex-1">حفظ المركبة</Button>
              <Button variant="secondary" onClick={() => setShowCreate(false)} className="flex-1">إلغاء</Button>
            </div>
          </div>
        </div>
      )}

      {/* تغيير الحالة — سبب إلزامي */}
      {statusTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md" dir="rtl">
            <h3 className="font-bold text-lg mb-1">تغيير حالة المركبة</h3>
            <p className="text-sm text-slate-500 mb-4">
              {statusTarget.vehicle_code} — {statusTarget.plate_number}
            </p>

            <label className="text-xs font-bold text-slate-600">الحالة الجديدة</label>
            <select value={nextStatus} className="w-full border rounded-xl p-2.5 text-sm mt-1 mb-3"
              onChange={(e) => setNextStatus(e.target.value as VehicleStatus)}>
              {(Object.keys(STATUS_STYLE) as VehicleStatus[]).map((s) => (
                <option key={s} value={s}>{STATUS_STYLE[s].label}</option>
              ))}
            </select>

            <label className="text-xs font-bold text-slate-600">سبب التغيير (إلزامي)</label>
            <textarea value={statusReason} rows={3}
              onChange={(e) => setStatusReason(e.target.value)}
              className="w-full border rounded-xl p-2.5 text-sm mt-1"
              placeholder="مثال: عطل في نظام الفرامل يستدعي الإيقاف" />

            <div className="flex gap-2 mt-4">
              <Button onClick={() => void submitStatus()} loading={saving} className="flex-1">تأكيد</Button>
              <Button variant="secondary" onClick={() => setStatusTarget(null)} className="flex-1">إلغاء</Button>
            </div>
          </div>
        </div>
      )}

      {/* تحديث العداد */}
      {mileageTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md" dir="rtl">
            <h3 className="font-bold text-lg mb-1">تحديث عداد الكيلومترات</h3>
            <p className="text-sm text-slate-500 mb-4">
              {mileageTarget.vehicle_code} — القراءة الحالية {mileageTarget.current_mileage_km} كم
            </p>

            <Input type="number" value={newMileage}
              onChange={(e) => setNewMileage(Number(e.target.value))} />
            <p className="text-[11px] text-slate-400 mt-2">
              العداد لا يتراجع — أي قيمة أقل من الحالية ستُرفض.
            </p>

            <div className="flex gap-2 mt-4">
              <Button onClick={() => void submitMileage()} loading={saving} className="flex-1">حفظ</Button>
              <Button variant="secondary" onClick={() => setMileageTarget(null)} className="flex-1">إلغاء</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
