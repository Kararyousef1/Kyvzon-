/**
 * PeoplePage — قائمة جهات الاتصال (الأشخاص) + إنشاء + بحث/تصفية بالحرارة.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, X, User, Search, Flame } from 'lucide-react';
import {
  crmContactService,
  type CrmContactInput, type ContactTemperature, type DecisionRole,
  TEMPERATURE_LABEL, TEMPERATURE_COLOR, DECISION_ROLE_LABEL,
} from '../../../services/sdk';
import { useContactsList, useAccounts } from './useContacts';
import { CRM_BASE } from '../crmCatalog';

const EMPTY: CrmContactInput = { first_name: '', decision_role: 'user', temperature: 'cold' };

export default function PeoplePage() {
  const navigate = useNavigate();
  const { data: contacts, loading, reload } = useContactsList();
  const { data: accounts } = useAccounts();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<ContactTemperature | 'all'>('all');
  const [show, setShow] = useState(false);
  const [form, setForm] = useState<CrmContactInput>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const accName = useMemo(() => Object.fromEntries(accounts.map((a) => [a.id, a.name])), [accounts]);
  const filtered = useMemo(() => contacts.filter((c) =>
    (filter === 'all' || c.temperature === filter) &&
    (q.trim() === '' || c.full_name.toLowerCase().includes(q.toLowerCase()) || (c.email || '').toLowerCase().includes(q.toLowerCase())),
  ), [contacts, filter, q]);

  const save = async () => {
    if (!form.first_name.trim()) { setErr('الاسم الأول مطلوب'); return; }
    setBusy(true); setErr(null);
    try { await crmContactService.createContact(form); setShow(false); setForm(EMPTY); reload(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'تعذّر الحفظ'); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث بالاسم/البريد…" className="pr-9 pl-3 py-2 text-sm rounded-xl border border-slate-200 outline-none w-56" />
          </div>
          <select value={filter} onChange={(e) => setFilter(e.target.value as ContactTemperature | 'all')} className="py-2 px-3 text-sm rounded-xl border border-slate-200 outline-none">
            <option value="all">كل الحرارات</option>
            {Object.entries(TEMPERATURE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <button onClick={() => setShow(true)} className="flex items-center gap-1.5 bg-cyan-600 text-white text-sm px-4 py-2 rounded-xl hover:bg-cyan-700">
          <Plus size={16} /> جهة اتصال جديدة
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs">
            <tr>
              <th className="text-right px-4 py-3">الاسم</th>
              <th className="text-right px-4 py-3">الحساب</th>
              <th className="text-center px-4 py-3">سلطة القرار</th>
              <th className="text-center px-4 py-3">الحرارة</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? <tr><td colSpan={4} className="text-center py-10 text-slate-400">جارٍ التحميل…</td></tr>
              : filtered.length === 0 ? <tr><td colSpan={4} className="text-center py-10 text-slate-400">لا جهات اتصال — أضف أول جهة.</td></tr>
                : filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/60 cursor-pointer" onClick={() => navigate(`${CRM_BASE}/contacts/people/${c.id}`)}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0"><User size={15} /></div>
                        <div><p className="font-semibold text-slate-800">{c.full_name}</p><p className="text-xs text-slate-400">{c.job_title || '—'}{c.email ? ` · ${c.email}` : ''}</p></div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-xs">{c.account_id ? (accName[c.account_id] || '—') : '—'}</td>
                    <td className="px-4 py-3 text-center text-xs text-slate-500">{DECISION_ROLE_LABEL[c.decision_role]}</td>
                    <td className="px-4 py-3 text-center"><span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${TEMPERATURE_COLOR[c.temperature]}`}>{c.temperature === 'hot' && <Flame size={10} />}{TEMPERATURE_LABEL[c.temperature]}</span></td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      {show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShow(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4"><h3 className="font-black text-slate-800">جهة اتصال جديدة</h3><button onClick={() => setShow(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button></div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-slate-500">الاسم الأول *</label><input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" /></div>
                <div><label className="text-xs text-slate-500">الاسم الأخير</label><input value={form.last_name || ''} onChange={(e) => setForm({ ...form, last_name: e.target.value })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" /></div>
              </div>
              <div><label className="text-xs text-slate-500">الحساب (الشركة)</label><select value={form.account_id || ''} onChange={(e) => setForm({ ...form, account_id: e.target.value || null })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none"><option value="">— بدون حساب —</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-slate-500">المسمى الوظيفي</label><input value={form.job_title || ''} onChange={(e) => setForm({ ...form, job_title: e.target.value })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" /></div>
                <div><label className="text-xs text-slate-500">القسم</label><input value={form.department || ''} onChange={(e) => setForm({ ...form, department: e.target.value })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-slate-500">البريد</label><input value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none font-mono" /></div>
                <div><label className="text-xs text-slate-500">الجوال</label><input value={form.mobile || ''} onChange={(e) => setForm({ ...form, mobile: e.target.value })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none font-mono" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-slate-500">سلطة القرار</label><select value={form.decision_role} onChange={(e) => setForm({ ...form, decision_role: e.target.value as DecisionRole })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none">{Object.entries(DECISION_ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                <div><label className="text-xs text-slate-500">الحرارة</label><select value={form.temperature} onChange={(e) => setForm({ ...form, temperature: e.target.value as ContactTemperature })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none">{Object.entries(TEMPERATURE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              </div>
              <div><label className="text-xs text-slate-500">مصدر الموافقة (GDPR)</label><input value={form.consent_source || ''} onChange={(e) => setForm({ ...form, consent_source: e.target.value })} placeholder="مثال: نموذج الموقع بتاريخ 2026/07/20" className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" /></div>
              {err && <p className="text-xs text-rose-600">{err}</p>}
            </div>
            <div className="flex gap-2 mt-5"><button onClick={save} disabled={busy} className="flex-1 bg-cyan-600 text-white text-sm py-2.5 rounded-xl hover:bg-cyan-700 disabled:opacity-60">{busy ? 'جارٍ…' : 'حفظ'}</button><button onClick={() => setShow(false)} className="px-4 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">إلغاء</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
