/**
 * MyTasksPage — لوحة المهام الشخصية: متأخرة / اليوم / الأسبوع + إنشاء + إكمال + تسجيل مكالمة.
 */
import { useMemo, useState } from 'react';
import { Plus, X, Circle, Phone } from 'lucide-react';
import {
  crmTaskService,
  type CrmTask, type CrmTaskInput, type TaskPriority, type TaskType, type CallOutcome,
  TASK_TYPE_LABEL, TASK_PRIORITY_LABEL, TASK_PRIORITY_COLOR, CALL_OUTCOME_LABEL,
} from '../../../services/sdk';
import { useTasks } from './useActivities';

const EMPTY: CrmTaskInput = { title: '', task_type: 'todo', priority: 'medium', due_at: null };

function startOfDay(d = new Date()) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }

export default function MyTasksPage() {
  const { data: tasks, loading, reload } = useTasks();
  const [show, setShow] = useState(false);
  const [form, setForm] = useState<CrmTaskInput>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [callFor, setCallFor] = useState<CrmTask | null>(null);

  const groups = useMemo(() => {
    const open = tasks.filter((t) => t.status === 'not_started' || t.status === 'in_progress');
    const now = Date.now();
    const todayEnd = startOfDay().getTime() + 86400000;
    const weekEnd = startOfDay().getTime() + 7 * 86400000;
    return {
      overdue: open.filter((t) => t.due_at && new Date(t.due_at).getTime() < now && new Date(t.due_at).getTime() < startOfDay().getTime()),
      today: open.filter((t) => t.due_at && new Date(t.due_at).getTime() >= startOfDay().getTime() && new Date(t.due_at).getTime() < todayEnd),
      week: open.filter((t) => t.due_at && new Date(t.due_at).getTime() >= todayEnd && new Date(t.due_at).getTime() < weekEnd),
      later: open.filter((t) => !t.due_at || new Date(t.due_at).getTime() >= weekEnd),
    };
  }, [tasks]);

  const save = async () => {
    if (!form.title.trim()) { setErr('عنوان المهمة مطلوب'); return; }
    setBusy(true); setErr(null);
    try { await crmTaskService.createTask(form); setShow(false); setForm(EMPTY); reload(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'تعذّر الحفظ'); } finally { setBusy(false); }
  };
  const complete = async (id: string) => { try { await crmTaskService.complete(id); reload(); } catch { /* noop */ } };

  const Section = ({ title, list, tone }: { title: string; list: CrmTask[]; tone: string }) => (
    <div>
      <h3 className={`text-sm font-bold mb-2 ${tone}`}>{title} ({list.length})</h3>
      {list.length === 0 ? <p className="text-slate-300 text-xs pb-2">—</p>
        : <div className="space-y-2">{list.map((t) => (
          <div key={t.id} className="flex items-center gap-3 bg-white rounded-xl border border-slate-200 p-3">
            <button onClick={() => complete(t.id)} className="text-slate-300 hover:text-emerald-500"><Circle size={18} /></button>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 truncate">{t.title}</p>
              <p className="text-xs text-slate-400">{TASK_TYPE_LABEL[t.task_type]}{t.due_at ? ` · ${new Date(t.due_at).toLocaleDateString('ar')}` : ''}{t.origin === 'sequence' ? ' · من سلسلة' : ''}</p>
            </div>
            {t.task_type === 'call' && <button onClick={() => setCallFor(t)} title="تسجيل مكالمة" className="text-cyan-500 hover:text-cyan-700"><Phone size={15} /></button>}
            <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full ${TASK_PRIORITY_COLOR[t.priority]}`}>{TASK_PRIORITY_LABEL[t.priority]}</span>
          </div>
        ))}</div>}
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button onClick={() => setShow(true)} className="flex items-center gap-1.5 bg-cyan-600 text-white text-sm px-4 py-2 rounded-xl hover:bg-cyan-700"><Plus size={16} /> مهمة جديدة</button>
      </div>

      {loading ? <p className="text-slate-400 text-sm text-center py-10">جارٍ التحميل…</p>
        : <div className="space-y-5">
          <Section title="متأخرة" list={groups.overdue} tone="text-rose-600" />
          <Section title="اليوم" list={groups.today} tone="text-cyan-700" />
          <Section title="هذا الأسبوع" list={groups.week} tone="text-slate-700" />
          <Section title="لاحقاً / بلا تاريخ" list={groups.later} tone="text-slate-400" />
        </div>}

      {show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShow(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4"><h3 className="font-black text-slate-800">مهمة جديدة</h3><button onClick={() => setShow(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button></div>
            <div className="space-y-3">
              <div><label className="text-xs text-slate-500">العنوان *</label><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-slate-500">النوع</label><select value={form.task_type} onChange={(e) => setForm({ ...form, task_type: e.target.value as TaskType })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none">{Object.entries(TASK_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                <div><label className="text-xs text-slate-500">الأولوية</label><select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as TaskPriority })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none">{Object.entries(TASK_PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              </div>
              <div><label className="text-xs text-slate-500">تاريخ الاستحقاق</label><input type="datetime-local" value={form.due_at || ''} onChange={(e) => setForm({ ...form, due_at: e.target.value || null })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" /></div>
              <div><label className="text-xs text-slate-500">الوصف</label><textarea value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none resize-none" /></div>
              {err && <p className="text-xs text-rose-600">{err}</p>}
            </div>
            <div className="flex gap-2 mt-5"><button onClick={save} disabled={busy} className="flex-1 bg-cyan-600 text-white text-sm py-2.5 rounded-xl hover:bg-cyan-700 disabled:opacity-60">{busy ? 'جارٍ…' : 'حفظ'}</button><button onClick={() => setShow(false)} className="px-4 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">إلغاء</button></div>
          </div>
        </div>
      )}

      {callFor && <LogCallModal task={callFor} onClose={() => setCallFor(null)} onDone={() => { setCallFor(null); reload(); }} />}
    </div>
  );
}

function LogCallModal({ task, onClose, onDone }: { task: CrmTask; onClose: () => void; onDone: () => void }) {
  const [outcome, setOutcome] = useState<CallOutcome>('interested');
  const [duration, setDuration] = useState(15);
  const [summary, setSummary] = useState('');
  const [nextStep, setNextStep] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await crmTaskService.logCall({
        contactId: task.contact_id, accountId: task.account_id, dealId: task.deal_id,
        durationMin: duration, outcome, summary, nextStep: nextStep || null,
      });
      await crmTaskService.complete(task.id);
      onDone();
    } catch { /* noop */ } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1"><h3 className="font-black text-slate-800">تسجيل مكالمة</h3><button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button></div>
        <p className="text-xs text-slate-400 mb-4">{task.title}</p>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-slate-500">النتيجة</label><select value={outcome} onChange={(e) => setOutcome(e.target.value as CallOutcome)} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none">{Object.entries(CALL_OUTCOME_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
            <div><label className="text-xs text-slate-500">المدة (دقيقة)</label><input type="number" value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" /></div>
          </div>
          <div><label className="text-xs text-slate-500">الملخص</label><textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={2} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none resize-none" /></div>
          <div><label className="text-xs text-slate-500">الخطوة التالية (تُنشئ مهمة متابعة)</label><input value={nextStep} onChange={(e) => setNextStep(e.target.value)} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" /></div>
        </div>
        <div className="flex gap-2 mt-5"><button onClick={submit} disabled={busy} className="flex-1 bg-cyan-600 text-white text-sm py-2.5 rounded-xl hover:bg-cyan-700 disabled:opacity-60">{busy ? 'جارٍ…' : 'حفظ وإكمال'}</button><button onClick={onClose} className="px-4 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">إلغاء</button></div>
      </div>
    </div>
  );
}
