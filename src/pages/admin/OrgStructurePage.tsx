/**
 * ════════════════════════════════════════════════════════════════
 *  OrgStructurePage - الهيكل التنظيمي للشركة (إضافة وإدارة الأقسام)
 * ════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Trash2, Building, GitMerge, Loader2, AlertTriangle, Folder, ChevronDown, ChevronRight, Check
} from 'lucide-react';
import Card, { CardHeader, CardTitle } from '../../shared/components/ui/Card';
import Button from '../../shared/components/ui/Button';
import Input from '../../shared/components/ui/Input';
import { departmentService } from '../../services/sdk/DepartmentService';
import { useUIStore } from '../../core/stores';
import { supabase } from '../../services/supabase/supabase';

interface Department {
  id: string;
  name_ar: string;
  name_en?: string;
  parent_department_id?: string | null;
}

export default function OrgStructurePage() {
  const { addToast } = useUIStore();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // نموذج الإضافة
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [parentId, setParentId] = useState('');

  // تحميل الأقسام
  const loadDepartments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await departmentService.findActive();
      setDepartments(data || []);
    } catch (err) {
      console.error('فشل تحميل الأقسام:', err);
      setError('تعذّر تحميل الهيكل التنظيمي للأقسام');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDepartments();
  }, [loadDepartments]);

  // إضافة قسم جديد
  const handleAddDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameAr.trim()) {
      addToast('يرجى إدخال اسم القسم بالعربية', 'error');
      return;
    }

    setSaving(true);
    try {
      await departmentService.create({
        name_ar: nameAr.trim(),
        name_en: nameEn.trim() || undefined,
        parent_department_id: parentId || undefined,
        is_active: true
      });

      addToast('تم إضافة القسم بنجاح', 'success');
      setNameAr('');
      setNameEn('');
      setParentId('');
      await loadDepartments();
    } catch (err) {
      console.error('فشل إضافة القسم:', err);
      addToast('حدث خطأ أثناء إضافة القسم', 'error');
    } finally {
      setSaving(false);
    }
  };

  // حذف قسم
  const handleDeleteDepartment = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا القسم؟ سيتم إزالة ارتباطه بالموظفين.')) return;

    try {
      setLoading(true);
      await departmentService.delete(id);
      addToast('تم حذف القسم بنجاح', 'success');
      await loadDepartments();
    } catch (err) {
      console.error('فشل حذف القسم:', err);
      addToast('حدث خطأ أثناء حذف القسم', 'error');
    } finally {
      setLoading(false);
    }
  };

  // بناء الشجرة الهرمية للأقسام
  const buildTree = (list: Department[], parentId: string | null = null): any[] => {
    return list
      .filter(d => d.parent_department_id === parentId)
      .map(d => ({
        ...d,
        children: buildTree(list, d.id)
      }));
  };

  const departmentTree = buildTree(departments, null);

  // مكون فرعي لرسم عقدة الشجرة بشكل متداخل واحترافي
  const renderTreeNode = (node: any, depth = 0) => {
    return (
      <div key={node.id} className="flex flex-col w-full">
        <div 
          className="flex items-center justify-between bg-white border border-slate-100 p-3.5 rounded-2xl shadow-sm hover:shadow-md transition-all mb-2"
          style={{ marginRight: `${depth * 24}px` }}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
              <Building size={18} />
            </div>
            <div>
              <p className="font-black text-slate-800 text-sm sm:text-base">{node.name_ar}</p>
              {node.name_en && <p className="text-xs text-slate-400 font-mono">{node.name_en}</p>}
            </div>
          </div>
          <button
            onClick={() => handleDeleteDepartment(node.id)}
            className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
            title="حذف القسم"
          >
            <Trash2 size={16} />
          </button>
        </div>
        {node.children && node.children.map((child: any) => renderTreeNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* رأس الصفحة */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-3xl border shadow-sm">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-800 flex items-center gap-2">
            <GitMerge className="text-indigo-600" /> الهيكل التنظيمي للشركة
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">إدارة وتصميم الهيكل الإداري والأقسام الخاصة بشركتك بشكل مرن وهرمي</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* لوحة إضافة قسم جديد */}
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-black">
              <Plus size={18} className="text-indigo-600" /> إضافة قسم جديد
            </CardTitle>
          </CardHeader>
          <form onSubmit={handleAddDepartment} className="p-5 space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5">اسم القسم (بالعربية) *</label>
              <Input
                placeholder="مثال: قسم التقنية، إدارة المالية"
                value={nameAr}
                onChange={(e) => setNameAr(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5">اسم القسم (بالإنجليزية - اختياري)</label>
              <Input
                placeholder="مثال: IT Department"
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5">القسم الرئيسي (للهيكل الهرمي)</label>
              <select
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 bg-white focus:outline-none focus:border-indigo-400"
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
              >
                <option value="">-- قسم رئيسي مستقل --</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name_ar}
                  </option>
                ))}
              </select>
            </div>

            <Button type="submit" loading={saving} fullWidth icon={<Plus size={16} />} iconPosition="left">
              إضافة القسم للهيكل
            </Button>
          </form>
        </Card>

        {/* شجرة الهيكل التنظيمي الفعلي للشركة */}
        <Card className="lg:col-span-2 bg-slate-50/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-black">
              <Building size={18} className="text-indigo-600" /> مخطط الأقسام الحالي
            </CardTitle>
          </CardHeader>
          <div className="p-5 space-y-4">
            {loading && departments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 space-y-3">
                <Loader2 size={32} className="animate-spin text-indigo-600" />
                <p className="text-sm text-slate-500 font-bold">جاري تحميل الهيكل التنظيمي...</p>
              </div>
            ) : error ? (
              <div className="bg-red-50 border border-red-100 p-4 rounded-2xl flex items-center gap-3 text-red-700">
                <AlertTriangle size={20} />
                <p className="text-sm font-bold">{error}</p>
              </div>
            ) : departments.length === 0 ? (
              <div className="text-center py-12 bg-white border border-dashed rounded-2xl p-6">
                <Building size={40} className="mx-auto text-slate-300 mb-3" />
                <p className="text-sm text-slate-500 font-bold">لا توجد أقسام مضافة بعد لهذه الشركة</p>
                <p className="text-xs text-slate-400 mt-1">استخدم النموذج الجانبي لإضافة أول قسم لشركتك</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                {departmentTree.map(node => renderTreeNode(node))}
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
