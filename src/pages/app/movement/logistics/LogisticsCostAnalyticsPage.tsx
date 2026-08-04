import { useCallback, useEffect, useState } from 'react';
import { BarChart3, DollarSign, Plus } from 'lucide-react';
import { useUIStore } from '../../../../core/stores';
import { logisticsTripCostService } from '../../../../services/sdk/LogisticsCarriersCostsService';
import type { LogisticsTripCostRecord } from '../../../../shared/types/logistics-carriers-costs';
import Card from '../../../../shared/components/ui/Card';
import Button from '../../../../shared/components/ui/Button';
import { getErrorMessage } from '../../../../services/errors';

export default function LogisticsCostAnalyticsPage() {
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(true);
  const [costs, setCosts] = useState<LogisticsTripCostRecord[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
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

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      <div className="bg-gradient-to-br from-indigo-700 to-slate-900 rounded-2xl p-6 text-white flex items-center justify-between flex-wrap gap-4">
        <div>
          <p className="text-white/70 text-sm font-semibold">Logistics Control • L11</p>
          <h2 className="text-2xl font-extrabold mt-1 flex items-center gap-2"><BarChart3 /> التكاليف والتحليلات المالية للرحلات</h2>
          <p className="text-white/75 mt-2 text-sm">متابعة تكاليف التشغيل، الإيرادات، صافي الأرباح، والتسويات المالية للرحلات.</p>
        </div>
        <Button onClick={() => addToast('إضافة تحليل تكلفة جديد قيد التطوير', 'info')} className="!bg-white !text-indigo-900 hover:!bg-indigo-50 !border-none" icon={<Plus size={16} />} iconPosition="left">سجل تكلفة</Button>
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
    </div>
  );
}
