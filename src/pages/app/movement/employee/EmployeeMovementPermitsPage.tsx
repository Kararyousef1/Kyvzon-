import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Clock, Plus, QrCode, Search, FileText, CheckSquare } from 'lucide-react';
import { useUIStore } from '../../../../core/stores';
import { employeeMovementPermitService } from '../../../../services/sdk/EmployeePermitsService';
import type { EmployeeMovementPermitRecord, PermitStatus } from '../../../../shared/types/employee-permits';
import Card from '../../../../shared/components/ui/Card';
import Button from '../../../../shared/components/ui/Button';
import { getErrorMessage } from '../../../../services/errors';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';

export default function EmployeeMovementPermitsPage() {
  const navigate = useNavigate();
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(true);
  const [permits, setPermits] = useState<EmployeeMovementPermitRecord[]>([]);
  const [statusTab, setStatusTab] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await employeeMovementPermitService.findAll({ orderBy: 'created_at', ascending: false });
      setPermits(data || []);
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { loadData(); }, [loadData]);

  const filtered = permits.filter(p => {
    if (statusTab !== 'all' && p.status !== statusTab) return false;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return [p.permit_number, p.destination_name, p.purpose, p.employee_name, p.department]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(q);
  });

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl p-6 text-white flex items-center justify-between flex-wrap gap-4">
        <div>
          <p className="text-white/70 text-sm font-semibold">Employee Movement • E01</p>
          <h2 className="text-2xl font-extrabold mt-1 flex items-center gap-2"><QrCode /> تصاريح الخروج المسبقة وتأمين QR</h2>
          <p className="text-white/75 mt-2 text-sm">إدارة تصاريح الموظفين، رموز التحقق المشفرة، الموافقات، وتتبّع الصلاحيات.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={() => navigate('/app/movement/employee/permits/templates')} className="!bg-white/15 hover:!bg-white/25 !text-white !border-none" icon={<FileText size={16} />} iconPosition="left">القوالب</Button>
          <Button onClick={() => navigate('/app/movement/employee/permits/approvals')} className="!bg-white/15 hover:!bg-white/25 !text-white !border-none" icon={<CheckSquare size={16} />} iconPosition="left">صندوق الموافقات</Button>
          <Button onClick={() => navigate('/app/movement/employee/permits/new')} className="!bg-white !text-indigo-700 hover:!bg-indigo-50 !border-none" icon={<Plus size={16} />} iconPosition="left">تصريح جديد</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold"><QrCode size={20} /></div><div><p className="text-2xl font-extrabold text-slate-900">{permits.length}</p><p className="text-xs text-slate-500">إجمالي التصاريح</p></div></div></Card>
        <Card><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold"><Clock size={20} /></div><div><p className="text-2xl font-extrabold text-slate-900">{permits.filter(p=>p.status==='pending_approval').length}</p><p className="text-xs text-slate-500">بانتظار الموافقة</p></div></div></Card>
        <Card><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold"><CheckCircle2 size={20} /></div><div><p className="text-2xl font-extrabold text-slate-900">{permits.filter(p=>['approved','active'].includes(p.status)).length}</p><p className="text-xs text-slate-500">معتمدة ونشطة</p></div></div></Card>
        <Card><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold"><CheckCircle2 size={20} /></div><div><p className="text-2xl font-extrabold text-slate-900">{permits.filter(p=>p.status==='completed').length}</p><p className="text-xs text-slate-500">تصاريح مكتملة</p></div></div></Card>
      </div>

      <div className="flex gap-2 bg-slate-50 border border-slate-100 rounded-2xl p-1.5 overflow-x-auto">
        {[
          { key: 'all', label: 'الكل' },
          { key: 'pending_approval', label: 'بانتظار الموافقة' },
          { key: 'approved', label: 'معتمد' },
          { key: 'active', label: 'نشط' },
          { key: 'completed', label: 'مكتمل' },
          { key: 'cancelled', label: 'ملغى' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setStatusTab(tab.key)}
            className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${statusTab === tab.key ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search size={16} className="absolute right-3 top-3 text-slate-400" />
        <input
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="بحث برقم التصريح، الوجهة، الغرض، أو اسم الموظف..."
          className="w-full pr-9 pl-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-indigo-400"
        />
      </div>

      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {['رقم التصريح', 'الموظف', 'النوع', 'الوجهة', 'الخروج المخطط', 'المدة', 'الحالة', 'إجراء'].map(h => <th key={h} className="text-right py-3 px-4 text-xs font-bold text-slate-500">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-slate-400">لا توجد تصاريح مطابقة للمعايير المحددة.</td></tr>
              ) : filtered.map(p => (
                <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer" onClick={() => navigate(`/app/movement/employee/permits/${p.id}`)}>
                  <td className="py-3 px-4 font-mono font-bold text-indigo-600">{p.permit_number || p.id.substring(0, 8)}</td>
                  <td className="py-3 px-4 font-bold text-slate-800">{p.employee_name || 'موظف'}</td>
                  <td className="py-3 px-4"><span className="px-2 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold">{p.permit_type}</span></td>
                  <td className="py-3 px-4 text-slate-700">{p.destination_name}</td>
                  <td className="py-3 px-4 font-mono text-slate-500">{format(new Date(p.valid_from), 'dd MMM HH:mm', { locale: ar })}</td>
                  <td className="py-3 px-4 font-bold text-slate-700">{p.max_duration_minutes} دقيقة</td>
                  <td className="py-3 px-4">
                    {p.status === 'approved' ? <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold">معتمد</span> :
                     p.status === 'pending_approval' ? <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-bold">بانتظار الموافقة</span> :
                     p.status === 'active' ? <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-bold">نشط</span> :
                     p.status === 'completed' ? <span className="px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold">مكتمل</span> :
                     <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 text-xs font-bold">{p.status}</span>}
                  </td>
                  <td className="py-3 px-4"><Button size="xs" variant="outline" onClick={(e) => { e.stopPropagation(); navigate(`/app/movement/employee/permits/${p.id}`); }}>التفاصيل</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
