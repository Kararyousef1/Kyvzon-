import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, FilePlus2, Loader2, Plus, RefreshCw, Send, Trash2 } from 'lucide-react';
import { generalLedgerService, type JournalDraftLineInput } from '../../../services/sdk/GeneralLedgerService';
import { chartOfAccountService } from '../../../services/sdk/ChartOfAccountService';
import { accountingPeriodService, currencyService, fiscalYearService, legalEntityService, type AccountingPeriodRecord, type CurrencyRecord, type LegalEntityRecord } from '../../../services/sdk/FinanceFoundationService';
import type { ChartOfAccountRecord, JournalEntryRecord } from '../../../shared/types/sdk';
import { getErrorMessage } from '../../../services/errors';
import { useUIStore } from '../../../core/stores';

type DraftLine = JournalDraftLineInput & { key: string };
const emptyLine = (): DraftLine => ({ key: crypto.randomUUID(), account_id: '', debit_amount: 0, credit_amount: 0, description: '' });

export default function JournalEntriesPage() {
  const { addToast } = useUIStore();
  const [entities, setEntities] = useState<LegalEntityRecord[]>([]);
  const [entityId, setEntityId] = useState('');
  const [periods, setPeriods] = useState<AccountingPeriodRecord[]>([]);
  const [accounts, setAccounts] = useState<ChartOfAccountRecord[]>([]);
  const [currencies, setCurrencies] = useState<CurrencyRecord[]>([]);
  const [entries, setEntries] = useState<JournalEntryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDraft, setShowDraft] = useState(false);
  const [header, setHeader] = useState({ accounting_period_id: '', entry_date: new Date().toISOString().slice(0, 10), description: '', reference: '', transaction_currency_code: 'IQD', exchange_rate: 1 });
  const [lines, setLines] = useState<DraftLine[]>([emptyLine(), emptyLine()]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const entityRows = await legalEntityService.findActive();
      setEntities(entityRows);
      const activeEntity = entityId || entityRows[0]?.id || '';
      if (!entityId && activeEntity) setEntityId(activeEntity);
      const currencyRows = await currencyService.findActive();
      setCurrencies(currencyRows);
      if (!activeEntity) { setEntries([]); setAccounts([]); setPeriods([]); return; }
      const years = await fiscalYearService.findForEntity(activeEntity);
      const periodGroups = await Promise.all(years.map(year => accountingPeriodService.findForFiscalYear(year.id)));
      const loadedPeriods = periodGroups.flat().filter(period => period.status === 'open');
      const [accountRows, entryRows] = await Promise.all([
        chartOfAccountService.findAll({ filters: { legal_entity_id: activeEntity, is_active: true }, orderBy: 'code' }),
        generalLedgerService.findAll({ filters: { legal_entity_id: activeEntity }, orderBy: 'entry_date', ascending: false }),
      ]);
      setPeriods(loadedPeriods);
      setAccounts(accountRows.filter(account => account.allow_posting));
      setEntries(entryRows);
      const entity = entityRows.find(row => row.id === activeEntity);
      setHeader(current => ({ ...current, accounting_period_id: current.accounting_period_id || loadedPeriods[0]?.id || '', transaction_currency_code: current.transaction_currency_code || entity?.base_currency_code || 'IQD' }));
    } catch (error) {
      addToast(`تعذر تحميل القيود: ${getErrorMessage(error)}`, 'error');
    } finally { setLoading(false); }
  }, [addToast, entityId]);

  useEffect(() => { void load(); }, [load]);

  const totals = useMemo(() => lines.reduce((result, line) => ({ debit: result.debit + Number(line.debit_amount || 0), credit: result.credit + Number(line.credit_amount || 0) }), { debit: 0, credit: 0 }), [lines]);
  const balanced = totals.debit > 0 && totals.debit === totals.credit && lines.length >= 2 && lines.every(line => line.account_id && ((line.debit_amount > 0) !== (line.credit_amount > 0)));

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
    if (!balanced) return addToast('يجب أن يكون القيد متوازناً وكل سطر مدين أو دائن فقط', 'error');
    setSaving(true);
    try {
      await generalLedgerService.createDraft({
        legal_entity_id: entityId,
        accounting_period_id: header.accounting_period_id,
        entry_date: header.entry_date,
        description: header.description.trim(),
        reference: header.reference.trim(),
        transaction_currency_code: header.transaction_currency_code,
        exchange_rate: Number(header.exchange_rate),
        idempotency_key: crypto.randomUUID(),
        lines: lines.map(({ key: _key, ...line }) => line),
      });
      addToast('تم حفظ القيد كمسودة', 'success');
      setShowDraft(false);
      setHeader({ accounting_period_id: periods[0]?.id || '', entry_date: new Date().toISOString().slice(0, 10), description: '', reference: '', transaction_currency_code: currencies.find(currency => currency.code === 'IQD')?.code || 'IQD', exchange_rate: 1 });
      setLines([emptyLine(), emptyLine()]);
      await load();
    } catch (error) { addToast(`تعذر حفظ المسودة: ${getErrorMessage(error)}`, 'error'); }
    finally { setSaving(false); }
  };

  const post = async (entry: JournalEntryRecord) => {
    if (!confirm(`ترحيل القيد ${entry.entry_number}؟ سيصبح غير قابل للتعديل.`)) return;
    try { await generalLedgerService.postJournalEntry(entry.id); addToast('تم ترحيل القيد وتسجيل التدقيق المالي', 'success'); await load(); }
    catch (error) { addToast(`تعذر ترحيل القيد: ${getErrorMessage(error)}`, 'error'); }
  };

  const reverse = async (entry: JournalEntryRecord) => {
    const period = periods.find(item => item.status === 'open');
    if (!period) return addToast('لا توجد فترة محاسبية مفتوحة لإنشاء قيد العكس', 'error');
    const reason = prompt(`سبب عكس القيد ${entry.entry_number}:`);
    if (!reason?.trim()) return;
    if (!confirm(`سيتم إنشاء وترحيل قيد عكسي للقيد ${entry.entry_number}. هل تريد المتابعة؟`)) return;
    try {
      await generalLedgerService.reverseEntry({ entryId: entry.id, accountingPeriodId: period.id, reversalDate: new Date().toISOString().slice(0, 10), reason: reason.trim(), idempotencyKey: crypto.randomUUID() });
      addToast('تم إنشاء وترحيل القيد العكسي وتسجيل العملية', 'success');
      await load();
    } catch (error) { addToast(`تعذر عكس القيد: ${getErrorMessage(error)}`, 'error'); }
  };

  return <div className="p-6 md:p-8 space-y-6" dir="rtl">
    <section className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4"><div><p className="text-sm font-bold text-blue-700">General Ledger</p><h1 className="text-3xl font-black text-slate-900 mt-1">قيود اليومية</h1><p className="text-slate-500 mt-2">إنشاء مسودات متوازنة وترحيلها ذرّياً بعد التحقق من الفترة والحسابات.</p></div><div className="flex gap-2"><button onClick={() => void load()} className="px-4 py-2.5 border rounded-xl font-bold text-sm"><RefreshCw size={16} className="inline ml-1" />تحديث</button><button disabled={!entityId || !periods.length} onClick={() => setShowDraft(true)} className="px-4 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm disabled:opacity-50"><Plus size={16} className="inline ml-1" />قيد جديد</button></div></section>
    <select value={entityId} onChange={event => setEntityId(event.target.value)} className="w-full md:w-96 bg-white border rounded-xl px-4 py-3 font-bold"><option value="">اختر كياناً قانونياً</option>{entities.map(entity => <option value={entity.id} key={entity.id}>{entity.code} — {entity.name_ar}</option>)}</select>
    {loading ? <div className="py-24 text-center"><Loader2 className="animate-spin mx-auto mb-3" />جارٍ التحميل…</div> : !entityId ? <Empty text="اختر كياناً قانونياً." /> : !periods.length ? <Empty text="لا توجد فترة محاسبية مفتوحة لهذا الكيان. أنشئ سنة وفترات محاسبية أولاً." /> : <section className="bg-white rounded-2xl border overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50"><tr><th className="p-4 text-right">الرقم</th><th className="p-4 text-right">التاريخ</th><th className="p-4 text-right">الوصف</th><th className="p-4 text-right">مدين</th><th className="p-4 text-right">دائن</th><th className="p-4 text-right">الحالة</th><th className="p-4" /></tr></thead><tbody className="divide-y">{entries.map(entry => <tr key={entry.id}><td className="p-4 font-mono font-bold text-blue-700">{entry.entry_number}</td><td className="p-4">{entry.entry_date}</td><td className="p-4">{entry.description}</td><td className="p-4">{Number(entry.total_debit).toLocaleString()}</td><td className="p-4">{Number(entry.total_credit).toLocaleString()}</td><td className="p-4">{entry.status}</td><td className="p-4">{entry.status === 'draft' && <button onClick={() => void post(entry)} className="text-emerald-700 font-bold text-xs ml-3"><Send size={14} className="inline ml-1" />ترحيل</button>}{entry.status === 'posted' && <button onClick={() => void reverse(entry)} className="text-rose-700 font-bold text-xs">عكس القيد</button>}</td></tr>)}{entries.length === 0 && <tr><td colSpan={7}><Empty text="لا توجد قيود بعد." /></td></tr>}</tbody></table></div></section>}
    {showDraft && <div className="fixed inset-0 z-50 bg-slate-950/60 p-4 overflow-y-auto" onClick={() => !saving && setShowDraft(false)}><form onSubmit={saveDraft} onClick={event => event.stopPropagation()} className="max-w-5xl mx-auto my-6 bg-white rounded-2xl p-6 space-y-5"><div className="flex justify-between"><div><h2 className="font-black text-xl">مسودة قيد جديد</h2><p className="text-sm text-slate-500">لا يمكن ترحيل القيد إلا بعد التحقق الخادمي من التوازن والفترة والحسابات.</p></div><button type="button" onClick={() => setShowDraft(false)}>×</button></div><div className="grid md:grid-cols-3 gap-3"><Input label="التاريخ"><input type="date" value={header.entry_date} onChange={event => setHeader(current => ({ ...current, entry_date: event.target.value }))} /></Input><Input label="الفترة"><select value={header.accounting_period_id} onChange={event => setHeader(current => ({ ...current, accounting_period_id: event.target.value }))}>{periods.map(period => <option value={period.id} key={period.id}>{period.name} ({period.start_date} — {period.end_date})</option>)}</select></Input><Input label="العملة"><select value={header.transaction_currency_code} onChange={event => setHeader(current => ({ ...current, transaction_currency_code: event.target.value }))}>{currencies.map(currency => <option key={currency.code} value={currency.code}>{currency.code}</option>)}</select></Input><Input label="الوصف"><input required value={header.description} onChange={event => setHeader(current => ({ ...current, description: event.target.value }))} /></Input><Input label="المرجع"><input value={header.reference} onChange={event => setHeader(current => ({ ...current, reference: event.target.value }))} /></Input><Input label="سعر الصرف"><input type="number" min="0.0000001" step="any" value={header.exchange_rate} onChange={event => setHeader(current => ({ ...current, exchange_rate: Number(event.target.value) }))} /></Input></div><div className="border rounded-xl overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50"><tr><th className="p-3 text-right">الحساب</th><th className="p-3 text-right">الوصف</th><th className="p-3 text-right">مدين</th><th className="p-3 text-right">دائن</th><th /></tr></thead><tbody>{lines.map(line => <tr key={line.key} className="border-t"><td className="p-2 min-w-64"><select value={line.account_id} onChange={event => updateLine(line.key, 'account_id', event.target.value)} className="w-full border rounded-lg p-2"><option value="">اختر حساباً</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.code} — {account.name_ar || account.name}</option>)}</select></td><td className="p-2"><input value={line.description} onChange={event => updateLine(line.key, 'description', event.target.value)} className="w-full border rounded-lg p-2" /></td><td className="p-2"><input type="number" min="0" step="0.01" value={line.debit_amount || ''} onChange={event => updateLine(line.key, 'debit_amount', Number(event.target.value))} className="w-28 border rounded-lg p-2" /></td><td className="p-2"><input type="number" min="0" step="0.01" value={line.credit_amount || ''} onChange={event => updateLine(line.key, 'credit_amount', Number(event.target.value))} className="w-28 border rounded-lg p-2" /></td><td className="p-2">{lines.length > 2 && <button type="button" onClick={() => setLines(current => current.filter(item => item.key !== line.key))} className="text-rose-600"><Trash2 size={16} /></button>}</td></tr>)}</tbody></table></div><button type="button" onClick={() => setLines(current => [...current, emptyLine()])} className="text-blue-700 font-bold text-sm"><Plus size={15} className="inline ml-1" />إضافة سطر</button><div className={`rounded-xl p-4 flex justify-between font-black ${balanced ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}><span>مدين: {totals.debit.toLocaleString()} | دائن: {totals.credit.toLocaleString()}</span><span>{balanced ? <><CheckCircle2 size={16} className="inline ml-1" />متوازن</> : 'غير متوازن'}</span></div><div className="flex gap-3"><button type="button" onClick={() => setShowDraft(false)} className="flex-1 border rounded-xl py-3 font-bold">إلغاء</button><button disabled={!balanced || saving} className="flex-1 bg-blue-600 text-white rounded-xl py-3 font-bold disabled:opacity-50">{saving ? 'جارٍ الحفظ…' : <><FilePlus2 size={16} className="inline ml-1" />حفظ كمسودة</>}</button></div></form></div>}
  </div>;
}
function Input({ label, children }: { label: string; children: ReactNode }) { return <label className="text-sm font-bold space-y-1 block"><span>{label}</span><div className="[&>input]:w-full [&>input]:border [&>input]:rounded-xl [&>input]:p-2.5 [&>select]:w-full [&>select]:border [&>select]:rounded-xl [&>select]:p-2.5">{children}</div></label>; }
function Empty({ text }: { text: string }) { return <div className="text-center py-20 text-slate-500">{text}</div>; }
