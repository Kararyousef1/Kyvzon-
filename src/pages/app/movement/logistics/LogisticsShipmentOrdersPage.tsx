import { useCallback, useEffect, useState } from 'react';
import { Package, Plus, Truck, CheckCircle2 , X } from 'lucide-react';
import { useUIStore } from '../../../../core/stores';
import { logisticsShipmentOrderService } from '../../../../services/sdk/LogisticsOrdersService';
import type { LogisticsShipmentOrderRecord } from '../../../../shared/types/logistics-orders';
import Card from '../../../../shared/components/ui/Card';
import Button from '../../../../shared/components/ui/Button';
import { getErrorMessage } from '../../../../services/errors';
import Input from '../../../../shared/components/ui/Input';
import { MovementUnitNav } from '../shared/MovementUnitNav';
import {
  logisticsDispatchOperationsService,
  type OrderPriority,
} from '../../../../services/sdk/LogisticsDispatchOperationsService';

export default function LogisticsShipmentOrdersPage() {
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    originAddress: '', destinationAddress: '', cargoDescription: '',
    cargoWeightKg: 0, cargoVolumeCbm: 0,
    priority: 'normal' as OrderPriority, scheduledDeparture: '',
  });
  const [orders, setOrders] = useState<LogisticsShipmentOrderRecord[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await logisticsShipmentOrderService.findAll({ orderBy: 'created_at', ascending: false });
      setOrders(data || []);
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { loadData(); }, [loadData]);

  /* الإنشاء عبر RPC create_shipment_order (0284) — رمز الأمر يُولَّد تلقائياً */
  const submitOrder = async () => {
    setSaving(true);
    try {
      await logisticsDispatchOperationsService.createOrder({
        ...form,
        scheduledDeparture: form.scheduledDeparture || null,
      });
      addToast('تم إنشاء أمر النقل', 'success');
      setShowCreate(false);
      setForm({
        originAddress: '', destinationAddress: '', cargoDescription: '',
        cargoWeightKg: 0, cargoVolumeCbm: 0, priority: 'normal', scheduledDeparture: '',
      });
      await loadData();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      <MovementUnitNav unit="logistics_orders" />
      <div className="bg-gradient-to-br from-indigo-700 to-slate-900 rounded-2xl p-6 text-white flex items-center justify-between flex-wrap gap-4">
        <div>
          <p className="text-white/70 text-sm font-semibold">Logistics Control • L05</p>
          <h2 className="text-2xl font-extrabold mt-1 flex items-center gap-2"><Package /> أوامر النقل والشحنات</h2>
          <p className="text-white/75 mt-2 text-sm">إدارة أوامر الشحن، الحمولة، نقاط المغادرة والوصول، والأولويات التشغيلية.</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="!bg-white !text-indigo-900 hover:!bg-indigo-50 !border-none" icon={<Plus size={16} />} iconPosition="left">أمر نقل جديد</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold"><Package size={20} /></div><div><p className="text-2xl font-extrabold text-slate-900">{orders.length}</p><p className="text-xs text-slate-500">إجمالي أوامر الشحن</p></div></div></Card>
        <Card><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold"><CheckCircle2 size={20} /></div><div><p className="text-2xl font-extrabold text-slate-900">{orders.filter(o=>o.status==='delivered').length}</p><p className="text-xs text-slate-500">الشحنات المسلمة</p></div></div></Card>
        <Card><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold"><Truck size={20} /></div><div><p className="text-2xl font-extrabold text-slate-900">{orders.filter(o=>['scheduled','dispatched','in_transit'].includes(o.status)).length}</p><p className="text-xs text-slate-500">تحت التنفيذ والجدولة</p></div></div></Card>
      </div>

      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {['رمز الأمر', 'وصف الشحنة', 'من (المغادرة)', 'إلى (الوصول)', 'الوزن (كغ)', 'الأولوية', 'الحالة'].map(h => <th key={h} className="text-right py-3 px-4 text-xs font-bold text-slate-500">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-slate-400">لا توجد أوامر نقل مسجلة.</td></tr>
              ) : orders.map(o => (
                <tr key={o.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="py-3 px-4 font-mono font-bold text-indigo-600">{o.order_code}</td>
                  <td className="py-3 px-4 font-bold text-slate-800">{o.cargo_description}</td>
                  <td className="py-3 px-4 text-slate-600">{o.origin_address}</td>
                  <td className="py-3 px-4 text-slate-600">{o.destination_address}</td>
                  <td className="py-3 px-4 font-bold text-slate-700">{o.cargo_weight_kg} كغ</td>
                  <td className="py-3 px-4">
                    {o.priority === 'urgent' ? <span className="px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 text-xs font-bold">عاجل جداً</span> :
                     o.priority === 'high' ? <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-bold">مرتفع</span> :
                     <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-bold">عادي</span>}
                  </td>
                  <td className="py-3 px-4">
                    {o.status === 'delivered' ? <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold">تم التوصيل</span> :
                     o.status === 'in_transit' ? <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-bold">في الطريق</span> :
                     <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 text-xs font-bold">{o.status}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-2xl" dir="rtl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">أمر نقل جديد</h3>
              <button type="button" onClick={() => setShowCreate(false)}
                className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-600">عنوان الانطلاق *</label>
                  <Input value={form.originAddress}
                    onChange={(e) => setForm({ ...form, originAddress: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600">عنوان الوجهة *</label>
                  <Input value={form.destinationAddress}
                    onChange={(e) => setForm({ ...form, destinationAddress: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600">وصف الحمولة *</label>
                <Input value={form.cargoDescription}
                  onChange={(e) => setForm({ ...form, cargoDescription: e.target.value })} />
              </div>
              <div className="grid md:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-600">الوزن (كغ)</label>
                  <Input type="number" value={form.cargoWeightKg}
                    onChange={(e) => setForm({ ...form, cargoWeightKg: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600">الحجم (م³)</label>
                  <Input type="number" value={form.cargoVolumeCbm}
                    onChange={(e) => setForm({ ...form, cargoVolumeCbm: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600">الأولوية</label>
                  <select value={form.priority} className="w-full border rounded-xl p-2.5 text-sm mt-1"
                    onChange={(e) => setForm({ ...form, priority: e.target.value as OrderPriority })}>
                    <option value="low">منخفضة</option>
                    <option value="normal">عادية</option>
                    <option value="high">عالية</option>
                    <option value="urgent">عاجلة</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600">موعد الانطلاق المخطط</label>
                <Input type="datetime-local" value={form.scheduledDeparture}
                  onChange={(e) => setForm({ ...form, scheduledDeparture: e.target.value })} />
              </div>
              <p className="text-[11px] text-slate-400">
                رمز الأمر يُولَّد تلقائياً. الحمولة تُفحص مقابل سعة المركبة عند الإرسال.
              </p>
            </div>
            <div className="flex gap-2 mt-5">
              <Button onClick={() => void submitOrder()} loading={saving} className="flex-1">حفظ</Button>
              <Button variant="secondary" onClick={() => setShowCreate(false)} className="flex-1">إلغاء</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
