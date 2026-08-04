import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, FileText, Plus } from 'lucide-react';
import { useUIStore } from '../../../../core/stores';
import { logisticsEpodService } from '../../../../services/sdk/LogisticsEpodFuelService';
import type { LogisticsEpodRecord } from '../../../../shared/types/logistics-epod-fuel';
import Card from '../../../../shared/components/ui/Card';
import Button from '../../../../shared/components/ui/Button';
import { getErrorMessage } from '../../../../services/errors';

export default function LogisticsEpodPage() {
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(true);
  const [epods, setEpods] = useState<LogisticsEpodRecord[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await logisticsEpodService.findAll({ orderBy: 'delivered_at', ascending: false });
      setEpods(data || []);
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { loadData(); }, [loadData]);

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      <div className="bg-gradient-to-br from-indigo-700 to-slate-900 rounded-2xl p-6 text-white flex items-center justify-between flex-wrap gap-4">
        <div>
          <p className="text-white/70 text-sm font-semibold">Logistics Control • L09</p>
          <h2 className="text-2xl font-extrabold mt-1 flex items-center gap-2"><FileText /> التسليم وإثباته الإلكتروني (EPOD)</h2>
          <p className="text-white/75 mt-2 text-sm">إدارة توقيعات المستلمين، صور إثبات التسليم، والملاحظات الميدانية.</p>
        </div>
        <Button onClick={() => addToast('إثبات تسليم جديد قيد التطوير', 'info')} className="!bg-white !text-indigo-900 hover:!bg-indigo-50 !border-none" icon={<Plus size={16} />} iconPosition="left">إثبات تسليم</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold"><FileText size={20} /></div><div><p className="text-2xl font-extrabold text-slate-900">{epods.length}</p><p className="text-xs text-slate-500">إجمالي إثباتات التسليم</p></div></div></Card>
        <Card><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold"><CheckCircle2 size={20} /></div><div><p className="text-2xl font-extrabold text-slate-900">{epods.filter(e=>e.status==='delivered').length}</p><p className="text-xs text-slate-500">تسليم ناجح ومعتمد</p></div></div></Card>
        <Card><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold"><FileText size={20} /></div><div><p className="text-2xl font-extrabold text-slate-900">100%</p><p className="text-xs text-slate-500">دقة التوثيق الرقمي</p></div></div></Card>
      </div>

      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {['معرّف الرحلة', 'المستلم', 'وقت التسليم', 'ملاحظات التسليم', 'الحالة'].map(h => <th key={h} className="text-right py-3 px-4 text-xs font-bold text-slate-500">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {epods.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-12 text-slate-400">لا توجد إثباتات تسليم مسجلة حالياً.</td></tr>
              ) : epods.map(e => (
                <tr key={e.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="py-3 px-4 font-mono font-bold text-indigo-600">{e.dispatch_id.substring(0, 12)}...</td>
                  <td className="py-3 px-4 font-bold text-slate-800">{e.recipient_name}</td>
                  <td className="py-3 px-4 font-mono text-slate-500">{new Date(e.delivered_at).toLocaleString('ar-IQ')}</td>
                  <td className="py-3 px-4 text-slate-600">{e.delivery_notes || '—'}</td>
                  <td className="py-3 px-4">
                    {e.status === 'delivered' ? <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold">تم التسليم</span> :
                     <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-bold">{e.status}</span>}
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
