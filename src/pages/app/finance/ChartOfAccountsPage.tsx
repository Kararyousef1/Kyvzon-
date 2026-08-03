import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, BarChart3, Building2, ChevronDown, Eye, FolderTree, Loader2, Pencil, Plus, RefreshCw, Search, ShieldCheck, SlidersHorizontal, X } from 'lucide-react';
import {
  chartOfAccountService,
  type FinanceChartAccountTreeRecord,
  type FinanceDimensionsDashboardRecord,
  type FinanceHierarchyIssueRecord,
} from '../../../services/sdk/ChartOfAccountService';
import { legalEntityService, type LegalEntityRecord } from '../../../services/sdk/FinanceFoundationService';
import type { ChartOfAccountRecord } from '../../../shared/types/sdk';
import { getErrorMessage } from '../../../services/errors';
import { useUIStore } from '../../../core/stores';
import { FinanceUnitNav } from './shared/FinanceUnitNav';

const ACCOUNT_TYPES = [
  { value: 'Asset', label: 'أصول', normal: 'debit' },
  { value: 'Liability', label: 'التزامات', normal: 'credit' },
  { value: 'Equity', label: 'حقوق ملكية', normal: 'credit' },
  { value: 'Revenue', label: 'إيرادات', normal: 'credit' },
  { value: 'Expense', label: 'مصروفات', normal: 'debit' },
] as const;

type AccountType = typeof ACCOUNT_TYPES[number]['value'];
type NormalBalance = 'debit' | 'credit';

type FormState = {
  accountId: string;
  code: string;
  name: string;
  nameAr: string;
  accountType: AccountType;
  parentId: string;
  normalBalance: NormalBalance;
  allowPosting: boolean;
  isControlAccount: boolean;
  requireCostCenter: boolean;
  requireProject: boolean;
  reason: string;
};

type ReasonAction = { type: 'archive'; account: FinanceChartAccountTreeRecord } | { type: 'posting'; account: FinanceChartAccountTreeRecord; allowPosting: boolean };

const emptyForm: FormState = {
  accountId: '',
  code: '',
  name: '',
  nameAr: '',
  accountType: 'Asset',
  parentId: '',
  normalBalance: 'debit',
  allowPosting: true,
  isControlAccount: false,
  requireCostCenter: false,
  requireProject: false,
  reason: '',
};

export default function ChartOfAccountsPage() {
  const { addToast } = useUIStore();
  const [entities, setEntities] = useState<LegalEntityRecord[]>([]);
  const [entityId, setEntityId] = useState('');
  const [accounts, setAccounts] = useState<FinanceChartAccountTreeRecord[]>([]);
  const [dashboard, setDashboard] = useState<FinanceDimensionsDashboardRecord | null>(null);
  const [issues, setIssues] = useState<FinanceHierarchyIssueRecord[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [reasonAction, setReasonAction] = useState<ReasonAction | null>(null);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const entityRows = await legalEntityService.findActive();
      setEntities(entityRows);
      const resolvedEntityId = entityId || entityRows[0]?.id || '';
      if (!entityId && resolvedEntityId) setEntityId(resolvedEntityId);

      if (!resolvedEntityId) {
        setAccounts([]);
        setDashboard(null);
        setIssues([]);
        setSelectedId('');
        return;
      }

      const [treeRows, dashboardRows] = await Promise.all([
        chartOfAccountService.findTree(resolvedEntityId),
        chartOfAccountService.findDimensionsDashboard(resolvedEntityId),
      ]);
      setAccounts(treeRows);
      setDashboard(dashboardRows[0] || null);
      setSelectedId(current => current && treeRows.some(row => row.id === current) ? current : treeRows[0]?.id || '');
    } catch (error) {
      addToast(`تعذر تحميل دليل الحسابات: ${getErrorMessage(error)}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast, entityId]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return accounts;
    return accounts.filter(account =>
      [account.code, account.name, account.name_ar, account.account_type, account.parent_code, account.parent_name]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(normalized),
    );
  }, [accounts, query]);

  const selected = useMemo(() => accounts.find(account => account.id === selectedId) || null, [accounts, selectedId]);

  const parentOptions = useMemo(() => accounts.filter(account =>
    account.is_active
    && !account.allow_posting
    && account.account_type === form.accountType
    && account.id !== form.accountId,
  ), [accounts, form.accountId, form.accountType]);

  const openCreate = () => {
    setForm({ ...emptyForm, normalBalance: normalForType('Asset') });
    setShowForm(true);
  };

  const openEdit = (account: FinanceChartAccountTreeRecord) => {
    setForm({
      accountId: account.id,
      code: account.code,
      name: account.name,
      nameAr: account.name_ar || '',
      accountType: account.account_type,
      parentId: account.parent_id || '',
      normalBalance: account.normal_balance || normalForType(account.account_type),
      allowPosting: Boolean(account.allow_posting),
      isControlAccount: Boolean(account.is_control_account),
      requireCostCenter: Boolean(account.require_cost_center),
      requireProject: Boolean(account.require_project),
      reason: '',
    });
    setShowForm(true);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!entityId) return addToast('اختر كياناً قانونياً أولاً', 'error');
    if (!form.code.trim() || !form.name.trim()) return addToast('رمز الحساب واسمه مطلوبان', 'error');
    if (form.isControlAccount && form.allowPosting) return addToast('الحساب الرقابي لا يسمح بالترحيل المباشر', 'error');
    if (form.accountId && !form.reason.trim()) return addToast('سبب تعديل الحساب مطلوب للتدقيق', 'error');

    setSaving(true);
    try {
      const account = await chartOfAccountService.upsertAccount({
        legalEntityId: entityId,
        accountId: form.accountId || null,
        code: form.code.trim(),
        name: form.name.trim(),
        nameAr: form.nameAr.trim() || null,
        accountType: form.accountType,
        parentId: form.parentId || null,
        normalBalance: form.normalBalance,
        allowPosting: form.allowPosting,
        isControlAccount: form.isControlAccount,
        reason: form.reason.trim() || (form.accountId ? 'تعديل حساب مالي' : 'إنشاء حساب مالي'),
      });
      await chartOfAccountService.upsertDimensionPolicy({
        accountId: account.id,
        requireCostCenter: form.requireCostCenter,
        requireProject: form.requireProject,
        reason: form.reason.trim() || 'تحديث سياسة أبعاد الحساب من نموذج دليل الحسابات',
      });
      addToast(form.accountId ? 'تم تحديث الحساب وسياسة الأبعاد' : 'تم إنشاء الحساب وسياسة الأبعاد', 'success');
      setShowForm(false);
      setForm(emptyForm);
      setSelectedId(account.id);
      await load();
    } catch (error) {
      addToast(`تعذر حفظ الحساب: ${getErrorMessage(error)}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const executeReasonAction = async () => {
    if (!reasonAction || !reason.trim()) return addToast('السبب مطلوب للتدقيق المالي', 'error');
    setSaving(true);
    try {
      if (reasonAction.type === 'archive') {
        await chartOfAccountService.archiveAccount(reasonAction.account.id, reason.trim());
        addToast('تمت أرشفة الحساب وتسجيل السبب', 'success');
      } else {
        await chartOfAccountService.updatePosting(reasonAction.account.id, reasonAction.allowPosting, reason.trim());
        addToast('تم تحديث حالة الترحيل وتسجيل السبب', 'success');
      }
      setReasonAction(null);
      setReason('');
      await load();
    } catch (error) {
      addToast(`تعذر تنفيذ العملية: ${getErrorMessage(error)}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const validateHierarchy = async () => {
    if (!entityId) return;
    try {
      const rows = await chartOfAccountService.validateHierarchy(entityId);
      setIssues(rows);
      addToast(rows.length ? `تم العثور على ${rows.length} ملاحظة في الشجرة` : 'الشجرة سليمة حسب قواعد الوحدة 01', rows.length ? 'warning' : 'success');
    } catch (error) {
      addToast(`تعذر التحقق من الشجرة: ${getErrorMessage(error)}`, 'error');
    }
  };

  const changeType = (value: AccountType) => setForm(current => ({ ...current, accountType: value, normalBalance: normalForType(value), parentId: '' }));

  return (
    <div className="space-y-5 max-w-[1700px] mx-auto" dir="rtl">
      <FinanceUnitNav unit="coa" />

      <section className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-emerald-700">Finance Unit 01 · COA & Dimensions</p>
          <h1 className="text-3xl font-black text-slate-900 mt-1">دليل الحسابات والأبعاد المالية</h1>
          <p className="text-slate-500 mt-2">شجرة حسابات محكومة لكل كيان، مع سياسات مراكز التكلفة والمشاريع، وأرشفة معلّلة لا تحذف الأثر المالي.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => void validateHierarchy()} disabled={!entityId} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 font-bold text-sm disabled:opacity-50"><ShieldCheck size={16} /> تحقق الشجرة</button>
          <button onClick={() => void load()} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 font-bold text-sm"><RefreshCw size={16} /> تحديث</button>
          <button onClick={openCreate} disabled={!entityId} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-sm disabled:opacity-50"><Plus size={16} /> حساب جديد</button>
        </div>
      </section>

      <section className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
        <Metric title="الحسابات النشطة" value={dashboard?.active_accounts || 0} icon={<FolderTree size={18} />} />
        <Metric title="حسابات الترحيل" value={dashboard?.posting_accounts || 0} icon={<BarChart3 size={18} />} />
        <Metric title="حسابات رقابية" value={dashboard?.control_accounts || 0} icon={<ShieldCheck size={18} />} />
        <Metric title="سياسات أبعاد" value={`${dashboard?.accounts_requiring_cost_center || 0} / ${dashboard?.accounts_requiring_project || 0}`} subtitle="مركز تكلفة / مشروع" icon={<SlidersHorizontal size={18} />} />
      </section>

      <section className="grid md:grid-cols-[minmax(240px,360px)_1fr] gap-4">
        <label className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 flex items-center gap-2">
          <Building2 size={17} className="text-slate-500" />
          <select value={entityId} onChange={event => { setEntityId(event.target.value); setIssues([]); }} className="w-full bg-transparent outline-none text-sm font-bold">
            <option value="">اختر كياناً قانونياً</option>
            {entities.map(entity => <option key={entity.id} value={entity.id}>{entity.code} — {entity.name_ar}</option>)}
          </select>
          <ChevronDown size={15} className="text-slate-400" />
        </label>
        <label className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 flex items-center gap-2">
          <Search size={17} className="text-slate-500" />
          <input value={query} onChange={event => setQuery(event.target.value)} className="w-full outline-none text-sm" placeholder="ابحث بالرمز أو الاسم أو النوع أو الحساب الأب…" />
        </label>
      </section>

      {issues.length > 0 && <section className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-2">
        <h2 className="font-black text-amber-900">نتائج تحقق الشجرة</h2>
        <div className="grid md:grid-cols-2 gap-2">
          {issues.map(issue => <div key={`${issue.account_id}-${issue.issue_code}`} className="text-sm bg-white/70 border border-amber-100 rounded-xl p-3"><span className={issue.severity === 'error' ? 'text-rose-700 font-black' : 'text-amber-700 font-black'}>{issue.severity}</span><span className="mx-2 font-mono">{issue.code}</span><span>{issue.issue_message}</span></div>)}
        </div>
      </section>}

      <section className="grid xl:grid-cols-[1fr_360px] gap-4 items-start">
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          {loading ? <div className="py-20 text-center text-slate-500"><Loader2 className="animate-spin mx-auto mb-3" />جارٍ تحميل الحسابات…</div> : !entityId ? <Empty text="اختر كياناً قانونياً لعرض دليل الحسابات." /> : filtered.length === 0 ? <Empty text="لا توجد حسابات مطابقة. أنشئ أول حساب لهذا الكيان." /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="text-right p-4">الرمز</th>
                    <th className="text-right p-4">الحساب</th>
                    <th className="text-right p-4">النوع/الرصيد</th>
                    <th className="text-right p-4">الأب</th>
                    <th className="text-right p-4">الترحيل</th>
                    <th className="text-right p-4">الأبعاد</th>
                    <th className="text-right p-4">الاستخدام</th>
                    <th className="p-4" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map(account => <tr key={account.id} className={`hover:bg-slate-50/70 ${selectedId === account.id ? 'bg-emerald-50/50' : ''}`}>
                    <td className="p-4"><button onClick={() => setSelectedId(account.id)} className="font-mono font-black text-emerald-700">{account.code}</button><p className="text-[11px] text-slate-400 mt-1">L{account.level} · أبناء {Number(account.child_count || 0)}</p></td>
                    <td className="p-4"><p className="font-bold text-slate-800">{account.name_ar || account.name}</p>{account.name_ar && <p className="text-xs text-slate-400 mt-1">{account.name}</p>}</td>
                    <td className="p-4"><p>{typeLabel(account.account_type)}</p><p className="text-xs text-slate-400 mt-1">{account.normal_balance === 'credit' ? 'دائن' : 'مدين'}</p></td>
                    <td className="p-4 text-slate-600">{account.parent_code ? `${account.parent_code} — ${account.parent_name || ''}` : 'جذر'}</td>
                    <td className="p-4"><Badge tone={account.is_active ? (account.allow_posting ? 'green' : 'slate') : 'rose'}>{account.is_active ? (account.allow_posting ? 'مسموح' : 'غير مسموح') : 'مؤرشف'}</Badge>{account.is_control_account && <Badge tone="amber">رقابي</Badge>}</td>
                    <td className="p-4"><div className="flex flex-wrap gap-1"><Badge tone={account.require_cost_center ? 'blue' : 'slate'}>مركز تكلفة</Badge><Badge tone={account.require_project ? 'violet' : 'slate'}>مشروع</Badge></div></td>
                    <td className="p-4"><button onClick={() => setSelectedId(account.id)} className="inline-flex items-center gap-1 text-slate-600 hover:text-emerald-700"><Eye size={14} /> {Number(account.line_count || 0)}</button>{Number(account.open_line_count || 0) > 0 && <p className="text-xs text-rose-600 mt-1">مفتوحة: {Number(account.open_line_count)}</p>}</td>
                    <td className="p-4"><div className="flex items-center justify-center gap-2">
                      <button onClick={() => openEdit(account)} className="text-blue-600 hover:text-blue-700" title="تعديل"><Pencil size={17} /></button>
                      {account.is_active && <button onClick={() => { setReasonAction({ type: 'posting', account, allowPosting: !account.allow_posting }); setReason(''); }} className="text-slate-600 hover:text-slate-800" title="تغيير الترحيل"><SlidersHorizontal size={17} /></button>}
                      {account.is_active && <button onClick={() => { setReasonAction({ type: 'archive', account }); setReason(''); }} className="text-rose-600 hover:text-rose-700" title="أرشفة"><Archive size={17} /></button>}
                    </div></td>
                  </tr>)}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <aside className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm sticky top-4">
          <h2 className="font-black text-slate-900">ملخص استخدام الحساب</h2>
          {!selected ? <p className="text-sm text-slate-500 mt-4">اختر حساباً من الجدول لعرض الأثر والاستخدام.</p> : <div className="mt-4 space-y-4">
            <div><p className="font-mono font-black text-emerald-700">{selected.code}</p><h3 className="font-black text-lg text-slate-900 mt-1">{selected.name_ar || selected.name}</h3><p className="text-xs text-slate-400 mt-1">{typeLabel(selected.account_type)} · مستوى {selected.level}</p></div>
            <div className="grid grid-cols-2 gap-2">
              <SmallMetric label="كل السطور" value={Number(selected.line_count || 0)} />
              <SmallMetric label="سطور مفتوحة" value={Number(selected.open_line_count || 0)} danger={Number(selected.open_line_count || 0) > 0} />
              <SmallMetric label="مدين مرحل" value={money(selected.posted_debit)} />
              <SmallMetric label="دائن مرحل" value={money(selected.posted_credit)} />
            </div>
            <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 text-sm text-slate-600">
              <p><strong>الصافي:</strong> {money(selected.posted_net_balance)}</p>
              <p className="mt-1"><strong>الترحيل:</strong> {selected.allow_posting ? 'مسموح' : 'غير مسموح'}</p>
              <p className="mt-1"><strong>الأبعاد:</strong> {selected.require_cost_center ? 'مركز تكلفة مطلوب' : 'مركز تكلفة اختياري'} · {selected.require_project ? 'مشروع مطلوب' : 'مشروع اختياري'}</p>
            </div>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl p-3">الأرشفة لا تحذف التاريخ، لكنها تمنع الترحيل المستقبلي. إذا وجدت سطور قيود مفتوحة فسترفض قاعدة البيانات الأرشفة حتى تُعالج.</p>
          </div>}
        </aside>
      </section>

      {showForm && <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4" onClick={() => !saving && setShowForm(false)}>
        <form onSubmit={submit} onClick={event => event.stopPropagation()} className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl p-6 space-y-4 max-h-[92vh] overflow-y-auto">
          <div className="flex items-center justify-between gap-3">
            <div><h2 className="font-black text-xl">{form.accountId ? 'تعديل حساب' : 'إضافة حساب'}</h2><p className="text-sm text-slate-500 mt-1">كل العمليات تمر عبر RPC وتُسجل في التدقيق المالي.</p></div>
            <button type="button" onClick={() => setShowForm(false)}><X /></button>
          </div>
          <div className="grid md:grid-cols-3 gap-3">
            <Field label="رمز الحساب *"><input required value={form.code} onChange={event => setForm(current => ({ ...current, code: event.target.value }))} /></Field>
            <Field label="النوع *"><select value={form.accountType} onChange={event => changeType(event.target.value as AccountType)}>{ACCOUNT_TYPES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Field>
            <Field label="الرصيد الطبيعي"><select value={form.normalBalance} onChange={event => setForm(current => ({ ...current, normalBalance: event.target.value as NormalBalance }))}><option value="debit">مدين</option><option value="credit">دائن</option></select></Field>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <Field label="اسم الحساب *"><input required value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} /></Field>
            <Field label="اسم الحساب بالعربية"><input value={form.nameAr} onChange={event => setForm(current => ({ ...current, nameAr: event.target.value }))} /></Field>
          </div>
          <Field label="الحساب الأب"><select value={form.parentId} onChange={event => setForm(current => ({ ...current, parentId: event.target.value }))}><option value="">حساب جذري</option>{parentOptions.map(account => <option key={account.id} value={account.id}>{account.code} — {account.name_ar || account.name}</option>)}</select></Field>
          <div className="grid md:grid-cols-2 gap-3 rounded-2xl bg-slate-50 border border-slate-100 p-4">
            <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={form.allowPosting} disabled={form.isControlAccount} onChange={event => setForm(current => ({ ...current, allowPosting: event.target.checked }))} /> يسمح بالترحيل المباشر</label>
            <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={form.isControlAccount} onChange={event => setForm(current => ({ ...current, isControlAccount: event.target.checked, allowPosting: event.target.checked ? false : current.allowPosting }))} /> حساب رقابي</label>
            <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={form.requireCostCenter} onChange={event => setForm(current => ({ ...current, requireCostCenter: event.target.checked }))} /> مركز تكلفة مطلوب</label>
            <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={form.requireProject} onChange={event => setForm(current => ({ ...current, requireProject: event.target.checked }))} /> مشروع مطلوب</label>
          </div>
          {form.accountId && <Field label="سبب التعديل *"><textarea required value={form.reason} onChange={event => setForm(current => ({ ...current, reason: event.target.value }))} className="min-h-24" placeholder="اكتب سبباً واضحاً يظهر في التدقيق المالي…" /></Field>}
          <div className="flex gap-3 pt-2"><button type="button" className="flex-1 border rounded-xl py-2.5 font-bold" onClick={() => setShowForm(false)}>إلغاء</button><button disabled={saving} className="flex-1 bg-emerald-600 text-white rounded-xl py-2.5 font-bold disabled:opacity-50">{saving ? 'جارٍ الحفظ…' : 'حفظ الحساب'}</button></div>
        </form>
      </div>}

      {reasonAction && <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4" onClick={() => !saving && setReasonAction(null)}>
        <div onClick={event => event.stopPropagation()} className="w-full max-w-lg bg-white rounded-2xl shadow-2xl p-6 space-y-4">
          <div className="flex items-center justify-between gap-3"><div><h2 className="font-black text-xl">{reasonAction.type === 'archive' ? 'أرشفة حساب' : 'تغيير حالة الترحيل'}</h2><p className="text-sm text-slate-500 mt-1">{reasonAction.account.code} — {reasonAction.account.name_ar || reasonAction.account.name}</p></div><button type="button" onClick={() => setReasonAction(null)}><X /></button></div>
          <div className="rounded-xl bg-amber-50 border border-amber-100 p-3 text-sm text-amber-900">هذه العملية حساسة وتتطلب سبباً إلزامياً. سيظهر السبب في سجل التدقيق المالي.</div>
          <textarea value={reason} onChange={event => setReason(event.target.value)} className="w-full min-h-28 rounded-xl border border-slate-200 px-3 py-2.5 text-sm" placeholder="اكتب السبب…" />
          <div className="flex gap-3"><button type="button" className="flex-1 border rounded-xl py-2.5 font-bold" onClick={() => setReasonAction(null)}>إلغاء</button><button disabled={saving || !reason.trim()} onClick={() => void executeReasonAction()} className="flex-1 bg-rose-600 text-white rounded-xl py-2.5 font-bold disabled:opacity-50">تنفيذ</button></div>
        </div>
      </div>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-sm font-bold text-slate-700 space-y-1"><span>{label}</span><div className="[&>input]:w-full [&>input]:rounded-xl [&>input]:border [&>input]:border-slate-200 [&>input]:px-3 [&>input]:py-2.5 [&>select]:w-full [&>select]:rounded-xl [&>select]:border [&>select]:border-slate-200 [&>select]:px-3 [&>select]:py-2.5 [&>textarea]:w-full [&>textarea]:rounded-xl [&>textarea]:border [&>textarea]:border-slate-200 [&>textarea]:px-3 [&>textarea]:py-2.5">{children}</div></label>;
}

function Metric({ title, value, subtitle, icon }: { title: string; value: ReactNode; subtitle?: string; icon: ReactNode }) {
  return <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm"><div className="flex items-center justify-between"><div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">{icon}</div><p className="text-2xl font-black text-slate-900">{value}</p></div><h3 className="font-bold text-slate-700 mt-3">{title}</h3>{subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}</div>;
}

function SmallMetric({ label, value, danger }: { label: string; value: ReactNode; danger?: boolean }) {
  return <div className={`rounded-xl border p-3 ${danger ? 'bg-rose-50 border-rose-100 text-rose-800' : 'bg-slate-50 border-slate-100 text-slate-700'}`}><p className="text-xs font-bold opacity-70">{label}</p><p className="font-black mt-1">{value}</p></div>;
}

function Badge({ children, tone }: { children: ReactNode; tone: 'green' | 'rose' | 'slate' | 'amber' | 'blue' | 'violet' }) {
  const cls: Record<typeof tone, string> = {
    green: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    rose: 'bg-rose-50 text-rose-700 border-rose-100',
    slate: 'bg-slate-50 text-slate-500 border-slate-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    blue: 'bg-blue-50 text-blue-700 border-blue-100',
    violet: 'bg-violet-50 text-violet-700 border-violet-100',
  };
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold ml-1 ${cls[tone]}`}>{children}</span>;
}

function Empty({ text }: { text: string }) { return <div className="py-20 text-center"><FolderTree className="mx-auto text-slate-300 mb-3" size={38} /><p className="text-slate-500">{text}</p></div>; }
function typeLabel(type: string) { return ACCOUNT_TYPES.find(item => item.value === type)?.label || type; }
function normalForType(type: AccountType): NormalBalance { return (ACCOUNT_TYPES.find(item => item.value === type)?.normal || 'debit') as NormalBalance; }
function money(value: unknown) { return Number(value || 0).toLocaleString(); }
