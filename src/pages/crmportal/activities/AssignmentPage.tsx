/**
 * AssignmentPage — قواعد الإسناد التلقائي: توزيع الصفقات حسب المنطقة/القيمة/المصدر.
 */
import { useMemo, useState } from 'react';
import { Plus, X, UserCheck } from 'lucide-react';
import {
  crmAssignmentService,
  type CrmAssignmentRuleInput, type AssignmentMatchType,
  ASSIGNMENT_MATCH_LABEL,
} from '../../../services/sdk';
import { crmAccountService } from '../../../services/sdk';
import { useAssignmentRules, useAsync } from './useActivities';

const EMPTY: CrmAssignmentRuleInput = { name: '', match_type: 'region', match_value: '', priority: 0 };

export default function AssignmentPage() {
  const { data: rules, loading, reload } = useAssignmentRules();
  // نستخدم قائمة الحسابات لاستنتاج المناطق المتاحة (مساعدة للمستخدم)
  const accounts = useAsync(() => crmAccountService.listAccounts(), [] as Awaited<ReturnType<typeof crmAccountService.listAccounts>>);
  const [show, setShow] = useState(false);
  const [form, setForm] = useState<CrmAssignmentRuleInput>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const regions = useMemo(() => Array.from(new Set(accounts.data.map((a) => a.country).filter(Boolean))) as string[], [accounts.data]);

  const save = async () => {
    if (!form.name.trim() || !form.match_value.trim()) { setErr('الاسم وقيمة المطابقة مطلوبان'); return; }
    setBusy(true); setErr(null);
    try { await crmAssignmentService.createRule(form); setShow(false); setForm(EMPTY); reload(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'تعذّر الحفظ'); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-slate-500">وزّع الصفقات الجديدة تلقائياً على الموظف المناسب حسب المنطقة أو قيمة الصفقة أو مصدرها.</p>
        <button onClick={() => setShow(true)} className="flex items-center gap-1.5 bg-cyan-600 text-white text-sm px-4 py-2 rounded-xl hover:bg-cyan-700"><Plus size={16} /> قاعدة إسناد</button>
      </div>

      {loading ? <p className="text-slate-400 text-sm text-center py-10">جارٍ التحميل…</p>
        : rules.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center"><UserCheck size={32} className="mx-auto text-slate-300" /><p className="text-slate-500 mt-3 font-semibold">لا قواعد إسناد بعد</p></div>
          : <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs"><tr><th className="text-right px-4 py-3">القاعدة</th><th className="text-right px-4 py-3">المطابقة</th><th className="text-center px-4 py-3">الأولوية</th><th className="text-center px-4 py-3">الحالة</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {rules.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-semibold text-slate-800">{r.name}</td>
                    <td className="px-4 py-3 text-slate-600 text-xs">{ASSIGNMENT_MATCH_LABEL[r.match_type]} = <span className="font-mono">{r.match_value}</span></td>
                    <td className="px-4 py-3 text-center text-xs text-slate-500">{r.priority}</td>
                    <td className="px-4 py-3 text-center"><span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full ${r.is_active ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-slate-100 text-slate-400 border-slate-200'}`}>{r.is_active ? 'مفعّلة' : 'معطّلة'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}

      {show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShow(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4"><h3 className="font-black text-slate-800">قاعدة إسناد تلقائي</h3><button onClick={() => setShow(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button></div>
            <div className="space-y-3">
              <div><label className="text-xs text-slate-500">اسم القاعدة *</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="مثال: فريق الخليج" className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" /></div>
              <div><label className="text-xs text-slate-500">نوع المطابقة</label><select value={form.match_type} onChange={(e) => setForm({ ...form, match_type: e.target.value as AssignmentMatchType })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none">{Object.entries(ASSIGNMENT_MATCH_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              <div>
                <label className="text-xs text-slate-500">قيمة المطابقة *</label>
                <input value={form.match_value} onChange={(e) => setForm({ ...form, match_value: e.target.value })} placeholder={form.match_type === 'value_gte' ? '50000' : form.match_type === 'region' ? 'الرياض' : 'website'} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" list="regions" />
                {form.match_type === 'region' && <datalist id="regions">{regions.map((r) => <option key={r} value={r} />)}</datalist>}
              </div>
              <div><label className="text-xs text-slate-500">الأولوية (الأعلى يُطبَّق أولاً)</label><input type="number" value={form.priority ?? 0} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" /></div>
              {err && <p className="text-xs text-rose-600">{err}</p>}
            </div>
            <div className="flex gap-2 mt-5"><button onClick={save} disabled={busy} className="flex-1 bg-cyan-600 text-white text-sm py-2.5 rounded-xl hover:bg-cyan-700 disabled:opacity-60">{busy ? 'جارٍ…' : 'حفظ'}</button><button onClick={() => setShow(false)} className="px-4 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">إلغاء</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
