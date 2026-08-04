import { useCallback, useEffect, useState } from 'react';
import { Plus, Send, Zap } from 'lucide-react';
import { useUIStore } from '../../../../core/stores';
import { logisticsDispatchService } from '../../../../services/sdk/LogisticsOrdersService';
import type { LogisticsDispatchRecord } from '../../../../shared/types/logistics-orders';
import Card from '../../../../shared/components/ui/Card';
import Button from '../../../../shared/components/ui/Button';
import { getErrorMessage } from '../../../../services/errors';

export default function LogisticsDispatchPage() {
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(true);
  const [dispatches, setDispatches] = useState<LogisticsDispatchRecord[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await logisticsDispatchService.findAll({ orderBy: 'dispatched_at', ascending: false });
      setDispatches(data || []);
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
          <p className="text-white/70 text-sm font-semibold">Logistics Control • L07</p>
          <h2 className="text-2xl font-extrabold mt-1 flex items-center gap-2"><Send /> الإرسال وتنفيذ الرحلات</h2>
          <p className="text-white/75 mt-2 text-sm">إدارة عمليات إرسال المركبات والسائقين وربطهم بأوامر الشحن.</p>
        </div>
        <Button onClick={() => addToast('إرسال رحلة جديدة قيد التطوير', 'info')} className="!bg-white !text-indigo-900 hover:!bg-indigo-50 !border-none" icon={<Plus size={16} />} iconPosition="left">إرسال رحلة</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold"><Zap size={20} /></div><div><p className="text-2xl font-extrabold text-slate-900">{dispatches.length}</p><p className="text-xs text-slate-500">إجمالي عمليات الإرسال</p></div></div></Card>
        <Card><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold"><Send size={20} /></div><div><p className="text-2xl font-extrabold text-slate-900">{dispatches.filter(d=>['dispatched','en_route'].includes(d.status)).length}</p><p className="text-xs text-slate-500">رحلات جارية</p></div></div></Card>
        <Card><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold"><Zap size={20} /></div><div><p className="text-2xl font-extrabold text-slate-900">{dispatches.filter(d=>d.status==='completed').length}</p><p className="text-xs text-slate-500">رحلات مكتملة</p></div></div></Card>
      </div>

      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {['رمز الإرسال', 'معرّف أمر الشحن', 'تاريخ الإرسال', 'الحالة'].map(h => <th key={h} className="text-right py-3 px-4 text-xs font-bold text-slate-500">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {dispatches.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-12 text-slate-400">لا توجد عمليات إرسال مسجلة.</td></tr>
              ) : dispatches.map(d => (
                <tr key={d.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="py-3 px-4 font-mono font-bold text-indigo-600">{d.dispatch_code}</td>
                  <td className="py-3 px-4 font-mono text-slate-600">{d.order_id.substring(0, 12)}...</td>
                  <td className="py-3 px-4 font-mono text-slate-500">{new Date(d.dispatched_at).toLocaleString('ar-IQ')}</td>
                  <td className="py-3 px-4">
                    {d.status === 'completed' ? <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold">مكتملة</span> :
                     d.status === 'en_route' ? <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-bold">في الطريق</span> :
                     <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 text-xs font-bold">{d.status}</span>}
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
