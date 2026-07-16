import { useCallback, useEffect, useState } from 'react';
import { useAuthStore, useUIStore } from '../../core/stores';
import Card from '../../shared/components/ui/Card';
import Button from '../../shared/components/ui/Button';
import Input from '../../shared/components/ui/Input';
import { Clock, Users, ArrowRightLeft, CheckCircle, Lock, Loader2 } from 'lucide-react';
import { employeeBreakService, userService } from '../../services/sdk';
import { getErrorMessage } from '../../services/errors';

export default function SupervisorBreaksPage() {
  const { user } = useAuthStore();
  const { addToast } = useUIStore();
  const [employees, setEmployees] = useState<any[]>([]);
  const [breaks, setBreaks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ employee_id: '', destination: '', duration_minutes: 15, pin_code: '' });

  const loadEmployees = useCallback(async () => {
    if (!user?.id) return;
    try {
      const users = await userService.findAllUsers(user.department ? { department: user.department } : undefined);
      const team = (users || []).filter((emp: any) => emp.id !== user.id && (emp.supervisor_id === user.id || emp.manager_id === user.id || emp.department === user.department));
      setEmployees(team);
    } catch (error) { console.error('Error loading employees:', getErrorMessage(error)); }
  }, [user?.department, user?.id]);

  const loadBreaks = useCallback(async () => {
    if (!user?.id) return;
    try {
      const data = await employeeBreakService.findAll({ filters: { supervisor_id: user.id }, orderBy: 'created_at', ascending: false });
      setBreaks(data || []);
    } catch (error) { console.error('Error loading breaks:', getErrorMessage(error)); }
  }, [user?.id]);

  useEffect(() => { loadEmployees(); loadBreaks(); }, [loadEmployees, loadBreaks]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.employee_id || !formData.destination || !formData.pin_code) return addToast('يرجى تعبئة جميع الحقول المطلوبة', 'error');
    try {
      setLoading(true);
      const supervisorProfile = await userService.findUserById(user?.id || '');
      const passcode = (supervisorProfile as any)?.passcode;
      if (passcode && passcode !== formData.pin_code) {
        addToast('الرمز السري غير صحيح، لا يمكن اعتماد التصريح', 'error');
        return;
      }
      const emp = employees.find(e => (e.employee_id || e.id) === formData.employee_id);
      await employeeBreakService.create({
        employee_id: formData.employee_id,
        supervisor_id: user?.id,
        destination: formData.destination,
        duration_minutes: formData.duration_minutes,
        break_type: 'supervisor_permit',
        started_at: new Date().toISOString(),
        status: 'approved',
        supervisor_name: user?.full_name || user?.name,
        employee_name: emp?.full_name,
      } as any);
      addToast('تم إصدار تصريح الاستراحة بنجاح', 'success');
      setFormData({ employee_id: '', destination: '', duration_minutes: 15, pin_code: '' });
      await loadBreaks();
    } catch (error) {
      console.error('Error creating break:', getErrorMessage(error));
      addToast(getErrorMessage(error, 'فشل في إصدار التصريح'), 'error');
    } finally { setLoading(false); }
  };

  return <div className="page-container animate-fade-in" dir="rtl">
    <div className="mb-8"><h1 className="page-title flex items-center gap-3"><ArrowRightLeft className="w-8 h-8 text-indigo-600" />بوابة المشرف - تصاريح الاستراحة</h1><p className="page-subtitle">إصدار ومتابعة تصاريح خروج الموظفين للاستراحة</p></div>
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-1"><Card><h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2"><Users className="w-5 h-5 text-indigo-500" />إصدار تصريح جديد</h2><form onSubmit={handleSubmit} className="space-y-4"><div><label className="block text-sm font-medium text-gray-700 mb-2">الموظف *</label><select required value={formData.employee_id} onChange={(e) => setFormData({ ...formData, employee_id: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-400"><option value="">-- اختر الموظف --</option>{employees.map(emp => { const employeeRecordId = emp.employee_id || ''; return <option key={emp.id} value={employeeRecordId} disabled={!employeeRecordId}>{emp.full_name}{!employeeRecordId ? ' — لا يوجد سجل موظف مرتبط' : ''}</option>; })}</select></div><div><label className="block text-sm font-medium text-gray-700 mb-2">إلى أين سيذهب؟ *</label><Input required placeholder="مثال: الكافتيريا، العيادة..." value={formData.destination} onChange={(e) => setFormData({ ...formData, destination: e.target.value })} /></div><div><label className="block text-sm font-medium text-gray-700 mb-2">المدة (بالدقائق) *</label><Input required type="number" min={5} max={120} value={formData.duration_minutes} onChange={(e) => setFormData({ ...formData, duration_minutes: parseInt(e.target.value) })} /></div><div><label className="block text-sm font-medium text-gray-700 mb-2">اسم المشرف المصرّح</label><div className="bg-slate-100 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-600 font-bold cursor-not-allowed">{user?.full_name || user?.name}</div></div><div><label className="block text-sm font-medium text-gray-700 mb-2">الرمز السري للتوقيع *</label><div className="relative"><Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><Input required type="password" placeholder="****" value={formData.pin_code} onChange={(e) => setFormData({ ...formData, pin_code: e.target.value })} className="bg-slate-50 border-dashed pr-10 tracking-widest text-center" /></div></div><Button type="submit" loading={loading} className="w-full mt-4"><CheckCircle className="w-5 h-5 ml-2" />إصدار التصريح للبوابة</Button></form></Card></div>
      <div className="lg:col-span-2"><Card><h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2"><Clock className="w-5 h-5 text-indigo-500" />سجل التصاريح المصدرة</h2>{loading ? <div className="py-12 text-center"><Loader2 className="animate-spin mx-auto" /></div> : <div className="overflow-x-auto"><table className="w-full whitespace-nowrap"><thead><tr className="border-b border-gray-100"><th className="table-header text-right p-4">الموظف</th><th className="table-header text-right p-4">الوجهة</th><th className="table-header text-right p-4">المدة</th><th className="table-header text-right p-4">الحالة</th><th className="table-header text-right p-4">الوقت</th></tr></thead><tbody>{breaks.length === 0 ? <tr><td colSpan={5} className="text-center py-8 text-gray-500">لا توجد تصاريح مصدرة</td></tr> : breaks.map((b) => <tr key={b.id} className="border-b border-gray-50"><td className="p-4 font-bold text-slate-800">{b.employee?.full_name || b.employee_name || b.employee_id}</td><td className="p-4 text-slate-600">{b.destination}</td><td className="p-4 text-slate-600">{b.duration_minutes} دقيقة</td><td className="p-4"><span className="bg-amber-50 text-amber-700 px-2 py-1 rounded-md text-xs">{b.status}</span></td><td className="p-4 text-sm text-slate-500">{b.created_at ? new Date(b.created_at).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }) : '—'}</td></tr>)}</tbody></table></div>}</Card></div>
    </div>
  </div>;
}
