import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, CheckCircle2, Loader2, RefreshCw, ShieldCheck, X } from 'lucide-react';
import {
  accountingPeriodService,
  financePeriodCloseService,
  fiscalYearService,
  legalEntityService,
  type AccountingPeriodRecord,
  type FinanceCloseChecklistBoardRecord,
  type FinanceGrcDashboardRecord,
  type FinancePeriodCloseReadinessRecord,
  type FiscalYearRecord,
  type LegalEntityRecord,
} from '../../../services/sdk/FinanceFoundationService';
import { getErrorMessage } from '../../../services/errors';
import { useUIStore } from '../../../core/stores';
import { FinanceUnitNav } from './shared/FinanceUnitNav';

type ReasonAction =
  | { type: 'soft_close' | 'final_close' | 'reopen'; period: AccountingPeriodRecord }
  | { type: 'complete_task' | 'waive_task'; task: FinanceCloseChecklistBoardRecord };

export default function AccountingPeriodsPage() {
  const { addToast } = useUIStore();
  const [entities, setEntities] = useState<LegalEntityRecord[]>([]);
  const [entityId, setEntityId] = useState('');
  const [years, setYears] = useState<FiscalYearRecord[]>([]);
  const [yearId, setYearId] = useState('');
  const [periods, setPeriods] = useState<AccountingPeriodRecord[]>([]);
  const [readiness, setReadiness] = useState<FinancePeriodCloseReadinessRecord[]>([]);
  const [checklist, setChecklist] = useState<FinanceCloseChecklistBoardRecord[]>([]);
  const [grc, setGrc] = useState<FinanceGrcDashboardRecord | null>(null);
  const [selectedPeriodId, setSelectedPeriodId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reasonAction, setReasonAction] = useState<ReasonAction | null>(null);
  const [reason, setReason] = useState('');
  const [evidenceRef, setEvidenceRef] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await legalEntityService.findActive(); setEntities(rows);
      const entity = entityId || rows[0]?.id || ''; if (!entityId && entity) setEntityId(entity);
      const fiscal = entity ? await fiscalYearService.findForEntity(entity) : []; setYears(fiscal);
      const selectedYear = yearId || fiscal[0]?.id || ''; if (!yearId && selectedYear) setYearId(selectedYear);
      const [periodRows, readinessRows, grcRows] = await Promise.all([
        selectedYear ? accountingPeriodService.findForFiscalYear(selectedYear) : Promise.resolve([]),
        selectedYear ? financePeriodCloseService.findReadiness(selectedYear) : Promise.resolve([]),
        entity ? financePeriodCloseService.findGrcDashboard(entity) : Promise.resolve([]),
      ]);
      setPeriods(periodRows);
      setReadiness(readinessRows);
      setGrc(grcRows[0] || null);
      const selected = selectedPeriodId && periodRows.some(p => p.id === selectedPeriodId) ? selectedPeriodId : periodRows[0]?.id || '';
      setSelectedPeriodId(selected);
      if (selected) setChecklist(await financePeriodCloseService.findChecklist(selected)); else setChecklist([]);
    } catch (error) { addToast(`تعذر تحميل الفترات: ${getErrorMessage(error)}`, 'error'); } finally { setLoading(false); }
  }, [addToast, entityId, yearId, selectedPeriodId]);

  useEffect(() => { void load(); }, [load]);

  const selectedPeriod = useMemo(() => periods.find(p => p.id === selectedPeriodId) || null, [periods, selectedPeriodId]);
  const readinessByPeriod = useMemo(() => new Map(readiness.map(row => [row.accounting_period_id, row])), [readiness]);

  const selectPeriod = async (periodId: string) => {
    setSelectedPeriodId(periodId);
    try { setChecklist(await financePeriodCloseService.findChecklist(periodId)); }
    catch (error) { addToast(`تعذر تحميل Checklist: ${getErrorMessage(error)}`, 'error'); }
  };

  const generateChecklist = async () => {
    if (!selectedPeriodId) return;
    setSaving(true);
    try { await financePeriodCloseService.generateChecklist(selectedPeriodId); addToast('تم توليد Checklist الإغلاق', 'success'); await load(); }
    catch (error) { addToast(`تعذر توليد Checklist: ${getErrorMessage(error)}`, 'error'); }
    finally { setSaving(false); }
  };

  const executeReasonAction = async () => {
    if (!reasonAction) return;
    if (reasonAction.type !== 'complete_task' && !reason.trim()) return addToast('السبب مطلوب للتدقيق المالي', 'error');
    setSaving(true);
    try {
      if (reasonAction.type === 'soft_close') await financePeriodCloseService.closePeriod(reasonAction.period.id, 'soft_closed', reason.trim());
      if (reasonAction.type === 'final_close') await financePeriodCloseService.closePeriod(reasonAction.period.id, 'closed', reason.trim());
      if (reasonAction.type === 'reopen') await financePeriodCloseService.reopenPeriod(reasonAction.period.id, reason.trim());
      if (reasonAction.type === 'complete_task') await financePeriodCloseService.completeTask(reasonAction.task.id, evidenceRef.trim() || undefined, reason.trim() || undefined);
      if (reasonAction.type === 'waive_task') await financePeriodCloseService.waiveTask(reasonAction.task.id, reason.trim());
      addToast('تم تنفيذ العملية وتسجيلها في التدقيق', 'success');
      setReasonAction(null); setReason(''); setEvidenceRef('');
      await load();
    } catch (error) { addToast(`تعذر تنفيذ العملية: ${getErrorMessage(error)}`, 'error'); }
    finally { setSaving(false); }
  };

  return <div className="space-y-5 max-w-[1700px] mx-auto" dir="rtl">
    <FinanceUnitNav unit="close" />
    <div className="flex justify-between flex-wrap gap-3"><div><p className="text-sm font-bold text-rose-700">Finance Unit 03 · Period Close & Audit/GRC</p><h1 className="text-3xl font-black">الفترات المحاسبية والإغلاق</h1><p className="text-slate-500 mt-2">Readiness وChecklist وإقفال نهائي محكوم بسبب وتدقيق.</p></div><button onClick={() => void load()} className="border rounded-xl px-4 py-2.5 font-bold bg-white"><RefreshCw size={15} className="inline ml-1" />تحديث</button></div>

    <section className="grid md:grid-cols-3 xl:grid-cols-6 gap-3">
      <Metric title="مفتوحة" value={grc?.open_periods || 0} />
      <Metric title="إقفال مرن" value={grc?.soft_closed_periods || 0} />
      <Metric title="مغلقة" value={grc?.closed_periods || 0} />
      <Metric title="جاهزة للإغلاق" value={grc?.periods_ready_for_close || 0} />
      <Metric title="مهام مطلوبة مفتوحة" value={grc?.open_required_close_tasks || 0} />
      <Metric title="Audit 7 أيام" value={grc?.audit_events_last_7_days || 0} />
    </section>

    <div className="grid md:grid-cols-2 gap-3"><select value={entityId} onChange={e => { setEntityId(e.target.value); setYearId(''); setSelectedPeriodId(''); }} className="border rounded-xl p-3 bg-white font-bold"><option value="">اختر كياناً</option>{entities.map(e => <option key={e.id} value={e.id}>{e.code} — {e.name_ar}</option>)}</select><select value={yearId} onChange={e => { setYearId(e.target.value); setSelectedPeriodId(''); }} className="border rounded-xl p-3 bg-white font-bold"><option value="">اختر سنة مالية</option>{years.map(y => <option key={y.id} value={y.id}>{y.name} ({y.start_date})</option>)}</select></div>

    {loading ? <div className="py-24 text-center"><Loader2 className="animate-spin mx-auto mb-3" />جارٍ تحميل الفترات…</div> : <section className="grid xl:grid-cols-[1fr_430px] gap-4 items-start">
      <div className="bg-white border rounded-2xl overflow-x-auto shadow-sm"><table className="w-full text-sm"><thead className="bg-slate-50"><tr><th className="p-4 text-right">الفترة</th><th className="p-4 text-right">التاريخ</th><th className="p-4 text-right">الحالة</th><th className="p-4 text-right">Readiness</th><th className="p-4">إجراء</th></tr></thead><tbody className="divide-y">{periods.map(p => { const r = readinessByPeriod.get(p.id); return <tr key={p.id} className={selectedPeriodId === p.id ? 'bg-rose-50/40' : ''}><td className="p-4"><button onClick={() => void selectPeriod(p.id)} className="font-bold text-rose-700">{p.name}</button></td><td className="p-4">{p.start_date} — {p.end_date}</td><td className="p-4"><Status status={p.status} /></td><td className="p-4"><div className="text-xs space-y-1"><p>قيود مفتوحة: {Number(r?.open_journal_entries || 0)}</p><p>مهام مطلوبة: {Number(r?.required_open_tasks || 0)}</p><p className={r?.ready_for_final_close ? 'text-emerald-700 font-bold' : 'text-amber-700 font-bold'}>{r?.ready_for_final_close ? 'جاهزة للإغلاق النهائي' : 'غير جاهزة/تحتاج Checklist'}</p></div></td><td className="p-4"><div className="flex gap-2 justify-center flex-wrap">{p.status === 'open' && <><button onClick={() => { setReasonAction({ type: 'soft_close', period: p }); setReason(''); }} className="text-amber-700 font-bold">إقفال مرن</button><button onClick={() => { setReasonAction({ type: 'final_close', period: p }); setReason(''); }} className="text-rose-700 font-bold">إقفال نهائي</button></>}{p.status === 'soft_closed' && <><button onClick={() => { setReasonAction({ type: 'reopen', period: p }); setReason(''); }} className="text-emerald-700 font-bold">فتح</button><button onClick={() => { setReasonAction({ type: 'final_close', period: p }); setReason(''); }} className="text-rose-700 font-bold">إقفال نهائي</button></>}{p.status === 'closed' && <button onClick={() => { setReasonAction({ type: 'reopen', period: p }); setReason(''); }} className="text-blue-700 font-bold">إعادة فتح</button>}</div></td></tr>; })}{!periods.length && <tr><td colSpan={5} className="p-16 text-center text-slate-500"><CalendarClock className="mx-auto mb-3 text-slate-300" />لا توجد فترات لهذا الاختيار.</td></tr>}</tbody></table></div>

      <aside className="bg-white border rounded-2xl p-5 shadow-sm sticky top-4"><div className="flex items-center justify-between gap-2"><div><h2 className="font-black text-slate-900">Checklist الإغلاق</h2><p className="text-xs text-slate-400 mt-1">{selectedPeriod?.name || 'اختر فترة'}</p></div><button disabled={!selectedPeriodId || saving} onClick={() => void generateChecklist()} className="text-xs bg-rose-600 text-white rounded-xl px-3 py-2 font-bold disabled:opacity-50">توليد</button></div><div className="mt-4 space-y-2">{checklist.map(task => <div key={task.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm"><div className="flex justify-between gap-2"><strong>{task.title_ar}</strong><TaskStatus status={task.status} /></div><p className="text-xs text-slate-400 mt-1">{task.task_code} · {task.severity}</p>{task.waiver_reason && <p className="text-xs text-amber-700 mt-2">تجاوز: {task.waiver_reason}</p>}<div className="flex gap-2 mt-3">{task.status === 'open' && <><button onClick={() => { setReasonAction({ type: 'complete_task', task }); setReason(''); setEvidenceRef(''); }} className="text-emerald-700 font-bold text-xs"><CheckCircle2 size={13} className="inline ml-1" />إكمال</button><button onClick={() => { setReasonAction({ type: 'waive_task', task }); setReason(''); }} className="text-amber-700 font-bold text-xs"><ShieldCheck size={13} className="inline ml-1" />تجاوز</button></>}</div></div>)}{!checklist.length && <div className="text-center py-12 text-slate-500 border border-dashed rounded-xl">لا توجد Checklist. اضغط توليد.</div>}</div></aside>
    </section>}

    {reasonAction && <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4" onClick={() => !saving && setReasonAction(null)}><div onClick={event => event.stopPropagation()} className="w-full max-w-lg bg-white rounded-2xl shadow-2xl p-6 space-y-4"><div className="flex items-center justify-between"><div><h2 className="font-black text-xl">{actionLabel(reasonAction)}</h2><p className="text-sm text-slate-500 mt-1">كل عملية إغلاق/تجاوز تسجل في التدقيق المالي.</p></div><button onClick={() => setReasonAction(null)}><X /></button></div>{reasonAction.type === 'complete_task' && <input value={evidenceRef} onChange={e => setEvidenceRef(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" placeholder="رابط/مرجع الدليل اختياري" />}<textarea value={reason} onChange={e => setReason(e.target.value)} className="w-full min-h-28 rounded-xl border border-slate-200 px-3 py-2.5 text-sm" placeholder={reasonAction.type === 'complete_task' ? 'ملاحظات الإكمال اختيارية…' : 'اكتب السبب الإلزامي…'} /><button disabled={saving || (reasonAction.type !== 'complete_task' && !reason.trim())} onClick={() => void executeReasonAction()} className="w-full bg-rose-600 text-white rounded-xl py-3 font-bold disabled:opacity-50">تنفيذ</button></div></div>}
  </div>;
}

function Metric({ title, value }: { title: string; value: ReactNode }) { return <div className="bg-white border rounded-2xl p-4 shadow-sm"><p className="text-2xl font-black text-slate-900">{value}</p><h3 className="font-bold text-slate-500 text-sm mt-2">{title}</h3></div>; }
function Status({ status }: { status: string }) { const cls = status === 'open' ? 'bg-emerald-50 text-emerald-700' : status === 'closed' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'; return <span className={`rounded-full px-2 py-1 text-xs font-bold ${cls}`}>{status}</span>; }
function TaskStatus({ status }: { status: string }) { const cls = status === 'completed' ? 'bg-emerald-50 text-emerald-700' : status === 'waived' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'; return <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${cls}`}>{status}</span>; }
function actionLabel(action: ReasonAction) { if (action.type === 'soft_close') return 'إقفال مرن'; if (action.type === 'final_close') return 'إقفال نهائي'; if (action.type === 'reopen') return 'إعادة فتح الفترة'; if (action.type === 'complete_task') return 'إكمال مهمة إغلاق'; return 'تجاوز مهمة إغلاق'; }
