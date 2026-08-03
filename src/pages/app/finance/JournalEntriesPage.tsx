import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, FilePlus2, GitPullRequestArrow, Loader2, Plus, RefreshCw, RotateCcw, Send, ShieldCheck, Trash2, X } from 'lucide-react';
import {
  generalLedgerService,
  type JournalDraftLineInput,
  type JournalEntryBoardRecord,
  type JournalEntryLineBoardRecord,
  type JournalLifecycleDashboardRecord,
} from '../../../services/sdk/GeneralLedgerService';
import { chartOfAccountService, type FinancePostingAccountLookupRecord } from '../../../services/sdk/ChartOfAccountService';
import {
  accountingPeriodService,
  currencyService,
  financeCostCenterService,
  financeProjectService,
  fiscalYearService,
  legalEntityService,
  type AccountingPeriodRecord,
  type CostCenterRecord,
  type CurrencyRecord,
  type FinanceProjectRecord,
  type LegalEntityRecord,
} from '../../../services/sdk/FinanceFoundationService';
import { getErrorMessage } from '../../../services/errors';
import { useUIStore } from '../../../core/stores';
import { FinanceUnitNav } from './shared/FinanceUnitNav';

type DraftLine = JournalDraftLineInput & { key: string };
type ReasonAction = { type: 'submit' | 'approve' | 'post' | 'void' | 'reverse'; entry: JournalEntryBoardRecord };

const emptyLine = (): DraftLine => ({ key: crypto.randomUUID(), account_id: '', debit_amount: 0, credit_amount: 0, description: '', cost_center_id: '', project_id: '' });

export default function JournalEntriesPage() {
  const { addToast } = useUIStore();
  const [entities, setEntities] = useState<LegalEntityRecord[]>([]);
  const [entityId, setEntityId] = useState('');
  const [periods, setPeriods] = useState<AccountingPeriodRecord[]>([]);
  const [accounts, setAccounts] = useState<FinancePostingAccountLookupRecord[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenterRecord[]>([]);
  const [projects, setProjects] = useState<FinanceProjectRecord[]>([]);
  const [currencies, setCurrencies] = useState<CurrencyRecord[]>([]);
  const [entries, setEntries] = useState<JournalEntryBoardRecord[]>([]);
  const [entryLines, setEntryLines] = useState<JournalEntryLineBoardRecord[]>([]);
  const [dashboard, setDashboard] = useState<JournalLifecycleDashboardRecord | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState('');
  const [loading, setLoading] = useState(true);
  const [linesLoading, setLinesLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showDraft, setShowDraft] = useState(false);
  const [reasonAction, setReasonAction] = useState<ReasonAction | null>(null);
  const [reason, setReason] = useState('');
  const [header, setHeader] = useState({ accounting_period_id: '', entry_date: new Date().toISOString().slice(0, 10), description: '', reference: '', transaction_currency_code: 'IQD', exchange_rate: 1 });
  const [lines, setLines] = useState<DraftLine[]>([emptyLine(), emptyLine()]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [entityRows, currencyRows] = await Promise.all([legalEntityService.findActive(), currencyService.findActive()]);
      setEntities(entityRows);
      setCurrencies(currencyRows);
      const activeEntity = entityId || entityRows[0]?.id || '';
      if (!entityId && activeEntity) setEntityId(activeEntity);
      if (!activeEntity) {
        setEntries([]); setAccounts([]); setPeriods([]); setCostCenters([]); setProjects([]); setDashboard(null); setSelectedEntryId(''); return;
      }

      const years = await fiscalYearService.findForEntity(activeEntity);
      const periodGroups = await Promise.all(years.map(year => accountingPeriodService.findForFiscalYear(year.id)));
      const loadedPeriods = periodGroups.flat().filter(period => period.status === 'open');
      const [accountRows, entryRows, dashboardRows, costCenterRows, projectRows] = await Promise.all([
        chartOfAccountService.findPostingLookup(activeEntity),
        generalLedgerService.findBoard(activeEntity),
        generalLedgerService.findLifecycleDashboard(activeEntity),
        financeCostCenterService.findAll({ filters: { legal_entity_id: activeEntity, is_active: true }, orderBy: 'code' }),
        financeProjectService.findAll({ filters: { legal_entity_id: activeEntity, status: 'active' }, orderBy: 'code' }),
      ]);
      setPeriods(loadedPeriods);
      setAccounts(accountRows);
      setEntries(entryRows);
      setDashboard(dashboardRows[0] || null);
      setCostCenters(costCenterRows);
      setProjects(projectRows);
      setSelectedEntryId(current => current && entryRows.some(row => row.id === current) ? current : entryRows[0]?.id || '');
      const entity = entityRows.find(row => row.id === activeEntity);
      setHeader(current => ({
        ...current,
        accounting_period_id: current.accounting_period_id || loadedPeriods[0]?.id || '',
        transaction_currency_code: entity?.base_currency_code || current.transaction_currency_code || 'IQD',
      }));
    } catch (error) {
      addToast(`تعذر تحميل القيود: ${getErrorMessage(error)}`, 'error');
    } finally { setLoading(false); }
  }, [addToast, entityId]);

  useEffect(() => { void load(); }, [load]);

  const loadLines = useCallback(async (entryId: string) => {
    if (!entryId) { setEntryLines([]); return; }
    setLinesLoading(true);
    try { setEntryLines(await generalLedgerService.findLines(entryId)); }
    catch (error) { addToast(`تعذر تحميل سطور القيد: ${getErrorMessage(error)}`, 'error'); }
    finally { setLinesLoading(false); }
  }, [addToast]);

  useEffect(() => { void loadLines(selectedEntryId); }, [loadLines, selectedEntryId]);

  const totals = useMemo(() => lines.reduce((result, line) => ({ debit: result.debit + Number(line.debit_amount || 0), credit: result.credit + Number(line.credit_amount || 0) }), { debit: 0, credit: 0 }), [lines]);
  const balanced = totals.debit > 0 && totals.debit === totals.credit && lines.length >= 2 && lines.every(line => line.account_id && ((Number(line.debit_amount) > 0) !== (Number(line.credit_amount) > 0)) && dimensionsSatisfied(line));
  const selectedEntry = useMemo(() => entries.find(entry => entry.id === selectedEntryId) || null, [entries, selectedEntryId]);

  function dimensionsSatisfied(line: DraftLine) {
    const account = accounts.find(item => item.id === line.account_id);
    if (!account) return false;
    if (account.require_cost_center && !line.cost_center_id) return false;
    if (account.require_project && !line.project_id) return false;
    return true;
  }

  const updateLine = (key: string, field: keyof DraftLine, value: string | number) => setLines(current => current.map(line => {
    if (line.key !== key) return line;
    const next = { ...line, [field]: value };
    if (field === 'debit_amount' && Number(value) > 0) next.credit_amount = 0;
    if (field === 'credit_amount' && Number(value) > 0) next.debit_amount = 0;
    return next;
  }));

  const saveDraft = async (event: FormEvent) => {
    event.preventDefault();
    if (!entityId || !header.accounting_period_id || !header.description.trim()) return addToast('أكمل الكيان والفترة ووصف القيد', 'error');
    if (!balanced) return addToast('القيد غير مكتمل: تحقق من التوازن والحسابات والأبعاد المطلوبة', 'error');
    setSaving(true);
    try {
      const draft = await generalLedgerService.createDraft({
        legal_entity_id: entityId,
        accounting_period_id: header.accounting_period_id,
        entry_date: header.entry_date,
        description: header.description.trim(),
        reference: header.reference.trim(),
        transaction_currency_code: header.transaction_currency_code,
        exchange_rate: Number(header.exchange_rate),
        idempotency_key: crypto.randomUUID(),
        lines: lines.map(({ key: _key, cost_center_id, project_id, ...line }) => ({
          ...line,
          cost_center_id: cost_center_id || undefined,
          project_id: project_id || undefined,
        })),
      });
      addToast('تم حفظ القيد كمسودة', 'success');
      setShowDraft(false);
      setSelectedEntryId(draft.id);
      setHeader({ accounting_period_id: periods[0]?.id || '', entry_date: new Date().toISOString().slice(0, 10), description: '', reference: '', transaction_currency_code: currencies.find(currency => currency.code === 'IQD')?.code || 'IQD', exchange_rate: 1 });
      setLines([emptyLine(), emptyLine()]);
      await load();
    } catch (error) { addToast(`تعذر حفظ المسودة: ${getErrorMessage(error)}`, 'error'); }
    finally { setSaving(false); }
  };

  const executeReasonAction = async () => {
    if (!reasonAction || !reason.trim()) return addToast('سبب العملية مطلوب للتدقيق المالي', 'error');
    setSaving(true);
    try {
      if (reasonAction.type === 'submit') await generalLedgerService.submitEntry(reasonAction.entry.id, reason.trim());
      if (reasonAction.type === 'approve') await generalLedgerService.approveEntry(reasonAction.entry.id, reason.trim());
      if (reasonAction.type === 'post') await generalLedgerService.postJournalEntry(reasonAction.entry.id, reason.trim());
      if (reasonAction.type === 'void') await generalLedgerService.voidEntry(reasonAction.entry.id, reason.trim());
      if (reasonAction.type === 'reverse') {
        const period = periods.find(item => item.status === 'open');
        if (!period) throw new Error('لا توجد فترة محاسبية مفتوحة لإنشاء قيد العكس');
        await generalLedgerService.reverseEntry({ entryId: reasonAction.entry.id, accountingPeriodId: period.id, reversalDate: new Date().toISOString().slice(0, 10), reason: reason.trim(), idempotencyKey: crypto.randomUUID() });
      }
      addToast('تم تنفيذ العملية وتسجيلها في التدقيق المالي', 'success');
      setReasonAction(null); setReason('');
      await load();
    } catch (error) { addToast(`تعذر تنفيذ العملية: ${getErrorMessage(error)}`, 'error'); }
    finally { setSaving(false); }
  };

  return <div className="space-y-5 max-w-[1700px] mx-auto" dir="rtl">
    <FinanceUnitNav unit="gl" />
    <section className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4"><div><p className="text-sm font-bold text-blue-700">Finance Unit 02 · General Ledger</p><h1 className="text-3xl font-black text-slate-900 mt-1">قيود اليومية ودورة حياتها</h1><p className="text-slate-500 mt-2">مسودة، إرسال، اعتماد، ترحيل، إلغاء أو عكس بقواعد خادمية وأسباب تدقيق إلزامية.</p></div><div className="flex gap-2"><button onClick={() => void load()} className="px-4 py-2.5 border rounded-xl font-bold text-sm bg-white"><RefreshCw size={16} className="inline ml-1" />تحديث</button><button disabled={!entityId || !periods.length || !accounts.length} onClick={() => setShowDraft(true)} className="px-4 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm disabled:opacity-50"><Plus size={16} className="inline ml-1" />قيد جديد</button></div></section>

    <section className="grid md:grid-cols-3 xl:grid-cols-6 gap-3">
      <Metric title="مسودات" value={dashboard?.draft_entries || 0} />
      <Metric title="مرسلة" value={dashboard?.submitted_entries || 0} />
      <Metric title="معتمدة" value={dashboard?.approved_entries || 0} />
      <Metric title="مرحلة" value={dashboard?.posted_entries || 0} />
      <Metric title="معكوسة" value={dashboard?.reversed_entries || 0} />
      <Metric title="ملغاة" value={dashboard?.voided_entries || 0} />
    </section>

    <select value={entityId} onChange={event => { setEntityId(event.target.value); setSelectedEntryId(''); }} className="w-full md:w-96 bg-white border rounded-xl px-4 py-3 font-bold"><option value="">اختر كياناً قانونياً</option>{entities.map(entity => <option value={entity.id} key={entity.id}>{entity.code} — {entity.name_ar}</option>)}</select>

    <section className="grid xl:grid-cols-[1fr_420px] gap-4 items-start">
      <div className="bg-white rounded-2xl border overflow-hidden shadow-sm">
        {loading ? <div className="py-24 text-center"><Loader2 className="animate-spin mx-auto mb-3" />جارٍ التحميل…</div> : !entityId ? <Empty text="اختر كياناً قانونياً." /> : !periods.length ? <Empty text="لا توجد فترة محاسبية مفتوحة لهذا الكيان. أنشئ سنة وفترات محاسبية أولاً." /> : entries.length === 0 ? <Empty text="لا توجد قيود بعد." /> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50"><tr><th className="p-4 text-right">الرقم</th><th className="p-4 text-right">التاريخ</th><th className="p-4 text-right">الوصف</th><th className="p-4 text-right">مدين</th><th className="p-4 text-right">دائن</th><th className="p-4 text-right">الحالة</th><th className="p-4 text-right">السطور</th><th className="p-4" /></tr></thead><tbody className="divide-y">{entries.map(entry => <tr key={entry.id} className={selectedEntryId === entry.id ? 'bg-blue-50/50' : ''}><td className="p-4"><button onClick={() => setSelectedEntryId(entry.id)} className="font-mono font-bold text-blue-700">{entry.entry_number}</button></td><td className="p-4">{entry.entry_date}</td><td className="p-4 max-w-sm truncate">{entry.description}</td><td className="p-4">{Number(entry.total_debit).toLocaleString()}</td><td className="p-4">{Number(entry.total_credit).toLocaleString()}</td><td className="p-4"><Status status={entry.status} /></td><td className="p-4">{Number(entry.line_count || 0)}</td><td className="p-4"><Actions entry={entry} onAction={(type) => { setReasonAction({ type, entry }); setReason(''); }} /></td></tr>)}</tbody></table></div>}
      </div>

      <aside className="bg-white border rounded-2xl p-5 shadow-sm sticky top-4">
        <h2 className="font-black text-slate-900">سطور القيد</h2>
        {!selectedEntry ? <p className="text-sm text-slate-500 mt-4">اختر قيداً لعرض تفاصيل السطور.</p> : <div className="mt-4 space-y-4"><div><p className="font-mono font-black text-blue-700">{selectedEntry.entry_number}</p><p className="text-sm text-slate-500 mt-1">{selectedEntry.period_name || '—'} · {selectedEntry.transaction_currency_code}</p></div>{linesLoading ? <Loader2 className="animate-spin" /> : <div className="space-y-2">{entryLines.map(line => <div key={line.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm"><div className="flex justify-between gap-2"><strong className="font-mono text-blue-700">{line.account_code}</strong><span>{Number(line.debit_amount) > 0 ? `مدين ${Number(line.debit_amount).toLocaleString()}` : `دائن ${Number(line.credit_amount).toLocaleString()}`}</span></div><p className="font-bold text-slate-700 mt-1">{line.account_name}</p><p className="text-xs text-slate-500 mt-1">{line.description || '—'}</p><p className="text-[11px] text-slate-400 mt-2">{line.cost_center_code ? `مركز: ${line.cost_center_code}` : 'بدون مركز'} · {line.project_code ? `مشروع: ${line.project_code}` : 'بدون مشروع'}</p></div>)}{!entryLines.length && <p className="text-sm text-slate-500">لا توجد سطور.</p>}</div>}</div>}
      </aside>
    </section>

    {showDraft && <div className="fixed inset-0 z-50 bg-slate-950/60 p-4 overflow-y-auto" onClick={() => !saving && setShowDraft(false)}><form onSubmit={saveDraft} onClick={event => event.stopPropagation()} className="max-w-6xl mx-auto my-6 bg-white rounded-2xl p-6 space-y-5"><div className="flex justify-between items-center gap-3 flex-wrap"><div><h2 className="font-black text-xl">مسودة قيد جديد</h2><p className="text-sm text-slate-500">الحسابات من Lookup حسابات الترحيل فقط، والأبعاد تُتحقق خادمياً عند الحفظ والترحيل.</p></div><button type="button" onClick={() => setShowDraft(false)}><X /></button></div><div className="grid md:grid-cols-3 gap-3"><Input label="التاريخ"><input type="date" value={header.entry_date} onChange={event => setHeader(current => ({ ...current, entry_date: event.target.value }))} /></Input><Input label="الفترة"><select value={header.accounting_period_id} onChange={event => setHeader(current => ({ ...current, accounting_period_id: event.target.value }))}>{periods.map(period => <option value={period.id} key={period.id}>{period.name} ({period.start_date} — {period.end_date})</option>)}</select></Input><Input label="العملة"><select value={header.transaction_currency_code} onChange={event => setHeader(current => ({ ...current, transaction_currency_code: event.target.value }))}>{currencies.map(currency => <option key={currency.code} value={currency.code}>{currency.code}</option>)}</select></Input><Input label="الوصف"><input required value={header.description} onChange={event => setHeader(current => ({ ...current, description: event.target.value }))} /></Input><Input label="المرجع"><input value={header.reference} onChange={event => setHeader(current => ({ ...current, reference: event.target.value }))} /></Input><Input label="سعر الصرف"><input type="number" min="0.0000001" step="any" value={header.exchange_rate} onChange={event => setHeader(current => ({ ...current, exchange_rate: Number(event.target.value) }))} /></Input></div><div className="border rounded-xl overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50"><tr><th className="p-3 text-right">الحساب</th><th className="p-3 text-right">وصف</th><th className="p-3 text-right">مركز تكلفة</th><th className="p-3 text-right">مشروع</th><th className="p-3 text-right">مدين</th><th className="p-3 text-right">دائن</th><th /></tr></thead><tbody>{lines.map(line => { const account = accounts.find(item => item.id === line.account_id); return <tr key={line.key} className="border-t"><td className="p-2 min-w-72"><select value={line.account_id} onChange={event => updateLine(line.key, 'account_id', event.target.value)} className="w-full border rounded-lg p-2"><option value="">اختر حساباً</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.code} — {account.display_name}</option>)}</select>{account && <p className="text-[11px] text-slate-400 mt-1">{account.require_cost_center ? 'مركز تكلفة مطلوب' : 'مركز اختياري'} · {account.require_project ? 'مشروع مطلوب' : 'مشروع اختياري'}</p>}</td><td className="p-2"><input value={line.description || ''} onChange={event => updateLine(line.key, 'description', event.target.value)} className="w-full border rounded-lg p-2" /></td><td className="p-2"><select value={line.cost_center_id || ''} onChange={event => updateLine(line.key, 'cost_center_id', event.target.value)} className="w-44 border rounded-lg p-2"><option value="">اختياري</option>{costCenters.map(cc => <option key={cc.id} value={cc.id}>{cc.code} — {cc.name_ar}</option>)}</select></td><td className="p-2"><select value={line.project_id || ''} onChange={event => updateLine(line.key, 'project_id', event.target.value)} className="w-44 border rounded-lg p-2"><option value="">اختياري</option>{projects.map(project => <option key={project.id} value={project.id}>{project.code} — {project.name_ar}</option>)}</select></td><td className="p-2"><input type="number" min="0" step="0.01" value={line.debit_amount || ''} onChange={event => updateLine(line.key, 'debit_amount', Number(event.target.value))} className="w-28 border rounded-lg p-2" /></td><td className="p-2"><input type="number" min="0" step="0.01" value={line.credit_amount || ''} onChange={event => updateLine(line.key, 'credit_amount', Number(event.target.value))} className="w-28 border rounded-lg p-2" /></td><td className="p-2">{lines.length > 2 && <button type="button" onClick={() => setLines(current => current.filter(item => item.key !== line.key))} className="text-rose-600"><Trash2 size={16} /></button>}</td></tr>; })}</tbody></table></div><button type="button" onClick={() => setLines(current => [...current, emptyLine()])} className="text-blue-700 font-bold text-sm"><Plus size={15} className="inline ml-1" />إضافة سطر</button><div className={`rounded-xl p-4 flex justify-between font-black ${balanced ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}><span>مدين: {totals.debit.toLocaleString()} | دائن: {totals.credit.toLocaleString()}</span><span>{balanced ? <><CheckCircle2 size={16} className="inline ml-1" />متوازن ومكتمل الأبعاد</> : 'غير مكتمل'}</span></div><div className="flex gap-3"><button type="button" onClick={() => setShowDraft(false)} className="flex-1 border rounded-xl py-3 font-bold">إلغاء</button><button disabled={!balanced || saving} className="flex-1 bg-blue-600 text-white rounded-xl py-3 font-bold disabled:opacity-50">{saving ? 'جارٍ الحفظ…' : <><FilePlus2 size={16} className="inline ml-1" />حفظ كمسودة</>}</button></div></form></div>}

    {reasonAction && <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4" onClick={() => !saving && setReasonAction(null)}><div onClick={event => event.stopPropagation()} className="w-full max-w-lg bg-white rounded-2xl shadow-2xl p-6 space-y-4"><div className="flex items-center justify-between"><div><h2 className="font-black text-xl">{actionLabel(reasonAction.type)}</h2><p className="text-sm text-slate-500 mt-1">{reasonAction.entry.entry_number}</p></div><button onClick={() => setReasonAction(null)}><X /></button></div><div className="rounded-xl bg-amber-50 border border-amber-100 p-3 text-sm text-amber-900">كل انتقال حالة مالية يتطلب سبباً ويُسجل في التدقيق. لا يوجد حذف صلب للقيود.</div><textarea value={reason} onChange={event => setReason(event.target.value)} className="w-full min-h-28 rounded-xl border border-slate-200 px-3 py-2.5 text-sm" placeholder="اكتب السبب…" /><button disabled={saving || !reason.trim()} onClick={() => void executeReasonAction()} className="w-full bg-blue-600 text-white rounded-xl py-3 font-bold disabled:opacity-50">تنفيذ</button></div></div>}
  </div>;
}

function Actions({ entry, onAction }: { entry: JournalEntryBoardRecord; onAction: (type: ReasonAction['type']) => void }) {
  return <div className="flex items-center justify-center gap-2 flex-wrap">
    {entry.status === 'draft' && <button onClick={() => onAction('submit')} className="text-blue-700 font-bold text-xs"><Send size={14} className="inline ml-1" />إرسال</button>}
    {entry.status === 'submitted' && <button onClick={() => onAction('approve')} className="text-emerald-700 font-bold text-xs"><ShieldCheck size={14} className="inline ml-1" />اعتماد</button>}
    {entry.status === 'approved' && <button onClick={() => onAction('post')} className="text-emerald-800 font-bold text-xs"><GitPullRequestArrow size={14} className="inline ml-1" />ترحيل</button>}
    {['draft', 'submitted', 'approved'].includes(entry.status) && <button onClick={() => onAction('void')} className="text-rose-700 font-bold text-xs">إلغاء</button>}
    {entry.status === 'posted' && <button onClick={() => onAction('reverse')} className="text-rose-700 font-bold text-xs"><RotateCcw size={14} className="inline ml-1" />عكس</button>}
  </div>;
}
function Metric({ title, value }: { title: string; value: ReactNode }) { return <div className="bg-white border rounded-2xl p-4 shadow-sm"><p className="text-2xl font-black text-slate-900">{value}</p><h3 className="font-bold text-slate-500 text-sm mt-2">{title}</h3></div>; }
function Status({ status }: { status: string }) { const cls = status === 'posted' ? 'bg-emerald-50 text-emerald-700' : status === 'voided' || status === 'reversed' ? 'bg-rose-50 text-rose-700' : 'bg-blue-50 text-blue-700'; return <span className={`rounded-full px-2 py-1 text-xs font-bold ${cls}`}>{status}</span>; }
function Input({ label, children }: { label: string; children: ReactNode }) { return <label className="text-sm font-bold space-y-1 block"><span>{label}</span><div className="[&>input]:w-full [&>input]:border [&>input]:rounded-xl [&>input]:p-2.5 [&>select]:w-full [&>select]:border [&>select]:rounded-xl [&>select]:p-2.5">{children}</div></label>; }
function Empty({ text }: { text: string }) { return <div className="text-center py-20 text-slate-500">{text}</div>; }
function actionLabel(type: ReasonAction['type']) { return ({ submit: 'إرسال القيد', approve: 'اعتماد القيد', post: 'ترحيل القيد', void: 'إلغاء القيد', reverse: 'عكس القيد' })[type]; }
