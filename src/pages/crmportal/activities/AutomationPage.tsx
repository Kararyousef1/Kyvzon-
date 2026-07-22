/**
 * AutomationPage — قواعد الأتمتة If-Then: قائمة + إنشاء + تفعيل/تعطيل.
 */
import { useState } from 'react';
import { Plus, X, Zap, ToggleLeft, ToggleRight } from 'lucide-react';
import {
  crmAutomationService,
  type CrmAutomationRuleInput, type AutomationTrigger, type AutomationAction,
  AUTOMATION_TRIGGER_LABEL, AUTOMATION_ACTION_LABEL,
} from '../../../services/sdk';
import { useAutomationRules } from './useActivities';

const EMPTY: CrmAutomationRuleInput = { name: '', trigger_event: 'deal_created', action_type: 'notify_manager', is_active: true };

export default function AutomationPage() {
  const { data: rules, loading, reload } = useAutomationRules();
  const [show, setShow] = useState(false);
  const [form, setForm] = useState<CrmAutomationRuleInput>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (!form.name.trim()) { setErr('اسم القاعدة مطلوب'); return; }
    setBusy(true); setErr(null);
    try { await crmAutomationService.createRule(form); setShow(false); setForm(EMPTY); reload(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'تعذّر الحفظ'); } finally { setBusy(false); }
  };
  const toggle = async (id: string, cur: boolean) => { try { await crmAutomationService.toggle(id, !cur); reload(); } catch { /* noop */ } };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-slate-500">قواعد "إذا... ثم..." تُشغّل الإجراءات تلقائياً — أشعِر المدير، أنشئ مهمة، حرّك المرحلة، ابدأ سلسلة، وأكثر.</p>
        <button onClick={() => setShow(true)} className="flex items-center gap-1.5 bg-cyan-600 text-white text-sm px-4 py-2 rounded-xl hover:bg-cyan-700"><Plus size={16} /> قاعدة جديدة</button>
      </div>

      {loading ? <p className="text-slate-400 text-sm text-center py-10">جارٍ التحميل…</p>
        : rules.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center"><Zap size={32} className="mx-auto text-slate-300" /><p className="text-slate-500 mt-3 font-semibold">لا قواعد أتمتة بعد</p></div>
          : <div className="space-y-2">{rules.map((r) => (
            <div key={r.id} className="flex items-center gap-3 bg-white rounded-2xl border border-slate-200 p-4">
              <div className="w-10 h-10 rounded-xl bg-cyan-50 text-cyan-600 flex items-center justify-center shrink-0"><Zap size={18} /></div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-slate-800 text-sm">{r.name}</p>
                <p className="text-xs text-slate-400">
                  <span className="text-slate-500">إذا:</span> {AUTOMATION_TRIGGER_LABEL[r.trigger_event]} <span className="text-slate-300">←</span> <span className="text-slate-500">ثم:</span> {AUTOMATION_ACTION_LABEL[r.action_type]}
                  {r.run_count > 0 && <span className="text-slate-300"> · نُفّذت {r.run_count} مرة</span>}
                </p>
              </div>
              <button onClick={() => toggle(r.id, r.is_active)} className={r.is_active ? 'text-emerald-500' : 'text-slate-300'}>
                {r.is_active ? <ToggleRight size={26} /> : <ToggleLeft size={26} />}
              </button>
            </div>
          ))}</div>}

      {show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShow(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4"><h3 className="font-black text-slate-800">قاعدة أتمتة جديدة</h3><button onClick={() => setShow(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button></div>
            <div className="space-y-3">
              <div><label className="text-xs text-slate-500">اسم القاعدة *</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" /></div>
              <div><label className="text-xs text-slate-500">إذا (المحفّز)</label><select value={form.trigger_event} onChange={(e) => setForm({ ...form, trigger_event: e.target.value as AutomationTrigger })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none">{Object.entries(AUTOMATION_TRIGGER_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              <div><label className="text-xs text-slate-500">ثم (الإجراء)</label><select value={form.action_type} onChange={(e) => setForm({ ...form, action_type: e.target.value as AutomationAction })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none">{Object.entries(AUTOMATION_ACTION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              {err && <p className="text-xs text-rose-600">{err}</p>}
            </div>
            <div className="flex gap-2 mt-5"><button onClick={save} disabled={busy} className="flex-1 bg-cyan-600 text-white text-sm py-2.5 rounded-xl hover:bg-cyan-700 disabled:opacity-60">{busy ? 'جارٍ…' : 'حفظ'}</button><button onClick={() => setShow(false)} className="px-4 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">إلغاء</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
