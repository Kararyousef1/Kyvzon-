import { useCallback, useEffect, useState } from 'react';
import { BarChart3, DollarSign, Plus , X } from 'lucide-react';
import { useUIStore } from '../../../../core/stores';
import { logisticsTripCostService } from '../../../../services/sdk/LogisticsCarriersCostsService';
import type { LogisticsTripCostRecord } from '../../../../shared/types/logistics-carriers-costs';
import Card from '../../../../shared/components/ui/Card';
import { MovementUnitNav } from '../shared/MovementUnitNav';
import Button from '../../../../shared/components/ui/Button';
import { getErrorMessage } from '../../../../services/errors';
import Input from '../../../../shared/components/ui/Input';
import { movementFoundationOperationsService } from '../../../../services/sdk/MovementFoundationOperationsService';
import { exportToCsv, type ExportColumn } from '../../../../utils/dataExport';
import {
  logisticsDispatchOperationsService,
  type DispatchBoardRow,
} from '../../../../services/sdk/LogisticsDispatchOperationsService';

export default function LogisticsCostAnalyticsPage() {
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [closedDispatches, setClosedDispatches] = useState<DispatchBoardRow[]>([]);
  const [form, setForm] = useState({
    dispatchId: '', fuelCost: 0, tollCost: 0,
    driverAllowance: 0, maintenanceShare: 0, revenue: 0,
  });
  const [costs, setCosts] = useState<LogisticsTripCostRecord[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const board = await logisticsDispatchOperationsService.findDispatchBoard().catch(() => []);
      setClosedDispatches(board.filter((d) => ['completed', 'failed'].includes(d.dispatch_status)));
      const data = await logisticsTripCostService.findAll({ orderBy: 'created_at', ascending: false });
      setCosts(data || []);
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { loadData(); }, [loadData]);

  const totalCost = costs.reduce((acc, c) => acc + Number(c.total_cost), 0);
  const totalRevenue = costs.reduce((acc, c) => acc + Number(c.revenue), 0);
  const netProfit = costs.reduce((acc, c) => acc + Number(c.net_profit), 0);

  /*
    الإجمالي والربح يُحسبان في الخادم (0285) — لا يُمرَّران من الواجهة.
    قبل ذلك كانا عمودين عاديين قابلين للكتابة بقيمة لا تطابق مكوّناتها.
  */
  const previewTotal =
    form.fuelCost + form.tollCost + form.driverAllowance + form.maintenanceShare;
  const previewProfit = form.revenue - previewTotal;

  /* التصدير عبر dataExport: BOM للعربية + حماية من حقن الصيغ */
  const exportCosts = () => {
    if (costs.length === 0) {
      addToast('لا بيانات للتصدير', 'info');
      return;
    }
    const columns: ExportColumn<typeof costs[number]>[] = [
      { header: 'تكلفة الوقود',   value: (r) => r.fuel_cost ?? 0 },
      { header: 'الرسوم',         value: (r) => r.toll_cost ?? 0 },
      { header: 'بدل السائق',     value: (r) => r.driver_allowance ?? 0 },
      { header: 'حصة الصيانة',    value: (r) => r.maintenance_share ?? 0 },
      { header: 'إجمالي التكلفة', value: (r) => r.total_cost ?? 0 },
      { header: 'الإيراد',        value: (r) => r.revenue ?? 0 },
      { header: 'صافي الربح',     value: (r) => r.net_profit ?? 0 },
      { header: 'الحالة',         value: (r) => r.status },
    ];
    exportToCsv('تكاليف_الرحلات', columns, costs);
    addToast(`تم تصدير ${costs.length} سجلاً`, 'success');
  };

  const submitCost = async () => {
    if (!form.dispatchId) { addToast('اختر الرحلة', 'error'); return; }
    setSaving(true);
    try {
      const res = await movementFoundationOperationsService.recordTripCost(form);
      addToast(`تم التسجيل — التكلفة ${res.total_cost} · الربح ${res.net_profit}`, 'success');
      setShowCreate(false);
      setForm({ dispatchId: '', fuelCost: 0, tollCost: 0, driverAllowance: 0, maintenanceShare: 0, revenue: 0 });
      await loadData();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      <MovementUnitNav unit="logistics_costs" />
      <div className="bg-gradient-to-br from-indigo-700 to-slate-900 rounded-2xl p-6 text-white flex items-center justify-between flex-wrap gap-4">
        <div>
          <p className="text-white/70 text-sm font-semibold">Logistics Control • L11</p>
          <h2 className="text-2xl font-extrabold mt-1 flex items-center gap-2"><BarChart3 /> التكاليف والتحليلات المالية للرحلات</h2>
          <p className="text-white/75 mt-2 text-sm">متابعة تكاليف التشغيل، الإيرادات، صافي الأرباح، والتسويات المالية للرحلات.</p>
        </div>
        <Button variant="secondary" onClick={exportCosts} className="!bg-white/10 !text-white hover:!bg-white/20 !border-none">تصدير CSV</Button>
        <Button onClick={() => setShowCreate(true)} className="!bg-white !text-indigo-900 hover:!bg-indigo-50 !border-none" icon={<Plus size={16} />} iconPosition="left">سجل تكلفة</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold"><DollarSign size={20} /></div><div><p className="text-2xl font-extrabold text-slate-900">{totalCost.toLocaleString()} د.ع</p><p className="text-xs text-slate-500">إجمالي التكاليف التشغيلية</p></div></div></Card>
        <Card><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold"><DollarSign size={20} /></div><div><p className="text-2xl font-extrabold text-slate-900">{totalRevenue.toLocaleString()} د.ع</p><p className="text-xs text-slate-500">إجمالي الإيرادات</p></div></div></Card>
        <Card><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center font-bold"><BarChart3 size={20} /></div><div><p className="text-2xl font-extrabold text-slate-900">{netProfit.toLocaleString()} د.ع</p><p className="text-xs text-slate-500">صافي الأرباح التشغيلية</p></div></div></Card>
      </div>

      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {['تكلفة الوقود', 'تكلفة الرسوم (Tolls)', 'بدلات السائق', 'إجمالي التكاليف', 'الإيرادات', 'صافي الربح', 'الحالة'].map(h => <th key={h} className="text-right py-3 px-4 text-xs font-bold text-slate-500">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {costs.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-slate-400">لا توجد تحليلات تكاليف مسجلة.</td></tr>
              ) : costs.map(c => (
                <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="py-3 px-4 font-mono text-slate-700">{c.fuel_cost.toLocaleString()} د.ع</td>
                  <td className="py-3 px-4 font-mono text-slate-700">{c.toll_cost.toLocaleString()} د.ع</td>
                  <td className="py-3 px-4 font-mono text-slate-700">{c.driver_allowance.toLocaleString()} د.ع</td>
                  <td className="py-3 px-4 font-mono font-bold text-slate-900">{c.total_cost.toLocaleString()} د.ع</td>
                  <td className="py-3 px-4 font-mono font-bold text-emerald-700">{c.revenue.toLocaleString()} د.ع</td>
                  <td className="py-3 px-4 font-mono font-bold text-indigo-700">{c.net_profit.toLocaleString()} د.ع</td>
                  <td className="py-3 px-4">
                    {c.status === 'paid' ? <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold">مدفوع</span> :
                     c.status === 'approved' ? <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-bold">معتمد</span> :
                     <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-bold">{c.status}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-xl max-h-[92vh] overflow-auto" dir="rtl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">تسجيل تكلفة رحلة</h3>
              <button type="button" onClick={() => setShowCreate(false)}
                className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-600">الرحلة (المنتهية فقط) *</label>
                <select value={form.dispatchId} className="w-full border rounded-xl p-2.5 text-sm mt-1"
                  onChange={(e) => setForm({ ...form, dispatchId: e.target.value })}>
                  <option value="">اختر رحلة</option>
                  {closedDispatches.map((d) => (
                    <option key={d.dispatch_id} value={d.dispatch_id}>
                      {d.dispatch_code} — {d.order_code} ({d.vehicle_code})
                    </option>
                  ))}
                </select>
                {closedDispatches.length === 0 && (
                  <p className="text-[11px] text-amber-600 mt-1">
                    لا رحلات منتهية بعد. التكلفة تُسجَّل بعد اكتمال الرحلة أو فشلها.
                  </p>
                )}
              </div>

              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-600">تكلفة الوقود</label>
                  <Input type="number" value={form.fuelCost}
                    onChange={(e) => setForm({ ...form, fuelCost: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600">الرسوم والعبور</label>
                  <Input type="number" value={form.tollCost}
                    onChange={(e) => setForm({ ...form, tollCost: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600">بدل السائق</label>
                  <Input type="number" value={form.driverAllowance}
                    onChange={(e) => setForm({ ...form, driverAllowance: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600">حصة الصيانة</label>
                  <Input type="number" value={form.maintenanceShare}
                    onChange={(e) => setForm({ ...form, maintenanceShare: Number(e.target.value) })} />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600">الإيراد</label>
                <Input type="number" value={form.revenue}
                  onChange={(e) => setForm({ ...form, revenue: Number(e.target.value) })} />
              </div>

              <div className="border rounded-xl p-3 bg-slate-50 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-600">إجمالي التكلفة (محسوب)</span>
                  <span className="font-bold font-mono">{previewTotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">صافي الربح (محسوب)</span>
                  <span className={`font-bold font-mono ${previewProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {previewProfit.toLocaleString()}
                  </span>
                </div>
              </div>

              <p className="text-[11px] text-slate-400">
                القيم أعلاه معاينة فقط — الحساب النهائي يتم في الخادم ولا يُقبل
                إدخاله يدوياً. لا يُسمح بتسجيل تكلفتين لنفس الرحلة.
              </p>
            </div>

            <div className="flex gap-2 mt-5">
              <Button onClick={() => void submitCost()} loading={saving} className="flex-1">حفظ</Button>
              <Button variant="secondary" onClick={() => setShowCreate(false)} className="flex-1">إلغاء</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
