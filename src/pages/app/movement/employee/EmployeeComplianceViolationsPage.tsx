import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { useUIStore } from '../../../../core/stores';
import { employeeViolationService } from '../../../../services/sdk/EmployeeComplianceService';
import type { EmployeeViolationRecord } from '../../../../shared/types/employee-compliance';
import Card from '../../../../shared/components/ui/Card';
import { getErrorMessage } from '../../../../services/errors';

export default function EmployeeComplianceViolationsPage() {
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(true);
  const [violations, setViolations] = useState<EmployeeViolationRecord[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await employeeViolationService.findAll({ orderBy: 'recorded_at', ascending: false });
      setViolations(data || []);
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { loadData(); }, [loadData]);

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl p-6 text-white flex items-center justify-between flex-wrap gap-4">
        <div>
          <p className="text-white/70 text-sm font-semibold">Employee Movement • E05</p>
          <h2 className="text-2xl font-extrabold mt-1 flex items-center gap-2"><ShieldAlert /> الامتثال والمخالفات المرصودة</h2>
          <p className="text-white/75 mt-2 text-sm">متابعة مخالفات التأخير، الخروج غير المصرح به، وانحرافات المسار للموظفين.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center font-bold"><ShieldAlert size={20} /></div><div><p className="text-2xl font-extrabold text-slate-900">{violations.length}</p><p className="text-xs text-slate-500">إجمالي المخالفات المسجلة</p></div></div></Card>
        <Card><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold"><AlertTriangle size={20} /></div><div><p className="text-2xl font-extrabold text-slate-900">{violations.filter(v=>v.status==='open').length}</p><p className="text-xs text-slate-500">مخالفات مفتوحة</p></div></div></Card>
        <Card><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold"><ShieldAlert size={20} /></div><div><p className="text-2xl font-extrabold text-slate-900">{violations.filter(v=>v.status==='resolved').length}</p><p className="text-xs text-slate-500">مخالفات معالجة</p></div></div></Card>
      </div>

      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {['نوع المخالفة', 'الخطورة', 'الوصف', 'الإجراء المتخذ', 'وقت التسجيل', 'الحالة'].map(h => <th key={h} className="text-right py-3 px-4 text-xs font-bold text-slate-500">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {violations.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-slate-400">لا توجد مخالفات مسجلة. النظام آمن وملتزم.</td></tr>
              ) : violations.map(v => (
                <tr key={v.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="py-3 px-4"><span className="px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 text-xs font-bold">{v.violation_type}</span></td>
                  <td className="py-3 px-4 font-bold text-slate-800">{v.severity}</td>
                  <td className="py-3 px-4 text-slate-600">{v.description}</td>
                  <td className="py-3 px-4 text-slate-600">{v.penalty_action || '—'}</td>
                  <td className="py-3 px-4 font-mono text-slate-500">{new Date(v.recorded_at).toLocaleString('ar-IQ')}</td>
                  <td className="py-3 px-4">
                    {v.status === 'resolved' ? <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold">معالجة</span> :
                     v.status === 'open' ? <span className="px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 text-xs font-bold">مفتوحة</span> :
                     <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 text-xs font-bold">{v.status}</span>}
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
