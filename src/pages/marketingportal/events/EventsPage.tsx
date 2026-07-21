/**
 * EventsPage — قائمة الفعاليات + إنشاء + فتح التفاصيل.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, X, CalendarDays, ArrowRight, MapPin, Video, ChevronLeft } from 'lucide-react';
import { eventService, EVENT_TYPE_LABEL, PRE_EVENT_SEQUENCE, type MarketingEventInput, type EventType } from '../../../services/sdk';
import { useEventsList, EVENT_STATUS_LABEL, EVENT_STATUS_COLOR } from './useEvents';
import { MARKETING_BASE } from '../marketingCatalog';

export default function EventsPage() {
  const { data: events, loading, reload } = useEventsList();
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<MarketingEventInput>({ name: '', event_type: 'virtual', starts_at: null, location: '', capacity: null });
  const [err, setErr] = useState<string | null>(null);

  const create = async () => {
    if (!form.name.trim()) { setErr('اسم الفعالية مطلوب'); return; }
    setBusy(true); setErr(null);
    try { const ev = await eventService.createEvent({ ...form, status: 'draft' }); setShowCreate(false); setForm({ name: '', event_type: 'virtual', starts_at: null, location: '', capacity: null }); reload(); navigate(`${MARKETING_BASE}/events/${ev.id}`); }
    catch (e) { setErr(e instanceof Error ? e.message : 'تعذّر الإنشاء'); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-5" dir="rtl">
      <div className="bg-gradient-to-br from-fuchsia-600 via-purple-600 to-indigo-600 rounded-3xl p-6 text-white relative overflow-hidden">
        <div className="absolute -top-10 -left-10 w-40 h-40 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center"><CalendarDays size={24} /></div>
            <div><h1 className="text-xl sm:text-2xl font-black">إدارة الفعاليات</h1><p className="text-white/75 text-sm">صفحات الأحداث · التذاكر · QR/Check-in · التحليلات</p></div>
          </div>
          <button onClick={() => navigate(MARKETING_BASE)} className="flex items-center gap-1.5 text-xs bg-white/15 hover:bg-white/25 transition-colors px-3 py-2 rounded-xl"><ArrowRight size={14} /> بوابة التسويق</button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{loading ? 'جارٍ التحميل…' : `${events.length} فعالية`}</p>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 bg-fuchsia-600 text-white text-sm px-4 py-2 rounded-xl hover:bg-fuchsia-700"><Plus size={16} /> فعالية جديدة</button>
      </div>

      {events.length === 0 && !loading ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <CalendarDays size={36} className="mx-auto text-slate-300" />
          <p className="text-slate-500 mt-3 font-semibold">لا فعاليات بعد</p>
          <p className="text-xs text-slate-400 mt-1">أنشئ فعاليتك الأولى (مؤتمر، ويبينار، ورشة عمل).</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {events.map((ev) => (
            <button key={ev.id} onClick={() => navigate(`${MARKETING_BASE}/events/${ev.id}`)} className="text-right rounded-2xl border border-slate-200 bg-white p-4 hover:border-fuchsia-300 hover:shadow-md transition-all">
              <div className="flex items-center justify-between">
                <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full ${EVENT_STATUS_COLOR[ev.status]}`}>{EVENT_STATUS_LABEL[ev.status]}</span>
                <span className="text-[10px] text-slate-400 flex items-center gap-1">{ev.event_type === 'in_person' ? <MapPin size={11} /> : <Video size={11} />} {EVENT_TYPE_LABEL[ev.event_type]}</span>
              </div>
              <h3 className="font-black text-slate-800 mt-2">{ev.name}</h3>
              <p className="text-[11px] text-slate-400 mt-1">{ev.starts_at ? new Date(ev.starts_at).toLocaleString('ar') : 'بلا تاريخ'}</p>
              <div className="flex items-center gap-1 text-fuchsia-500 text-xs mt-3"><ChevronLeft size={14} /> إدارة الفعالية</div>
            </button>
          ))}
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="font-black text-slate-800 mb-1">تسلسل التواصل قبل الحدث</h2>
        <p className="text-xs text-slate-500 mb-4">يُرسل تلقائياً عبر وحدتَي البريد (2) والرسائل (4).</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {PRE_EVENT_SEQUENCE.map((s, i) => (
            <div key={i} className="rounded-xl border border-slate-100 p-3">
              <span className="w-6 h-6 rounded-full bg-fuchsia-600 text-white text-xs font-bold flex items-center justify-center">{i + 1}</span>
              <p className="text-xs font-bold text-slate-700 mt-2">{s.when}</p>
              <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{s.content}</p>
            </div>
          ))}
        </div>
      </section>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4"><h3 className="font-black text-slate-800">فعالية جديدة</h3><button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button></div>
            <div className="space-y-3">
              <div><label className="text-xs text-slate-500">اسم الفعالية *</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" /></div>
              <div><label className="text-xs text-slate-500">النوع</label><select value={form.event_type} onChange={(e) => setForm({ ...form, event_type: e.target.value as EventType })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none"><option value="in_person">حضوري</option><option value="virtual">افتراضي</option><option value="hybrid">هجين</option></select></div>
              <div><label className="text-xs text-slate-500">التاريخ والوقت</label><input type="datetime-local" value={form.starts_at || ''} onChange={(e) => setForm({ ...form, starts_at: e.target.value || null })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" /></div>
              <div><label className="text-xs text-slate-500">الموقع / رابط البث</label><input value={form.location || ''} onChange={(e) => setForm({ ...form, location: e.target.value })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" placeholder="فندق أو Zoom" /></div>
              <div><label className="text-xs text-slate-500">السعة (اتركه فارغاً = بلا حد)</label><input type="number" value={form.capacity ?? ''} onChange={(e) => setForm({ ...form, capacity: e.target.value ? parseInt(e.target.value, 10) : null })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" /></div>
              {err && <p className="text-xs text-rose-600">{err}</p>}
            </div>
            <div className="flex gap-2 mt-5"><button onClick={create} disabled={busy} className="flex-1 bg-fuchsia-600 text-white text-sm py-2.5 rounded-xl hover:bg-fuchsia-700 disabled:opacity-60">إنشاء</button><button onClick={() => setShowCreate(false)} className="px-4 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">إلغاء</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
