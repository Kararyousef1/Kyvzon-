import { useCallback, useEffect, useState } from 'react';
import { Briefcase, CheckCircle2, Plus, MapPin } from 'lucide-react';
import { useAuthStore, useUIStore } from '../../../../core/stores';
import { employeeFieldVisitService } from '../../../../services/sdk/EmployeeVisitsMissionsService';
import { movementLocationService } from '../../../../services/sdk/MovementFoundationService';
import type { EmployeeFieldVisitRecord } from '../../../../shared/types/employee-visits-missions';
import type { MovementLocationRecord } from '../../../../shared/types/movement-foundation';
import Card from '../../../../shared/components/ui/Card';
import Button from '../../../../shared/components/ui/Button';
import { getErrorMessage } from '../../../../services/errors';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { MovementUnitNav } from '../shared/MovementUnitNav';

export default function EmployeeFieldVisitsPage() {
  const { user } = useAuthStore();
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(true);
  const [visits, setVisits] = useState<EmployeeFieldVisitRecord[]>([]);
  const [locations, setLocations] = useState<MovementLocationRecord[]>([]);
  const [showCreate, setShowCreate] = useState(false);

  // Form state
  const [form, setForm] = useState({
    client_name: '',
    location_address: '',
    purpose: '',
    scheduled_at: new Date().toISOString().slice(0, 16),
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [visitRows, locRows] = await Promise.all([
        employeeFieldVisitService.findAll({ orderBy: 'scheduled_at', ascending: false }),
        movementLocationService.findActiveLocations(),
      ]);
      setVisits(visitRows || []);
      setLocations(locRows || []);
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { loadData(); }, [loadData]);

  const createVisit = async () => {
    if (!form.client_name.trim()) return addToast('يرجى إدخال اسم العميل أو الجهة', 'warning');
    if (!form.purpose.trim()) return addToast('يرجى إدخال غرض الزيارة', 'warning');

    try {
      await employeeFieldVisitService.create({
        tenant_id: user?.tenant_id || '',
        employee_id: user?.id || '',
        client_name: form.client_name.trim(),
        location_address: form.location_address.trim() || 'موقع العميل',
        purpose: form.purpose.trim(),
        scheduled_at: new Date(form.scheduled_at).toISOString(),
        status: 'planned',
      } as Partial<EmployeeFieldVisitRecord>);

      addToast('تمت جدولة الزيارة الميدانية بنجاح', 'success');
      setShowCreate(false);
      setForm({ client_name: '', location_address: '', purpose: '', scheduled_at: new Date().toISOString().slice(0, 16) });
      loadData();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      <MovementUnitNav unit="employee_field_visits" />
      <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl p-6 text-white flex items-center justify-between flex-wrap gap-4">
        <div>
          <p className="text-white/70 text-sm font-semibold">Employee Movement • E03</p>
          <h2 className="text-2xl font-extrabold mt-1 flex items-center gap-2"><Briefcase /> الزيارات الميدانية ومتابعة العملاء</h2>
          <p className="text-white/75 mt-2 text-sm">إدارة الزيارات الميدانية، تسجيل الحضور والانصراف الميداني وتقارير المهام.</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="!bg-white !text-indigo-700 hover:!bg-indigo-50 !border-none" icon={<Plus size={16} />} iconPosition="left">زيارة ميدانية جديدة</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold"><Briefcase size={20} /></div><div><p className="text-2xl font-extrabold text-slate-900">{visits.length}</p><p className="text-xs text-slate-500">إجمالي الزيارات</p></div></div></Card>
        <Card><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold"><CheckCircle2 size={20} /></div><div><p className="text-2xl font-extrabold text-slate-900">{visits.filter(v=>v.status==='completed').length}</p><p className="text-xs text-slate-500">زيارات مكتملة</p></div></div></Card>
        <Card><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold"><Briefcase size={20} /></div><div><p className="text-2xl font-extrabold text-slate-900">{visits.filter(v=>v.status==='planned').length}</p><p className="text-xs text-slate-500">زيارات مجدولة</p></div></div></Card>
      </div>

      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {['العميل / الجهة', 'العنوان', 'الغرض', 'الموعد المجدول', 'الحالة'].map(h => <th key={h} className="text-right py-3 px-4 text-xs font-bold text-slate-500">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {visits.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-12 text-slate-400">لا توجد زيارات ميدانية مسجلة.</td></tr>
              ) : visits.map(v => (
                <tr key={v.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="py-3 px-4 font-bold text-slate-800">{v.client_name}</td>
                  <td className="py-3 px-4 text-slate-600 flex items-center gap-1"><MapPin size={14} className="text-indigo-500" /> {v.location_address}</td>
                  <td className="py-3 px-4 text-slate-600">{v.purpose}</td>
                  <td className="py-3 px-4 font-mono text-slate-500">{format(new Date(v.scheduled_at), 'dd MMM HH:mm', { locale: ar })}</td>
                  <td className="py-3 px-4">
                    {v.status === 'completed' ? <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold">مكتملة</span> :
                     v.status === 'checked_in' ? <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-bold">تسجيل وصول</span> :
                     <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 text-xs font-bold">{v.status}</span>}
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
            <h3 className="text-lg font-bold text-slate-900 mb-2">تخطيط زيارة ميدانية جديدة</h3>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">اسم العميل / الجهة</label>
              <input
                value={form.client_name}
                onChange={e => setForm({ ...form, client_name: e.target.value })}
                placeholder="اسم الشركة أو العميل..."
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">عنوان الموقع</label>
              <input
                value={form.location_address}
                onChange={e => setForm({ ...form, location_address: e.target.value })}
                placeholder="العنوان التفصيلي..."
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">الغرض من الزيارة</label>
              <textarea
                value={form.purpose}
                onChange={e => setForm({ ...form, purpose: e.target.value })}
                rows={2}
                placeholder="أجندة الغرض..."
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">الموعد المجدول</label>
              <input
                type="datetime-local"
                value={form.scheduled_at}
                onChange={e => setForm({ ...form, scheduled_at: e.target.value })}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400 font-mono"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="secondary" fullWidth onClick={() => setShowCreate(false)}>إلغاء</Button>
              <Button fullWidth onClick={createVisit}>حفظ وجدولة الزيارة</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
