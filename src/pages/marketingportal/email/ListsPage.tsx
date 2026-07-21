/**
 * ListsPage — إدارة القوائم والمشتركين + Double Opt-in + نظافة القائمة.
 */
import { useMemo, useState } from 'react';
import { Plus, X, Users, MailCheck, Sparkles } from 'lucide-react';
import {
  emailListService, emailSubscriberService,
  type EmailListInput, type EmailSubscriberInput, type SubscriberStatus,
} from '../../../services/sdk';
import { useLists, useSubscribers, SUBSCRIBER_STATUS_LABEL, SUBSCRIBER_STATUS_COLOR } from './useEmail';

export default function ListsPage() {
  const { data: lists, loading: lLoad, reload: reloadLists } = useLists();
  const { data: subs, loading: sLoad, reload: reloadSubs } = useSubscribers();
  const [tab, setTab] = useState<'subscribers' | 'lists'>('subscribers');
  const [filter, setFilter] = useState<SubscriberStatus | 'all'>('all');
  const [busy, setBusy] = useState(false);
  const [showSub, setShowSub] = useState(false);
  const [showList, setShowList] = useState(false);
  const [subForm, setSubForm] = useState<EmailSubscriberInput & { doubleOptIn: boolean }>({ email: '', full_name: '', doubleOptIn: true });
  const [listForm, setListForm] = useState<EmailListInput>({ name: '', opt_in_type: 'double' });
  const [err, setErr] = useState<string | null>(null);

  const filtered = useMemo(() => subs.filter((s) => filter === 'all' || s.status === filter), [subs, filter]);
  const staleCount = useMemo(() => subs.filter((s) => s.status === 'confirmed' && (!s.last_engaged_at || Date.now() - new Date(s.last_engaged_at).getTime() > 180 * 86400000)).length, [subs]);

  const addSub = async () => {
    if (!subForm.email.trim()) { setErr('البريد مطلوب'); return; }
    setBusy(true); setErr(null);
    try {
      const { doubleOptIn, ...rest } = subForm;
      await emailSubscriberService.subscribe(rest, doubleOptIn);
      setShowSub(false); setSubForm({ email: '', full_name: '', doubleOptIn: true }); reloadSubs();
    } catch (e) { setErr(e instanceof Error ? e.message : 'تعذّر الحفظ'); } finally { setBusy(false); }
  };
  const addList = async () => {
    if (!listForm.name.trim()) { setErr('اسم القائمة مطلوب'); return; }
    setBusy(true); setErr(null);
    try { await emailListService.createList(listForm); setShowList(false); setListForm({ name: '', opt_in_type: 'double' }); reloadLists(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'تعذّر الحفظ'); } finally { setBusy(false); }
  };
  // محاكاة تأكيد Double Opt-in (يُحاكي ضغط العميل على رابط التأكيد)
  const confirmSub = async (token: string | null) => {
    if (!token) return; setBusy(true);
    try { await emailSubscriberService.confirm(token); reloadSubs(); } catch { /* noop */ } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-2">
          <button onClick={() => setTab('subscribers')} className={`text-sm px-4 py-2 rounded-xl ${tab === 'subscribers' ? 'bg-fuchsia-600 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>المشتركون ({subs.length})</button>
          <button onClick={() => setTab('lists')} className={`text-sm px-4 py-2 rounded-xl ${tab === 'lists' ? 'bg-fuchsia-600 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>القوائم ({lists.length})</button>
        </div>
        <button onClick={() => (tab === 'subscribers' ? setShowSub(true) : setShowList(true))} className="flex items-center gap-1.5 bg-fuchsia-600 text-white text-sm px-4 py-2 rounded-xl hover:bg-fuchsia-700">
          <Plus size={16} /> {tab === 'subscribers' ? 'مشترك' : 'قائمة'}
        </button>
      </div>

      {tab === 'subscribers' ? (
        <>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <select value={filter} onChange={(e) => setFilter(e.target.value as SubscriberStatus | 'all')} className="py-2 px-3 text-sm rounded-xl border border-slate-200 outline-none">
              <option value="all">كل الحالات</option>
              <option value="pending">بانتظار التأكيد</option>
              <option value="confirmed">مؤكّد</option>
              <option value="unsubscribed">ملغى</option>
              <option value="bounced">مرتد</option>
            </select>
            {staleCount > 0 && (
              <span className="flex items-center gap-1.5 text-xs bg-amber-50 text-amber-600 border border-amber-200 px-3 py-1.5 rounded-lg">
                <Sparkles size={13} /> {staleCount} مشترك خامل (يحتاج تنظيفاً/إعادة اشتباك)
              </span>
            )}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs">
                <tr><th className="text-right px-4 py-3">المشترك</th><th className="text-right px-4 py-3">الشركة/المسمى</th><th className="text-center px-4 py-3">الحالة</th><th className="text-center px-4 py-3">إجراء</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sLoad ? <tr><td colSpan={4} className="text-center py-10 text-slate-400">جارٍ التحميل…</td></tr>
                  : filtered.length === 0 ? <tr><td colSpan={4} className="text-center py-10 text-slate-400">لا مشتركين — أضف أول مشترك.</td></tr>
                    : filtered.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50/60">
                        <td className="px-4 py-3"><p className="font-semibold text-slate-800">{s.full_name || '—'}</p><p className="text-xs text-slate-400">{s.email}</p></td>
                        <td className="px-4 py-3 text-slate-600 text-xs">{s.job_title || '—'}{s.industry ? ` · ${s.industry}` : ''}</td>
                        <td className="px-4 py-3 text-center"><span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full ${SUBSCRIBER_STATUS_COLOR[s.status]}`}>{SUBSCRIBER_STATUS_LABEL[s.status]}</span></td>
                        <td className="px-4 py-3 text-center">
                          {s.status === 'pending' && s.confirm_token
                            ? <button onClick={() => confirmSub(s.confirm_token)} disabled={busy} className="text-xs bg-emerald-50 text-emerald-600 border border-emerald-200 px-2 py-1 rounded-lg hover:bg-emerald-100 inline-flex items-center gap-1"><MailCheck size={12} /> محاكاة التأكيد</button>
                            : <span className="text-xs text-slate-300">—</span>}
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {lLoad ? <p className="text-slate-400 text-sm">جارٍ التحميل…</p>
            : lists.length === 0 ? <div className="col-span-full rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center"><Users size={32} className="mx-auto text-slate-300" /><p className="text-slate-500 mt-3 font-semibold">لا قوائم بعد</p></div>
              : lists.map((l) => (
                <div key={l.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <h3 className="font-black text-slate-800">{l.name}</h3>
                  <p className="text-xs text-slate-500 mt-1">{l.description || '—'}</p>
                  <span className="inline-block mt-3 text-[10px] font-bold bg-fuchsia-50 text-fuchsia-600 border border-fuchsia-200 px-2 py-0.5 rounded-full">{l.opt_in_type === 'double' ? 'تأكيد مزدوج' : 'تأكيد مفرد'}</span>
                </div>
              ))}
        </div>
      )}

      {showSub && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowSub(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4"><h3 className="font-black text-slate-800">مشترك جديد</h3><button onClick={() => setShowSub(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button></div>
            <div className="space-y-3">
              <div><label className="text-xs text-slate-500">البريد *</label><input value={subForm.email} onChange={(e) => setSubForm({ ...subForm, email: e.target.value })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none font-mono" /></div>
              <div><label className="text-xs text-slate-500">الاسم</label><input value={subForm.full_name || ''} onChange={(e) => setSubForm({ ...subForm, full_name: e.target.value })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" /></div>
              <div><label className="text-xs text-slate-500">المسمى الوظيفي</label><input value={subForm.job_title || ''} onChange={(e) => setSubForm({ ...subForm, job_title: e.target.value })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" /></div>
              <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={subForm.doubleOptIn} onChange={(e) => setSubForm({ ...subForm, doubleOptIn: e.target.checked })} /> تأكيد مزدوج (Double Opt-in) — موصى به</label>
              {err && <p className="text-xs text-rose-600">{err}</p>}
            </div>
            <div className="flex gap-2 mt-5"><button onClick={addSub} disabled={busy} className="flex-1 bg-fuchsia-600 text-white text-sm py-2.5 rounded-xl hover:bg-fuchsia-700 disabled:opacity-60">{busy ? 'جارٍ…' : 'حفظ'}</button><button onClick={() => setShowSub(false)} className="px-4 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">إلغاء</button></div>
          </div>
        </div>
      )}

      {showList && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowList(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4"><h3 className="font-black text-slate-800">قائمة جديدة</h3><button onClick={() => setShowList(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button></div>
            <div className="space-y-3">
              <div><label className="text-xs text-slate-500">الاسم *</label><input value={listForm.name} onChange={(e) => setListForm({ ...listForm, name: e.target.value })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" /></div>
              <div><label className="text-xs text-slate-500">الوصف</label><input value={listForm.description || ''} onChange={(e) => setListForm({ ...listForm, description: e.target.value })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" /></div>
              <div><label className="text-xs text-slate-500">نوع الموافقة</label><select value={listForm.opt_in_type} onChange={(e) => setListForm({ ...listForm, opt_in_type: e.target.value as 'single' | 'double' })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none"><option value="double">تأكيد مزدوج (موصى به)</option><option value="single">تأكيد مفرد</option></select></div>
              {err && <p className="text-xs text-rose-600">{err}</p>}
            </div>
            <div className="flex gap-2 mt-5"><button onClick={addList} disabled={busy} className="flex-1 bg-fuchsia-600 text-white text-sm py-2.5 rounded-xl hover:bg-fuchsia-700 disabled:opacity-60">{busy ? 'جارٍ…' : 'حفظ'}</button><button onClick={() => setShowList(false)} className="px-4 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">إلغاء</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
