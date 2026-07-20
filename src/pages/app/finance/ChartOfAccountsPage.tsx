import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, Building2, ChevronDown, FolderTree, Loader2, Plus, RefreshCw, Search, X } from 'lucide-react';
import { chartOfAccountService } from '../../../services/sdk/ChartOfAccountService';
import { legalEntityService, type LegalEntityRecord } from '../../../services/sdk/FinanceFoundationService';
import type { ChartOfAccountRecord } from '../../../shared/types/sdk';
import { getErrorMessage } from '../../../services/errors';
import { useUIStore } from '../../../core/stores';

const ACCOUNT_TYPES = [
  { value: 'Asset', label: 'أصول', normal: 'debit' },
  { value: 'Liability', label: 'التزامات', normal: 'credit' },
  { value: 'Equity', label: 'حقوق ملكية', normal: 'credit' },
  { value: 'Revenue', label: 'إيرادات', normal: 'credit' },
  { value: 'Expense', label: 'مصروفات', normal: 'debit' },
] as const;

type AccountType = typeof ACCOUNT_TYPES[number]['value'];

const initialForm = {
  code: '',
  name: '',
  name_ar: '',
  account_type: 'Asset' as AccountType,
  parent_id: '',
  allow_posting: true,
};

export default function ChartOfAccountsPage() {
  const { addToast } = useUIStore();
  const [entities, setEntities] = useState<LegalEntityRecord[]>([]);
  const [entityId, setEntityId] = useState('');
  const [accounts, setAccounts] = useState<ChartOfAccountRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(initialForm);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const entityRows = await legalEntityService.findActive();
      setEntities(entityRows);
      const resolvedEntityId = entityId || entityRows[0]?.id || '';
      if (!entityId && resolvedEntityId) setEntityId(resolvedEntityId);
      if (resolvedEntityId) {
        const rows = await chartOfAccountService.findAll({
          filters: { legal_entity_id: resolvedEntityId },
          orderBy: 'code',
        });
        setAccounts(rows);
      } else {
        setAccounts([]);
      }
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
      [account.code, account.name, account.name_ar, account.account_type]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(normalized),
    );
  }, [accounts, query]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!entityId) return addToast('اختر كياناً قانونياً أولاً', 'error');
    if (!form.code.trim() || !form.name.trim()) return addToast('رمز الحساب واسمه مطلوبان', 'error');
    if (accounts.some(account => account.code === form.code.trim())) {
      return addToast('رمز الحساب مستخدم في هذا الكيان القانوني', 'error');
    }

    setSaving(true);
    try {
      const accountType = ACCOUNT_TYPES.find(item => item.value === form.account_type)!;
      const parent = accounts.find(account => account.id === form.parent_id);
      await chartOfAccountService.create({
        legal_entity_id: entityId,
        code: form.code.trim(),
        name: form.name.trim(),
        name_ar: form.name_ar.trim() || null,
        account_type: form.account_type,
        parent_id: form.parent_id || null,
        level: parent ? parent.level + 1 : 1,
        normal_balance: accountType.normal,
        allow_posting: form.allow_posting,
        is_active: true,
      } as Partial<ChartOfAccountRecord>);
      addToast('تم إنشاء الحساب بنجاح', 'success');
      setForm(initialForm);
      setShowForm(false);
      await load();
    } catch (error) {
      addToast(`تعذر إنشاء الحساب: ${getErrorMessage(error)}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const archive = async (account: ChartOfAccountRecord) => {
    if (!confirm(`أرشفة الحساب ${account.code}؟ لن يمكن الترحيل إليه بعد ذلك.`)) return;
    try {
      await chartOfAccountService.update(account.id, { is_active: false, allow_posting: false } as Partial<ChartOfAccountRecord>);
      addToast('تمت أرشفة الحساب', 'success');
      await load();
    } catch (error) {
      addToast(`تعذر أرشفة الحساب: ${getErrorMessage(error)}`, 'error');
    }
  };

  return (
    <div className="space-y-5 max-w-[1600px] mx-auto" dir="rtl">
      <section className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-emerald-700">Financial Core · IFRS</p>
          <h1 className="text-3xl font-black text-slate-900 mt-1">دليل الحسابات</h1>
          <p className="text-slate-500 mt-2">شجرة حسابات مستقلة لكل كيان قانوني. الحسابات المؤرشفة لا تقبل الترحيل.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => void load()} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 font-bold text-sm"><RefreshCw size={16} /> تحديث</button>
          <button onClick={() => setShowForm(true)} disabled={!entityId} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-sm disabled:opacity-50"><Plus size={16} /> حساب جديد</button>
        </div>
      </section>

      <section className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-900">
        <strong>ضابط محاسبي:</strong> لا تحذف الحسابات المستخدمة. الأرشفة توقف الترحيل إليها وتحافظ على السجل المالي التاريخي.
      </section>

      <section className="grid md:grid-cols-[minmax(240px,360px)_1fr] gap-4">
        <label className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 flex items-center gap-2">
          <Building2 size={17} className="text-slate-500" />
          <select value={entityId} onChange={event => setEntityId(event.target.value)} className="w-full bg-transparent outline-none text-sm font-bold">
            <option value="">اختر كياناً قانونياً</option>
            {entities.map(entity => <option key={entity.id} value={entity.id}>{entity.code} — {entity.name_ar}</option>)}
          </select>
          <ChevronDown size={15} className="text-slate-400" />
        </label>
        <label className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 flex items-center gap-2">
          <Search size={17} className="text-slate-500" />
          <input value={query} onChange={event => setQuery(event.target.value)} className="w-full outline-none text-sm" placeholder="ابحث بالرمز أو الاسم أو النوع…" />
        </label>
      </section>

      <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        {loading ? <div className="py-20 text-center text-slate-500"><Loader2 className="animate-spin mx-auto mb-3" />جارٍ تحميل الحسابات…</div> : !entityId ? <Empty text="اختر كياناً قانونياً لعرض دليل الحسابات." /> : filtered.length === 0 ? <Empty text="لا توجد حسابات مطابقة. أنشئ أول حساب لهذا الكيان." /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600"><tr><th className="text-right p-4">الرمز</th><th className="text-right p-4">الحساب</th><th className="text-right p-4">النوع</th><th className="text-right p-4">المستوى</th><th className="text-right p-4">الترحيل</th><th className="text-right p-4">الحالة</th><th className="p-4" /></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(account => <tr key={account.id} className="hover:bg-slate-50/70"><td className="p-4 font-mono font-bold text-emerald-700">{account.code}</td><td className="p-4"><p className="font-bold text-slate-800">{account.name_ar || account.name}</p>{account.name_ar && <p className="text-xs text-slate-400 mt-1">{account.name}</p>}</td><td className="p-4">{typeLabel(account.account_type)}</td><td className="p-4">{account.level}</td><td className="p-4">{account.allow_posting ? 'مسموح' : 'غير مسموح'}</td><td className="p-4"><span className={account.is_active ? 'text-emerald-700' : 'text-slate-400'}>{account.is_active ? 'نشط' : 'مؤرشف'}</span></td><td className="p-4">{account.is_active && <button onClick={() => void archive(account)} className="text-rose-600 hover:text-rose-700" title="أرشفة"><Archive size={17} /></button>}</td></tr>)}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showForm && <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4" onClick={() => !saving && setShowForm(false)}><form onSubmit={submit} onClick={event => event.stopPropagation()} className="w-full max-w-xl bg-white rounded-2xl shadow-2xl p-6 space-y-4"><div className="flex items-center justify-between"><div><h2 className="font-black text-xl">إضافة حساب</h2><p className="text-sm text-slate-500 mt-1">ينتمي الحساب للكيان المحدد فقط.</p></div><button type="button" onClick={() => setShowForm(false)}><X /></button></div><div className="grid grid-cols-2 gap-3"><Field label="رمز الحساب *"><input required value={form.code} onChange={event => setForm(current => ({ ...current, code: event.target.value }))} /></Field><Field label="النوع *"><select value={form.account_type} onChange={event => setForm(current => ({ ...current, account_type: event.target.value as AccountType }))}>{ACCOUNT_TYPES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Field></div><Field label="اسم الحساب *"><input required value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} /></Field><Field label="اسم الحساب بالعربية"><input value={form.name_ar} onChange={event => setForm(current => ({ ...current, name_ar: event.target.value }))} /></Field><Field label="الحساب الأب"><select value={form.parent_id} onChange={event => setForm(current => ({ ...current, parent_id: event.target.value }))}><option value="">حساب رئيسي</option>{accounts.filter(account => account.is_active).map(account => <option key={account.id} value={account.id}>{account.code} — {account.name_ar || account.name}</option>)}</select></Field><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={form.allow_posting} onChange={event => setForm(current => ({ ...current, allow_posting: event.target.checked }))} /> يسمح بالترحيل المباشر إلى الحساب</label><div className="flex gap-3 pt-2"><button type="button" className="flex-1 border rounded-xl py-2.5 font-bold" onClick={() => setShowForm(false)}>إلغاء</button><button disabled={saving} className="flex-1 bg-emerald-600 text-white rounded-xl py-2.5 font-bold disabled:opacity-50">{saving ? 'جارٍ الحفظ…' : 'حفظ الحساب'}</button></div></form></div>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-sm font-bold text-slate-700 space-y-1"><span>{label}</span><div className="[&>input]:w-full [&>input]:rounded-xl [&>input]:border [&>input]:border-slate-200 [&>input]:px-3 [&>input]:py-2.5 [&>select]:w-full [&>select]:rounded-xl [&>select]:border [&>select]:border-slate-200 [&>select]:px-3 [&>select]:py-2.5">{children}</div></label>;
}

function Empty({ text }: { text: string }) { return <div className="py-20 text-center"><FolderTree className="mx-auto text-slate-300 mb-3" size={38} /><p className="text-slate-500">{text}</p></div>; }
function typeLabel(type: string) { return ACCOUNT_TYPES.find(item => item.value === type)?.label || type; }
