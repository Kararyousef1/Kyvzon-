import { useCallback, useEffect, useState } from 'react';
import { FileText, Loader2, Plus, RefreshCw } from 'lucide-react';
import {
  procurementPolicyService,
  type ProcurementPolicyRecord,
} from '../../../../services/sdk/Procurement/ProcurementFoundationService';
import { getErrorMessage } from '../../../../services/errors';
import { useUIStore } from '../../../../core/stores';
import { ProcurementUnitNav } from '../shared/ProcurementUnitNav';

/**
 * السياسات المعروفة تُعرض كحقول مفهومة بدل JSON خام،
 * التزاماً بمبدأ: لا نطلب من الموظف كتابة JSON.
 */
const KNOWN_POLICIES: {
  key: string;
  label: string;
  description: string;
  field: string;
  fieldLabel: string;
  type: 'number' | 'boolean';
  unit?: string;
}[] = [
  { key: 'pr_auto_approve_limit', label: 'حد الاعتماد التلقائي', description: 'طلبات الشراء تحت هذا المبلغ تُعتمد تلقائياً', field: 'amount', fieldLabel: 'المبلغ', type: 'number', unit: 'دينار' },
  { key: 'pr_require_budget_check', label: 'إلزام فحص الميزانية', description: 'منع تجاوز الميزانية عند إنشاء طلب الشراء', field: 'enabled', fieldLabel: 'مفعّل', type: 'boolean' },
  { key: 'po_require_three_quotes', label: 'إلزام ثلاثة عروض', description: 'أوامر الشراء فوق هذا المبلغ تتطلب ثلاثة عروض أسعار', field: 'threshold', fieldLabel: 'العتبة', type: 'number', unit: 'دينار' },
  { key: 'gr_allow_over_receipt', label: 'السماح بالاستلام الزائد', description: 'نسبة التجاوز المسموحة عند استلام البضائع', field: 'percent', fieldLabel: 'النسبة', type: 'number', unit: '%' },
  { key: 'supplier_require_documents', label: 'إلزام وثائق المورد', description: 'منع التعامل مع مورد بوثائق منتهية', field: 'enabled', fieldLabel: 'مفعّل', type: 'boolean' },
];

export default function ProcurementPoliciesPage() {
  const { addToast } = useUIStore();
  const [rows, setRows] = useState<ProcurementPolicyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await procurementPolicyService.findAll();
      setRows(data);
      const next: Record<string, string> = {};
      for (const p of KNOWN_POLICIES) {
        const found = data.find(r => r.policy_key === p.key);
        const raw = found?.policy_value?.[p.field];
        next[p.key] = raw === undefined || raw === null ? '' : String(raw);
      }
      setDrafts(next);
    } catch (e) {
      addToast(`تعذر تحميل السياسات: ${getErrorMessage(e)}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { void load(); }, [load]);

  const savePolicy = async (policy: typeof KNOWN_POLICIES[number]) => {
    const raw = drafts[policy.key] ?? '';
    let value: Record<string, unknown>;

    if (policy.type === 'number') {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) { addToast('القيمة يجب أن تكون رقماً غير سالب', 'error'); return; }
      value = { [policy.field]: n };
    } else {
      value = { [policy.field]: raw === 'true' };
    }

    setSavingKey(policy.key);
    try {
      await procurementPolicyService.upsert({
        policyKey: policy.key,
        policyValue: value,
        description: policy.description,
      });
      addToast(`تم حفظ سياسة: ${policy.label}`, 'success');
      await load();
    } catch (e) {
      addToast(getErrorMessage(e), 'error');
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="space-y-5 max-w-[1600px] mx-auto" dir="rtl">
      <ProcurementUnitNav unit="foundation" />

      <div className="flex justify-between items-center gap-3 flex-wrap">
        <div>
          <p className="text-sm font-bold text-amber-700">Procurement Foundation</p>
          <h1 className="text-3xl font-black">سياسات المشتريات</h1>
          <p className="text-slate-500 mt-2">
            ضوابط وعتبات تُطبَّق على مستوى الشركة. كل تغيير يُسجَّل في سجل التدقيق.
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

      {loading ? (
        <div className="py-24 text-center"><Loader2 className="animate-spin mx-auto mb-3" />جارٍ التحميل…</div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {KNOWN_POLICIES.map(policy => {
            const existing = rows.find(r => r.policy_key === policy.key);
            return (
              <div key={policy.key} className="bg-white border rounded-2xl p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <h3 className="font-black flex items-center gap-2">
                      <FileText size={16} className="text-amber-600 shrink-0" />
                      {policy.label}
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">{policy.description}</p>
                    <p className="font-mono text-[10px] text-slate-400 mt-1">{policy.key}</p>
                  </div>
                  {existing ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 shrink-0">مضبوطة</span>
                  ) : (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-500 shrink-0">غير مضبوطة</span>
                  )}
                </div>

                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <label className="block text-xs font-bold text-slate-600 mb-1">
                      {policy.fieldLabel}{policy.unit ? ` (${policy.unit})` : ''}
                    </label>
                    {policy.type === 'number' ? (
                      <input
                        type="number" min="0"
                        value={drafts[policy.key] ?? ''}
                        onChange={e => setDrafts(d => ({ ...d, [policy.key]: e.target.value }))}
                        className="w-full border rounded-xl p-2.5"
                      />
                    ) : (
                      <select
                        value={drafts[policy.key] || 'false'}
                        onChange={e => setDrafts(d => ({ ...d, [policy.key]: e.target.value }))}
                        className="w-full border rounded-xl p-2.5 bg-white"
                      >
                        <option value="true">مفعّل</option>
                        <option value="false">معطّل</option>
                      </select>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => void savePolicy(policy)}
                    disabled={savingKey === policy.key}
                    className="bg-amber-600 text-white rounded-xl px-5 py-2.5 font-bold hover:bg-amber-700 disabled:opacity-50 transition-colors"
                  >
                    <Plus size={14} className="inline ml-1" />
                    {savingKey === policy.key ? '…' : 'حفظ'}
                  </button>
                </div>

                {existing?.updated_by_name && (
                  <p className="text-[11px] text-slate-400 mt-2">
                    آخر تعديل: {existing.updated_by_name} — {new Date(existing.updated_at).toLocaleDateString('ar')}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
