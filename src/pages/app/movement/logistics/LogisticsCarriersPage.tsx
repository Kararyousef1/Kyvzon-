import { useCallback, useEffect, useState } from 'react';
import { Award, Plus, Truck } from 'lucide-react';
import { useUIStore } from '../../../../core/stores';
import { logisticsCarrierService } from '../../../../services/sdk/LogisticsCarriersCostsService';
import type { LogisticsCarrierRecord } from '../../../../shared/types/logistics-carriers-costs';
import Card from '../../../../shared/components/ui/Card';
import Button from '../../../../shared/components/ui/Button';
import { getErrorMessage } from '../../../../services/errors';

export default function LogisticsCarriersPage() {
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(true);
  const [carriers, setCarriers] = useState<LogisticsCarrierRecord[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await logisticsCarrierService.findAll({ orderBy: 'carrier_name_ar', ascending: true });
      setCarriers(data || []);
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
          <p className="text-white/70 text-sm font-semibold">Logistics Control • L10</p>
          <h2 className="text-2xl font-extrabold mt-1 flex items-center gap-2"><Truck /> الناقلون والتعاقد الخارجي (3PL)</h2>
          <p className="text-white/75 mt-2 text-sm">إدارة شركات الشحن الخارجية، عقود الخدمات، تقييم الأداء والالتزام.</p>
        </div>
        <Button onClick={() => addToast('إضافة ناقل جديد قيد التطوير', 'info')} className="!bg-white !text-indigo-900 hover:!bg-indigo-50 !border-none" icon={<Plus size={16} />} iconPosition="left">ناقل جديد</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold"><Truck size={20} /></div><div><p className="text-2xl font-extrabold text-slate-900">{carriers.length}</p><p className="text-xs text-slate-500">إجمالي الناقلين الخارجيين</p></div></div></Card>
        <Card><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold"><Award size={20} /></div><div><p className="text-2xl font-extrabold text-slate-900">{carriers.filter(c=>c.status==='active').length}</p><p className="text-xs text-slate-500">ناقلون نشطون وعقود سارية</p></div></div></Card>
        <Card><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center font-bold"><Award size={20} /></div><div><p className="text-2xl font-extrabold text-slate-900">5.0 / 5</p><p className="text-xs text-slate-500">متوسط تقييم جودة الخدمة</p></div></div></Card>
      </div>

      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {['رمز الناقل', 'اسم شركة النقل', 'نوع الخدمة', 'مسؤول الاتصال', 'الهاتف', 'التقييم', 'الحالة'].map(h => <th key={h} className="text-right py-3 px-4 text-xs font-bold text-slate-500">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {carriers.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-slate-400">لا توجد شركات نقل خارجية مسجلة.</td></tr>
              ) : carriers.map(c => (
                <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="py-3 px-4 font-mono font-bold text-indigo-600">{c.carrier_code}</td>
                  <td className="py-3 px-4 font-bold text-slate-800">{c.carrier_name_ar}</td>
                  <td className="py-3 px-4"><span className="px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold">{c.service_type}</span></td>
                  <td className="py-3 px-4 text-slate-600">{c.contact_person || '—'}</td>
                  <td className="py-3 px-4 font-mono text-slate-600">{c.phone || '—'}</td>
                  <td className="py-3 px-4 font-bold text-amber-600 flex items-center gap-1"><Award size={14} /> {c.rating}</td>
                  <td className="py-3 px-4">
                    {c.status === 'active' ? <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold">نشط</span> :
                     <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 text-xs font-bold">{c.status}</span>}
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
