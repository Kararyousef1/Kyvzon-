/**
 * CampaignsPage — حملات SMS (عداد 160) / واتساب (قالب معتمد) + إرسال فعلي (Twilio، مع رجوع آمن للمحاكاة) للموافقين.
 */
import { useState } from 'react';
import { Plus, X, Send, CheckCircle2 } from 'lucide-react';
import {
  messagingCampaignService, messagingContactService, messagingDeliveryService,
  SMS_MAX_CHARS, type MessagingCampaignInput, type MessagingChannel, type SmsType,
} from '../../../services/sdk';
import { useMsgCampaigns, useWaTemplates, CHANNEL_LABEL, CAMPAIGN_STATUS_LABEL, CAMPAIGN_STATUS_COLOR } from './useMessaging';

const SMS_TYPES: SmsType[] = ['promotional', 'transactional', 'reminder', 'survey'];
const SMS_TYPE_LABEL: Record<string, string> = { promotional: 'ترويجي', transactional: 'تشغيلي', reminder: 'تذكير', survey: 'استطلاع' };

export default function CampaignsPage() {
  const { data: campaigns, loading, reload } = useMsgCampaigns();
  const { data: waTemplates } = useWaTemplates();
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState<MessagingCampaignInput>({ name: '', channel: 'sms', sms_type: 'promotional', body: '', wa_template_id: null });
  const [err, setErr] = useState<string | null>(null);

  const approvedTemplates = waTemplates.filter((t) => t.approval_status === 'approved');
  const smsLen = (form.body || '').length;
  const smsParts = Math.max(1, Math.ceil(smsLen / SMS_MAX_CHARS));

  const create = async () => {
    if (!form.name.trim()) { setErr('اسم الحملة مطلوب'); return; }
    if (form.channel === 'sms' && !form.body?.trim()) { setErr('نص الرسالة مطلوب'); return; }
    if (form.channel === 'whatsapp' && !form.wa_template_id) { setErr('اختر قالباً معتمداً'); return; }
    setBusy(true); setErr(null);
    try { await messagingCampaignService.createCampaign(form); setShowCreate(false); setForm({ name: '', channel: 'sms', sms_type: 'promotional', body: '', wa_template_id: null }); reload(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'تعذّر الإنشاء'); } finally { setBusy(false); }
  };

  const send = async (id: string, channel: MessagingChannel, body: string) => {
    setBusy(true); setMsg(null);
    try {
      const contacts = await messagingContactService.listContacts();
      const eligible = contacts.filter((c) => {
        if (channel === 'sms') return c.sms_consent && !c.sms_opted_out;
        return c.wa_consent && !c.wa_opted_out;
      });
      if (eligible.length === 0) { setMsg('لا جهات اتصال موافقة لهذه القناة.'); return; }

      let live = 0; let simulated = false;
      for (const c of eligible) {
        try {
          const res = await messagingDeliveryService.sendLive({
            contactId: c.id, phone: c.phone, channel, body, campaignId: id, source: 'campaign',
          });
          if (res.mode === 'live' && res.ok) { live++; }
          else { simulated = true; break; }
        } catch { simulated = true; break; }
      }

      if (simulated) {
        // لا مفاتيح مزوّد → أكمل بالمحاكاة (احترام الموافقة/opt-out)
        const n = await messagingDeliveryService.sendCampaign(id, channel, body, eligible.map((c) => c.id));
        await messagingCampaignService.setStatus(id, 'sent');
        setMsg(`لا مفاتيح مزوّد مضبوطة — تمت محاكاة إرسال ${n} رسالة للموافقين فقط. أضف مفاتيح Twilio للإرسال الفعلي.`);
      } else {
        await messagingCampaignService.setStatus(id, 'sent');
        setMsg(`✅ تم الإرسال الفعلي إلى ${live} جهة اتصال عبر المزوّد (Twilio) — للموافقين فقط.`);
      }
      reload();
    } catch (e) { setMsg(e instanceof Error ? e.message : 'تعذّر الإرسال'); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{loading ? 'جارٍ التحميل…' : `${campaigns.length} حملة`}</p>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 bg-fuchsia-600 text-white text-sm px-4 py-2 rounded-xl hover:bg-fuchsia-700"><Plus size={16} /> حملة جديدة</button>
      </div>

      {msg && <div className="text-sm text-fuchsia-700 bg-fuchsia-50 border border-fuchsia-200 rounded-xl px-4 py-2 flex items-center gap-2"><CheckCircle2 size={15} /> {msg}</div>}

      {campaigns.length === 0 && !loading ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center"><Send size={34} className="mx-auto text-slate-300" /><p className="text-slate-500 mt-3 font-semibold">لا حملات</p></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {campaigns.map((c) => (
            <div key={c.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${CAMPAIGN_STATUS_COLOR[c.status]}`}>{CAMPAIGN_STATUS_LABEL[c.status]}</span>
                <span className="text-[10px] text-slate-400">{CHANNEL_LABEL[c.channel]}</span>
              </div>
              <h3 className="font-black text-slate-800 mt-2">{c.name}</h3>
              <p className="text-xs text-slate-500 mt-1 line-clamp-2 min-h-[2rem]">{c.body || '(قالب واتساب)'}</p>
              {c.status !== 'sent' && <button onClick={() => send(c.id, c.channel, c.body)} disabled={busy} className="w-full mt-3 text-sm bg-fuchsia-600 text-white rounded-xl py-2 hover:bg-fuchsia-700 flex items-center justify-center gap-1.5"><Send size={14} /> إرسال الحملة</button>}
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4"><h3 className="font-black text-slate-800">حملة مراسلة</h3><button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button></div>
            <div className="space-y-3">
              <div><label className="text-xs text-slate-500">اسم الحملة *</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" /></div>
              <div><label className="text-xs text-slate-500">القناة</label><select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value as MessagingChannel })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none"><option value="sms">SMS</option><option value="whatsapp">واتساب</option></select></div>

              {form.channel === 'sms' ? (
                <>
                  <div><label className="text-xs text-slate-500">نوع SMS</label><select value={form.sms_type || 'promotional'} onChange={(e) => setForm({ ...form, sms_type: e.target.value as SmsType })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none">{SMS_TYPES.map((t) => <option key={t} value={t}>{SMS_TYPE_LABEL[t]}</option>)}</select></div>
                  <div>
                    <div className="flex items-center justify-between"><label className="text-xs text-slate-500">النص</label><span className={`text-[10px] ${smsLen <= SMS_MAX_CHARS ? 'text-emerald-600' : 'text-amber-500'}`}>{smsLen}/{SMS_MAX_CHARS} · {smsParts} رسالة</span></div>
                    <textarea value={form.body || ''} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={4} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" placeholder="[Kyvzon] عرض خاص… رد STOP للإلغاء" />
                  </div>
                </>
              ) : (
                <div><label className="text-xs text-slate-500">القالب المعتمد</label>
                  <select value={form.wa_template_id || ''} onChange={(e) => setForm({ ...form, wa_template_id: e.target.value || null })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none">
                    <option value="">— اختر قالباً معتمداً —</option>
                    {approvedTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  {approvedTemplates.length === 0 && <p className="text-[11px] text-amber-500 mt-1">لا قوالب معتمدة — أنشئ قالباً واعتمده من تبويب «قوالب واتساب».</p>}
                </div>
              )}
              {err && <p className="text-xs text-rose-600">{err}</p>}
            </div>
            <div className="flex gap-2 mt-5"><button onClick={create} disabled={busy} className="flex-1 bg-fuchsia-600 text-white text-sm py-2.5 rounded-xl hover:bg-fuchsia-700 disabled:opacity-60">إنشاء</button><button onClick={() => setShowCreate(false)} className="px-4 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">إلغاء</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
