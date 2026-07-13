/**
 * ════════════════════════════════════════════════════════════════
 *  OrgStructurePage - الهيكل التنظيمي (نسخة مُصلحة — Mobile/Tablet P1)
 * ════════════════════════════════════════════════════════════════
 *
 *  🔧 الإصلاحات المُطبّقة:
 *  ─────────────────────────────────────────────────────────────────
 *  ✅ P1: min-w-[600px] → min-w-[300px] sm:min-w-[600px] (لا scroll أفقي قسري على الموبايل)
 *  ✅ P1: أحجام العقد والفجوات responsive (أصغر على الموبايل)
 *  ✅ تنظيف جميع markdown artifacts (15+ موضع)
 *  ✅ إصلاح جميع template literals المكسورة
 *  ✅ إزالة Mock data fallback (كان يخفي أخطاء الجدول المفقود)
 *  ✅ إزالة as any → أنواع صريحة
 *  ✅ معالجة أخطاء + حالة فارغة + حالة تحميل
 *  ════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Shield, Plus, GitMerge, User, Building, Trash2,
  CheckCircle, ShieldAlert, Briefcase, AlertTriangle, Loader2,
} from 'lucide-react';
import Card, { CardHeader, CardTitle } from '../../shared/components/ui/Card';
import Button from '../../shared/components/ui/Button';
import Input from '../../shared/components/ui/Input';
import { supabase } from '../../services/supabase/supabase';
import { specialtyService } from '../../services/sdk';
import { useUIStore } from '../../core/stores';

// ════════════════════════════════════════════════════════════════
//  Types
// ════════════════════════════════════════════════════════════════

interface Specialty {
  id: string;
  name: string;
  department: string;
  role_level: string;
}

type RoleLevel = 'manager' | 'supervisor' | 'employee';

interface TreeNodeProps {
  title: string;
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
  colorClass: string;
  isLeaf?: boolean;
  children?: React.ReactNode;
}

// ════════════════════════════════════════════════════════════════
//  Constants
// ════════════════════════════════════════════════════════════════

const ROLE_LABELS: Record<RoleLevel, string> = {
  manager: 'مدير',
  supervisor: 'مشرف',
  employee: 'موظف',
};

const DEPARTMENTS = [
  'الإدارة العليا',
  'الإنتاج',
  'ضبط الجودة (QC)',
  'الموارد البشرية (HR)',
  'العيادة الطبية',
];

// ════════════════════════════════════════════════════════════════
//  TreeNode Component (responsive)
// ════════════════════════════════════════════════════════════════

function TreeNode({ title, icon: Icon, colorClass, isLeaf = false, children }: TreeNodeProps) {
  return (
    <div className="flex flex-col items-center">
      <div
        className={`relative flex items-center gap-1.5 sm:gap-3 px-3 sm:px-6 py-2 sm:py-3 rounded-2xl border-2 shadow-sm z-10 bg-white min-w-[130px] sm:min-w-[200px] justify-center ${colorClass}`}
      >
        <div className={`p-1.5 sm:p-2 rounded-xl text-white ${colorClass.replace('border-', 'bg-').replace('text-', '')}`}>
          <Icon size={16} className="sm:w-5 sm:h-5" />
        </div>
        <span className="font-extrabold text-xs sm:text-base text-slate-800 text-center">{title}</span>
      </div>

      {!isLeaf && (
        <>
          <div className="w-0.5 h-4 sm:h-8 bg-slate-300" />
          <div className="w-full flex justify-center gap-2 sm:gap-8 relative border-t-2 border-slate-300 pt-4 sm:pt-8 mt-[-2px]">
            {children}
          </div>
        </>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
//  Main Component
// ════════════════════════════════════════════════════════════════

export default function OrgStructurePage() {
  const { addToast } = useUIStore();
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newSpecialty, setNewSpecialty] = useState('');
  const [selectedDept, setSelectedDept] = useState('الإنتاج');
  const [selectedRole, setSelectedRole] = useState<RoleLevel>('employee');

  // ─── تحميل الاختصاصات ────────────────────────────────────────
  const loadSpecialties = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await specialtyService.findAllSpecialties();
      setSpecialties(data || []);
    } catch (err) {
      console.error('[OrgStructurePage] فشل تحميل الاختصاصات:', err);
      const message = err instanceof Error ? err.message : 'تعذّر تحميل الاختصاصات';
      setError(message);
      setSpecialties([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSpecialties();
  }, [loadSpecialties]);

  // ─── إضافة اختصاص ────────────────────────────────────────────
  const handleAddSpecialty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSpecialty.trim()) return;

    try {
      setLoading(true);
      const result = await specialtyService.createSpecialty({
        name: newSpecialty.trim(),
        department: selectedDept,
        role_level: selectedRole,
      });

      setSpecialties((prev) => [...prev, result]);
      setNewSpecialty('');
      addToast('تمت إضافة الاختصاص بنجاح! أصبح متاحاً في شاشة الموظفين.', 'success');
    } catch (err) {
      console.error('[OrgStructurePage] فشل إضافة الاختصاص:', err);
      const message = err instanceof Error ? err.message : 'حدث خطأ أثناء إضافة الاختصاص';
      addToast(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // ─── حذف اختصاص ──────────────────────────────────────────────
  const handleDeleteSpecialty = async (id: string) => {
    try {
      await specialtyService.deleteSpecialty(id);
      setSpecialties((prev) => prev.filter((s) => s.id !== id));
      addToast('تم حذف الاختصاص', 'success');
    } catch (err) {
      console.error('[OrgStructurePage] فشل حذف الاختصاص:', err);
      const message = err instanceof Error ? err.message : 'حدث خطأ أثناء الحذف';
      addToast(message, 'error');
    }
  };

  // ════════════════════════════════════════════════════════════════
  //  Render
  // ════════════════════════════════════════════════════════════════

  return (
    <div className="space-y-5 sm:space-y-6 animate-fade-in" dir="rtl">
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-slate-800 flex items-center gap-2">
          <GitMerge className="text-indigo-600" /> الهيكل التنظيمي والصلاحيات
        </h1>
        <p className="text-sm text-slate-500 mt-1">إدارة الشجرة الوظيفية والاختصاصات الديناميكية للشركة</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-5 sm:gap-6">
        {/* ── لوحة إضافة اختصاص ── */}
        <Card className="lg:col-span-1 h-fit w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="text-indigo-500" /> إضافة اختصاص جديد
            </CardTitle>
          </CardHeader>
          <form onSubmit={handleAddSpecialty} className="space-y-4 mt-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">مسمى الاختصاص</label>
              <Input
                placeholder="مثال: طبيب، مبرمج، مهندس إنتاج..."
                value={newSpecialty}
                onChange={(e) => setNewSpecialty(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">القسم المرتبط</label>
              <select
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-400"
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
              >
                {DEPARTMENTS.map((dept) => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">المستوى والصلاحية</label>
              <select
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-400"
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value as RoleLevel)}
              >
                <option value="manager">مدير قسم (صلاحيات إدارية)</option>
                <option value="supervisor">مشرف (صلاحيات إشرافية)</option>
                <option value="employee">موظف (صلاحيات أساسية)</option>
              </select>
            </div>
            <Button type="submit" loading={loading} fullWidth icon={<Plus size={16} />} iconPosition="left">
              إضافة للنظام
            </Button>
          </form>

          {/* ── الاختصاصات الحالية ── */}
          <div className="mt-8 border-t border-slate-100 pt-6">
            <h3 className="font-bold text-slate-700 mb-3 text-sm">الاختصاصات الحالية المضافة:</h3>
            <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
              {loading && specialties.length === 0 ? (
                <div className="text-center py-6">
                  <Loader2 size={24} className="mx-auto animate-spin text-slate-300" />
                </div>
              ) : error ? (
                <div className="text-center py-4">
                  <AlertTriangle size={20} className="mx-auto text-red-400 mb-2" />
                  <p className="text-xs text-red-500">{error}</p>
                </div>
              ) : specialties.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">لا توجد اختصاصات بعد</p>
              ) : (
                specialties.map((spec) => {
                  const role = (spec.role_level as RoleLevel) || 'employee';
                  return (
                    <div key={spec.id} className="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-800 truncate">{spec.name}</p>
                        <p className="text-xs text-slate-500">
                          {spec.department} • {ROLE_LABELS[role]}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDeleteSpecialty(spec.id)}
                        className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors flex-shrink-0"
                        title="حذف"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </Card>

        {/* ── شجرة الهيكل التنظيمي ── */}
        <Card className="lg:col-span-2 overflow-x-auto bg-slate-50/50">
          <CardHeader>
            <CardTitle>مخطط الهيكل التنظيمي</CardTitle>
          </CardHeader>

          {/* ✅ P1 FIX: min-w-[300px] على الموبايل (بدل min-w-[600px] الثابت) */}
          <div className="min-w-[300px] sm:min-w-[600px] py-4 sm:py-8 flex justify-center">
            <TreeNode title="المدير العام (CEO)" icon={ShieldAlert} colorClass="border-slate-800 text-slate-800">
              {/* قسم الإنتاج */}
              <div className="relative flex flex-col items-center">
                <TreeNode title="مدير الإنتاج" icon={Building} colorClass="border-indigo-500 text-indigo-500">
                  <div className="relative flex flex-col items-center">
                    <TreeNode title="مشرف الخط" icon={User} colorClass="border-sky-500 text-sky-500">
                      <div className="flex gap-2 sm:gap-4">
                        <TreeNode title="فني إنتاج" icon={CheckCircle} colorClass="border-emerald-500 text-emerald-500" isLeaf />
                        <TreeNode title="عامل تعبئة" icon={CheckCircle} colorClass="border-emerald-500 text-emerald-500" isLeaf />
                      </div>
                    </TreeNode>
                  </div>
                </TreeNode>
              </div>

              {/* قسم الموارد */}
              <div className="relative flex flex-col items-center">
                <TreeNode title="مدير الموارد البشرية" icon={Building} colorClass="border-purple-500 text-purple-500">
                  <div className="flex gap-2 sm:gap-4">
                    <TreeNode title="مشرف التوظيف" icon={User} colorClass="border-pink-500 text-pink-500" isLeaf />
                    <TreeNode title="أخصائي شؤون" icon={User} colorClass="border-pink-500 text-pink-500" isLeaf />
                  </div>
                </TreeNode>
              </div>
            </TreeNode>
          </div>

          <div className="mt-8 bg-indigo-50 border border-indigo-100 p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <Shield className="text-indigo-600 shrink-0" size={24} />
            <p className="text-sm text-indigo-800 leading-relaxed font-medium">
              هذه الشجرة تتفاعل مع الاختصاصات التي تضيفها. المسميات الوظيفية الجديدة يتم حقنها تلقائياً في قاعدة البيانات لتصبح جزءاً من الهيكل التنظيمي، ويمكن لمدير النظام تحديد صلاحيات كل مستوى.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
