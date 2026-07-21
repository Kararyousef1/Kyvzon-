/**
 * InboxPage — مركز التفاعل الموحّد: تعليقات/رسائل/إشارات + رد + تحويل تعليق→Lead.
 */
import { useMemo, useState } from 'react';
import { Plus, X, Inbox, MessageCircle, UserPlus, Send, CheckCircle2 } from 'lucide-react';
import { useAuthStore } from '../../../core/stores';
import { socialInteractionService, type SocialInteractionInput, type InteractionType, type InteractionStatus } from '../../../services/sdk';
import { useInbox, INTERACTION_TYPE_LABEL, INTERACTION_STATUS_LABEL, PLATFORM_LABEL } from './useSocial';

const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-600 border-amber-200',
  replied: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  assigned: 'bg-sky-50 text-sky-600 border-sky-200',
  closed: 'bg-slate-100 text-slate-500 border-slate-200',
};

export default function InboxPage() {
  const { user } = useAuthStore();
  const { data: inbox, loading, reload } = useInbox();
  const [filter, setFilter] = useState<InteractionStatus | 'all'>('all');
  const [replyFor, setReplyFor] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<SocialInteractionInput>({ platform: 'instagram', interaction_type: 'comment', author_name: '', message: '' });

  const filtered = useMemo(() => inbox.filter((i) => filter === 'all' || i.status === filter), [inbox, filter]);

  const reply = async (id: string) => {
    if (!replyText.trim()) return; setBusy(true);
    try { await socialInteractionService.reply(id, replyText); setReplyFor(null); setReplyText(''); reload(); }
    catch { /* noop */ } finally { setBusy(false); }
  };
  const convert = async (id: string) => {
    setBusy(true); setMsg(null);
    try { await socialInteractionService.convertToLead(id, user?.id); setMsg('تم إنشاء عميل محتمل في CRM وتعيينه — إشعار أُرسل للموظف.'); reload(); }
    catch (e) { setMsg(e instanceof Error ? e.message : 'تعذّر التحويل'); } finally { setBusy(false); }
  };
  const addDemo = async () => {
    if (!form.message.trim()) return; setBusy(true);
    try { await socialInteractionService.createInteraction(form); setShowAdd(false); setForm({ platform: 'instagram', interaction_type: 'comment', author_name: '', message: '' }); reload(); }
    catch { /* noop */ } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <select value={filter} onChange={(e) => setFilter(e.target.value as InteractionStatus | 'all')} className="py-2 px-3 text-sm rounded-xl border border-slate-200 outline-none">
          <option value="all">الكل</option><option value="pending">معلّق</option><option value="replied">تم الرد</option><option value="assigned">مُعيّن</option><option value="closed">مغلق</option>
        </select>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 text-sm border border-slate-200 px-4 py-2 rounded-xl hover:bg-slate-50"><Plus size={15} /> تفاعل تجريبي</button>
      </div>

      {msg && <div className="text-sm text-fuchsia-700 bg-fuchsia-50 border border-fuchsia-200 rounded-xl px-4 py-2 flex items-center gap-2"><CheckCircle2 size={15} /> {msg}</div>}

      {filtered.length === 0 && !loading ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center"><Inbox size={34} className="mx-auto text-slate-300" /><p className="text-slate-500 mt-3 font-semibold">لا تفاعلات</p><p className="text-xs text-slate-400 mt-1">التعليقات والرسائل والإشارات ستظهر هنا موحّدة.</p></div>
      ) : (
        <div className="space-y-2">
          {filtered.map((i) => (
            <div key={i.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <span className="w-9 h-9 rounded-xl bg-fuchsia-50 text-fuchsia-600 flex items-center justify-center flex-shrink-0"><MessageCircle size={16} /></span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-800 text-sm">{i.author_name || 'مستخدم'}</span>
                      <span className="text-[10px] text-slate-400">{PLATFORM_LABEL[i.platform] || i.platform} · {INTERACTION_TYPE_LABEL[i.interaction_type]}</span>
                    </div>
                    <p className="text-sm text-slate-600 mt-1">{i.message}</p>
                    {i.reply_text && <p className="text-xs text-emerald-600 mt-1.5 bg-emerald-50 rounded-lg px-2 py-1 inline-block">ردّك: {i.reply_text}</p>}
                    {i.converted_lead_id && <p className="text-[11px] text-fuchsia-600 mt-1 flex items-center gap-1"><UserPlus size={11} /> حُوِّل لعميل محتمل</p>}
                  </div>
                </div>
                <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_COLOR[i.status]}`}>{INTERACTION_STATUS_LABEL[i.status]}</span>
              </div>
              <div className="flex gap-2 mt-3">
                {i.status !== 'replied' && <button onClick={() => setReplyFor(replyFor === i.id ? null : i.id)} className="text-xs border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 flex items-center gap-1"><Send size={12} /> رد</button>}
                {!i.converted_lead_id && <button onClick={() => convert(i.id)} disabled={busy} className="text-xs bg-fuchsia-50 text-fuchsia-600 border border-fuchsia-200 px-3 py-1.5 rounded-lg hover:bg-fuchsia-100 flex items-center gap-1"><UserPlus size={12} /> تحويل لعميل</button>}
              </div>
              {replyFor === i.id && (
                <div className="flex gap-2 mt-2">
                  <input value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder="اكتب ردك…" className="flex-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" />
                  <button onClick={() => reply(i.id)} disabled={busy} className="bg-fuchsia-600 text-white text-sm px-4 rounded-xl hover:bg-fuchsia-700">إرسال</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4"><h3 className="font-black text-slate-800">تفاعل تجريبي</h3><button onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button></div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-xs text-slate-500">المنصة</label><select value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none"><option value="instagram">Instagram</option><option value="facebook">Facebook</option><option value="linkedin">LinkedIn</option><option value="x">X</option></select></div>
                <div><label className="text-xs text-slate-500">النوع</label><select value={form.interaction_type} onChange={(e) => setForm({ ...form, interaction_type: e.target.value as InteractionType })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none"><option value="comment">تعليق</option><option value="dm">رسالة</option><option value="mention">إشارة</option></select></div>
              </div>
              <div><label className="text-xs text-slate-500">اسم صاحب التفاعل</label><input value={form.author_name || ''} onChange={(e) => setForm({ ...form, author_name: e.target.value })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" /></div>
              <div><label className="text-xs text-slate-500">النص</label><textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} rows={3} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" placeholder="كم تكلف الباقة السنوية؟" /></div>
            </div>
            <div className="flex gap-2 mt-5"><button onClick={addDemo} disabled={busy} className="flex-1 bg-fuchsia-600 text-white text-sm py-2.5 rounded-xl hover:bg-fuchsia-700 disabled:opacity-60">حفظ</button><button onClick={() => setShowAdd(false)} className="px-4 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">إلغاء</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
