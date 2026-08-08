/**
 * ApprovalRulesAdminPage — تكوين قواعد الاعتماد لكل الوحدات
 *
 * ═════════════════════════════════════════════════════════════════════════
 * الفجوة التي تسدّها:
 *   0305 أنشأ approval_rules و resolve_approval_chain، لكن الجدول كان
 *   بلا واجهة — فحص الشيفرة أثبت أن لا سطر في src/ يقرأ منه.
 *   النتيجة: قواعد الاعتماد غير قابلة للتكوين إطلاقاً.
 *
 * لوحة الفجوات أعلى الصفحة عمداً: قاعدة اعتماد خاطئة أخطر من غيابها،
 * لأن الطلب يقع في فراغ صامت. المستخدم يرى المشكلة قبل القائمة.
 * ═════════════════════════════════════════════════════════════════════════
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  ToggleLeft,
  ToggleRight,
  X,
} from 'lucide-react';
import { useUIStore } from '../../core/stores';
import {
  approvalRulesService,
  APPROVAL_RULE_ROLE_LABELS,
  type ApprovalRuleGap,
  type ApprovalRuleRole,
  type ApprovalRuleRow,
} from '../../services/sdk/ApprovalRulesService';
import { departmentService } from '../../services/sdk/DepartmentService';
import { PORTAL_UNITS, findUnit, type PortalUnitKey } from '../../shared/constants/portalUnits';
import Card from '../../shared/components/ui/Card';
import Button from '../../shared/components/ui/Button';
import Modal from '../../shared/components/ui/Modal';
import { getErrorMessage } from '../../services/errors';

interface DeptOption {
  id: string;
  name_ar?: string;
}

interface FormState {
  ruleId: string | null;
  unitKey: PortalUnitKey;
  ruleName: string;
  minAmount: string;
  maxAmount: string;
  level: number;
  requiredRole: ApprovalRuleRole;
  departmentId: string;
}

const EMPTY_FORM: FormState = {
  ruleId: null,
  unitKey: 'movement',
  ruleName: '',
  minAmount: '0',
  maxAmount: '999999',
  level: 1,
  requiredRole: 'manager',
  departmentId: '',
};

const SEVERITY_STYLE: Record<ApprovalRuleGap['severity'], { cls: string; icon: typeof Info }> = {
  error: { cls: 'bg-rose-50 border-rose-200 text-rose-800', icon: AlertTriangle },
  warning: { cls: 'bg-amber-50 border-amber-200 text-amber-800', icon: AlertTriangle },
  info: { cls: 'bg-sky-50 border-sky-200 text-sky-800', icon: Info },
};

function fmtNum(n: number): string {
  return new Intl.NumberFormat('ar-IQ', { maximumFractionDigits: 2 }).format(n);
}

export default function ApprovalRulesAdminPage() {
  const { addToast } = useUIStore();
  const [rules, setRules] = useState<ApprovalRuleRow[]>([]);
  const [gaps, setGaps] = useState<ApprovalRuleGap[]>([]);
  const [departments, setDepartments] = useState<DeptOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [unitFilter, setUnitFilter] = useState<PortalUnitKey | 'all'>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const key = unitFilter === 'all' ? undefined : unitFilter;
      const [r, g, d] = await Promise.all([
        approvalRulesService.findRules(key),
        approvalRulesService.detectGaps(key),
        departmentService.findActive().catch(() => []),
      ]);
      setRules(r);
      setGaps(g);
      setDepartments(d as DeptOption[]);
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast, unitFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const errorCount = useMemo(() => gaps.filter((g) => g.severity === 'error').length, [gaps]);

  const openCreate = () => {
    setForm({
      ...EMPTY_FORM,
      unitKey: unitFilter === 'all' ? 'movement' : unitFilter,
    });
    setModalOpen(true);
  };

  const openEdit = (r: ApprovalRuleRow) => {
    setForm({
      ruleId: r.ruleId,
      unitKey: r.unitKey,
      ruleName: r.ruleName,
      minAmount: String(r.minAmount),
      maxAmount: String(r.maxAmount),
      level: r.level,
      requiredRole: r.requiredRole,
      departmentId: r.departmentId ?? '',
    });
    setModalOpen(true);
  };

  const submit = async () => {
    if (!form.ruleName.trim()) {
      addToast('اسم القاعدة مطلوب', 'error');
      return;
    }
    const min = Number(form.minAmount);
    const max = Number(form.maxAmount);
    if (Number.isNaN(min) || Number.isNaN(max)) {
      addToast('المبالغ يجب أن تكون أرقاماً', 'error');
      return;
    }
    if (max < min) {
      addToast('الحد الأعلى أصغر من الأدنى', 'error');
      return;
    }
    setSaving(true);
    try {
      await approvalRulesService.upsert({
        unitKey: form.unitKey,
        ruleName: form.ruleName.trim(),
        minAmount: min,
        maxAmount: max,
        level: form.level,
        requiredRole: form.requiredRole,
        departmentId: form.departmentId || null,
        ruleId: form.ruleId,
      });
      addToast(form.ruleId ? 'حُدِّثت القاعدة' : 'أُنشئت القاعدة', 'success');
      setModalOpen(false);
      await load();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (r: ApprovalRuleRow) => {
    try {
      await approvalRulesService.setActive(r.ruleId, !r.isActive);
      addToast(r.isActive ? 'عُطِّلت القاعدة' : 'فُعِّلت القاعدة', 'success');
      await load();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    }
  };

  return (
    <div className="space-y-4" dir="rtl">
      <div className="bg-gradient-to-l from-slate-800 to-slate-700 rounded-2xl p-5 text-white">
        <p className="text-white/60 text-sm font-semibold">بوابة الإدارة</p>
        <h1 className="text-2xl font-black mt-1">قواعد الاعتماد</h1>
        <p className="text-white/70 text-sm mt-1">
          من يعتمد ماذا — بالمبلغ والقسم والمستوى، لكل وحدة.
        </p>
      </div>

      {/* لوحة الفجوات أولاً: المشكلة قبل القائمة */}
      {!loading && gaps.length > 0 && (
        <div className="space-y-2">
          {errorCount > 0 && (
            <p className="text-xs font-black text-rose-700">
              {errorCount} مشكلة تمنع سير الاعتماد
            </p>
          )}
          {gaps.map((g, i) => {
            const st = SEVERITY_STYLE[g.severity];
            return (
              <div
                key={`${g.unitKey}-${i}`}
                className={`rounded-xl border p-3 text-xs flex items-start gap-2 ${st.cls}`}
              >
                <st.icon size={14} className="mt-0.5 shrink-0" />
                <span>
                  <strong>{findUnit(g.unitKey)?.label ?? g.unitKey} — {g.issue}:</strong>{' '}
                  {g.detail}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {!loading && gaps.length === 0 && rules.length > 0 && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle2 size={14} />
          لا فجوات ولا تعارضات في القواعد الحالية.
        </div>
      )}

      <Card className="p-3">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setUnitFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
              unitFilter === 'all'
                ? 'bg-slate-800 text-white border-slate-800'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            كل الوحدات
          </button>
          {PORTAL_UNITS.map((u) => (
            <button
              key={u.unitKey}
              type="button"
              onClick={() => setUnitFilter(u.unitKey)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                unitFilter === u.unitKey
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {u.label}
            </button>
          ))}
          <div className="mr-auto flex gap-2">
            <Button variant="secondary" onClick={() => void load()} icon={<RefreshCw size={14} />}>
              تحديث
            </Button>
            <Button variant="primary" onClick={openCreate} icon={<Plus size={14} />}>
              قاعدة جديدة
            </Button>
          </div>
        </div>
      </Card>

      {loading ? (
        <Card className="p-10 text-center text-slate-400 text-sm">جارٍ التحميل…</Card>
      ) : rules.length === 0 ? (
        <Card className="p-10 text-center">
          <ShieldCheck size={36} className="mx-auto text-slate-300 mb-3" />
          <p className="font-bold text-slate-700">لا قواعد بعد</p>
          <p className="text-sm text-slate-500 mt-1">
            بلا قواعد، تعتمد الطلبات على السلسلة التنظيمية وحدها.
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs">
                <tr>
                  <th className="p-3 text-right font-bold">الوحدة</th>
                  <th className="p-3 text-right font-bold">القاعدة</th>
                  <th className="p-3 text-right font-bold">النطاق</th>
                  <th className="p-3 text-right font-bold">القسم</th>
                  <th className="p-3 text-right font-bold">المستوى</th>
                  <th className="p-3 text-right font-bold">المعتمِد</th>
                  <th className="p-3 text-right font-bold">الحالة</th>
                  <th className="p-3 text-right font-bold"></th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr
                    key={r.ruleId}
                    className={`border-t border-slate-100 ${r.isActive ? '' : 'opacity-50'}`}
                  >
                    <td className="p-3 text-xs font-bold text-slate-600">
                      {findUnit(r.unitKey)?.label ?? r.unitKey}
                    </td>
                    <td className="p-3 font-bold text-slate-800">{r.ruleName}</td>
                    <td className="p-3 text-xs text-slate-600 font-mono">
                      {fmtNum(r.minAmount)} — {fmtNum(r.maxAmount)}
                    </td>
                    <td className="p-3 text-xs text-slate-500">{r.departmentName}</td>
                    <td className="p-3 text-center">
                      <span className="text-xs px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 font-black">
                        {r.level}
                      </span>
                    </td>
                    <td className="p-3 text-xs font-bold text-indigo-700">
                      {APPROVAL_RULE_ROLE_LABELS[r.requiredRole]}
                    </td>
                    <td className="p-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-lg font-bold ${
                          r.isActive
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {r.isActive ? 'فعّالة' : 'معطَّلة'}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1 justify-end">
                        <button
                          type="button"
                          onClick={() => openEdit(r)}
                          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
                          title="تعديل"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => void toggle(r)}
                          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
                          title={r.isActive ? 'تعطيل' : 'تفعيل'}
                        >
                          {r.isActive ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <p className="text-[11px] text-slate-400 text-center">
        القواعد المعطَّلة تبقى للتدقيق — لا حذف.
      </p>

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={form.ruleId ? 'تعديل قاعدة' : 'قاعدة اعتماد جديدة'}
      >
        <div className="space-y-3" dir="rtl">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-600 mb-1 block">الوحدة</label>
              <select
                value={form.unitKey}
                onChange={(e) => setForm((f) => ({ ...f, unitKey: e.target.value as PortalUnitKey }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm"
              >
                {PORTAL_UNITS.map((u) => (
                  <option key={u.unitKey} value={u.unitKey}>
                    {u.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600 mb-1 block">المستوى (1-5)</label>
              <input
                type="number"
                min={1}
                max={5}
                value={form.level}
                onChange={(e) => setForm((f) => ({ ...f, level: Number(e.target.value) }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-600 mb-1 block">اسم القاعدة *</label>
            <input
              value={form.ruleName}
              onChange={(e) => setForm((f) => ({ ...f, ruleName: e.target.value }))}
              placeholder="مثال: مصروف يتجاوز 50 ألفاً"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-600 mb-1 block">من مبلغ</label>
              <input
                type="number"
                value={form.minAmount}
                onChange={(e) => setForm((f) => ({ ...f, minAmount: e.target.value }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600 mb-1 block">إلى مبلغ</label>
              <input
                type="number"
                value={form.maxAmount}
                onChange={(e) => setForm((f) => ({ ...f, maxAmount: e.target.value }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-600 mb-1 block">المعتمِد المطلوب</label>
              <select
                value={form.requiredRole}
                onChange={(e) =>
                  setForm((f) => ({ ...f, requiredRole: e.target.value as ApprovalRuleRole }))
                }
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm"
              >
                {(Object.keys(APPROVAL_RULE_ROLE_LABELS) as ApprovalRuleRole[]).map((r) => (
                  <option key={r} value={r}>
                    {APPROVAL_RULE_ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600 mb-1 block">القسم</label>
              <select
                value={form.departmentId}
                onChange={(e) => setForm((f) => ({ ...f, departmentId: e.target.value }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm"
              >
                <option value="">كل الأقسام</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name_ar ?? d.id}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-1">
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving} icon={<X size={14} />}>
              إلغاء
            </Button>
            <Button variant="primary" onClick={submit} disabled={saving}>
              {saving ? 'جارٍ الحفظ…' : form.ruleId ? 'حفظ التعديل' : 'إنشاء القاعدة'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
