/**
 * ContactsPage — جهات الاتصال + الموافقة (Consent) + STOP (Opt-out) + سجل المحادثات.
 */
import { useState } from 'react';
import { Plus, X, Contact, Ban, MessageCircle, CheckCircle2 } from 'lucide-react';
import { messagingContactService, messagingDeliveryService, type MessagingContactInput, type MessagingMessage, type MessagingChannel } from '../../../services/sdk';
import { useContacts, MSG_STATUS_LABEL, CHANNEL_LABEL } from './useMessaging';

export default function ContactsPage() {
  const { data: contacts, loading, reload } = useContacts();
  const [showAdd, setShowAdd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<MessagingContactInput>({ phone: '', full_name: '', sms_consent: true, wa_consent: true });
  const [err, setErr] = useState<string | null>(null);
  const [convFor, setConvFor] = useState<string | null>(null);
  const [conv, setConv] = useState<MessagingMessage[]>([]);

  const add = async () => {
    if (!form.phone.trim()) { setErr('رقم الهاتف مطلوب'); return; }
    setBusy(true); setErr(null);
    try { await messagingContactService.addContact(form); setShowAdd(false); setForm({ phone: '', full_name: '', sms_consent: true, wa_consent: true }); reload(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'تعذّر الحفظ'); } finally { setBusy(false); }
  };
  const stop = async (id: string, channel: MessagingChannel) => { setBusy(true); try { await messagingContactService.processStop(id, channel); reload(); } catch { /* noop */ } finally { setBusy(false); } };
  const openConv = async (id: string) => {
    if (convFor === id) { setConvFor(null); return; }
    setConvFor(id);
    try { setConv(await messagingDeliveryService.conversation(id)); } catch { setConv([]); }
  };

  const ConsentBadge = ({ label, consent, opted }: { label: string; consent: boolean; opted: boolean }) => (
    <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full ${opted ? 'bg-slate-100 text-slate-400 border-slate-200' : consent ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-amber-50 text-amber-600 border-amber-200'}`}>
      {label}: {opted ? 'ملغى' : consent ? 'موافق' : 'لا'}
    </span>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{loading ? 'جارٍ التحميل…' : `${contacts.length} جهة اتصال`}</p>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 bg-fuchsia-600 text-white text-sm px-4 py-2 rounded-xl hover:bg-fuchsia-700"><Plus size={16} /> جهة اتصال</button>
      </div>

      {contacts.length === 0 && !loading ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center"><Contact size={34} className="mx-auto text-slate-300" /><p className="text-slate-500 mt-3 font-semibold">لا جهات اتصال</p><p className="text-xs text-slate-400 mt-1">أضف أرقاماً بموافقة صريحة قبل الإرسال (إلزامي قانوناً).</p></div>
      ) : (
        <div className="space-y-2">
          {contacts.map((c) => (
            <div key={c.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-800">{c.full_name || 'بدون اسم'}</p>
                  <p className="text-xs text-slate-400 font-mono">{c.phone}</p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    <ConsentBadge label="SMS" consent={c.sms_consent} opted={c.sms_opted_out} />
                    <ConsentBadge label="واتساب" consent={c.wa_consent} opted={c.wa_opted_out} />
                    {c.lead_id && <span className="text-[10px] bg-fuchsia-50 text-fuchsia-600 border border-fuchsia-200 px-2 py-0.5 rounded-full">مرتبط بعميل</span>}
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 flex-shrink-0">
                  <button onClick={() => openConv(c.id)} className="text-xs border border-slate-200 px-2.5 py-1 rounded-lg hover:bg-slate-50 flex items-center gap-1"><MessageCircle size={12} /> المحادثة</button>
                  {!c.sms_opted_out && <button onClick={() => stop(c.id, 'sms')} disabled={busy} className="text-xs border border-rose-200 text-rose-500 px-2.5 py-1 rounded-lg hover:bg-rose-50 flex items-center gap-1"><Ban size={12} /> STOP SMS</button>}
                </div>
              </div>
              {convFor === c.id && (
                <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 p-3 space-y-1.5 max-h-48 overflow-y-auto">
                  {conv.length === 0 ? <p className="text-xs text-slate-400 text-center">لا رسائل بعد</p>
                    : conv.map((m) => (
                      <div key={m.id} className="text-xs bg-white rounded-lg px-2 py-1.5 border border-slate-100">
                        <span className="text-slate-400">[{CHANNEL_LABEL[m.channel]} · {MSG_STATUS_LABEL[m.status]}]</span> <span className="text-slate-700">{m.body || '—'}</span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4"><h3 className="font-black text-slate-800">جهة اتصال</h3><button onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button></div>
            <div className="space-y-3">
              <div><label className="text-xs text-slate-500">رقم الهاتف (E.164) *</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none font-mono" placeholder="+9647701234567" /></div>
              <div><label className="text-xs text-slate-500">الاسم</label><input value={form.full_name || ''} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" /></div>
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
                <p className="text-xs text-amber-700 mb-2 flex items-center gap-1"><CheckCircle2 size={13} /> الموافقة الصريحة إلزامية قبل الإرسال التسويقي:</p>
                <label className="flex items-center gap-2 text-sm text-slate-700 mb-1"><input type="checkbox" checked={form.sms_consent} onChange={(e) => setForm({ ...form, sms_consent: e.target.checked })} /> موافقة SMS</label>
                <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={form.wa_consent} onChange={(e) => setForm({ ...form, wa_consent: e.target.checked })} /> موافقة واتساب</label>
              </div>
              {err && <p className="text-xs text-rose-600">{err}</p>}
            </div>
            <div className="flex gap-2 mt-5"><button onClick={add} disabled={busy} className="flex-1 bg-fuchsia-600 text-white text-sm py-2.5 rounded-xl hover:bg-fuchsia-700 disabled:opacity-60">حفظ</button><button onClick={() => setShowAdd(false)} className="px-4 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">إلغاء</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
