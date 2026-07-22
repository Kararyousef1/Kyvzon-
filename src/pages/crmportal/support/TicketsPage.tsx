/**
 * TicketsPage — قائمة التذاكر + إنشاء تذكرة (Omnichannel) + تصفية بالحالة/الأولوية.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, X, Ticket, Search, AlertTriangle } from 'lucide-react';
import {
  crmTicketService, crmSlaService,
  type CrmTicket, type TicketType, type TicketPriority, type TicketChannel, type TicketStatus,
  TICKET_TYPE_LABEL, TICKET_PRIORITY_LABEL, TICKET_PRIORITY_COLOR, TICKET_CHANNEL_LABEL,
  TICKET_STATUS_LABEL, TICKET_STATUS_COLOR,
} from '../../../services/sdk';
import { useTickets } from './useSupport';
import { useContactsData } from '../pipeline/useShared';
import { CRM_BASE } from '../crmCatalog';

interface Form { subject: string; description: string; account_id: string; ticket_type: TicketType; priority: TicketPriority; channel: TicketChannel; }
const EMPTY: Form = { subject: '', description: '', account_id: '', ticket_type: 'technical', priority: 'p3', channel: 'email' };

function slaLeft(t: CrmTicket): { label: string; danger: boolean } | null {
  if (t.status === 'resolved' || t.status === 'closed' || !t.sla_resolution_due) return null;
  const diff = new Date(t.sla_resolution_due).getTime() - Date.now();
  if (diff < 0) return { label: 'تجاوز SLA', danger: true };
  const h = Math.floor(diff / 3600000);
  return { label: h < 1 ? '< ساعة' : `${h} ساعة`, danger: h < 2 };
}

export default function TicketsPage() {
  const navigate = useNavigate();
  const { data: tickets, loading, reload } = useTickets();
  const { accounts } = useContactsData();
  const [q, setQ] = useState('');
  const [fStatus, setFStatus] = useState<TicketStatus | 'all'>('all');
  const [fPriority, setFPriority] = useState<TicketPriority | 'all'>('all');
  const [show, setShow] = useState(false);
  const [form, setForm] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const accName = useMemo(() => Object.fromEntries(accounts.map((a) => [a.id, a.name])), [accounts]);
  const filtered = useMemo(() => tickets.filter((t) =>
    (fStatus === 'all' || t.status === fStatus) &&
    (fPriority === 'all' || t.priority === fPriority) &&
    (q.trim() === '' || t.subject.toLowerCase().includes(q.toLowerCase()) || t.ticket_number.toLowerCase().includes(q.toLowerCase())),
  ), [tickets, fStatus, fPriority, q]);

  const save = async () => {
    if (!form.subject.trim()) { setErr('الموضوع مطلوب'); return; }
    setBusy(true); setErr(null);
    try {
      // نضمن وجود سياسات SLA (تهيئة صامتة أول مرة)
      await crmSlaService.seedDefault().catch(() => {});
      const id = await crmTicketService.createTicket({
        subject: form.subject, description: form.description || null,
        accountId: form.account_id || null, type: form.ticket_type, priority: form.priority, channel: form.channel,
      });
      setShow(false); setForm(EMPTY); reload(); navigate(`${CRM_BASE}/support/tickets/${id}`);
    } catch (e) { setErr(e instanceof Error ? e.message : 'تعذّر'); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث بالموضوع/الرقم…" className="pr-9 pl-3 py-2 text-sm rounded-xl border border-slate-200 outline-none w-52" />
          </div>
          <select value={fStatus} onChange={(e) => setFStatus(e.target.value as TicketStatus | 'all')} className="py-2 px-3 text-sm rounded-xl border border-slate-200 outline-none"><option value="all">كل الحالات</option>{Object.entries(TICKET_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <select value={fPriority} onChange={(e) => setFPriority(e.target.value as TicketPriority | 'all')} className="py-2 px-3 text-sm rounded-xl border border-slate-200 outline-none"><option value="all">كل الأولويات</option>{Object.entries(TICKET_PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </div>
        <button onClick={() => { setForm(EMPTY); setShow(true); }} className="flex items-center gap-1.5 bg-cyan-600 text-white text-sm px-4 py-2 rounded-xl hover:bg-cyan-700"><Plus size={16} /> تذكرة جديدة</button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs">
            <tr><th className="text-right px-4 py-3">التذكرة</th><th className="text-right px-4 py-3">الحساب</th><th className="text-center px-4 py-3">الأولوية</th><th className="text-center px-4 py-3">القناة</th><th className="text-center px-4 py-3">SLA</th><th className="text-center px-4 py-3">الحالة</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? <tr><td colSpan={6} className="text-center py-10 text-slate-400">جارٍ التحميل…</td></tr>
              : filtered.length === 0 ? <tr><td colSpan={6} className="text-center py-10 text-slate-400">لا تذاكر.</td></tr>
                : filtered.map((t) => {
                  const sla = slaLeft(t);
                  return (
                    <tr key={t.id} className="hover:bg-slate-50/60 cursor-pointer" onClick={() => navigate(`${CRM_BASE}/support/tickets/${t.id}`)}>
                      <td className="px-4 py-3"><div className="flex items-center gap-2"><div className="w-8 h-8 rounded-lg bg-cyan-50 text-cyan-600 flex items-center justify-center shrink-0"><Ticket size={15} /></div><div><p className="font-semibold text-slate-800">{t.subject}</p><p className="text-xs text-slate-400 font-mono">{t.ticket_number} · {TICKET_TYPE_LABEL[t.ticket_type]}</p></div></div></td>
                      <td className="px-4 py-3 text-slate-600 text-xs">{t.account_id ? accName[t.account_id] || '—' : '—'}</td>
                      <td className="px-4 py-3 text-center"><span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full ${TICKET_PRIORITY_COLOR[t.priority]}`}>{TICKET_PRIORITY_LABEL[t.priority]}</span></td>
                      <td className="px-4 py-3 text-center text-xs text-slate-500">{TICKET_CHANNEL_LABEL[t.channel]}</td>
                      <td className="px-4 py-3 text-center">{t.sla_breached ? <span className="text-[10px] font-bold text-rose-600 flex items-center justify-center gap-1"><AlertTriangle size={11} /> كُسر</span> : sla ? <span className={`text-[10px] font-bold ${sla.danger ? 'text-rose-600' : 'text-slate-500'}`}>{sla.label}</span> : <span className="text-[10px] text-slate-300">—</span>}</td>
                      <td className="px-4 py-3 text-center"><span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full ${TICKET_STATUS_COLOR[t.status]}`}>{TICKET_STATUS_LABEL[t.status]}</span></td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>

      {show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShow(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4"><h3 className="font-black text-slate-800">تذكرة جديدة</h3><button onClick={() => setShow(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button></div>
            <div className="space-y-3">
              <div><label className="text-xs text-slate-500">الموضوع *</label><input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" /></div>
              <div><label className="text-xs text-slate-500">الوصف</label><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none resize-none" /></div>
              <div><label className="text-xs text-slate-500">الحساب</label><select value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none"><option value="">— بدون حساب —</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-slate-500">النوع</label><select value={form.ticket_type} onChange={(e) => setForm({ ...form, ticket_type: e.target.value as TicketType })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none">{Object.entries(TICKET_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                <div><label className="text-xs text-slate-500">الأولوية</label><select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as TicketPriority })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none">{Object.entries(TICKET_PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              </div>
              <div><label className="text-xs text-slate-500">القناة</label><select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value as TicketChannel })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none">{Object.entries(TICKET_CHANNEL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              {err && <p className="text-xs text-rose-600">{err}</p>}
            </div>
            <div className="flex gap-2 mt-5"><button onClick={save} disabled={busy} className="flex-1 bg-cyan-600 text-white text-sm py-2.5 rounded-xl hover:bg-cyan-700 disabled:opacity-60">{busy ? 'جارٍ…' : 'إنشاء'}</button><button onClick={() => setShow(false)} className="px-4 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">إلغاء</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
