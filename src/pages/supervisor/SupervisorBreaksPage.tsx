import { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase/supabase';
import { useAuthStore, useUIStore } from '../../core/stores';
import Card from '../../shared/components/ui/Card';
import Button from '../../shared/components/ui/Button';
import Input from '../../shared/components/ui/Input';
import { Clock, Users, ArrowRightLeft, CheckCircle, Lock } from 'lucide-react';

export default function SupervisorBreaksPage() {
  const { user } = useAuthStore();
  const { addToast } = useUIStore();
  const [employees, setEmployees] = useState<any[]>([]);
  const [breaks, setBreaks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    employee_id: '',
    destination: '',
    duration_minutes: 15,
    pin_code: ''
  });

  useEffect(() => {
    if (user?.department) {
      loadEmployees();
    }
    loadBreaks();
  }, [user]);

  const loadEmployees = async () => {
    if (!user?.id) return;
    try {
      // بناء استعلام يجلب الموظفين التابعين له (كمشرف أو كمدير) أو الذين في نفس قسمه
      const orQuery = `supervisor_id.eq.${user.id},manager_id.eq.${user.id},department_manager_id.eq.${user.id}${user.department ? `,department.eq.${user.department}` : ''}`;
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, department, manager_id, supervisor_id, department_manager_id, rank')
        .or(orQuery);

      if (error) throw error;
      
      // تصفية القائمة لتشمل فقط موظفيه المباشرين، أو الموظفين العاديين في قسمه
      const myEmployees = (data || []).filter(emp => 
        emp.supervisor_id === user?.id || 
        emp.manager_id === user?.id || 
        emp.department_manager_id === user?.id || 
        (emp.department === user?.department && emp.rank === 'employee' && emp.id !== user?.id)
      );
      setEmployees(myEmployees);
    } catch (error) {
      console.error('Error loading employees:', error);
    }
  };

  const loadBreaks = async () => {
    try {
      const { data, error } = await supabase
        .from('employee_breaks')
        .select(`
          *,
          employee:profiles!employee_breaks_employee_id_fkey(full_name, department)
        `)
        .eq('supervisor_id', user?.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setBreaks(data || []);
    } catch (error) {
      console.error('Error loading breaks:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.employee_id || !formData.destination || !formData.pin_code) {
      addToast('يرجى تعبئة جميع الحقول المطلوبة', 'error');
      return;
    }
    
    try {
      setLoading(true);

      // التحقق من الرمز السري للمشرف قبل الاعتماد
      const { data: supervisorProfile } = await supabase
        .from('profiles')
        .select('passcode')
        .eq('id', user?.id)
        .single();

      if (supervisorProfile?.passcode !== formData.pin_code) {
        addToast('الرمز السري غير صحيح، لا يمكن اعتماد التصريح', 'error');
        setLoading(false);
        return;
      }

      const { error } = await supabase
        .from('employee_breaks')
        .insert({
          employee_id: formData.employee_id,
          supervisor_id: user?.id,
          destination: formData.destination,
          duration_minutes: formData.duration_minutes,
          status: 'approved',
          supervisor_name: user?.full_name || user?.name
        });

      if (error) throw error;
      addToast('تم إصدار تصريح الاستراحة بنجاح', 'success');
      setFormData({ ...formData, employee_id: '', destination: '', pin_code: '' });
      loadBreaks();
    } catch (error: any) {
      console.error('Error creating break:', error);
      addToast('فشل في إصدار التصريح. يرجى تحديث قاعدة البيانات', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container animate-fade-in">
      <div className="mb-8">
        <h1 className="page-title flex items-center gap-3">
          <ArrowRightLeft className="w-8 h-8 text-indigo-600" />
          بوابة المشرف - تصاريح الاستراحة
        </h1>
        <p className="page-subtitle">إصدار ومتابعة تصاريح خروج الموظفين للاستراحة</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <Card>
            <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-500" />
              إصدار تصريح جديد
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">الموظف *</label>
                <select
                  required
                  value={formData.employee_id}
                  onChange={(e) => setFormData({ ...formData, employee_id: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-400"
                >
                  <option value="">-- اختر الموظف --</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.full_name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">إلى أين سيذهب؟ *</label>
                <Input
                  required
                  type="text"
                  placeholder="مثال: الكافتيريا، العيادة..."
                  value={formData.destination}
                  onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">المدة (بالدقائق) *</label>
                <Input
                  required
                  type="number"
                  min={5}
                  max={120}
                  value={formData.duration_minutes}
                  onChange={(e) => setFormData({ ...formData, duration_minutes: parseInt(e.target.value) })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">اسم المشرف المصرّح</label>
                <div className="bg-slate-100 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-600 font-bold cursor-not-allowed">
                  {user?.full_name || user?.name}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">الرمز السري للتوقيع (Passcode) *</label>
                <div className="relative">
                  <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    required
                    type="password"
                    placeholder="****"
                    value={formData.pin_code}
                    onChange={(e) => setFormData({ ...formData, pin_code: e.target.value })}
                    className="bg-slate-50 border-dashed pr-10 tracking-widest text-center"
                  />
                </div>
                <p className="text-xs text-slate-500 mt-1">أدخل الرمز السري الخاص بك لتوقيع التصريح إلكترونياً</p>
              </div>

              <Button type="submit" loading={loading} className="w-full mt-4">
                <CheckCircle className="w-5 h-5 ml-2" />
                إصدار التصريح للبوابة
              </Button>
            </form>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card>
            <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
              <Clock className="w-5 h-5 text-indigo-500" />
              سجل التصاريح المصدرة
            </h2>
            
            <div className="overflow-x-auto">
              <table className="w-full whitespace-nowrap">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="table-header text-right p-4">الموظف</th>
                    <th className="table-header text-right p-4">الوجهة</th>
                    <th className="table-header text-right p-4">المدة</th>
                    <th className="table-header text-right p-4">الحالة</th>
                    <th className="table-header text-right p-4">الوقت</th>
                  </tr>
                </thead>
                <tbody>
                  {breaks.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-8 text-gray-500">لا توجد تصاريح مصدرة</td>
                    </tr>
                  ) : (
                    breaks.map((b) => (
                      <tr key={b.id} className="border-b border-gray-50">
                        <td className="p-4 font-bold text-slate-800">{b.employee?.full_name}</td>
                        <td className="p-4 text-slate-600">{b.destination}</td>
                        <td className="p-4 text-slate-600">{b.duration_minutes} دقيقة</td>
                        <td className="p-4">
                          {b.status === 'approved' && <span className="bg-amber-50 text-amber-700 px-2 py-1 rounded-md text-xs">مصرح (ينتظر الخروج)</span>}
                          {b.status === 'out' && <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded-md text-xs">في الخارج</span>}
                          {b.status === 'completed' && <span className="bg-emerald-50 text-emerald-700 px-2 py-1 rounded-md text-xs">مكتمل (عاد)</span>}
                        </td>
                        <td className="p-4 text-sm text-slate-500">
                          {new Date(b.created_at).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>
      
    </div>
  );
}
