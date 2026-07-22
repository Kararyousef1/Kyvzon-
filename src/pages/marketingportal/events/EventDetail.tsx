/**
 * EventDetail — تفاصيل الفعالية بتبويبات:
 *   صفحة الحدث (متحدثون/رعاة/جلسات) · التذاكر والخصومات · التسجيلات · Check-in · التحليلات.
 */
import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronLeft, Plus, X, Mic, Ticket, Percent, QrCode, ScanLine, CheckCircle2,
  Users, DollarSign, TrendingUp, UserPlus, Clock,
} from 'lucide-react';
import {
  eventService, eventTicketService, eventPromoService, eventRegistrationService,
  TICKET_TIER_LABEL, EVENT_TYPE_LABEL,
  type MarketingEvent, type EventSpeaker, type EventTicketType, type EventPromoCode,
  type EventRegistration, type EventKpis, type TicketTier, type CheckinResult,
} from '../../../services/sdk';
import { MARKETING_BASE } from '../marketingCatalog';
import { EVENT_STATUS_LABEL, EVENT_STATUS_COLOR, REG_STATUS_LABEL, REG_STATUS_COLOR, PAYMENT_LABEL } from './useEvents';

type Tab = 'page' | 'tickets' | 'registrations' | 'checkin' | 'analytics';

export default function EventDetail() {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('page');
  const [event, setEvent] = useState<MarketingEvent | null>(null);
  const [speakers, setSpeakers] = useState<EventSpeaker[]>([]);
  const [tickets, setTickets] = useState<EventTicketType[]>([]);
  const [promos, setPromos] = useState<EventPromoCode[]>([]);
  const [regs, setRegs] = useState<EventRegistration[]>([]);
  const [kpi, setKpi] = useState<EventKpis | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!eventId) return;
    const ev = await eventService.findById(eventId);
    setEvent(ev as MarketingEvent | null);
    const [sp, tk, pr, rg, k] = await Promise.all([
      eventService.listSpeakers(eventId), eventTicketService.listForEvent(eventId),
      eventPromoService.listForEvent(eventId), eventRegistrationService.listForEvent(eventId),
      eventRegistrationService.kpis(eventId),
    ]);
    setSpeakers(sp); setTickets(tk); setPromos(pr); setRegs(rg); setKpi(k);
  }, [eventId]);
  useEffect(() => { load(); }, [load]);

  if (!event) return <div className="p-8 text-center text-slate-400" dir="rtl">جارٍ التحميل…</div>;

  const TABS: Array<{ id: Tab; label: string; icon: typeof Ticket }> = [
    { id: 'page', label: 'صفحة الحدث', icon: Mic },
    { id: 'tickets', label: 'التذاكر والخصومات', icon: Ticket },
    { id: 'registrations', label: 'التسجيلات', icon: Users },
    { id: 'checkin', label: 'Check-in', icon: ScanLine },
    { id: 'analytics', label: 'التحليلات', icon: TrendingUp },
  ];

  return (
    <div className="space-y-4" dir="rtl">
      <button onClick={() => navigate(`${MARKETING_BASE}/events`)} className="flex items-center gap-1 text-sm text-fuchsia-600 hover:underline"><ChevronLeft size={16} /> كل الفعاليات</button>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-black text-slate-800 text-lg">{event.name}</h1>
            <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full ${EVENT_STATUS_COLOR[event.status]}`}>{EVENT_STATUS_LABEL[event.status]}</span>
            <span className="text-[10px] bg-fuchsia-50 text-fuchsia-600 px-2 py-0.5 rounded-full">{EVENT_TYPE_LABEL[event.event_type]}</span>
          </div>
          <p className="text-xs text-slate-400 mt-1">{event.starts_at ? new Date(event.starts_at).toLocaleString('ar') : 'بلا تاريخ'} {event.location ? `· ${event.location}` : ''}</p>
        </div>
        {event.status === 'draft' && <button onClick={async () => { await eventService.setStatus(event.id, 'published'); load(); }} className="text-sm bg-fuchsia-600 text-white px-4 py-2 rounded-xl hover:bg-fuchsia-700">نشر الفعالية</button>}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => { const Icon = t.icon; return (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap ${tab === t.id ? 'bg-gradient-to-br from-fuchsia-600 to-purple-700 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}><Icon size={16} /> {t.label}</button>
        ); })}
      </div>

      {msg && <div className="text-sm text-fuchsia-700 bg-fuchsia-50 border border-fuchsia-200 rounded-xl px-4 py-2 flex items-center gap-2"><CheckCircle2 size={15} /> {msg}</div>}

      {tab === 'page' && <PageTab eventId={event.id} speakers={speakers} reload={load} setBusy={setBusy} busy={busy} />}
      {tab === 'tickets' && <TicketsTab eventId={event.id} tickets={tickets} promos={promos} reload={load} busy={busy} setBusy={setBusy} />}
      {tab === 'registrations' && <RegistrationsTab eventId={event.id} tickets={tickets} regs={regs} reload={load} busy={busy} setBusy={setBusy} setMsg={setMsg} />}
      {tab === 'checkin' && <CheckinTab regs={regs} reload={load} setMsg={setMsg} />}
      {tab === 'analytics' && kpi && <AnalyticsTab kpi={kpi} regs={regs} reload={load} setMsg={setMsg} />}
    </div>
  );
}

// ── صفحة الحدث: المتحدثون ────────────────────────────────────────────────────
function PageTab({ eventId, speakers, reload, busy, setBusy }: { eventId: string; speakers: EventSpeaker[]; reload: () => void; busy: boolean; setBusy: (b: boolean) => void }) {
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ name: '', title: '', bio: '', linkedin_url: '' });
  const add = async () => {
    if (!form.name.trim()) return; setBusy(true);
    try { await eventService.addSpeaker({ event_id: eventId, name: form.name, title: form.title || null, bio: form.bio || null, photo_url: null, linkedin_url: form.linkedin_url || null }); setShow(false); setForm({ name: '', title: '', bio: '', linkedin_url: '' }); reload(); }
    catch { /* noop */ } finally { setBusy(false); }
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between mb-4"><div className="flex items-center gap-2"><Mic size={18} className="text-fuchsia-600" /><h3 className="font-black text-slate-800">المتحدثون</h3></div><button onClick={() => setShow(true)} className="flex items-center gap-1.5 text-sm border border-slate-200 px-3 py-1.5 rounded-xl hover:bg-slate-50"><Plus size={15} /> متحدث</button></div>
      {speakers.length === 0 ? <p className="text-sm text-slate-400">لا متحدثين — أضف بطاقات المتحدثين لصفحة الحدث.</p>
        : <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {speakers.map((s) => (
              <div key={s.id} className="rounded-xl border border-slate-100 p-4"><div className="w-10 h-10 rounded-full bg-fuchsia-100 text-fuchsia-600 flex items-center justify-center font-bold">{s.name.charAt(0)}</div><p className="font-bold text-slate-800 mt-2">{s.name}</p><p className="text-xs text-slate-500">{s.title || '—'}</p>{s.bio && <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">{s.bio}</p>}</div>
            ))}
          </div>}
      {show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShow(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4"><h3 className="font-black text-slate-800">متحدث</h3><button onClick={() => setShow(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button></div>
            <div className="space-y-3">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="الاسم *" className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" />
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="المسمى الوظيفي" className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" />
              <textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} placeholder="نبذة" rows={2} className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" />
              <input value={form.linkedin_url} onChange={(e) => setForm({ ...form, linkedin_url: e.target.value })} placeholder="رابط LinkedIn" className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none font-mono" />
            </div>
            <div className="flex gap-2 mt-5"><button onClick={add} disabled={busy} className="flex-1 bg-fuchsia-600 text-white text-sm py-2.5 rounded-xl hover:bg-fuchsia-700 disabled:opacity-60">حفظ</button><button onClick={() => setShow(false)} className="px-4 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">إلغاء</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── التذاكر والخصومات ────────────────────────────────────────────────────────
function TicketsTab({ eventId, tickets, promos, reload, busy, setBusy }: { eventId: string; tickets: EventTicketType[]; promos: EventPromoCode[]; reload: () => void; busy: boolean; setBusy: (b: boolean) => void }) {
  const [showT, setShowT] = useState(false); const [showP, setShowP] = useState(false);
  const [tf, setTf] = useState<{ name: string; tier: TicketTier; price: number; quantity: string }>({ name: '', tier: 'general', price: 0, quantity: '' });
  const [pf, setPf] = useState<{ code: string; discount_type: 'percent' | 'fixed'; discount_value: number }>({ code: '', discount_type: 'percent', discount_value: 10 });
  const addT = async () => { if (!tf.name.trim()) return; setBusy(true); try { await eventTicketService.createTicket({ event_id: eventId, name: tf.name, tier: tf.tier, price: tf.price, quantity: tf.quantity ? parseInt(tf.quantity, 10) : null }); setShowT(false); setTf({ name: '', tier: 'general', price: 0, quantity: '' }); reload(); } catch { /* noop */ } finally { setBusy(false); } };
  const addP = async () => { if (!pf.code.trim()) return; setBusy(true); try { await eventPromoService.createPromo({ event_id: eventId, code: pf.code, discount_type: pf.discount_type, discount_value: pf.discount_value }); setShowP(false); setPf({ code: '', discount_type: 'percent', discount_value: 10 }); reload(); } catch { /* noop */ } finally { setBusy(false); } };
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between mb-4"><div className="flex items-center gap-2"><Ticket size={18} className="text-fuchsia-600" /><h3 className="font-black text-slate-800">أنواع التذاكر</h3></div><button onClick={() => setShowT(true)} className="flex items-center gap-1.5 text-sm border border-slate-200 px-3 py-1.5 rounded-xl hover:bg-slate-50"><Plus size={15} /> تذكرة</button></div>
        {tickets.length === 0 ? <p className="text-sm text-slate-400">لا تذاكر — أضف نوع تذكرة (Early Bird/General/VIP…).</p>
          : <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {tickets.map((t) => (
                <div key={t.id} className="rounded-xl border border-slate-100 p-4"><div className="flex items-center justify-between"><span className="text-[10px] font-bold bg-fuchsia-50 text-fuchsia-600 px-2 py-0.5 rounded-full">{TICKET_TIER_LABEL[t.tier]}</span><span className="font-black text-slate-800">{t.price > 0 ? `${t.price} ${t.currency}` : 'مجاني'}</span></div><p className="font-bold text-slate-700 mt-2">{t.name}</p><p className="text-[11px] text-slate-400 mt-0.5">بيع: {t.sold}{t.quantity ? ` / ${t.quantity}` : ''}</p></div>
              ))}
            </div>}
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between mb-4"><div className="flex items-center gap-2"><Percent size={18} className="text-fuchsia-600" /><h3 className="font-black text-slate-800">كودات الخصم</h3></div><button onClick={() => setShowP(true)} className="flex items-center gap-1.5 text-sm border border-slate-200 px-3 py-1.5 rounded-xl hover:bg-slate-50"><Plus size={15} /> كود</button></div>
        {promos.length === 0 ? <p className="text-sm text-slate-400">لا كودات خصم.</p>
          : <div className="flex flex-wrap gap-2">{promos.map((p) => <span key={p.id} className="text-xs font-mono border border-slate-200 bg-slate-50 px-3 py-1.5 rounded-lg">{p.code} · {p.discount_type === 'percent' ? `${p.discount_value}%` : `${p.discount_value}`} · استُخدم {p.used_count}</span>)}</div>}
      </div>
      {showT && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowT(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4"><h3 className="font-black text-slate-800">نوع تذكرة</h3><button onClick={() => setShowT(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button></div>
            <div className="space-y-3">
              <input value={tf.name} onChange={(e) => setTf({ ...tf, name: e.target.value })} placeholder="اسم التذكرة *" className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" />
              <select value={tf.tier} onChange={(e) => setTf({ ...tf, tier: e.target.value as TicketTier })} className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none">{(Object.keys(TICKET_TIER_LABEL) as TicketTier[]).map((k) => <option key={k} value={k}>{TICKET_TIER_LABEL[k]}</option>)}</select>
              <input type="number" value={tf.price} onChange={(e) => setTf({ ...tf, price: parseFloat(e.target.value || '0') })} placeholder="السعر (0 = مجاني)" className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" />
              <input type="number" value={tf.quantity} onChange={(e) => setTf({ ...tf, quantity: e.target.value })} placeholder="الكمية (فارغ = بلا حد)" className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" />
            </div>
            <div className="flex gap-2 mt-5"><button onClick={addT} disabled={busy} className="flex-1 bg-fuchsia-600 text-white text-sm py-2.5 rounded-xl hover:bg-fuchsia-700 disabled:opacity-60">حفظ</button><button onClick={() => setShowT(false)} className="px-4 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">إلغاء</button></div>
          </div>
        </div>
      )}
      {showP && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowP(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4"><h3 className="font-black text-slate-800">كود خصم</h3><button onClick={() => setShowP(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button></div>
            <div className="space-y-3">
              <input value={pf.code} onChange={(e) => setPf({ ...pf, code: e.target.value.toUpperCase() })} placeholder="الكود (SAVE20)" className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none font-mono" />
              <select value={pf.discount_type} onChange={(e) => setPf({ ...pf, discount_type: e.target.value as 'percent' | 'fixed' })} className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none"><option value="percent">نسبة %</option><option value="fixed">مبلغ ثابت</option></select>
              <input type="number" value={pf.discount_value} onChange={(e) => setPf({ ...pf, discount_value: parseFloat(e.target.value || '0') })} placeholder="القيمة" className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" />
            </div>
            <div className="flex gap-2 mt-5"><button onClick={addP} disabled={busy} className="flex-1 bg-fuchsia-600 text-white text-sm py-2.5 rounded-xl hover:bg-fuchsia-700 disabled:opacity-60">حفظ</button><button onClick={() => setShowP(false)} className="px-4 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">إلغاء</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── التسجيلات ────────────────────────────────────────────────────────────────
function RegistrationsTab({ eventId, tickets, regs, reload, busy, setBusy, setMsg }: { eventId: string; tickets: EventTicketType[]; regs: EventRegistration[]; reload: () => void; busy: boolean; setBusy: (b: boolean) => void; setMsg: (m: string | null) => void }) {
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ full_name: '', email: '', ticket_type_id: '', promo_code: '' });
  const register = async () => {
    if (!form.full_name.trim() || !form.email.trim()) { setMsg('الاسم والبريد مطلوبان'); return; }
    setBusy(true); setMsg(null);
    try { await eventRegistrationService.register({ eventId, ticketTypeId: form.ticket_type_id || null, fullName: form.full_name, email: form.email, promoCode: form.promo_code || null }); setShow(false); setForm({ full_name: '', email: '', ticket_type_id: '', promo_code: '' }); reload(); setMsg('تم التسجيل (حالة تلقائية: مسجّل أو قائمة انتظار حسب السعة) + QR فريد.'); }
    catch (e) { setMsg(e instanceof Error ? e.message : 'تعذّر التسجيل'); } finally { setBusy(false); }
  };

  // إنشاء جلسة دفع Stripe (يفتح رابط الدفع؛ أو يخبر بالمحاكاة إن غاب المفتاح)
  const pay = async (regId: string) => {
    setBusy(true); setMsg(null);
    try {
      const res = await eventRegistrationService.createPaymentSession(regId);
      if (res.mode === 'live' && res.ok && res.url) { window.open(res.url, '_blank'); setMsg('تم فتح صفحة الدفع (Stripe) في تبويب جديد.'); }
      else setMsg(res.message || 'الدفع بوضع محاكاة — أضف STRIPE_SECRET_KEY للتفعيل الفعلي.');
    } catch (e) { setMsg(e instanceof Error ? e.message : 'تعذّر إنشاء الدفع'); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between"><p className="text-sm text-slate-500">{regs.length} تسجيل</p><button onClick={() => setShow(true)} className="flex items-center gap-1.5 bg-fuchsia-600 text-white text-sm px-4 py-2 rounded-xl hover:bg-fuchsia-700"><Plus size={16} /> تسجيل يدوي</button></div>
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs"><tr><th className="text-right px-4 py-3">المسجّل</th><th className="text-center px-4 py-3">الحالة</th><th className="text-center px-4 py-3">الدفع</th><th className="text-center px-4 py-3">الحضور</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {regs.length === 0 ? <tr><td colSpan={4} className="text-center py-10 text-slate-400">لا تسجيلات بعد.</td></tr>
              : regs.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3"><p className="font-semibold text-slate-800">{r.full_name}</p><p className="text-xs text-slate-400">{r.email}</p></td>
                  <td className="px-4 py-3 text-center"><span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full ${REG_STATUS_COLOR[r.status]}`}>{REG_STATUS_LABEL[r.status]}</span></td>
                  <td className="px-4 py-3 text-center text-xs text-slate-500">
                    {r.payment_status === 'pending'
                      ? <button onClick={() => pay(r.id)} disabled={busy} className="text-[11px] bg-emerald-600 text-white px-2.5 py-1 rounded-lg hover:bg-emerald-700 disabled:opacity-60">دفع</button>
                      : PAYMENT_LABEL[r.payment_status]}
                  </td>
                  <td className="px-4 py-3 text-center">{r.checked_in ? <span className="text-emerald-600 text-xs font-bold">حضر ✓</span> : <span className="text-slate-300 text-xs">—</span>}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShow(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4"><h3 className="font-black text-slate-800">تسجيل جديد</h3><button onClick={() => setShow(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button></div>
            <div className="space-y-3">
              <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="الاسم *" className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" />
              <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="البريد *" className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none font-mono" />
              <select value={form.ticket_type_id} onChange={(e) => setForm({ ...form, ticket_type_id: e.target.value })} className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none"><option value="">— نوع التذكرة —</option>{tickets.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.price > 0 ? `${t.price} ${t.currency}` : 'مجاني'})</option>)}</select>
              <input value={form.promo_code} onChange={(e) => setForm({ ...form, promo_code: e.target.value.toUpperCase() })} placeholder="كود خصم (اختياري)" className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none font-mono" />
            </div>
            <div className="flex gap-2 mt-5"><button onClick={register} disabled={busy} className="flex-1 bg-fuchsia-600 text-white text-sm py-2.5 rounded-xl hover:bg-fuchsia-700 disabled:opacity-60">تسجيل</button><button onClick={() => setShow(false)} className="px-4 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">إلغاء</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Check-in ─────────────────────────────────────────────────────────────────
function CheckinTab({ regs, reload, setMsg }: { regs: EventRegistration[]; reload: () => void; setMsg: (m: string | null) => void }) {
  const registered = regs.filter((r) => r.status === 'registered');
  const scan = async (token: string) => {
    setMsg(null);
    try {
      const res: CheckinResult = await eventRegistrationService.checkinByQr(token);
      const map: Record<string, string> = { success: `تم تسجيل حضور ${res.registrant} ✓`, already_checked_in: `${res.registrant} سبق تسجيل حضوره (منع تكرار)`, not_found: 'رمز غير موجود' };
      setMsg(map[res.result]); reload();
    } catch (e) { setMsg(e instanceof Error ? e.message : 'خطأ'); }
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-2 mb-1"><ScanLine size={18} className="text-fuchsia-600" /><h3 className="font-black text-slate-800">تسجيل الحضور (QR Check-in)</h3></div>
      <p className="text-xs text-slate-500 mb-4">في التطبيق الفعلي: امسح QR بكاميرا الهاتف. هنا: اضغط «مسح» لمحاكاة المسح (يمنع التكرار تلقائياً).</p>
      {registered.length === 0 ? <p className="text-sm text-slate-400">لا مسجّلين مؤكّدين.</p>
        : <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {registered.map((r) => (
              <div key={r.id} className="rounded-xl border border-slate-100 p-3 flex items-center gap-3">
                <img src={eventRegistrationService.qrDataUri(r.qr_token)} alt="QR" className="w-14 h-14 rounded" />
                <div className="flex-1 min-w-0"><p className="text-sm font-semibold text-slate-800 truncate">{r.full_name}</p>{r.checked_in ? <span className="text-emerald-600 text-xs font-bold">حضر ✓</span> : <button onClick={() => scan(r.qr_token)} className="text-xs bg-fuchsia-50 text-fuchsia-600 border border-fuchsia-200 px-2 py-1 rounded-lg hover:bg-fuchsia-100 mt-1 inline-flex items-center gap-1"><QrCode size={12} /> مسح</button>}</div>
              </div>
            ))}
          </div>}
    </div>
  );
}

// ── التحليلات ────────────────────────────────────────────────────────────────
function AnalyticsTab({ kpi, regs, reload, setMsg }: { kpi: EventKpis; regs: EventRegistration[]; reload: () => void; setMsg: (m: string | null) => void }) {
  const withLead = regs.filter((r) => r.lead_id);
  const simulateEngagement = async (id: string) => {
    setMsg(null);
    try { await eventRegistrationService.setEngagement(id, 90, 85); setMsg('سُجّل حضور 90% → رُفع Lead Score تلقائياً (حضور ويبينار).'); reload(); }
    catch (e) { setMsg(e instanceof Error ? e.message : 'خطأ'); }
  };
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { icon: Users, l: 'مسجّل', v: kpi.registered }, { icon: Clock, l: 'قائمة انتظار', v: kpi.waitlisted },
          { icon: CheckCircle2, l: 'حضر', v: kpi.checkedIn }, { icon: DollarSign, l: 'إيراد', v: `$${kpi.revenue}` },
          { icon: TrendingUp, l: 'نسبة الحضور', v: `${kpi.attendanceRate}%` },
        ].map((s) => { const Icon = s.icon; return (
          <div key={s.l} className="rounded-2xl border border-slate-200 bg-white p-4"><div className="w-8 h-8 rounded-lg bg-fuchsia-50 text-fuchsia-600 flex items-center justify-center"><Icon size={16} /></div><p className="text-xl font-black text-slate-800 mt-2">{s.v}</p><p className="text-[11px] text-slate-500">{s.l}</p></div>
        ); })}
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2 mb-1"><UserPlus size={18} className="text-fuchsia-600" /><h3 className="font-black text-slate-800">Engagement → Lead Score (الوحدة 1)</h3></div>
        <p className="text-xs text-slate-500 mb-4">حضور 80%+ يرفع تقييم العميل تلقائياً. {kpi.leads} مسجّل مرتبط بعميل.</p>
        {withLead.length === 0 ? <p className="text-sm text-slate-400">لا تسجيلات مرتبطة بعملاء بعد.</p>
          : <div className="space-y-2">{withLead.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-xl border border-slate-100 p-3"><span className="text-sm text-slate-700">{r.full_name} · حضور {r.attendance_pct}%</span><button onClick={() => simulateEngagement(r.id)} className="text-xs bg-fuchsia-50 text-fuchsia-600 border border-fuchsia-200 px-3 py-1.5 rounded-lg hover:bg-fuchsia-100">محاكاة حضور 90%</button></div>
            ))}</div>}
      </div>
    </div>
  );
}
