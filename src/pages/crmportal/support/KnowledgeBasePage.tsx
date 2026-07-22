/**
 * KnowledgeBasePage — قاعدة المعرفة: مقالات + إنشاء + إحصاءات Deflection.
 */
import { useMemo, useState } from 'react';
import { Plus, X, BookOpen, Search, ThumbsUp, Eye } from 'lucide-react';
import {
  crmKbService,
  type CrmKbArticleInput, type KbArticleType,
  KB_ARTICLE_TYPE_LABEL,
} from '../../../services/sdk';
import { useKbArticles } from './useSupport';

const EMPTY: CrmKbArticleInput = { title: '', body: '', article_type: 'how_to', is_published: true };
const TYPE_COLOR: Record<KbArticleType, string> = {
  how_to: 'bg-cyan-50 text-cyan-600 border-cyan-200',
  troubleshooting: 'bg-amber-50 text-amber-600 border-amber-200',
  faq: 'bg-violet-50 text-violet-600 border-violet-200',
  release_notes: 'bg-emerald-50 text-emerald-600 border-emerald-200',
};

export default function KnowledgeBasePage() {
  const { data: articles, loading, reload } = useKbArticles();
  const [q, setQ] = useState('');
  const [show, setShow] = useState(false);
  const [form, setForm] = useState<CrmKbArticleInput>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const filtered = useMemo(() => articles.filter((a) => q.trim() === '' || a.title.toLowerCase().includes(q.toLowerCase())), [articles, q]);
  const totalDeflection = useMemo(() => articles.reduce((s, a) => s + a.deflection_count, 0), [articles]);

  const save = async () => {
    if (!form.title.trim() || !form.body.trim()) { setErr('العنوان والمحتوى مطلوبان'); return; }
    setBusy(true); setErr(null);
    try { await crmKbService.createArticle(form); setShow(false); setForm(EMPTY); reload(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'تعذّر'); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="relative">
          <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث في المقالات…" className="pr-9 pl-3 py-2 text-sm rounded-xl border border-slate-200 outline-none w-56" />
        </div>
        <button onClick={() => setShow(true)} className="flex items-center gap-1.5 bg-cyan-600 text-white text-sm px-4 py-2 rounded-xl hover:bg-cyan-700"><Plus size={16} /> مقال جديد</button>
      </div>

      {articles.length > 0 && (
        <div className="rounded-xl bg-cyan-50 border border-cyan-200 text-sm text-cyan-700 px-4 py-2.5">
          إجمالي حالات Deflection (عملاء وجدوا إجابتهم بلا تذكرة): <b>{totalDeflection}</b> — الهدف 40-60% من الاستفسارات.
        </div>
      )}

      {loading ? <p className="text-slate-400 text-sm text-center py-10">جارٍ التحميل…</p>
        : filtered.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center"><BookOpen size={32} className="mx-auto text-slate-300" /><p className="text-slate-500 mt-3 font-semibold">لا مقالات بعد</p><p className="text-slate-400 text-sm mt-1">أنشئ مقالات How-To وTroubleshooting وFAQ لتقليل التذاكر.</p></div>
          : <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{filtered.map((a) => (
            <div key={a.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full ${TYPE_COLOR[a.article_type]}`}>{KB_ARTICLE_TYPE_LABEL[a.article_type]}</span>
                {!a.is_published && <span className="text-[10px] text-slate-400">مسودة</span>}
              </div>
              <h4 className="font-black text-slate-800 mt-2">{a.title}</h4>
              <p className="text-xs text-slate-500 mt-1 line-clamp-2">{a.body}</p>
              <div className="flex items-center gap-3 mt-3 text-[11px] text-slate-400">
                <span className="flex items-center gap-1"><Eye size={12} /> {a.view_count}</span>
                <span className="flex items-center gap-1"><ThumbsUp size={12} /> {a.helpful_count}</span>
                <span>Deflection: {a.deflection_count}</span>
              </div>
            </div>
          ))}</div>}

      {show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShow(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4"><h3 className="font-black text-slate-800">مقال جديد</h3><button onClick={() => setShow(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button></div>
            <div className="space-y-3">
              <div><label className="text-xs text-slate-500">العنوان *</label><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" /></div>
              <div><label className="text-xs text-slate-500">النوع</label><select value={form.article_type} onChange={(e) => setForm({ ...form, article_type: e.target.value as KbArticleType })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none">{Object.entries(KB_ARTICLE_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              <div><label className="text-xs text-slate-500">المحتوى *</label><textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={5} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none resize-none" /></div>
              {err && <p className="text-xs text-rose-600">{err}</p>}
            </div>
            <div className="flex gap-2 mt-5"><button onClick={save} disabled={busy} className="flex-1 bg-cyan-600 text-white text-sm py-2.5 rounded-xl hover:bg-cyan-700 disabled:opacity-60">{busy ? 'جارٍ…' : 'نشر'}</button><button onClick={() => setShow(false)} className="px-4 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">إلغاء</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
