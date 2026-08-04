import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, RefreshCw, ShieldCheck, X } from 'lucide-react';
import {
  procurementApprovalRuleService,
  type ApprovalRequiredRole,
  type ProcurementApprovalRuleBoardRecord,
} from '../../../../services/sdk/Procurement/ProcurementFoundationService';
import { departmentService } from '../../../../services/sdk/DepartmentService';
import { getErrorMessage } from '../../../../services/errors';
import { useUIStore } from '../../../../core/stores';
import { ProcurementUnitNav } from '../shared/ProcurementUnitNav';

const ROLES: { value: ApprovalRequiredRole; label: string }[] = [
  { value: 'supervisor', label: 'مشرف' },
  { value: 'direct_manager', label: 'المدير المباشر' },
  { value: 'manager', label: 'مدير' },
  { value: 'finance', label: 'المالية' },
  { value: 'procurement', label: 'المشتريات' },
  { value: 'admin', label: 'مدير النظام' },
];

interface DepartmentOption { id: string; name_ar: string }

interface FormState {
  ruleId: string | null;
  ruleName: string;
  minAmount: string;
  maxAmount: string;
  level: number;
  requiredRole: ApprovalRequiredRole;
  departmentId: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  ruleId: null, ruleName: '', minAmount: '0', maxAmount: '',
  level: 1, requiredRole: 'supervisor', departmentId: '', notes: '',
};

export default function ApprovalRulesPage() {
  const { addToast } = useUIStore();
  const [rows, setRows] = useState<ProcurementApprovalRuleBoardRecord[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [statusTarget, setStatusTarget] = useState<ProcurementApprovalRuleBoardRecord | null>(null);
  const [statusReason, setStatusReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // الأقسام عبر طبقة SDK — لا استدعاء مباشر لـ supabase من الصفحات
      // (حدود SDK: scripts/check-sdk-boundary.mjs · docs/adr/0002)
      const [board, deps] = await Promise.all([
        procurementApprovalRuleService.findBoard(),
        departmentService.findActive().catch(() => []),
      ]);
      setRows(board);
      setDepartments(
        deps.map((d) => ({ id: d.id, name_ar: d.name_ar })) as DepartmentOption[],
      );
    } catch (e) {
      addToast(`تعذر تحميل قواعد الموافقة: ${getErrorMessage(e)}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { void load(); }, [load]);

  const resetForm = () => setForm(EMPTY_FORM);

  const save = async () => {
    const min = Number(form.minAmount);
    const max = Number(form.maxAmount);
    if (!form.ruleName.trim()) { addToast('اسم القاعدة مطلوب', 'error'); return; }
    if (!Number.isFinite(min) || min < 0) { addToast('الحد الأدنى غير صالح', 'error'); return; }
    if (!Number.isFinite(max) || max <= min) { addToast('الحد الأعلى يجب أن يتجاوز الأدنى', 'error'); return; }

    setSaving(true);
    try {
      await procurementApprovalRuleService.upsert({
        ruleName: form.ruleName.trim(),
        minAmount: min,
        maxAmount: max,
        level: form.level,
        requiredRole: form.requiredRole,
        ruleId: form.ruleId,
        departmentId: form.departmentId || null,
        notes: form.notes.trim() || null,
      });
      addToast(form.ruleId ? 'تم تحديث القاعدة' : 'تم إنشاء القاعدة', 'success');
      resetForm();
      await load();
    } catch (e) {
      addToast(getErrorMessage(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (row: ProcurementApprovalRuleBoardRecord) => {
    setForm({
      ruleId: row.id,
      ruleName: row.rule_name,
      minAmount: String(row.min_amount),
      maxAmount: String(row.max_amount),
      level: row.level,
      requiredRole: row.required_role,
      departmentId: row.department_id || '',
      notes: row.notes || '',
    });
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const confirmStatus = async () => {
    if (!statusTarget) return;
    if (!statusReason.trim()) { addToast('السبب مطلوب', 'error'); return; }
    try {
      await procurementApprovalRuleService.setStatus(statusTarget.id, !statusTarget.is_active, statusReason.trim());
      addToast(statusTarget.is_active ? 'تم تعطيل القاعدة' : 'تم تفعيل القاعدة', 'success');
      setStatusTarget(null);
      setStatusReason('');
      await load();
    } catch (e) {
      addToast(getErrorMessage(e), 'error');
    }
  };

  return (
    <div className="space-y-5 max-w-[1600px] mx-auto" dir="rtl">
      <ProcurementUnitNav unit="foundation" />

      <div className="flex justify-between items-center gap-3 flex-wrap">
        <div>
          <p className="text-sm font-bold text-amber-700">Procurement Foundation</p>
          <h1 className="text-3xl font-black">قواعد الموافقة</h1>
          <p className="text-slate-500 mt-2">
            تحدد من يعتمد طلب الشراء حسب المبلغ والقسم. بدون قاعدة نشطة لن تجد الطلبات معتمِداً.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="border rounded-xl px-4 py-2 font-bold hover:bg-slate-50 transition-colors"
        >
          <RefreshCw size={15} className="inline ml-1" />تحديث
        </button>
      </div>

      <div className="bg-white border rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-black flex items-center gap-2">
            <ShieldCheck size={18} className="text-amber-600" />
            {form.ruleId ? 'تعديل قاعدة' : 'قاعدة جديدة'}
          </h2>
          {form.ruleId && (
            <button type="button" onClick={resetForm} className="text-sm text-slate-500 hover:text-slate-800">
              <X size={14} className="inline ml-1" />إلغاء التعديل
            </button>
          )}
        </div>

        <div className="grid md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="lg:col-span-2">
            <label className="block text-xs font-bold text-slate-600 mb-1">اسم القاعدة *</label>
            <input
              value={form.ruleName}
              onChange={e => setForm(f => ({ ...f, ruleName: e.target.value }))}
              placeholder="اعتماد المشرف حتى مليون"
              className="w-full border rounded-xl p-2.5"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">من مبلغ *</label>
            <input
              type="number" min="0"
              value={form.minAmount}
              onChange={e => setForm(f => ({ ...f, minAmount: e.target.value }))}
              className="w-full border rounded-xl p-2.5"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">إلى مبلغ *</label>
            <input
              type="number" min="0"
              value={form.maxAmount}
              onChange={e => setForm(f => ({ ...f, maxAmount: e.target.value }))}
              placeholder="1000000"
              className="w-full border rounded-xl p-2.5"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">المستوى *</label>
            <select
              value={form.level}
              onChange={e => setForm(f => ({ ...f, level: Number(e.target.value) }))}
              className="w-full border rounded-xl p-2.5 bg-white"
            >
              {[1, 2, 3, 4, 5].map(l => <option key={l} value={l}>مستوى {l}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">الدور المطلوب *</label>
            <select
              value={form.requiredRole}
              onChange={e => setForm(f => ({ ...f, requiredRole: e.target.value as ApprovalRequiredRole }))}
              className="w-full border rounded-xl p-2.5 bg-white"
            >
              {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div className="lg:col-span-3">
            <label className="block text-xs font-bold text-slate-600 mb-1">القسم (اتركه فارغاً = كل الأقسام)</label>
            <select
              value={form.departmentId}
              onChange={e => setForm(f => ({ ...f, departmentId: e.target.value }))}
              className="w-full border rounded-xl p-2.5 bg-white"
            >
              <option value="">كل الأقسام</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name_ar}</option>)}
            </select>
          </div>
          <div className="lg:col-span-3">
            <label className="block text-xs font-bold text-slate-600 mb-1">ملاحظات</label>
            <input
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full border rounded-xl p-2.5"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="mt-4 bg-amber-600 text-white rounded-xl px-6 py-2.5 font-bold hover:bg-amber-700 disabled:opacity-50 transition-colors"
        >
          <Plus size={15} className="inline ml-1" />
          {saving ? 'جارٍ الحفظ…' : form.ruleId ? 'حفظ التعديل' : 'إنشاء القاعدة'}
        </button>
      </div>

      {loading ? (
        <div className="py-24 text-center"><Loader2 className="animate-spin mx-auto mb-3" />جارٍ التحميل…</div>
      ) : (
        <div className="bg-white border rounded-2xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="p-3 text-right">القاعدة</th>
                <th className="p-3">المستوى</th>
                <th className="p-3 text-right">نطاق المبلغ</th>
                <th className="p-3">الدور</th>
                <th className="p-3 text-right">القسم</th>
                <th className="p-3">الحالة</th>
                <th className="p-3">إجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map(row => (
                <tr key={row.id} className={row.is_active ? '' : 'bg-slate-50/60'}>
                  <td className="p-3">
                    <div className="font-semibold">{row.rule_name}</div>
                    {row.notes && <div className="text-[11px] text-slate-400">{row.notes}</div>}
                  </td>
                  <td className="p-3 text-center">
                    <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 font-bold">{row.level}</span>
                  </td>
                  <td className="p-3 font-mono text-slate-700">
                    {Number(row.min_amount).toLocaleString()} — {Number(row.max_amount).toLocaleString()}
                  </td>
                  <td className="p-3 text-center">
                    {ROLES.find(r => r.value === row.required_role)?.label ?? row.required_role}
                  </td>
                  <td className="p-3">{row.department_name || <span className="text-slate-400">كل الأقسام</span>}</td>
                  <td className="p-3 text-center">
                    {row.is_active ? (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700">نشطة</span>
                    ) : (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-600" title={row.deactivated_reason || ''}>
                        معطّلة
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-center whitespace-nowrap">
                    <button type="button" onClick={() => startEdit(row)} className="text-blue-700 font-bold text-xs hover:underline ml-3">
                      تعديل
                    </button>
                    <button
                      type="button"
                      onClick={() => { setStatusTarget(row); setStatusReason(''); }}
                      className={`font-bold text-xs hover:underline ${row.is_active ? 'text-rose-700' : 'text-emerald-700'}`}
                    >
                      {row.is_active ? 'تعطيل' : 'تفعيل'}
                    </button>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={7} className="p-16 text-center text-slate-500">
                    <ShieldCheck className="mx-auto mb-3 text-slate-300" size={32} />
                    لا توجد قواعد موافقة. أنشئ قاعدة واحدة على الأقل.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {statusTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" dir="rtl">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h3 className="font-black text-lg mb-2">
              {statusTarget.is_active ? 'تعطيل قاعدة' : 'تفعيل قاعدة'}
            </h3>
            <p className="text-sm text-slate-500 mb-4">{statusTarget.rule_name}</p>
            <label className="block text-xs font-bold text-slate-600 mb-1">السبب *</label>
            <textarea
              value={statusReason}
              onChange={e => setStatusReason(e.target.value)}
              rows={3}
              placeholder="اذكر سبب التغيير — يُسجَّل في سجل التدقيق"
              className="w-full border rounded-xl p-3"
            />
            <div className="flex gap-2 mt-4">
              <button type="button" onClick={() => void confirmStatus()} className="flex-1 bg-amber-600 text-white rounded-xl py-2.5 font-bold hover:bg-amber-700">
                تأكيد
              </button>
              <button type="button" onClick={() => { setStatusTarget(null); setStatusReason(''); }} className="flex-1 border rounded-xl py-2.5 font-bold hover:bg-slate-50">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
