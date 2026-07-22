/**
 * AccountsPage — قائمة الحسابات (الشركات) + إنشاء + بحث/تصفية + إثراء.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, X, Building2, Search, Sparkles } from 'lucide-react';
import {
  crmAccountService,
  type CrmAccountInput, type AccountType,
  ACCOUNT_TYPE_LABEL, ACCOUNT_TYPE_COLOR, ACCOUNT_TIER_LABEL,
} from '../../../services/sdk';
import { useAccounts } from './useContacts';
import { CRM_BASE } from '../crmCatalog';

const EMPTY: CrmAccountInput = { name: '', account_type: 'prospect', account_tier: 'smb' };

export default function AccountsPage() {
  const navigate = useNavigate();
  const { data: accounts, loading, reload } = useAccounts();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<AccountType | 'all'>('all');
  const [show, setShow] = useState(false);
  const [form, setForm] = useState<CrmAccountInput>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const filtered = useMemo(() => accounts.filter((a) =>
    (filter === 'all' || a.account_type === filter) &&
    (q.trim() === '' || a.name.toLowerCase().includes(q.toLowerCase()) || (a.industry || '').toLowerCase().includes(q.toLowerCase())),
  ), [accounts, filter, q]);

  const save = async () => {
    if (!form.name.trim()) { setErr('اسم الحساب مطلوب'); return; }
    setBusy(true); setErr(null);
    try { await crmAccountService.createAccount(form); setShow(false); setForm(EMPTY); reload(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'تعذّر الحفظ'); } finally { setBusy(false); }
  };
  const enrich = async (id: string) => {
    try { await crmAccountService.enrich(id); reload(); } catch { /* noop */ }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث بالاسم/القطاع…" className="pr-9 pl-3 py-2 text-sm rounded-xl border border-slate-200 outline-none w-56" />
          </div>
          <select value={filter} onChange={(e) => setFilter(e.target.value as AccountType | 'all')} className="py-2 px-3 text-sm rounded-xl border border-slate-200 outline-none">
            <option value="all">كل التصنيفات</option>
            {Object.entries(ACCOUNT_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <button onClick={() => setShow(true)} className="flex items-center gap-1.5 bg-cyan-600 text-white text-sm px-4 py-2 rounded-xl hover:bg-cyan-700">
          <Plus size={16} /> حساب جديد
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs">
            <tr>
              <th className="text-right px-4 py-3">الحساب</th>
              <th className="text-right px-4 py-3">القطاع</th>
              <th className="text-center px-4 py-3">التصنيف</th>
              <th className="text-center px-4 py-3">المستوى</th>
              <th className="text-center px-4 py-3">القيمة</th>
              <th className="text-center px-4 py-3">إثراء</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? <tr><td colSpan={6} className="text-center py-10 text-slate-400">جارٍ التحميل…</td></tr>
              : filtered.length === 0 ? <tr><td colSpan={6} className="text-center py-10 text-slate-400">لا حسابات — أضف أول حساب.</td></tr>
                : filtered.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50/60 cursor-pointer" onClick={() => navigate(`${CRM_BASE}/contacts/accounts/${a.id}`)}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-cyan-50 text-cyan-600 flex items-center justify-center shrink-0"><Building2 size={15} /></div>
                        <div><p className="font-semibold text-slate-800">{a.name}</p><p className="text-xs text-slate-400">{a.country || '—'}{a.city ? ` · ${a.city}` : ''}</p></div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-xs">{a.industry || '—'}</td>
                    <td className="px-4 py-3 text-center"><span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full ${ACCOUNT_TYPE_COLOR[a.account_type]}`}>{ACCOUNT_TYPE_LABEL[a.account_type]}</span></td>
                    <td className="px-4 py-3 text-center text-xs text-slate-500">{ACCOUNT_TIER_LABEL[a.account_tier]}</td>
                    <td className="px-4 py-3 text-center text-xs font-mono text-slate-700">{Number(a.lifetime_value).toLocaleString('ar')}</td>
                    <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                      {a.enrichment_status === 'none'
                        ? <button onClick={() => enrich(a.id)} className="text-xs bg-violet-50 text-violet-600 border border-violet-200 px-2 py-1 rounded-lg hover:bg-violet-100 inline-flex items-center gap-1"><Sparkles size={12} /> إثراء</button>
                        : <span className="text-[10px] text-slate-400">{a.enrichment_status === 'simulated' ? 'مُثرى (محاكاة)' : a.enrichment_status}</span>}
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      {show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShow(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4"><h3 className="font-black text-slate-800">حساب جديد</h3><button onClick={() => setShow(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button></div>
            <div className="space-y-3">
              <div><label className="text-xs text-slate-500">اسم الشركة *</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-slate-500">القطاع</label><input value={form.industry || ''} onChange={(e) => setForm({ ...form, industry: e.target.value })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" /></div>
                <div><label className="text-xs text-slate-500">عدد الموظفين</label><input type="number" value={form.employee_count ?? ''} onChange={(e) => setForm({ ...form, employee_count: e.target.value ? Number(e.target.value) : null })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-slate-500">التصنيف</label><select value={form.account_type} onChange={(e) => setForm({ ...form, account_type: e.target.value as AccountType })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none">{Object.entries(ACCOUNT_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                <div><label className="text-xs text-slate-500">المستوى</label><select value={form.account_tier} onChange={(e) => setForm({ ...form, account_tier: e.target.value as CrmAccountInput['account_tier'] })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none">{Object.entries(ACCOUNT_TIER_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-slate-500">الدولة</label><input value={form.country || ''} onChange={(e) => setForm({ ...form, country: e.target.value })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" /></div>
                <div><label className="text-xs text-slate-500">الموقع الإلكتروني</label><input value={form.website || ''} onChange={(e) => setForm({ ...form, website: e.target.value })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none font-mono" /></div>
              </div>
              <div><label className="text-xs text-slate-500">تاريخ التجديد القادم</label><input type="date" value={form.renewal_date || ''} onChange={(e) => setForm({ ...form, renewal_date: e.target.value || null })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" /></div>
              {err && <p className="text-xs text-rose-600">{err}</p>}
            </div>
            <div className="flex gap-2 mt-5"><button onClick={save} disabled={busy} className="flex-1 bg-cyan-600 text-white text-sm py-2.5 rounded-xl hover:bg-cyan-700 disabled:opacity-60">{busy ? 'جارٍ…' : 'حفظ'}</button><button onClick={() => setShow(false)} className="px-4 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">إلغاء</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
