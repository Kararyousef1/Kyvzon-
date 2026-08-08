import { useCallback, useEffect, useState } from 'react';
import { Award, Plus, Calendar, DollarSign, CheckCircle2 } from 'lucide-react';
import { useAuthStore, useUIStore } from '../../../../core/stores';
import { employeeMissionService } from '../../../../services/sdk/EmployeeVisitsMissionsService';
import type { EmployeeMissionRecord } from '../../../../shared/types/employee-visits-missions';
import Card from '../../../../shared/components/ui/Card';
import Button from '../../../../shared/components/ui/Button';
import { getErrorMessage } from '../../../../services/errors';
import { MovementUnitNav } from '../shared/MovementUnitNav';

export default function EmployeeMissionsPage() {
  const { user } = useAuthStore();
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(true);
  const [missions, setMissions] = useState<EmployeeMissionRecord[]>([]);
  const [showCreate, setShowCreate] = useState(false);

  // Form state
  const [form, setForm] = useState({
    mission_title: '',
    destination: '',
    mission_type: 'official_mission' as 'official_mission' | 'training' | 'conference' | 'client_support',
    start_date: new Date().toISOString().slice(0, 10),
    end_date: new Date().toISOString().slice(0, 10),
    allowance_amount: 150000,
    notes: '',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await employeeMissionService.findAll({ orderBy: 'start_date', ascending: false });
      setMissions(data || []);
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { loadData(); }, [loadData]);

  const createMission = async () => {
    if (!form.mission_title.trim()) return addToast('يرجى إدخال عنوان المهمة أو الانتداب', 'warning');
    if (!form.destination.trim()) return addToast('يرجى إدخال وجهة السفر', 'warning');

    try {
      await employeeMissionService.create({
        tenant_id: user?.tenant_id || '',
        employee_id: user?.id || '',
        mission_title: form.mission_title.trim(),
        destination: form.destination.trim(),
        mission_type: form.mission_type,
        start_date: form.start_date,
        end_date: form.end_date,
        allowance_amount: Number(form.allowance_amount || 0),
        status: 'pending',
        notes: form.notes.trim() || undefined,
      } as Partial<EmployeeMissionRecord>);

      addToast('تم إنشاء طلب المهمة والانتداب المالي بنجاح', 'success');
      setShowCreate(false);
      setForm({
        mission_title: '',
        destination: '',
        mission_type: 'official_mission',
        start_date: new Date().toISOString().slice(0, 10),
        end_date: new Date().toISOString().slice(0, 10),
        allowance_amount: 150000,
        notes: '',
      });
      loadData();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    }
  };

  const totalAllowance = missions.reduce((acc, m) => acc + Number(m.allowance_amount || 0), 0);

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      <MovementUnitNav unit="employee_missions" />
      <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl p-6 text-white flex items-center justify-between flex-wrap gap-4">
        <div>
          <p className="text-white/70 text-sm font-semibold">Employee Movement • E04</p>
          <h2 className="text-2xl font-extrabold mt-1 flex items-center gap-2"><Award /> المهام الرسمية والانتدابات</h2>
          <p className="text-white/75 mt-2 text-sm">إدارة الانتدابات الداخلية والخارجية، البدلات المالية، ومتابعة فترات المهمة.</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="!bg-white !text-indigo-700 hover:!bg-indigo-50 !border-none" icon={<Plus size={16} />} iconPosition="left">مهمة جديدة</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold"><Award size={20} /></div><div><p className="text-2xl font-extrabold text-slate-900">{missions.length}</p><p className="text-xs text-slate-500">إجمالي المهام</p></div></div></Card>
        <Card><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold"><Calendar size={20} /></div><div><p className="text-2xl font-extrabold text-slate-900">{missions.filter(m=>m.status==='approved' || m.status==='in_progress').length}</p><p className="text-xs text-slate-500">مهام معتمدة وجارية</p></div></div></Card>
        <Card><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center font-bold"><DollarSign size={20} /></div><div><p className="text-2xl font-extrabold text-slate-900">{totalAllowance.toLocaleString()} د.ع</p><p className="text-xs text-slate-500">إجمالي البدلات المالية</p></div></div></Card>
      </div>

      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {['عنوان المهمة', 'الوجهة', 'نوع المهمة', 'تاريخ البدء', 'تاريخ الانتهاء', 'البدل المالي (د.ع)', 'الحالة'].map(h => <th key={h} className="text-right py-3 px-4 text-xs font-bold text-slate-500">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {missions.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-slate-400">لا توجد مهام أو انتدابات مسجلة.</td></tr>
              ) : missions.map(m => (
                <tr key={m.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="py-3 px-4 font-bold text-slate-800">{m.mission_title}</td>
                  <td className="py-3 px-4 text-slate-600">{m.destination}</td>
                  <td className="py-3 px-4"><span className="px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold">{m.mission_type}</span></td>
                  <td className="py-3 px-4 font-mono text-slate-500">{m.start_date}</td>
                  <td className="py-3 px-4 font-mono text-slate-500">{m.end_date}</td>
                  <td className="py-3 px-4 font-mono font-bold text-slate-700">{m.allowance_amount.toLocaleString()} د.ع</td>
                  <td className="py-3 px-4">
                    {m.status === 'approved' ? <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold">معتمدة</span> :
                     m.status === 'in_progress' ? <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-bold">جارية</span> :
                     m.status === 'pending' ? <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-bold">بانتظار الاعتماد</span> :
                     <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 text-xs font-bold">{m.status}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {showCreate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-900 mb-2">طلب مهمة أو انتداب جديد</h3>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">عنوان المهمة</label>
              <input
                value={form.mission_title}
                onChange={e => setForm({ ...form, mission_title: e.target.value })}
                placeholder="مثال: حضور مؤتمر التقنية الإقليمي..."
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">الوجهة (المدينة / الدولة)</label>
              <input
                value={form.destination}
                onChange={e => setForm({ ...form, destination: e.target.value })}
                placeholder="مثال: أربيل، إقليم كردستان"
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">نوع المهمة</label>
              <select
                value={form.mission_type}
                onChange={e => setForm({ ...form, mission_type: e.target.value as EmployeeMissionRecord['mission_type'] })}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400"
              >
                <option value="official_mission">مهمة رسمية (Official Mission)</option>
                <option value="training">تدريب (Training)</option>
                <option value="conference">مؤتمر (Conference)</option>
                <option value="client_support">دعم عملاء (Client Support)</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">تاريخ البدء</label>
                <input
                  type="date"
                  value={form.start_date}
                  onChange={e => setForm({ ...form, start_date: e.target.value })}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">تاريخ الانتهاء</label>
                <input
                  type="date"
                  value={form.end_date}
                  onChange={e => setForm({ ...form, end_date: e.target.value })}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400 font-mono"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">البدل المالي التقديري (د.ع)</label>
              <input
                type="number"
                min={0}
                value={form.allowance_amount}
                onChange={e => setForm({ ...form, allowance_amount: Number(e.target.value) })}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">ملاحظات</label>
              <textarea
                value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                rows={2}
                placeholder="ملاحظات إضافية أو تفاصيل السكن..."
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="secondary" fullWidth onClick={() => setShowCreate(false)}>إلغاء</Button>
              <Button fullWidth onClick={createMission}>إرسال طلب الانتداب</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
