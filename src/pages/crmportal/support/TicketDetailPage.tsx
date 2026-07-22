/**
 * TicketDetailPage — سجل التذكرة: الردود (عامة + ملاحظات داخلية) + ردود جاهزة +
 * تغيير الحالة + SLA + تقييم CSAT بعد الحل.
 */
import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowRight, Ticket, Building2, Send, Lock, Star, MessageSquareText, AlertTriangle,
} from 'lucide-react';
import {
  crmTicketService,
  type CrmTicket, type CrmTicketReply, type TicketStatus,
  TICKET_TYPE_LABEL, TICKET_PRIORITY_LABEL, TICKET_PRIORITY_COLOR, TICKET_CHANNEL_LABEL,
  TICKET_STATUS_LABEL, TICKET_STATUS_COLOR,
} from '../../../services/sdk';
import { useAsync, useCanned } from './useSupport';
import { useContactsData } from '../pipeline/useShared';
import { CRM_BASE } from '../crmCatalog';

function fmt(d: string | null): string {
  if (!d) return '—';
  try { return new Date(d).toLocaleString('ar', { dateStyle: 'medium', timeStyle: 'short' }); } catch { return d; }
}

export default function TicketDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const ticket = useAsync<CrmTicket | null>(() => crmTicketService.findById(id), null, [id]);
  const replies = useAsync<CrmTicketReply[]>(() => crmTicketService.replies(id), [], [id]);
  const canned = useCanned();
  const { accounts } = useContactsData();

  const [body, setBody] = useState('');
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [csat, setCsat] = useState(0);

  const t = ticket.data;
  const accName = t?.account_id ? accounts.find((a) => a.id === t.account_id)?.name : null;
  const reloadAll = () => { ticket.reload(); replies.reload(); };

  const sendReply = async () => {
    if (!body.trim()) return;
    setBusy(true);
    try { await crmTicketService.addReply(id, body, internal, 'agent'); setBody(''); reloadAll(); }
    catch { /* noop */ } finally { setBusy(false); }
  };
  const setStatus = async (status: TicketStatus) => { try { await crmTicketService.setStatus(id, status); reloadAll(); } catch { /* noop */ } };
  const submitCsat = async (score: number) => { setCsat(score); try { await crmTicketService.submitCsat(id, score); ticket.reload(); } catch { /* noop */ } };

  if (ticket.loading) return <div className="text-center py-16 text-slate-400">جارٍ التحميل…</div>;
  if (!t) return <div className="text-center py-16"><p className="text-slate-400">التذكرة غير موجودة.</p><Link to={`${CRM_BASE}/support/tickets`} className="text-cyan-600 text-sm mt-2 inline-block">← عودة</Link></div>;

  return (
    <div className="space-y-5">
      <button onClick={() => navigate(`${CRM_BASE}/support/tickets`)} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700"><ArrowRight size={14} /> كل التذاكر</button>

      <div className="rounded-3xl border border-slate-200 bg-white p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-cyan-50 text-cyan-600 flex items-center justify-center"><Ticket size={28} /></div>
            <div>
              <h1 className="text-xl font-black text-slate-800">{t.subject}</h1>
              <p className="text-xs text-slate-400 font-mono">{t.ticket_number} · {TICKET_TYPE_LABEL[t.ticket_type]} · {TICKET_CHANNEL_LABEL[t.channel]}</p>
              {accName && <p className="text-sm text-slate-500 flex items-center gap-1.5 mt-1"><Building2 size={13} /> {accName}</p>}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full ${TICKET_PRIORITY_COLOR[t.priority]}`}>{TICKET_PRIORITY_LABEL[t.priority]}</span>
              <select value={t.status} onChange={(e) => setStatus(e.target.value as TicketStatus)} className={`text-[10px] font-bold border px-2 py-1 rounded-full outline-none ${TICKET_STATUS_COLOR[t.status]}`}>
                {Object.entries(TICKET_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            {t.sla_breached && <span className="text-[10px] font-bold text-rose-600 flex items-center gap-1"><AlertTriangle size={11} /> كُسر الـ SLA</span>}
            {!t.sla_breached && t.sla_resolution_due && <span className="text-[10px] text-slate-400">حل قبل: {fmt(t.sla_resolution_due)}</span>}
          </div>
        </div>
        {t.description && <p className="text-sm text-slate-600 mt-3 leading-relaxed border-t border-slate-100 pt-3">{t.description}</p>}
      </div>

      {/* الردود */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="font-bold text-slate-800 text-sm mb-3 flex items-center gap-2"><MessageSquareText size={16} className="text-cyan-600" /> المحادثة</h3>
        {replies.loading ? <p className="text-slate-400 text-sm">جارٍ…</p>
          : replies.data.length === 0 ? <p className="text-slate-400 text-sm py-4 text-center">لا ردود بعد.</p>
            : <div className="space-y-3">{replies.data.map((r) => (
              <div key={r.id} className={`rounded-xl p-3 border ${r.is_internal ? 'bg-amber-50/60 border-amber-200' : r.author_type === 'customer' ? 'bg-slate-50 border-slate-200' : 'bg-cyan-50/40 border-cyan-100'}`}>
                <div className="flex items-center gap-2 mb-1">
                  {r.is_internal && <span className="text-[10px] font-bold text-amber-600 flex items-center gap-1"><Lock size={10} /> ملاحظة داخلية</span>}
                  <span className="text-[10px] text-slate-400">{r.author_type === 'customer' ? 'العميل' : r.author_type === 'system' ? 'النظام' : 'موظف'} · {fmt(r.created_at)}</span>
                </div>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{r.body}</p>
              </div>
            ))}</div>}

        {/* صندوق الرد */}
        {t.status !== 'closed' && (
          <div className="mt-4 border-t border-slate-100 pt-3">
            {canned.data.length > 0 && (
              <select onChange={(e) => { if (e.target.value) setBody((b) => b ? `${b}\n${e.target.value}` : e.target.value); e.target.value = ''; }} className="mb-2 text-xs py-1.5 px-2 rounded-lg border border-slate-200 outline-none">
                <option value="">إدراج رد جاهز…</option>
                {canned.data.map((c) => <option key={c.id} value={c.body}>{c.title}</option>)}
              </select>
            )}
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder={internal ? 'ملاحظة داخلية (لا يراها العميل)…' : 'اكتب ردك للعميل…'} className={`w-full px-3 py-2 text-sm rounded-xl border outline-none resize-none ${internal ? 'border-amber-200 bg-amber-50/40' : 'border-slate-200'}`} />
            <div className="flex items-center justify-between mt-2">
              <label className="flex items-center gap-1.5 text-xs text-slate-500"><input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} /> ملاحظة داخلية</label>
              <button onClick={sendReply} disabled={busy || !body.trim()} className="flex items-center gap-1.5 bg-cyan-600 text-white text-sm px-4 py-2 rounded-xl hover:bg-cyan-700 disabled:opacity-60"><Send size={14} /> إرسال</button>
            </div>
          </div>
        )}
      </div>

      {/* CSAT بعد الحل */}
      {(t.status === 'resolved' || t.status === 'closed') && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="font-bold text-slate-800 text-sm mb-2 flex items-center gap-2"><Star size={16} className="text-amber-500" /> تقييم رضا العميل (CSAT)</h3>
          {t.csat_score ? <p className="text-sm text-slate-600">التقييم المُسجَّل: <span className="font-black text-amber-600">{t.csat_score}/5</span>{t.csat_comment ? ` — ${t.csat_comment}` : ''}</p>
            : <div className="flex items-center gap-1">{[1, 2, 3, 4, 5].map((n) => (
              <button key={n} onClick={() => submitCsat(n)} className={`text-2xl transition-colors ${n <= csat ? 'text-amber-400' : 'text-slate-200 hover:text-amber-300'}`}>★</button>
            ))}<span className="text-xs text-slate-400 mr-2">اضغط لتسجيل تقييم العميل</span></div>}
        </div>
      )}
    </div>
  );
}
