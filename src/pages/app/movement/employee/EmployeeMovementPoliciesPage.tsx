import { useCallback, useEffect, useState } from 'react';
import { Plus, ShieldCheck, Sliders, CheckCircle2 , X } from 'lucide-react';
import { useUIStore } from '../../../../core/stores';
import { movementPolicyService } from '../../../../services/sdk/MovementFoundationService';
import type { MovementPolicyRecord } from '../../../../shared/types/movement-foundation';
import Card from '../../../../shared/components/ui/Card';
import Button from '../../../../shared/components/ui/Button';
import { getErrorMessage } from '../../../../services/errors';
import Input from '../../../../shared/components/ui/Input';
import { movementFoundationOperationsService } from '../../../../services/sdk/MovementFoundationOperationsService';
import { MovementUnitNav } from '../shared/MovementUnitNav';

export default function EmployeeMovementPoliciesPage() {
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    titleAr: '', destinationType: '', maxDurationMinutes: 60,
    requiresApproval: false, autoNotifyOverdue: true, reason: '',
  });
  const [policies, setPolicies] = useState<MovementPolicyRecord[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await movementPolicyService.findAll({ orderBy: 'created_at', ascending: false });
      setPolicies(data || []);
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { loadData(); }, [loadData]);

  /* التعديل يتطلب سبباً لأن السياسة تحكم كل التصاريح القادمة (0285) */
  const submitPolicy = async () => {
    setSaving(true);
    try {
      await movementFoundationOperationsService.upsertPolicy({
        titleAr: form.titleAr,
        destinationType: form.destinationType,
        maxDurationMinutes: form.maxDurationMinutes,
        requiresApproval: form.requiresApproval,
        autoNotifyOverdue: form.autoNotifyOverdue,
        policyId: editId,
        reason: form.reason || null,
      });
      addToast(editId ? 'تم تعديل السياسة' : 'تمت إضافة السياسة', 'success');
      setShowForm(false); setEditId(null);
      await loadData();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      <MovementUnitNav unit="employee_foundation" />
      <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl p-6 text-white flex items-center justify-between flex-wrap gap-4">
        <div>
          <p className="text-white/70 text-sm font-semibold">Employee Movement • E00</p>
          <h2 className="text-2xl font-extrabold mt-1 flex items-center gap-2"><Sliders /> سياسات وقواعد حركة الموظفين</h2>
          <p className="text-white/75 mt-2 text-sm">إدارة مدد الخروج المسموحة، متطلبات الموافقات، وقواعد الأمان لجميع وجهات الموظفين.</p>
        </div>
        <Button onClick={() => { setEditId(null); setForm({ titleAr: '', destinationType: '', maxDurationMinutes: 60, requiresApproval: false, autoNotifyOverdue: true, reason: '' }); setShowForm(true); }} className="!bg-white !text-indigo-700 hover:!bg-indigo-50 !border-none" icon={<Plus size={16} />} iconPosition="left">سياسة جديدة</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold"><Sliders size={20} /></div><div><p className="text-2xl font-extrabold text-slate-900">{policies.length}</p><p className="text-xs text-slate-500">السياسات النشطة</p></div></div></Card>
        <Card><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold"><CheckCircle2 size={20} /></div><div><p className="text-2xl font-extrabold text-slate-900">مفعلة بالكامل</p><p className="text-xs text-slate-500">حالة نظام السياسات</p></div></div></Card>
        <Card><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold"><ShieldCheck size={20} /></div><div><p className="text-2xl font-extrabold text-slate-900">آمن ومرتبط</p><p className="text-xs text-slate-500">مطابق لـ RLS</p></div></div></Card>
      </div>

      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {['رمز السياسة', 'عنوان السياسة', 'نوع الوجهة', 'المدة القصوى (دقيقة)', 'الموافقة مطلوبة', 'الحالة'].map(h => <th key={h} className="text-right py-3 px-4 text-xs font-bold text-slate-500">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {policies.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-slate-400">لا توجد سياسات مسجلة. سيتم إدراج السياسات الافتراضية عبر النظام.</td></tr>
              ) : policies.map(p => (
                <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="py-3 px-4 font-mono font-bold text-indigo-600">{p.policy_code}</td>
                  <td className="py-3 px-4 font-bold text-slate-800">{p.title_ar}</td>
                  <td className="py-3 px-4 text-slate-600">{p.destination_type}</td>
                  <td className="py-3 px-4 font-bold text-slate-700">{p.max_duration_minutes} دقيقة</td>
                  <td className="py-3 px-4">{p.requires_approval ? <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-bold">مطلوبة</span> : <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold">تلقائية</span>}</td>
                  <td className="py-3 px-4">{p.is_active ? <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold">نشط</span> : <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 text-xs font-bold">معطل</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-xl" dir="rtl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">{editId ? 'تعديل سياسة' : 'سياسة جديدة'}</h3>
              <button type="button" onClick={() => setShowForm(false)}
                className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-600">عنوان السياسة *</label>
                <Input value={form.titleAr} onChange={(e) => setForm({ ...form, titleAr: e.target.value })} />
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-600">نوع الوجهة *</label>
                  <Input value={form.destinationType}
                    onChange={(e) => setForm({ ...form, destinationType: e.target.value })}
                    placeholder="مثال: بنك · دائرة حكومية · عميل" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600">أقصى مدة (دقيقة) *</label>
                  <Input type="number" value={form.maxDurationMinutes}
                    onChange={(e) => setForm({ ...form, maxDurationMinutes: Number(e.target.value) })} />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.requiresApproval}
                  onChange={(e) => setForm({ ...form, requiresApproval: e.target.checked })} />
                يتطلب موافقة مسبقة
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.autoNotifyOverdue}
                  onChange={(e) => setForm({ ...form, autoNotifyOverdue: e.target.checked })} />
                إشعار تلقائي عند التأخر
              </label>
              {editId && (
                <div>
                  <label className="text-xs font-bold text-slate-600">سبب التعديل (إلزامي)</label>
                  <textarea value={form.reason} rows={2}
                    onChange={(e) => setForm({ ...form, reason: e.target.value })}
                    className="w-full border rounded-xl p-2.5 text-sm mt-1" />
                </div>
              )}
              <p className="text-[11px] text-slate-400">
                المدة من 1 إلى 1440 دقيقة. التعديل يؤثر على التصاريح القادمة ويُسجَّل في التدقيق.
              </p>
            </div>
            <div className="flex gap-2 mt-5">
              <Button onClick={() => void submitPolicy()} loading={saving} className="flex-1">حفظ</Button>
              <Button variant="secondary" onClick={() => setShowForm(false)} className="flex-1">إلغاء</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
