import { useCallback, useEffect, useState } from 'react';
import { Plus, Wrench , X } from 'lucide-react';
import { useUIStore } from '../../../../core/stores';
import { logisticsMaintenanceService } from '../../../../services/sdk/LogisticsFleetService';
import type { LogisticsMaintenanceRecord } from '../../../../shared/types/logistics-fleet';
import Card from '../../../../shared/components/ui/Card';
import { MovementUnitNav } from '../shared/MovementUnitNav';
import Button from '../../../../shared/components/ui/Button';
import { getErrorMessage } from '../../../../services/errors';
import Input from '../../../../shared/components/ui/Input';
import { logisticsVehicleService } from '../../../../services/sdk/LogisticsFleetService';
import type { LogisticsVehicleRecord } from '../../../../shared/types/logistics-fleet';
import {
  logisticsFleetOperationsService,
  type MaintenanceType,
} from '../../../../services/sdk/LogisticsFleetOperationsService';

export default function LogisticsMaintenancePage() {
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [vehicles, setVehicles] = useState<LogisticsVehicleRecord[]>([]);
  const [completeTarget, setCompleteTarget] = useState<{ id: string; label: string } | null>(null);
  const [actualCost, setActualCost] = useState(0);
  const [completeNotes, setCompleteNotes] = useState('');
  const [form, setForm] = useState({
    vehicleId: '', maintenanceType: 'routine' as MaintenanceType,
    scheduledDate: new Date().toISOString().slice(0, 10),
    description: '', estimatedCost: 0,
  });
  const [maintenanceRecords, setMaintenanceRecords] = useState<LogisticsMaintenanceRecord[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const v = await logisticsVehicleService.findAll({ orderBy: 'vehicle_code', ascending: true }).catch(() => []);
      setVehicles(v || []);
      const data = await logisticsMaintenanceService.findAll({ orderBy: 'scheduled_date', ascending: true });
      setMaintenanceRecords(data || []);
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { loadData(); }, [loadData]);

  /* الجدولة والإكمال عبر RPCs (0283): صيانة اليوم تُخرج المركبة من الخدمة،
     والإكمال يعيدها إن لم يبقَ أمر مفتوح آخر. */
  const submitSchedule = async () => {
    if (!form.vehicleId) { addToast('اختر المركبة', 'error'); return; }
    setSaving(true);
    try {
      await logisticsFleetOperationsService.scheduleMaintenance(form);
      addToast('تمت جدولة الصيانة', 'success');
      setShowCreate(false);
      setForm({
        vehicleId: '', maintenanceType: 'routine',
        scheduledDate: new Date().toISOString().slice(0, 10),
        description: '', estimatedCost: 0,
      });
      await loadData();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const submitComplete = async () => {
    if (!completeTarget) return;
    setSaving(true);
    try {
      await logisticsFleetOperationsService.completeMaintenance(
        completeTarget.id, actualCost, completeNotes || undefined,
      );
      addToast('تم إكمال الصيانة', 'success');
      setCompleteTarget(null); setActualCost(0); setCompleteNotes('');
      await loadData();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      <MovementUnitNav unit="logistics_maintenance" />
      <div className="bg-gradient-to-br from-indigo-700 to-slate-900 rounded-2xl p-6 text-white flex items-center justify-between flex-wrap gap-4">
        <div>
          <p className="text-white/70 text-sm font-semibold">Logistics Control • L03</p>
          <h2 className="text-2xl font-extrabold mt-1 flex items-center gap-2"><Wrench /> جدول الصيانة والإصلاح</h2>
          <p className="text-white/75 mt-2 text-sm">متابعة أعمال الصيانة الدورية، الطارئة، وإصلاحات الأسطول وتكاليفها.</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="!bg-white !text-indigo-900 hover:!bg-indigo-50 !border-none" icon={<Plus size={16} />} iconPosition="left">سجل صيانة</Button>
      </div>

      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {['نوع الصيانة', 'الوصف', 'التكلفة (د.ع)', 'تاريخ الجدولة', 'الحالة', 'إجراءات'].map(h => <th key={h} className="text-right py-3 px-4 text-xs font-bold text-slate-500">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {maintenanceRecords.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-12 text-slate-400">لا توجد سجلات صيانة حالية.</td></tr>
              ) : maintenanceRecords.map(m => (
                <tr key={m.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="py-3 px-4"><span className="px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold">{m.maintenance_type}</span></td>
                  <td className="py-3 px-4 font-bold text-slate-800">{m.description}</td>
                  <td className="py-3 px-4 font-mono font-bold text-slate-700">{m.cost.toLocaleString()} د.ع</td>
                  <td className="py-3 px-4 font-mono text-slate-600">{m.scheduled_date}</td>
                  <td className="py-3 px-4">
                    {m.status === 'scheduled' ? <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-bold">مجدولة</span> :
                     m.status === 'in_progress' ? <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-bold">قيد التنفيذ</span> :
                     m.status === 'completed' ? <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold">مكتملة</span> :
                     <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 text-xs font-bold">ملغاة</span>}
                  </td>
                  <td className="py-3 px-4">
                    {['scheduled', 'in_progress'].includes(m.status) && (
                      <button
                        type="button"
                        onClick={() => {
                          setCompleteTarget({ id: m.id, label: m.description });
                          setActualCost(Number(m.cost) || 0);
                        }}
                        className="px-2 py-1 rounded-lg border text-xs font-bold text-emerald-700 hover:bg-emerald-50"
                      >
                        إكمال
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-xl" dir="rtl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">جدولة صيانة</h3>
              <button type="button" onClick={() => setShowCreate(false)}
                className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-600">المركبة *</label>
                <select value={form.vehicleId} className="w-full border rounded-xl p-2.5 text-sm mt-1"
                  onChange={(e) => setForm({ ...form, vehicleId: e.target.value })}>
                  <option value="">اختر مركبة</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>{v.vehicle_code} — {v.plate_number}</option>
                  ))}
                </select>
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-600">نوع الصيانة</label>
                  <select value={form.maintenanceType} className="w-full border rounded-xl p-2.5 text-sm mt-1"
                    onChange={(e) => setForm({ ...form, maintenanceType: e.target.value as MaintenanceType })}>
                    <option value="routine">دورية</option>
                    <option value="repair">إصلاح</option>
                    <option value="emergency">طارئة</option>
                    <option value="inspection">فحص</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600">التاريخ المجدول *</label>
                  <Input type="date" value={form.scheduledDate}
                    onChange={(e) => setForm({ ...form, scheduledDate: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600">الوصف * (5 أحرف على الأقل)</label>
                <textarea value={form.description} rows={3}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full border rounded-xl p-2.5 text-sm mt-1"
                  placeholder="مثال: تغيير زيت المحرك والفلاتر" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600">التكلفة المقدَّرة</label>
                <Input type="number" value={form.estimatedCost}
                  onChange={(e) => setForm({ ...form, estimatedCost: Number(e.target.value) })} />
              </div>
              <p className="text-[11px] text-slate-400">
                صيانة بتاريخ اليوم أو قبله تُخرج المركبة من الخدمة تلقائياً.
                لا يُسمح بأمرَي صيانة مفتوحين لنفس المركبة.
              </p>
            </div>
            <div className="flex gap-2 mt-5">
              <Button onClick={() => void submitSchedule()} loading={saving} className="flex-1">جدولة</Button>
              <Button variant="secondary" onClick={() => setShowCreate(false)} className="flex-1">إلغاء</Button>
            </div>
          </div>
        </div>
      )}

      {completeTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md" dir="rtl">
            <h3 className="font-bold text-lg mb-1">إكمال الصيانة</h3>
            <p className="text-sm text-slate-500 mb-4">{completeTarget.label}</p>
            <label className="text-xs font-bold text-slate-600">التكلفة الفعلية *</label>
            <Input type="number" value={actualCost}
              onChange={(e) => setActualCost(Number(e.target.value))} />
            <label className="text-xs font-bold text-slate-600 block mt-3">ملاحظات الفني</label>
            <textarea value={completeNotes} rows={3}
              onChange={(e) => setCompleteNotes(e.target.value)}
              className="w-full border rounded-xl p-2.5 text-sm mt-1" />
            <p className="text-[11px] text-slate-400 mt-2">
              تعود المركبة للخدمة إن لم يبقَ أمر صيانة مفتوح آخر.
            </p>
            <div className="flex gap-2 mt-4">
              <Button onClick={() => void submitComplete()} loading={saving} className="flex-1">إكمال</Button>
              <Button variant="secondary" onClick={() => setCompleteTarget(null)} className="flex-1">إلغاء</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
