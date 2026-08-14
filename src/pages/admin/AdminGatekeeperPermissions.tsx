import { useState, useEffect } from 'react';
import { gatekeeperAdminPermissionService } from '../../services/sdk/GatekeeperAdminPermissionService';
import Card from '../../shared/components/ui/Card';
import Button from '../../shared/components/ui/Button';
import { useUIStore } from '../../core/stores';
import { ShieldCheck, RefreshCw, AlertTriangle } from 'lucide-react';

export default function AdminGatekeeperPermissions() {
  const { addToast } = useUIStore();
  const [managers, setManagers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dbError, setDbError] = useState(false);

  useEffect(() => {
    loadManagers();
  }, []);

  const loadManagers = async () => {
    try {
      setLoading(true);
      setManagers(await gatekeeperAdminPermissionService.findProfilePermissions());
      setDbError(false);
    } catch (error: any) {
      console.error('Error loading managers:', error);
      if (error.message?.includes('can_manage_breaks')) {
        setDbError(true);
      }
      addToast('فشل في تحميل قائمة المدراء', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (id: string, currentStatus: boolean) => {
    setManagers(managers.map(m => 
      m.id === id ? { ...m, can_manage_breaks: !currentStatus, _changed: true } : m
    ));
  };

  const handleSaveChanges = async () => {
    const changedManagers = managers.filter(m => m._changed);
    if (changedManagers.length === 0) {
      addToast('لا توجد تغييرات لحفظها', 'success');
      return;
    }

    try {
      setSaving(true);
      for (const m of changedManagers) {
        await gatekeeperAdminPermissionService.updateBreakPermission(
          m.id,
          m.can_manage_breaks,
        );
      }
      
      setManagers(managers.map(m => ({ ...m, _changed: false })));
      addToast('تم حفظ التغييرات بنجاح', 'success');
    } catch (error: any) {
      console.error('Error saving changes:', error);
      if (error.message === 'RLS_ERROR') {
        addToast('لم يتم الحفظ: تم المنع بواسطة نظام الحماية RLS في قاعدة البيانات', 'error');
      } else if (error.message?.includes('can_manage_breaks')) {
        setDbError(true);
        addToast('فشل في حفظ التغييرات. تأكد من بناء العمود في قاعدة البيانات', 'error');
      } else {
        addToast('فشل في حفظ التغييرات. تحقق من الاتصال بالخادم', 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-container animate-fade-in">
      <div className="mb-8">
        <h1 className="page-title flex items-center gap-3">
          <ShieldCheck className="w-8 h-8 text-indigo-600" />
          إدارة تصاريح الخروج (المشرفين)
        </h1>
        <p className="page-subtitle">تفعيل أو تعطيل بوابة الاستراحات للمشرفين والمدراء</p>
      </div>

      {dbError && (
        <Card className="mb-6 border-red-200 bg-red-50">
          <div className="flex items-center gap-3">
            <AlertTriangle className="text-red-500 w-8 h-8" />
            <div>
              <h3 className="font-bold text-red-800">خطأ في قاعدة البيانات</h3>
              <p className="text-sm text-red-700">الرجاء تشغيل كود SQL التالي في Supabase لتعمل هذه الميزة:</p>
              <code className="block mt-2 bg-white/50 px-3 py-2 rounded text-left text-xs" dir="ltr">
                ALTER TABLE profiles ADD COLUMN IF NOT EXISTS can_manage_breaks BOOLEAN DEFAULT false;
              </code>
            </div>
          </div>
        </Card>
      )}

      <Card>
        {loading && managers.length === 0 ? (
          <div className="flex justify-center items-center py-12">
            <RefreshCw className="w-8 h-8 animate-spin text-indigo-500" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="table-header text-right p-4">الاسم</th>
                  <th className="table-header text-right p-4">البريد الإلكتروني</th>
                  <th className="table-header text-right p-4">القسم / المنصب</th>
                  <th className="table-header text-right p-4">الدور</th>
                  <th className="table-header text-center p-4">تفعيل بوابة المشرف</th>
                </tr>
              </thead>
              <tbody>
                {managers.map((manager) => (
                  <tr key={manager.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="p-4 font-bold text-slate-800">
                      {manager.full_name || 'بدون اسم'}
                      {manager._changed && <span className="ml-2 w-2 h-2 rounded-full bg-amber-500 inline-block" title="تم التعديل بانتظار الحفظ" />}
                    </td>
                    <td className="p-4 text-slate-600">{manager.email}</td>
                    <td className="p-4 text-slate-600">{manager.department || '-'} / {manager.position || '-'}</td>
                    <td className="p-4">
                      <span className="px-2 py-1 bg-slate-100 text-slate-700 rounded-md text-xs font-bold">
                        {manager.role}
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                          type="checkbox" 
                          className="sr-only peer"
                          checked={manager.can_manage_breaks === true}
                          onChange={() => handleToggle(manager.id, manager.can_manage_breaks === true)}
                          disabled={saving}
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                      </label>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      
      <div className="mt-6 flex justify-end">
        <Button onClick={handleSaveChanges} disabled={saving || !managers.some(m => m._changed)} className="px-8 btn-primary">
          {saving ? <RefreshCw className="w-5 h-5 animate-spin mx-auto" /> : '💾 حفظ التغييرات'}
        </Button>
      </div>
    </div>
  );
}
