/**
 * SequencesPage — سلاسل المتابعة: قائمة + تهيئة القياسية + استعراض الخطوات + الالتحاقات.
 */
import { useState } from 'react';
import { Workflow, Sparkles, ChevronDown, ChevronUp, Clock } from 'lucide-react';
import {
  crmSequenceService,
  type CrmSequence, type CrmSequenceStep, type CrmSequenceEnrollment,
  SEQUENCE_TYPE_LABEL, SEQUENCE_ACTION_LABEL,
} from '../../../services/sdk';
import { useSequences, useAsync } from './useActivities';

function SequenceRow({ seq }: { seq: CrmSequence }) {
  const [open, setOpen] = useState(false);
  const steps = useAsync<CrmSequenceStep[]>(() => (open ? crmSequenceService.listSteps(seq.id) : Promise.resolve([])), [], [open]);
  const enrolls = useAsync<CrmSequenceEnrollment[]>(() => (open ? crmSequenceService.listEnrollments(seq.id) : Promise.resolve([])), [], [open]);
  const active = enrolls.data.filter((e) => e.status === 'active').length;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between p-4 text-right hover:bg-slate-50/60">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-50 text-cyan-600 flex items-center justify-center"><Workflow size={18} /></div>
          <div>
            <p className="font-bold text-slate-800 text-sm">{seq.name}</p>
            <p className="text-xs text-slate-400">{SEQUENCE_TYPE_LABEL[seq.sequence_type]}{seq.description ? ` · ${seq.description}` : ''}</p>
          </div>
        </div>
        {open ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
      </button>
      {open && (
        <div className="border-t border-slate-100 p-4 space-y-4">
          <div>
            <p className="text-xs font-bold text-slate-500 mb-2">الخطوات ({steps.data.length})</p>
            {steps.loading ? <p className="text-slate-400 text-xs">جارٍ…</p>
              : <div className="relative pr-4 border-r-2 border-slate-100 space-y-3">
                {steps.data.map((s) => (
                  <div key={s.id} className="relative">
                    <span className="absolute -right-[22px] top-1 w-3 h-3 rounded-full bg-cyan-500 ring-4 ring-cyan-50" />
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] bg-slate-100 text-slate-500 border border-slate-200 px-2 py-0.5 rounded-full flex items-center gap-1"><Clock size={9} /> يوم +{s.delay_days}</span>
                      <span className="text-[10px] bg-cyan-50 text-cyan-600 border border-cyan-200 px-2 py-0.5 rounded-full">{SEQUENCE_ACTION_LABEL[s.action_type]}</span>
                      <span className="text-sm text-slate-700">{s.title}</span>
                    </div>
                  </div>
                ))}
              </div>}
          </div>
          <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 text-xs text-slate-500">
            الالتحاقات: <b className="text-slate-700">{enrolls.data.length}</b> · نشطة الآن: <b className="text-cyan-600">{active}</b>
            <span className="block mt-1 text-slate-400">تُطلَق السلسلة من سجل الصفقة أو جهة الاتصال بالتحاقها؛ كل خطوة تُنشئ مهمة تلقائياً في وقتها.</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SequencesPage() {
  const { data: sequences, loading, reload } = useSequences();
  const [seeding, setSeeding] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const seed = async () => {
    setSeeding(true); setMsg(null);
    try { const n = await crmSequenceService.seedDefault(); setMsg(n > 0 ? `تمت إضافة ${n} سلسلة قياسية ✓` : 'السلاسل القياسية موجودة مسبقاً'); reload(); }
    catch (e) { setMsg(e instanceof Error ? e.message : 'تعذّر'); } finally { setSeeding(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-slate-500">سلاسل نقاط تواصل مبرمجة تضمن عدم نسيان أي متابعة — تُنشأ المهام تلقائياً وفق جدول محدد.</p>
        <button onClick={seed} disabled={seeding} className="flex items-center gap-1.5 bg-cyan-600 text-white text-sm px-4 py-2 rounded-xl hover:bg-cyan-700 disabled:opacity-60"><Sparkles size={16} /> {seeding ? 'جارٍ…' : 'تهيئة السلاسل القياسية'}</button>
      </div>
      {msg && <div className="rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-600 px-4 py-2.5">{msg}</div>}

      {loading ? <p className="text-slate-400 text-sm text-center py-10">جارٍ التحميل…</p>
        : sequences.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center"><Workflow size={32} className="mx-auto text-slate-300" /><p className="text-slate-500 mt-3 font-semibold">لا سلاسل بعد</p><p className="text-slate-400 text-sm mt-1">ابدأ بتهيئة السلاسل القياسية (Post-Demo + Cold Outreach).</p></div>
          : <div className="space-y-3">{sequences.map((s) => <SequenceRow key={s.id} seq={s} />)}</div>}
    </div>
  );
}
