/**
 * ListeningPage — الاستماع الاجتماعي: مصطلحات (علامة/كلمة/منافس) + نتائج (mentions) + فرص.
 */
import { useState } from 'react';
import { Plus, X, Ear, TrendingUp, AlertCircle } from 'lucide-react';
import { socialListeningService, type TermType } from '../../../services/sdk';
import { useTerms, useMentions, PLATFORM_LABEL } from './useSocial';

const TERM_TYPE_LABEL: Record<string, string> = { brand: 'العلامة التجارية', keyword: 'كلمة مفتاحية', competitor: 'منافس' };
const TERM_COLOR: Record<string, string> = {
  brand: 'bg-fuchsia-50 text-fuchsia-600 border-fuchsia-200',
  keyword: 'bg-sky-50 text-sky-600 border-sky-200',
  competitor: 'bg-amber-50 text-amber-600 border-amber-200',
};
const SENTIMENT: Record<string, { label: string; cls: string }> = {
  positive: { label: 'إيجابي', cls: 'text-emerald-600' },
  neutral: { label: 'محايد', cls: 'text-slate-500' },
  negative: { label: 'سلبي', cls: 'text-rose-600' },
};

export default function ListeningPage() {
  const { data: terms, loading: tLoad, reload: reloadTerms } = useTerms();
  const { data: mentions, loading: mLoad, reload: reloadMentions } = useMentions();
  const [showAdd, setShowAdd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<{ term: string; type: TermType }>({ term: '', type: 'keyword' });

  const addTerm = async () => {
    if (!form.term.trim()) return; setBusy(true);
    try { await socialListeningService.createTerm(form.term, form.type); setShowAdd(false); setForm({ term: '', type: 'keyword' }); reloadTerms(); }
    catch { /* noop */ } finally { setBusy(false); }
  };
  const markOpportunity = async (id: string) => { setBusy(true); try { await socialListeningService.convertMentionToLead(id); reloadMentions(); } catch { /* noop */ } finally { setBusy(false); } };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2"><Ear size={18} className="text-fuchsia-600" /><h2 className="font-black text-slate-800">مصطلحات الرصد</h2></div>
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 bg-fuchsia-600 text-white text-sm px-4 py-2 rounded-xl hover:bg-fuchsia-700"><Plus size={16} /> مصطلح</button>
        </div>
        {tLoad ? <p className="text-slate-400 text-sm">جارٍ التحميل…</p>
          : terms.length === 0 ? <p className="text-slate-400 text-sm">لا مصطلحات — أضف علامتك التجارية أو منافساً لرصده.</p>
            : <div className="flex flex-wrap gap-2">
                {terms.map((t) => <span key={t.id} className={`text-xs font-semibold border px-3 py-1.5 rounded-full ${TERM_COLOR[t.term_type]}`}>{t.term} <span className="opacity-60">· {TERM_TYPE_LABEL[t.term_type]}</span></span>)}
              </div>}
      </section>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2"><TrendingUp size={16} className="text-fuchsia-600" /><h3 className="font-black text-slate-800">الإشارات المرصودة (Mentions)</h3></div>
        {mLoad ? <p className="text-center text-slate-400 py-8 text-sm">جارٍ التحميل…</p>
          : mentions.length === 0 ? (
            <div className="p-10 text-center"><Ear size={30} className="mx-auto text-slate-300" /><p className="text-slate-500 mt-3 font-semibold">لا إشارات مرصودة بعد</p><p className="text-xs text-slate-400 mt-1">عند الربط الفعلي بالمنصات، تظهر هنا كل الإشارات لمصطلحاتك — حتى دون ذكر حسابك.</p></div>
          ) : (
            <div className="divide-y divide-slate-100">
              {mentions.map((m) => (
                <div key={m.id} className="p-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2"><span className="font-semibold text-slate-800 text-sm">{m.author_name || 'مستخدم'}</span><span className="text-[10px] text-slate-400">{PLATFORM_LABEL[m.platform] || m.platform}</span><span className={`text-[11px] font-bold ${SENTIMENT[m.sentiment].cls}`}>· {SENTIMENT[m.sentiment].label}</span></div>
                    <p className="text-sm text-slate-600 mt-1">{m.content}</p>
                  </div>
                  {m.is_opportunity
                    ? <span className="text-emerald-600 text-xs font-bold flex items-center gap-1 flex-shrink-0"><AlertCircle size={13} /> فرصة</span>
                    : <button onClick={() => markOpportunity(m.id)} disabled={busy} className="text-xs bg-fuchsia-50 text-fuchsia-600 border border-fuchsia-200 px-3 py-1.5 rounded-lg hover:bg-fuchsia-100 flex-shrink-0">تعليم كفرصة</button>}
                </div>
              ))}
            </div>
          )}
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4"><h3 className="font-black text-slate-800">مصطلح رصد</h3><button onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button></div>
            <div className="space-y-3">
              <div><label className="text-xs text-slate-500">المصطلح</label><input value={form.term} onChange={(e) => setForm({ ...form, term: e.target.value })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" placeholder="Kyvzon / برنامج HR / اسم منافس" /></div>
              <div><label className="text-xs text-slate-500">النوع</label><select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as TermType })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none"><option value="keyword">كلمة مفتاحية</option><option value="brand">العلامة التجارية</option><option value="competitor">منافس</option></select></div>
            </div>
            <div className="flex gap-2 mt-5"><button onClick={addTerm} disabled={busy} className="flex-1 bg-fuchsia-600 text-white text-sm py-2.5 rounded-xl hover:bg-fuchsia-700 disabled:opacity-60">حفظ</button><button onClick={() => setShowAdd(false)} className="px-4 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">إلغاء</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
