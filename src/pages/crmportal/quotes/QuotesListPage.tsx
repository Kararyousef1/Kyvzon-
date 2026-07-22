/**
 * QuotesListPage — قائمة العروض + إنشاء عرض جديد.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, X, FileSignature, Search } from 'lucide-react';
import {
  crmQuoteService,
  type CrmQuoteInput, type QuoteStatus,
  QUOTE_STATUS_LABEL, QUOTE_STATUS_COLOR,
} from '../../../services/sdk';
import { useQuotesList } from './useQuotes';
import { useContactsData } from '../pipeline/useShared';
import { CRM_BASE } from '../crmCatalog';

function genNumber() { return `Q-${Date.now().toString().slice(-6)}`; }
const EMPTY = (): CrmQuoteInput => ({ quote_number: genNumber(), title: '', discount_pct: 0, tax_pct: 15 });

export default function QuotesListPage() {
  const navigate = useNavigate();
  const { data: quotes, loading } = useQuotesList();
  const { accounts } = useContactsData();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<QuoteStatus | 'all'>('all');
  const [show, setShow] = useState(false);
  const [form, setForm] = useState<CrmQuoteInput>(EMPTY());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const accName = useMemo(() => Object.fromEntries(accounts.map((a) => [a.id, a.name])), [accounts]);
  const filtered = useMemo(() => quotes.filter((x) =>
    (filter === 'all' || x.status === filter) &&
    (q.trim() === '' || x.title.toLowerCase().includes(q.toLowerCase()) || x.quote_number.toLowerCase().includes(q.toLowerCase())),
  ), [quotes, filter, q]);

  const save = async () => {
    if (!form.title.trim()) { setErr('عنوان العرض مطلوب'); return; }
    setBusy(true); setErr(null);
    try { const created = await crmQuoteService.createQuote(form); setShow(false); setForm(EMPTY()); navigate(`${CRM_BASE}/quotes/detail/${created.id}`); }
    catch (e) { setErr(e instanceof Error ? e.message : 'تعذّر الحفظ'); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث بالعنوان/الرقم…" className="pr-9 pl-3 py-2 text-sm rounded-xl border border-slate-200 outline-none w-56" />
          </div>
          <select value={filter} onChange={(e) => setFilter(e.target.value as QuoteStatus | 'all')} className="py-2 px-3 text-sm rounded-xl border border-slate-200 outline-none">
            <option value="all">كل الحالات</option>
            {Object.entries(QUOTE_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <button onClick={() => { setForm(EMPTY()); setShow(true); }} className="flex items-center gap-1.5 bg-cyan-600 text-white text-sm px-4 py-2 rounded-xl hover:bg-cyan-700"><Plus size={16} /> عرض جديد</button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs">
            <tr><th className="text-right px-4 py-3">العرض</th><th className="text-right px-4 py-3">الحساب</th><th className="text-center px-4 py-3">الإجمالي</th><th className="text-center px-4 py-3">الخصم</th><th className="text-center px-4 py-3">الحالة</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? <tr><td colSpan={5} className="text-center py-10 text-slate-400">جارٍ التحميل…</td></tr>
              : filtered.length === 0 ? <tr><td colSpan={5} className="text-center py-10 text-slate-400">لا عروض.</td></tr>
                : filtered.map((x) => (
                  <tr key={x.id} className="hover:bg-slate-50/60 cursor-pointer" onClick={() => navigate(`${CRM_BASE}/quotes/detail/${x.id}`)}>
                    <td className="px-4 py-3"><div className="flex items-center gap-2"><div className="w-8 h-8 rounded-lg bg-cyan-50 text-cyan-600 flex items-center justify-center shrink-0"><FileSignature size={15} /></div><div><p className="font-semibold text-slate-800">{x.title}</p><p className="text-xs text-slate-400 font-mono">{x.quote_number}</p></div></div></td>
                    <td className="px-4 py-3 text-slate-600 text-xs">{x.account_id ? accName[x.account_id] || '—' : '—'}</td>
                    <td className="px-4 py-3 text-center font-mono text-slate-700">{Number(x.total).toLocaleString('ar')}</td>
                    <td className="px-4 py-3 text-center text-xs text-slate-500">{x.discount_pct}%</td>
                    <td className="px-4 py-3 text-center"><span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full ${QUOTE_STATUS_COLOR[x.status]}`}>{QUOTE_STATUS_LABEL[x.status]}</span></td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      {show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShow(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4"><h3 className="font-black text-slate-800">عرض جديد</h3><button onClick={() => setShow(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button></div>
            <div className="space-y-3">
              <div><label className="text-xs text-slate-500">عنوان العرض *</label><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="عرض Kyvzon Enterprise — النخبة" className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" /></div>
              <div><label className="text-xs text-slate-500">الحساب</label><select value={form.account_id || ''} onChange={(e) => setForm({ ...form, account_id: e.target.value || null })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none"><option value="">— بدون حساب —</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-slate-500">رقم العرض</label><input value={form.quote_number} onChange={(e) => setForm({ ...form, quote_number: e.target.value })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none font-mono" /></div>
                <div><label className="text-xs text-slate-500">صلاحية حتى</label><input type="date" value={form.valid_until || ''} onChange={(e) => setForm({ ...form, valid_until: e.target.value || null })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" /></div>
              </div>
              {err && <p className="text-xs text-rose-600">{err}</p>}
            </div>
            <div className="flex gap-2 mt-5"><button onClick={save} disabled={busy} className="flex-1 bg-cyan-600 text-white text-sm py-2.5 rounded-xl hover:bg-cyan-700 disabled:opacity-60">{busy ? 'جارٍ…' : 'إنشاء وتحرير'}</button><button onClick={() => setShow(false)} className="px-4 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">إلغاء</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
