import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { FileText, Loader2, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { accountsPayableService, vendorService, type ApDashboardRecord, type ApInvoiceBoardRecord, type ApInvoiceLineBoardRecord, type ApInvoiceLineInput, type VendorRecord } from '../../../services/sdk/AccountsPayableService';
import { chartOfAccountService, type FinancePostingAccountLookupRecord } from '../../../services/sdk/ChartOfAccountService';
import { currencyService, financeCostCenterService, financeProjectService, legalEntityService, type CostCenterRecord, type CurrencyRecord, type FinanceProjectRecord, type LegalEntityRecord } from '../../../services/sdk/FinanceFoundationService';
import { useUIStore } from '../../../core/stores';
import { getErrorMessage } from '../../../services/errors';
import { FinanceUnitNav } from './shared/FinanceUnitNav';

type DraftLine = ApInvoiceLineInput & { key: string };
type ReasonAction = { type: 'submitted' | 'approved' | 'voided'; invoice: ApInvoiceBoardRecord };
const emptyLine = (): DraftLine => ({ key: crypto.randomUUID(), account_id: '', description: '', quantity: 1, unit_price: 0, line_amount: 0, tax_amount: 0, total_amount: 0, cost_center_id: '', project_id: '' });

export default function AccountsPayablePage() {
  const { addToast } = useUIStore();
  const [entities, setEntities] = useState<LegalEntityRecord[]>([]);
  const [entityId, setEntityId] = useState('');
  const [vendors, setVendors] = useState<VendorRecord[]>([]);
  const [accounts, setAccounts] = useState<FinancePostingAccountLookupRecord[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenterRecord[]>([]);
  const [projects, setProjects] = useState<FinanceProjectRecord[]>([]);
  const [currencies, setCurrencies] = useState<CurrencyRecord[]>([]);
  const [rows, setRows] = useState<ApInvoiceBoardRecord[]>([]);
  const [lineRows, setLineRows] = useState<ApInvoiceLineBoardRecord[]>([]);
  const [dashboard, setDashboard] = useState<ApDashboardRecord | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [show, setShow] = useState(false);
  const [reasonAction, setReasonAction] = useState<ReasonAction | null>(null);
  const [reason, setReason] = useState('');
  const [f, setF] = useState({ vendorId: '', invoiceNumber: '', invoiceDate: new Date().toISOString().slice(0, 10), dueDate: '', currencyCode: 'IQD', exchangeRate: 1, notes: '' });
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [es, cs] = await Promise.all([legalEntityService.findActive(), currencyService.findActive()]);
      setEntities(es); setCurrencies(cs);
      const id = entityId || es[0]?.id || ''; if (!entityId && id) setEntityId(id);
      if (!id) { setVendors([]); setRows([]); setDashboard(null); setAccounts([]); return; }
      const [vs, ap, dash, acc, cc, pr] = await Promise.all([
        vendorService.findActiveForEntity(id), accountsPayableService.findBoard(id), accountsPayableService.findDashboard(id), chartOfAccountService.findPostingLookup(id),
        financeCostCenterService.findAll({ filters: { legal_entity_id: id, is_active: true }, orderBy: 'code' }), financeProjectService.findAll({ filters: { legal_entity_id: id, status: 'active' }, orderBy: 'code' }),
      ]);
      setVendors(vs); setRows(ap); setDashboard(dash[0] || null); setAccounts(acc); setCostCenters(cc); setProjects(pr);
      setSelectedId(current => current && ap.some(row => row.id === current) ? current : ap[0]?.id || '');
    } catch (e) { addToast(`تعذر تحميل الذمم: ${getErrorMessage(e)}`, 'error'); } finally { setLoading(false); }
  }, [addToast, entityId]);
  useEffect(() => { void load(); }, [load]);

  const loadLines = useCallback(async (invoiceId: string) => {
    if (!invoiceId) { setLineRows([]); return; }
    try { setLineRows(await accountsPayableService.findLines(invoiceId)); } catch (e) { addToast(getErrorMessage(e), 'error'); }
  }, [addToast]);
  useEffect(() => { void loadLines(selectedId); }, [loadLines, selectedId]);

  const total = useMemo(() => lines.reduce((s, l) => s + Number(l.total_amount || 0), 0), [lines]);
  const complete = total > 0 && f.vendorId && f.invoiceNumber.trim() && lines.every(line => line.account_id && Number(line.total_amount) > 0 && dimensionsSatisfied(line));
  const selected = rows.find(row => row.id === selectedId) || null;

  function dimensionsSatisfied(line: DraftLine) {
    const account = accounts.find(a => a.id === line.account_id);
    if (!account) return false;
    if (account.require_cost_center && !line.cost_center_id) return false;
    if (account.require_project && !line.project_id) return false;
    return true;
  }
  const updateLine = (key: string, patch: Partial<DraftLine>) => setLines(current => current.map(line => {
    if (line.key !== key) return line;
    const next = { ...line, ...patch };
    next.line_amount = Number(next.quantity || 0) * Number(next.unit_price || 0);
    next.total_amount = Number(next.line_amount || 0) + Number(next.tax_amount || 0);
    return next;
  }));

  const create = async (e: FormEvent) => {
    e.preventDefault(); if (!entityId || !complete) return addToast('أكمل المورد ورقم الفاتورة والسطور والأبعاد المطلوبة', 'error');
    setSaving(true);
    try {
      const invoice = await accountsPayableService.createInvoiceWithLines({ legalEntityId: entityId, vendorId: f.vendorId, invoiceNumber: f.invoiceNumber, invoiceDate: f.invoiceDate, dueDate: f.dueDate || undefined, currencyCode: f.currencyCode, exchangeRate: Number(f.exchangeRate), notes: f.notes, lines: lines.map(({ key: _key, cost_center_id, project_id, ...line }) => ({ ...line, cost_center_id: cost_center_id || undefined, project_id: project_id || undefined })) });
      addToast('تم حفظ فاتورة المورد كمسودة مع السطور', 'success'); setShow(false); setSelectedId(invoice.id);
      setF({ vendorId: '', invoiceNumber: '', invoiceDate: new Date().toISOString().slice(0, 10), dueDate: '', currencyCode: 'IQD', exchangeRate: 1, notes: '' }); setLines([emptyLine()]); await load();
    } catch (e) { addToast(`تعذر حفظ الفاتورة: ${getErrorMessage(e)}`, 'error'); } finally { setSaving(false); }
  };

  const executeReasonAction = async () => {
    if (!reasonAction || !reason.trim()) return addToast('سبب العملية مطلوب للتدقيق', 'error');
    setSaving(true);
    try { await accountsPayableService.setStatus(reasonAction.invoice.id, reasonAction.type, reason.trim()); addToast('تم تحديث حالة الفاتورة وتسجيل السبب', 'success'); setReasonAction(null); setReason(''); await load(); }
    catch (e) { addToast(`تعذر تحديث الفاتورة: ${getErrorMessage(e)}`, 'error'); } finally { setSaving(false); }
  };

  return <div className="space-y-5 max-w-[1700px] mx-auto" dir="rtl"><FinanceUnitNav unit="ap" /><div className="flex justify-between items-center gap-3 flex-wrap"><div><p className="text-sm font-bold text-orange-700">Finance Unit 04 · Accounts Payable</p><h1 className="text-3xl font-black">فواتير الموردين</h1><p className="text-slate-500 mt-2">فواتير بسطر/أبعاد ودورة حياة محكومة بالأسباب والتدقيق.</p></div><div className="flex gap-2"><button onClick={() => void load()} className="border rounded-xl px-4 py-2 font-bold bg-white"><RefreshCw size={15} className="inline ml-1" />تحديث</button><button onClick={() => setShow(true)} disabled={!vendors.length || !accounts.length} className="bg-orange-600 text-white rounded-xl px-4 py-2 font-bold disabled:opacity-50"><Plus size={15} className="inline ml-1" />فاتورة جديدة</button></div></div>
    <section className="grid md:grid-cols-4 gap-3"><Metric title="مسودات" value={dashboard?.draft_invoices || 0} /><Metric title="مرسلة" value={dashboard?.submitted_invoices || 0} /><Metric title="معتمدة" value={dashboard?.approved_invoices || 0} /><Metric title="المستحق" value={Number(dashboard?.total_outstanding || 0).toLocaleString()} /></section>
    <select value={entityId} onChange={e => setEntityId(e.target.value)} className="border rounded-xl p-3 bg-white w-full md:w-96">{entities.map(x => <option key={x.id} value={x.id}>{x.code} — {x.name_ar}</option>)}</select>
    <section className="grid xl:grid-cols-[1fr_390px] gap-4 items-start">{loading ? <div className="py-24 text-center"><Loader2 className="animate-spin mx-auto mb-3" />جارٍ التحميل…</div> : <div className="bg-white border rounded-2xl overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50"><tr><th className="p-3 text-right">الفاتورة</th><th className="p-3 text-right">المورد</th><th className="p-3 text-right">التاريخ</th><th className="p-3 text-right">المبلغ</th><th className="p-3 text-right">المتبقي</th><th className="p-3 text-right">الحالة</th><th className="p-3">إجراء</th></tr></thead><tbody className="divide-y">{rows.map(r => <tr key={r.id} className={selectedId === r.id ? 'bg-orange-50/50' : ''}><td className="p-3"><button onClick={() => setSelectedId(r.id)} className="font-mono text-orange-700 font-bold">{r.invoice_number}</button></td><td className="p-3">{r.vendor_display_name}</td><td className="p-3">{r.invoice_date}</td><td className="p-3">{Number(r.amount).toLocaleString()} {r.currency_code}</td><td className="p-3">{Number(r.outstanding_amount).toLocaleString()}</td><td className="p-3">{r.status}</td><td className="p-3"><Actions invoice={r} onAction={(type) => { setReasonAction({ type, invoice: r }); setReason(''); }} /></td></tr>)}{!rows.length && <tr><td colSpan={7} className="p-16 text-center text-slate-500"><FileText className="mx-auto mb-3 text-slate-300" />لا توجد فواتير موردين.</td></tr>}</tbody></table></div>}
      <aside className="bg-white border rounded-2xl p-5 shadow-sm"><h2 className="font-black">سطور الفاتورة</h2>{!selected ? <p className="text-sm text-slate-500 mt-4">اختر فاتورة.</p> : <div className="space-y-2 mt-4"><p className="font-mono text-orange-700 font-bold">{selected.invoice_number}</p>{lineRows.map(l => <div key={l.id} className="bg-slate-50 border rounded-xl p-3 text-sm"><b>{l.account_code} — {l.account_name}</b><p className="text-xs text-slate-500 mt-1">{l.description || '—'}</p><p className="mt-1">{Number(l.total_amount).toLocaleString()}</p><p className="text-[11px] text-slate-400">{l.cost_center_code || 'بدون مركز'} · {l.project_code || 'بدون مشروع'}</p></div>)}</div>}</aside></section>
    {show && <div className="fixed inset-0 z-50 bg-slate-950/50 p-4 overflow-y-auto" onClick={() => !saving && setShow(false)}><form onSubmit={create} onClick={e => e.stopPropagation()} className="max-w-5xl mx-auto bg-white rounded-2xl p-6 space-y-4"><div className="flex justify-between"><h2 className="font-black text-xl">فاتورة مورد جديدة</h2><button type="button" onClick={() => setShow(false)}><X /></button></div><div className="grid md:grid-cols-3 gap-3"><Input label="المورد"><select required value={f.vendorId} onChange={e => setF(x => ({ ...x, vendorId: e.target.value }))}><option value="">اختر المورد</option>{vendors.map(v => <option key={v.id} value={v.id}>{v.vendor_code} — {v.name_ar}</option>)}</select></Input><Input label="رقم الفاتورة"><input required value={f.invoiceNumber} onChange={e => setF(x => ({ ...x, invoiceNumber: e.target.value }))} /></Input><Input label="العملة"><select value={f.currencyCode} onChange={e => setF(x => ({ ...x, currencyCode: e.target.value }))}>{currencies.map(c => <option key={c.code}>{c.code}</option>)}</select></Input><Input label="التاريخ"><input type="date" value={f.invoiceDate} onChange={e => setF(x => ({ ...x, invoiceDate: e.target.value }))} /></Input><Input label="الاستحقاق"><input type="date" value={f.dueDate} onChange={e => setF(x => ({ ...x, dueDate: e.target.value }))} /></Input><Input label="سعر الصرف"><input type="number" min="0.0000001" step="any" value={f.exchangeRate} onChange={e => setF(x => ({ ...x, exchangeRate: Number(e.target.value) }))} /></Input></div><textarea placeholder="ملاحظات" value={f.notes} onChange={e => setF(x => ({ ...x, notes: e.target.value }))} className="w-full border rounded-xl p-3" />
      <div className="overflow-x-auto border rounded-xl"><table className="w-full text-sm"><thead className="bg-slate-50"><tr><th className="p-2 text-right">الحساب</th><th className="p-2 text-right">الوصف</th><th className="p-2">مركز</th><th className="p-2">مشروع</th><th className="p-2">كمية</th><th className="p-2">سعر</th><th className="p-2">ضريبة</th><th /></tr></thead><tbody>{lines.map(line => { const acc = accounts.find(a => a.id === line.account_id); return <tr key={line.key} className="border-t"><td className="p-2 min-w-64"><select value={line.account_id} onChange={e => updateLine(line.key, { account_id: e.target.value })} className="w-full border rounded-lg p-2"><option value="">حساب</option>{accounts.map(a => <option value={a.id} key={a.id}>{a.code} — {a.display_name}</option>)}</select>{acc && <p className="text-[11px] text-slate-400">{acc.require_cost_center ? 'مركز مطلوب' : 'مركز اختياري'} · {acc.require_project ? 'مشروع مطلوب' : 'مشروع اختياري'}</p>}</td><td className="p-2"><input value={line.description || ''} onChange={e => updateLine(line.key, { description: e.target.value })} className="border rounded-lg p-2" /></td><td className="p-2"><select value={line.cost_center_id || ''} onChange={e => updateLine(line.key, { cost_center_id: e.target.value })} className="border rounded-lg p-2"><option value="">—</option>{costCenters.map(c => <option value={c.id} key={c.id}>{c.code}</option>)}</select></td><td className="p-2"><select value={line.project_id || ''} onChange={e => updateLine(line.key, { project_id: e.target.value })} className="border rounded-lg p-2"><option value="">—</option>{projects.map(p => <option value={p.id} key={p.id}>{p.code}</option>)}</select></td><td className="p-2"><input type="number" min="0.0001" step="any" value={line.quantity} onChange={e => updateLine(line.key, { quantity: Number(e.target.value) })} className="w-24 border rounded-lg p-2" /></td><td className="p-2"><input type="number" min="0" step="0.01" value={line.unit_price || ''} onChange={e => updateLine(line.key, { unit_price: Number(e.target.value) })} className="w-28 border rounded-lg p-2" /></td><td className="p-2"><input type="number" min="0" step="0.01" value={line.tax_amount || ''} onChange={e => updateLine(line.key, { tax_amount: Number(e.target.value) })} className="w-24 border rounded-lg p-2" /></td><td className="p-2">{lines.length > 1 && <button type="button" onClick={() => setLines(current => current.filter(x => x.key !== line.key))} className="text-rose-600"><Trash2 size={16} /></button>}</td></tr>; })}</tbody></table></div><button type="button" onClick={() => setLines(x => [...x, emptyLine()])} className="text-orange-700 font-bold"><Plus size={15} className="inline ml-1" />إضافة سطر</button><div className="bg-orange-50 rounded-xl p-3 font-black text-orange-800">إجمالي الفاتورة: {total.toLocaleString()}</div><button disabled={!complete || saving} className="w-full bg-orange-600 text-white rounded-xl py-3 font-bold disabled:opacity-50">حفظ كمسودة</button></form></div>}
    {reasonAction && <ReasonModal title={reasonAction.type === 'submitted' ? 'إرسال الفاتورة' : reasonAction.type === 'approved' ? 'اعتماد الفاتورة' : 'إلغاء الفاتورة'} reason={reason} setReason={setReason} saving={saving} onClose={() => setReasonAction(null)} onRun={() => void executeReasonAction()} />}
  </div>;
}
function Actions({ invoice, onAction }: { invoice: ApInvoiceBoardRecord; onAction: (type: ReasonAction['type']) => void }) { return <div className="flex gap-2 justify-center flex-wrap">{invoice.status === 'draft' && <button onClick={() => onAction('submitted')} className="text-blue-700 font-bold">إرسال</button>}{invoice.status === 'submitted' && <button onClick={() => onAction('approved')} className="text-emerald-700 font-bold">اعتماد</button>}{['draft', 'submitted', 'approved'].includes(invoice.status) && <button onClick={() => onAction('voided')} className="text-rose-700 font-bold">إلغاء</button>}</div>; }
function Metric({ title, value }: { title: string; value: ReactNode }) { return <div className="bg-white border rounded-2xl p-4"><p className="text-2xl font-black">{value}</p><p className="text-sm text-slate-500 font-bold mt-1">{title}</p></div>; }
function Input({ label, children }: { label: string; children: ReactNode }) { return <label className="block text-sm font-bold space-y-1"><span>{label}</span><div className="[&>input]:w-full [&>input]:border [&>input]:rounded-xl [&>input]:p-2.5 [&>select]:w-full [&>select]:border [&>select]:rounded-xl [&>select]:p-2.5">{children}</div></label>; }
function ReasonModal({ title, reason, setReason, saving, onClose, onRun }: { title: string; reason: string; setReason: (v: string) => void; saving: boolean; onClose: () => void; onRun: () => void }) { return <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4" onClick={() => !saving && onClose()}><div onClick={e => e.stopPropagation()} className="w-full max-w-lg bg-white rounded-2xl p-6 space-y-4"><div className="flex justify-between"><h2 className="font-black text-xl">{title}</h2><button onClick={onClose}><X /></button></div><textarea value={reason} onChange={e => setReason(e.target.value)} className="w-full min-h-28 border rounded-xl p-3" placeholder="سبب إلزامي يظهر في التدقيق المالي…" /><button disabled={!reason.trim() || saving} onClick={onRun} className="w-full bg-orange-600 text-white rounded-xl py-3 font-bold disabled:opacity-50">تنفيذ</button></div></div>; }
