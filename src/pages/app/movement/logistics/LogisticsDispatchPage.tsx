/**
 * L07 — الإرسال والتنفيذ
 *
 * كانت الصفحة قراءة فقط وزر «إرسال رحلة» يعرض «قيد التطوير».
 * الآن: لوحة تشغيل كاملة عبر RPCs (0284):
 *   إرسال أمر ← en_route ← arrived ← ePOD ← completed
 * كل انتقال يمرّ بآلة حالات صارمة في قاعدة البيانات.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, Clock, Loader2, MapPin,
  Package, RefreshCw, Send, Truck, X,
} from 'lucide-react';
import { useUIStore } from '../../../../core/stores';
import { getErrorMessage } from '../../../../services/errors';
import {
  logisticsDispatchOperationsService,
  type DispatchBoardRow,
  type DispatchStatus,
  type EpodStatus,
  type ShipmentOrderRecord,
} from '../../../../services/sdk/LogisticsDispatchOperationsService';
import { logisticsVehicleService, logisticsDriverService } from '../../../../services/sdk/LogisticsFleetService';
import type { LogisticsVehicleRecord, LogisticsDriverRecord } from '../../../../shared/types/logistics-fleet';
import Card from '../../../../shared/components/ui/Card';
import Button from '../../../../shared/components/ui/Button';
import Input from '../../../../shared/components/ui/Input';
import { MovementUnitNav } from '../shared/MovementUnitNav';

const COLUMNS: { key: DispatchStatus; label: string; tone: string }[] = [
  { key: 'dispatched', label: 'مُرسَلة',  tone: 'bg-slate-100 text-slate-700' },
  { key: 'en_route',   label: 'في الطريق', tone: 'bg-blue-100 text-blue-700' },
  { key: 'arrived',    label: 'وصلت',     tone: 'bg-amber-100 text-amber-700' },
  { key: 'completed',  label: 'مكتملة',   tone: 'bg-emerald-100 text-emerald-700' },
  { key: 'failed',     label: 'فاشلة',    tone: 'bg-rose-100 text-rose-700' },
];

const PRIORITY_TONE: Record<string, string> = {
  urgent: 'bg-rose-50 text-rose-700',
  high:   'bg-amber-50 text-amber-700',
  normal: 'bg-slate-50 text-slate-600',
  low:    'bg-slate-50 text-slate-400',
};

export default function LogisticsDispatchPage() {
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [board, setBoard] = useState<DispatchBoardRow[]>([]);
  const [orders, setOrders] = useState<ShipmentOrderRecord[]>([]);
  const [vehicles, setVehicles] = useState<LogisticsVehicleRecord[]>([]);
  const [drivers, setDrivers] = useState<LogisticsDriverRecord[]>([]);

  const [showDispatch, setShowDispatch] = useState(false);
  const [form, setForm] = useState({ orderId: '', vehicleId: '', driverId: '', estimatedArrival: '' });

  // إغلاق برفض — سبب إلزامي (لا confirm/prompt)
  const [failTarget, setFailTarget] = useState<DispatchBoardRow | null>(null);
  const [failReason, setFailReason] = useState('');

  // إثبات التسليم
  const [epodTarget, setEpodTarget] = useState<DispatchBoardRow | null>(null);
  const [epod, setEpod] = useState({
    recipientName: '', status: 'delivered' as EpodStatus, deliveryNotes: '',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [b, o, v, d] = await Promise.all([
        logisticsDispatchOperationsService.findDispatchBoard(),
        logisticsDispatchOperationsService.findDispatchableOrders(),
        logisticsVehicleService.findAvailableVehicles().catch(() => []),
        logisticsDriverService.findActiveDrivers().catch(() => []),
      ]);
      setBoard(b); setOrders(o); setVehicles(v); setDrivers(d);
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { void loadData(); }, [loadData]);

  const overdue = useMemo(() => board.filter((r) => r.is_overdue), [board]);
  const active = useMemo(
    () => board.filter((r) => !['completed', 'failed'].includes(r.dispatch_status)).length,
    [board],
  );

  const submitDispatch = async () => {
    if (!form.orderId || !form.vehicleId || !form.driverId) {
      addToast('اختر الأمر والمركبة والسائق', 'error');
      return;
    }
    setSaving(true);
    try {
      await logisticsDispatchOperationsService.dispatchOrder({
        orderId: form.orderId,
        vehicleId: form.vehicleId,
        driverId: form.driverId,
        estimatedArrival: form.estimatedArrival || null,
      });
      addToast('تم إرسال الرحلة — المركبة الآن في رحلة', 'success');
      setShowDispatch(false);
      setForm({ orderId: '', vehicleId: '', driverId: '', estimatedArrival: '' });
      await loadData();
    } catch (err) {
      // رسائل صريحة: CARGO_EXCEEDS_VEHICLE_WEIGHT · ASSIGNMENT_BLOCKED …
      addToast(getErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const advance = async (row: DispatchBoardRow, next: DispatchStatus) => {
    setSaving(true);
    try {
      await logisticsDispatchOperationsService.updateDispatchStatus(row.dispatch_id, next);
      addToast('تم تحديث حالة الرحلة', 'success');
      await loadData();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const submitFail = async () => {
    if (!failTarget) return;
    setSaving(true);
    try {
      await logisticsDispatchOperationsService.updateDispatchStatus(
        failTarget.dispatch_id, 'failed', failReason,
      );
      addToast('تم إغلاق الرحلة كفاشلة وتسجيل السبب', 'success');
      setFailTarget(null); setFailReason('');
      await loadData();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const submitEpod = async () => {
    if (!epodTarget) return;
    setSaving(true);
    try {
      await logisticsDispatchOperationsService.recordDeliveryProof({
        dispatchId: epodTarget.dispatch_id,
        recipientName: epod.recipientName,
        status: epod.status,
        deliveryNotes: epod.deliveryNotes || null,
      });
      addToast('تم تسجيل إثبات التسليم', 'success');
      setEpodTarget(null);
      setEpod({ recipientName: '', status: 'delivered', deliveryNotes: '' });
      await loadData();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      <MovementUnitNav unit="logistics_dispatch" />

      <div className="bg-gradient-to-br from-indigo-700 to-slate-900 rounded-2xl p-6 text-white flex items-center justify-between flex-wrap gap-4">
        <div>
          <p className="text-white/70 text-sm font-semibold">Logistics Control • L07</p>
          <h2 className="text-2xl font-extrabold mt-1 flex items-center gap-2">
            <Send /> الإرسال والتنفيذ
          </h2>
          <p className="text-white/75 mt-2 text-sm">
            {active} رحلة نشطة · {overdue.length} متأخرة عن الموعد المتوقع
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => setShowDispatch(true)}
            className="!bg-white !text-indigo-900 hover:!bg-indigo-50 !border-none"
            icon={<Send size={16} />}
            iconPosition="left"
          >
            إرسال رحلة
          </Button>
          <Button
            onClick={() => void loadData()}
            className="!bg-white/10 !text-white hover:!bg-white/20 !border-none"
            icon={<RefreshCw size={16} />}
            iconPosition="left"
          >
            تحديث
          </Button>
        </div>
      </div>

      {overdue.length > 0 && (
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="text-rose-600" size={18} />
            <h3 className="font-bold text-slate-900">رحلات متأخرة ({overdue.length})</h3>
          </div>
          <div className="space-y-2">
            {overdue.map((r) => (
              <div key={r.dispatch_id}
                className="flex items-center justify-between gap-3 p-3 rounded-xl border border-rose-200 bg-rose-50 text-sm">
                <div>
                  <span className="font-bold">{r.dispatch_code}</span>
                  <span className="text-slate-600"> — {r.destination_address} · {r.driver_name_ar}</span>
                </div>
                <span className="text-xs font-bold text-rose-700 whitespace-nowrap">
                  متأخرة {r.minutes_late} دقيقة
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {loading ? (
        <div className="py-20 flex items-center justify-center">
          <Loader2 className="animate-spin text-slate-400" size={32} />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4">
          {COLUMNS.map((col) => {
            const items = board.filter((r) => r.dispatch_status === col.key);
            return (
              <div key={col.key} className="space-y-3">
                <div className={`rounded-xl px-3 py-2 text-sm font-bold flex items-center justify-between ${col.tone}`}>
                  <span>{col.label}</span>
                  <span>{items.length}</span>
                </div>

                {items.length === 0 ? (
                  <div className="text-center text-xs text-slate-300 py-6 border border-dashed rounded-xl">
                    لا رحلات
                  </div>
                ) : items.map((r) => (
                  <Card key={r.dispatch_id} padding="sm">
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono font-bold text-indigo-600 text-xs">{r.dispatch_code}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${PRIORITY_TONE[r.priority] ?? ''}`}>
                          {r.priority}
                        </span>
                      </div>

                      <div className="text-xs text-slate-600 flex items-start gap-1">
                        <MapPin size={12} className="mt-0.5 shrink-0" />
                        <span>{r.origin_address} ← {r.destination_address}</span>
                      </div>

                      <div className="text-[11px] text-slate-500 flex items-center gap-2">
                        <Truck size={12} /> {r.vehicle_code}
                        <span>·</span>
                        {r.driver_name_ar}
                      </div>

                      <div className="text-[11px] text-slate-400 flex items-center gap-1">
                        <Package size={12} /> {r.cargo_description} — {r.cargo_weight_kg} كغ
                      </div>

                      {r.is_overdue && (
                        <div className="text-[11px] text-rose-600 font-bold flex items-center gap-1">
                          <Clock size={12} /> متأخرة {r.minutes_late} دقيقة
                        </div>
                      )}

                      {r.has_epod && (
                        <div className="text-[11px] text-emerald-600 font-bold flex items-center gap-1">
                          <CheckCircle2 size={12} /> إثبات تسليم: {r.epod_status}
                        </div>
                      )}

                      {/* الإجراءات حسب الحالة — تطابق آلة الحالات في 0284 */}
                      <div className="flex gap-1.5 pt-1 flex-wrap">
                        {r.dispatch_status === 'dispatched' && (
                          <button type="button" disabled={saving}
                            onClick={() => void advance(r, 'en_route')}
                            className="px-2 py-1 rounded-lg border text-[11px] font-bold text-blue-700 hover:bg-blue-50 disabled:opacity-50">
                            بدء الحركة
                          </button>
                        )}
                        {r.dispatch_status === 'en_route' && (
                          <button type="button" disabled={saving}
                            onClick={() => void advance(r, 'arrived')}
                            className="px-2 py-1 rounded-lg border text-[11px] font-bold text-amber-700 hover:bg-amber-50 disabled:opacity-50">
                            تسجيل الوصول
                          </button>
                        )}
                        {r.dispatch_status === 'arrived' && !r.has_epod && (
                          <button type="button" disabled={saving}
                            onClick={() => setEpodTarget(r)}
                            className="px-2 py-1 rounded-lg border text-[11px] font-bold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">
                            إثبات التسليم
                          </button>
                        )}
                        {!['completed', 'failed'].includes(r.dispatch_status) && (
                          <button type="button" disabled={saving}
                            onClick={() => { setFailTarget(r); setFailReason(''); }}
                            className="px-2 py-1 rounded-lg border text-[11px] font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50">
                            إغلاق كفاشلة
                          </button>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* نموذج الإرسال */}
      {showDispatch && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-2xl" dir="rtl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">إرسال رحلة جديدة</h3>
              <button type="button" onClick={() => setShowDispatch(false)} className="text-slate-400 hover:text-slate-700">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-600">أمر النقل</label>
                <select value={form.orderId} className="w-full border rounded-xl p-2.5 text-sm mt-1"
                  onChange={(e) => setForm({ ...form, orderId: e.target.value })}>
                  <option value="">اختر أمراً قابلاً للإرسال</option>
                  {orders.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.order_code} — {o.cargo_description} ({o.cargo_weight_kg} كغ)
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-600">المركبة</label>
                  <select value={form.vehicleId} className="w-full border rounded-xl p-2.5 text-sm mt-1"
                    onChange={(e) => setForm({ ...form, vehicleId: e.target.value })}>
                    <option value="">اختر مركبة متاحة</option>
                    {vehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.vehicle_code} — {v.plate_number} (حتى {v.max_weight_kg} كغ)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600">السائق</label>
                  <select value={form.driverId} className="w-full border rounded-xl p-2.5 text-sm mt-1"
                    onChange={(e) => setForm({ ...form, driverId: e.target.value })}>
                    <option value="">اختر سائقاً نشطاً</option>
                    {drivers.map((d) => (
                      <option key={d.id} value={d.id}>{d.driver_name_ar}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600">الوصول المتوقع</label>
                <Input type="datetime-local" value={form.estimatedArrival}
                  onChange={(e) => setForm({ ...form, estimatedArrival: e.target.value })} />
              </div>

              <p className="text-[11px] text-slate-400">
                يُرفض الإرسال تلقائياً عند: تجاوز الحمولة سعة المركبة · رخصة أو
                وثيقة منتهية · صيانة مفتوحة · مركبة أو سائق في رحلة أخرى.
              </p>
            </div>

            <div className="flex gap-2 mt-5">
              <Button onClick={() => void submitDispatch()} loading={saving} className="flex-1">إرسال</Button>
              <Button variant="secondary" onClick={() => setShowDispatch(false)} className="flex-1">إلغاء</Button>
            </div>
          </div>
        </div>
      )}

      {/* إغلاق كفاشلة — سبب إلزامي */}
      {failTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md" dir="rtl">
            <h3 className="font-bold text-lg mb-1">إغلاق الرحلة كفاشلة</h3>
            <p className="text-sm text-slate-500 mb-4">{failTarget.dispatch_code}</p>

            <label className="text-xs font-bold text-slate-600">سبب الفشل (إلزامي)</label>
            <textarea value={failReason} rows={3}
              onChange={(e) => setFailReason(e.target.value)}
              className="w-full border rounded-xl p-2.5 text-sm mt-1"
              placeholder="مثال: عطل ميكانيكي في الطريق تعذّر إصلاحه" />

            <div className="flex gap-2 mt-4">
              <Button onClick={() => void submitFail()} loading={saving} className="flex-1">تأكيد الإغلاق</Button>
              <Button variant="secondary" onClick={() => setFailTarget(null)} className="flex-1">إلغاء</Button>
            </div>
          </div>
        </div>
      )}

      {/* إثبات التسليم */}
      {epodTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md" dir="rtl">
            <h3 className="font-bold text-lg mb-1">إثبات التسليم</h3>
            <p className="text-sm text-slate-500 mb-4">
              {epodTarget.dispatch_code} — {epodTarget.destination_address}
            </p>

            <label className="text-xs font-bold text-slate-600">اسم المستلم *</label>
            <Input value={epod.recipientName}
              onChange={(e) => setEpod({ ...epod, recipientName: e.target.value })} />

            <label className="text-xs font-bold text-slate-600 block mt-3">حالة التسليم</label>
            <select value={epod.status} className="w-full border rounded-xl p-2.5 text-sm mt-1"
              onChange={(e) => setEpod({ ...epod, status: e.target.value as EpodStatus })}>
              <option value="delivered">تم التسليم</option>
              <option value="partially_delivered">تسليم جزئي</option>
              <option value="rejected">مرفوض</option>
              <option value="disputed">متنازع عليه</option>
            </select>

            <label className="text-xs font-bold text-slate-600 block mt-3">
              ملاحظات {['rejected', 'disputed'].includes(epod.status) && '(إلزامية)'}
            </label>
            <textarea value={epod.deliveryNotes} rows={3}
              onChange={(e) => setEpod({ ...epod, deliveryNotes: e.target.value })}
              className="w-full border rounded-xl p-2.5 text-sm mt-1" />

            <p className="text-[11px] text-slate-400 mt-2">
              التسليم الناجح يُغلق الرحلة ويحرّر المركبة تلقائياً.
            </p>

            <div className="flex gap-2 mt-4">
              <Button onClick={() => void submitEpod()} loading={saving} className="flex-1">حفظ</Button>
              <Button variant="secondary" onClick={() => setEpodTarget(null)} className="flex-1">إلغاء</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
