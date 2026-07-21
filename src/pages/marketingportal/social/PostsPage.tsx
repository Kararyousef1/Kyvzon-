/**
 * PostsPage — منشئ المنشورات: نص + رابط + اختيار المنصات + معاينة حية + جدولة/نشر + UTM تلقائي.
 */
import { useState } from 'react';
import { Plus, X, PenSquare, Eye, Send } from 'lucide-react';
import {
  socialPostService, socialUtmService,
  type SocialPostInput, type ContentType, type SocialAccount,
} from '../../../services/sdk';
import { usePosts, useAccounts, POST_STATUS_LABEL, POST_STATUS_COLOR, CONTENT_TYPE_LABEL, PLATFORM_LABEL } from './useSocial';

const CONTENT_TYPES: ContentType[] = ['post', 'reel', 'story', 'case_study', 'educational', 'infographic', 'poll'];

export default function PostsPage() {
  const { data: posts, loading, reload } = usePosts();
  const { data: accounts } = useAccounts();
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selectedAccts, setSelectedAccts] = useState<string[]>([]);
  const [form, setForm] = useState<SocialPostInput & { campaign_name: string }>({ content: '', link_url: '', content_type: 'post', campaign_name: '', status: 'scheduled' });
  const [err, setErr] = useState<string | null>(null);

  const toggleAcct = (id: string) => setSelectedAccts((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);

  const create = async () => {
    if (!form.content.trim()) { setErr('محتوى المنشور مطلوب'); return; }
    if (selectedAccts.length === 0) { setErr('اختر منصة واحدة على الأقل'); return; }
    setBusy(true); setErr(null);
    try {
      const post = await socialPostService.createPost(form);
      // أهداف النشر لكل حساب مختار (نشر موحّد)
      for (const accId of selectedAccts) {
        const acc = accounts.find((a) => a.id === accId);
        if (!acc) continue;
        await socialPostService.addTarget({ post_id: post.id, account_id: accId, platform: acc.platform, status: 'scheduled' });
        // توليد UTM تلقائي إن كان هناك رابط
        if (form.link_url) {
          const url = await socialUtmService.buildUrl({ base: form.link_url, source: acc.platform, campaign: form.campaign_name || undefined, content: form.content_type });
          await socialUtmService.createLink({ post_id: post.id, base_url: form.link_url, utm_source: acc.platform, utm_campaign: form.campaign_name || null, utm_content: form.content_type, full_url: url });
        }
      }
      setShowCreate(false); setSelectedAccts([]); setForm({ content: '', link_url: '', content_type: 'post', campaign_name: '', status: 'scheduled' }); reload();
    } catch (e) { setErr(e instanceof Error ? e.message : 'تعذّر الإنشاء'); } finally { setBusy(false); }
  };
  const publish = async (id: string) => { setBusy(true); try { await socialPostService.publish(id); reload(); } catch { /* noop */ } finally { setBusy(false); } };

  const PreviewCard = ({ acc }: { acc: SocialAccount }) => (
    <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
      <div className="flex items-center gap-2 p-2.5 border-b border-slate-100 bg-slate-50">
        <span className="w-7 h-7 rounded-full bg-fuchsia-100 text-fuchsia-600 text-xs font-bold flex items-center justify-center">{PLATFORM_LABEL[acc.platform].slice(0, 2)}</span>
        <span className="text-xs font-semibold text-slate-700">{acc.account_name}</span>
        <span className="text-[10px] text-slate-400 mr-auto">{PLATFORM_LABEL[acc.platform]}</span>
      </div>
      <div className="p-3">
        <p className="text-sm text-slate-700 whitespace-pre-wrap break-words">{form.content || 'محتوى المنشور…'}</p>
        {form.link_url && <p className="text-xs text-sky-600 mt-2 truncate">{form.link_url}</p>}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{loading ? 'جارٍ التحميل…' : `${posts.length} منشور`}</p>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 bg-fuchsia-600 text-white text-sm px-4 py-2 rounded-xl hover:bg-fuchsia-700"><Plus size={16} /> منشور جديد</button>
      </div>

      {posts.length === 0 && !loading ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center"><PenSquare size={34} className="mx-auto text-slate-300" /><p className="text-slate-500 mt-3 font-semibold">لا منشورات بعد</p></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {posts.map((p) => (
            <div key={p.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full ${POST_STATUS_COLOR[p.status]}`}>{POST_STATUS_LABEL[p.status]}</span>
                <span className="text-[10px] text-slate-400">{CONTENT_TYPE_LABEL[p.content_type]}</span>
              </div>
              <p className="text-sm text-slate-700 mt-2 line-clamp-3 min-h-[3.5rem]">{p.content}</p>
              {p.scheduled_at && <p className="text-[11px] text-slate-400 mt-1">🗓️ {new Date(p.scheduled_at).toLocaleString('ar')}</p>}
              {p.status !== 'published' && <button onClick={() => publish(p.id)} disabled={busy} className="w-full mt-3 text-sm bg-fuchsia-600 text-white rounded-xl py-2 hover:bg-fuchsia-700 flex items-center justify-center gap-1.5"><Send size={14} /> نشر (محاكاة)</button>}
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-2xl w-full max-w-3xl p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4"><h3 className="font-black text-slate-800">منشور جديد</h3><button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button></div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* المحرّر */}
              <div className="space-y-3">
                <div><label className="text-xs text-slate-500">المحتوى *</label><textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} rows={5} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" /></div>
                <div><label className="text-xs text-slate-500">الرابط (يُولَّد له UTM تلقائياً)</label><input value={form.link_url || ''} onChange={(e) => setForm({ ...form, link_url: e.target.value })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none font-mono" placeholder="https://kyvzon.com/pricing" /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="text-xs text-slate-500">نوع المحتوى</label><select value={form.content_type} onChange={(e) => setForm({ ...form, content_type: e.target.value as ContentType })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none">{CONTENT_TYPES.map((c) => <option key={c} value={c}>{CONTENT_TYPE_LABEL[c]}</option>)}</select></div>
                  <div><label className="text-xs text-slate-500">اسم الحملة (UTM)</label><input value={form.campaign_name} onChange={(e) => setForm({ ...form, campaign_name: e.target.value })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none font-mono" placeholder="q1-2026" /></div>
                </div>
                <div><label className="text-xs text-slate-500">جدولة</label><input type="datetime-local" value={form.scheduled_at || ''} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value || null })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" /></div>
                <div>
                  <label className="text-xs text-slate-500">المنصات *</label>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {accounts.length === 0 ? <span className="text-xs text-slate-400">لا حسابات — اربط حساباً أولاً.</span>
                      : accounts.map((a) => (
                        <button key={a.id} onClick={() => toggleAcct(a.id)} className={`text-xs px-3 py-1.5 rounded-lg border ${selectedAccts.includes(a.id) ? 'bg-fuchsia-600 text-white border-fuchsia-600' : 'border-slate-200 text-slate-600'}`}>{a.account_name}</button>
                      ))}
                  </div>
                </div>
                {err && <p className="text-xs text-rose-600">{err}</p>}
              </div>
              {/* المعاينة الحية */}
              <div>
                <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-2"><Eye size={14} /> معاينة حية</div>
                <div className="space-y-2">
                  {selectedAccts.length === 0 ? <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-400">اختر منصات لعرض المعاينة</div>
                    : selectedAccts.map((id) => { const acc = accounts.find((a) => a.id === id); return acc ? <PreviewCard key={id} acc={acc} /> : null; })}
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-5"><button onClick={create} disabled={busy} className="flex-1 bg-fuchsia-600 text-white text-sm py-2.5 rounded-xl hover:bg-fuchsia-700 disabled:opacity-60">{busy ? 'جارٍ…' : 'حفظ المنشور'}</button><button onClick={() => setShowCreate(false)} className="px-4 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">إلغاء</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
