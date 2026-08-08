import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Fuel, Plus, X } from 'lucide-react';
import { useUIStore } from '../../../../core/stores';
import { logisticsFuelService } from '../../../../services/sdk/LogisticsEpodFuelService';
import type { LogisticsFuelLogRecord } from '../../../../shared/types/logistics-epod-fuel';
import Card from '../../../../shared/components/ui/Card';
import Button from '../../../../shared/components/ui/Button';
import { getErrorMessage } from '../../../../services/errors';
import Input from '../../../../shared/components/ui/Input';
import { MovementUnitNav } from '../shared/MovementUnitNav';
import { logisticsVehicleService, logisticsDriverService } from '../../../../services/sdk/LogisticsFleetService';
import type { LogisticsVehicleRecord, LogisticsDriverRecord } from '../../../../shared/types/logistics-fleet';
import {
  logisticsDispatchOperationsService,
  FUEL_FLAG_LABELS,
  type FuelFlag,
} from '../../../../services/sdk/LogisticsDispatchOperationsService';

export default function LogisticsFuelPage() {
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(true);
  const [fuelLogs, setFuelLogs] = useState<LogisticsFuelLogRecord[]>([]);
  const [vehicles, setVehicles] = useState<LogisticsVehicleRecord[]>([]);
  const [drivers, setDrivers] = useState<LogisticsDriverRecord[]>([]);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [lastFlags, setLastFlags] = useState<FuelFlag[]>([]);
  const [form, setForm] = useState({
    vehicleId: '', driverId: '', liters: 0, cost: 0,
    odometerReading: 0, stationName: '',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [data, v, d] = await Promise.all([
        logisticsFuelService.findAll({ orderBy: 'logged_at', ascending: false }),
        logisticsVehicleService.findAll({ orderBy: 'vehicle_code', ascending: true }).catch(() => []),
        logisticsDriverService.findActiveDrivers().catch(() => []),
      ]);
      setFuelLogs(data || []);
      setVehicles(v || []);
      setDrivers(d || []);
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { loadData(); }, [loadData]);

  /*
    التسجيل عبر RPC log_fuel_transaction (0284) لا إدراجاً مباشراً:
    يمنع تراجع العداد ويكشف أعلام الاحتيال (تزوّد سريع · استهلاك شاذ ·
    كمية مفرطة · وقود لمركبة كهربائية).
  */
  const submitFuel = async () => {
    if (!form.vehicleId) { addToast('اختر المركبة', 'error'); return; }
    setSaving(true);
    try {
      const res = await logisticsDispatchOperationsService.logFuel({
        vehicleId: form.vehicleId,
        liters: form.liters,
        cost: form.cost,
        odometerReading: form.odometerReading,
        driverId: form.driverId || null,
        stationName: form.stationName || null,
      });
      setLastFlags(res.flags);
      addToast(
        res.flags.length > 0
          ? `تم التسجيل مع ${res.flags.length} تنبيه يحتاج مراجعة`
          : 'تم تسجيل التزوّد',
        res.flags.length > 0 ? 'info' : 'success',
      );
      setShowCreate(false);
      setForm({ vehicleId: '', driverId: '', liters: 0, cost: 0, odometerReading: 0, stationName: '' });
      await loadData();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const totalLiters = fuelLogs.reduce((acc, f) => acc + Number(f.liters), 0);
  const totalCost = fuelLogs.reduce((acc, f) => acc + Number(f.cost), 0);

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      <MovementUnitNav unit="logistics_fuel" />
      <div className="bg-gradient-to-br from-indigo-700 to-slate-900 rounded-2xl p-6 text-white flex items-center justify-between flex-wrap gap-4">
        <div>
          <p className="text-white/70 text-sm font-semibold">Logistics Control • L04</p>
          <h2 className="text-2xl font-extrabold mt-1 flex items-center gap-2"><Fuel /> استهلاك الوقود والطاقة</h2>
          <p className="text-white/75 mt-2 text-sm">متابعة تعبئة الوقود، التكاليف، قراءات العدادات، وكفاءة استهلاك الأسطول.</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="!bg-white !text-indigo-900 hover:!bg-indigo-50 !border-none" icon={<Plus size={16} />} iconPosition="left">سجل وقود</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold"><Fuel size={20} /></div><div><p className="text-2xl font-extrabold text-slate-900">{totalLiters.toLocaleString()} لتر</p><p className="text-xs text-slate-500">إجمالي الوقود المستهلك</p></div></div></Card>
        <Card><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center font-bold"><Fuel size={20} /></div><div><p className="text-2xl font-extrabold text-slate-900">{totalCost.toLocaleString()} د.ع</p><p className="text-xs text-slate-500">إجمالي التكاليف المالية</p></div></div></Card>
        <Card><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold"><Fuel size={20} /></div><div><p className="text-2xl font-extrabold text-slate-900">{fuelLogs.length}</p><p className="text-xs text-slate-500">عمليات التعبئة المسجلة</p></div></div></Card>
      </div>

      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {['معرّف المركبة', 'كمية الوقود (لتر)', 'التكلفة الإجمالية (د.ع)', 'قراءة العداد (كم)', 'محطة التعبئة', 'وقت التسجيل'].map(h => <th key={h} className="text-right py-3 px-4 text-xs font-bold text-slate-500">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {fuelLogs.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-slate-400">لا توجد سجلات وقود مسجلة.</td></tr>
              ) : fuelLogs.map(f => (
                <tr key={f.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="py-3 px-4 font-mono font-bold text-indigo-600">{f.vehicle_id.substring(0, 12)}...</td>
                  <td className="py-3 px-4 font-bold text-slate-800">{f.liters} لتر</td>
                  <td className="py-3 px-4 font-mono font-bold text-slate-700">{f.cost.toLocaleString()} د.ع</td>
                  <td className="py-3 px-4 font-mono text-slate-600">{f.odometer_reading} كم</td>
                  <td className="py-3 px-4 text-slate-600">{f.station_name || '—'}</td>
                  <td className="py-3 px-4 font-mono text-slate-500">{new Date(f.logged_at).toLocaleString('ar-IQ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* أعلام آخر تسجيل — تظهر بعد الحفظ مباشرة */}
      {lastFlags.length > 0 && (
        <Card>
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="text-amber-600" size={18} />
            <h3 className="font-bold text-slate-900">تنبيهات آخر تسجيل</h3>
            <button type="button" onClick={() => setLastFlags([])}
              className="mr-auto text-slate-400 hover:text-slate-700"><X size={16} /></button>
          </div>
          <div className="flex flex-wrap gap-2">
            {lastFlags.map((f) => (
              <span key={f} className="text-xs px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 font-bold">
                {FUEL_FLAG_LABELS[f] ?? f}
              </span>
            ))}
          </div>
          <p className="text-[11px] text-slate-400 mt-2">
            الأعلام لا تمنع التسجيل — تُعلَّم المعاملة للمراجعة.
          </p>
        </Card>
      )}

      {/* نموذج تسجيل التزوّد */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-xl" dir="rtl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">تسجيل تزوّد وقود</h3>
              <button type="button" onClick={() => setShowCreate(false)}
                className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-600">المركبة *</label>
                <select value={form.vehicleId} className="w-full border rounded-xl p-2.5 text-sm mt-1"
                  onChange={(e) => {
                    const v = vehicles.find((x) => x.id === e.target.value);
                    setForm({
                      ...form,
                      vehicleId: e.target.value,
                      odometerReading: v ? Number(v.current_mileage_km) : 0,
                    });
                  }}>
                  <option value="">اختر مركبة</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.vehicle_code} — {v.plate_number} ({v.current_mileage_km} كم)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600">السائق</label>
                <select value={form.driverId} className="w-full border rounded-xl p-2.5 text-sm mt-1"
                  onChange={(e) => setForm({ ...form, driverId: e.target.value })}>
                  <option value="">بلا سائق محدد</option>
                  {drivers.map((d) => <option key={d.id} value={d.id}>{d.driver_name_ar}</option>)}
                </select>
              </div>

              <div className="grid md:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-600">اللترات *</label>
                  <Input type="number" value={form.liters}
                    onChange={(e) => setForm({ ...form, liters: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600">التكلفة</label>
                  <Input type="number" value={form.cost}
                    onChange={(e) => setForm({ ...form, cost: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600">قراءة العداد *</label>
                  <Input type="number" value={form.odometerReading}
                    onChange={(e) => setForm({ ...form, odometerReading: Number(e.target.value) })} />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600">المحطة</label>
                <Input value={form.stationName}
                  onChange={(e) => setForm({ ...form, stationName: e.target.value })} />
              </div>

              <p className="text-[11px] text-slate-400">
                العداد لا يتراجع. يُكشف تلقائياً: تزوّدان خلال ساعة · استهلاك شاذ ·
                كمية مفرطة · وقود لمركبة كهربائية.
              </p>
            </div>

            <div className="flex gap-2 mt-5">
              <Button onClick={() => void submitFuel()} loading={saving} className="flex-1">حفظ</Button>
              <Button variant="secondary" onClick={() => setShowCreate(false)} className="flex-1">إلغاء</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
