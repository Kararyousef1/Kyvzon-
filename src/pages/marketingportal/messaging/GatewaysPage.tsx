/**
 * GatewaysPage — بوابات المراسلة (Twilio/MessageBird/Meta) + التدرّج الآمن (Warm-up).
 */
import { useEffect, useState } from 'react';
import { Plus, X, Radio, CheckCircle2, Flame } from 'lucide-react';
import { messagingGatewayService, type MessagingGatewayInput, type MessagingChannel, type MessagingProvider, type WaWarmupWeek } from '../../../services/sdk';
import { useGateways, CHANNEL_LABEL } from './useMessaging';

const PROVIDERS: MessagingProvider[] = ['twilio', 'messagebird', 'meta_cloud'];
const PROVIDER_LABEL: Record<string, string> = { simulation: 'محاكاة', twilio: 'Twilio', messagebird: 'MessageBird', meta_cloud: 'Meta Cloud API' };

export default function GatewaysPage() {
  const { data: gateways, loading, reload } = useGateways();
  const [warmup, setWarmup] = useState<WaWarmupWeek[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<MessagingGatewayInput>({ channel: 'sms', provider: 'twilio', sender_id: '' });
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { messagingGatewayService.warmupSchedule().then(setWarmup).catch(() => {}); }, []);

  const add = async () => {
    setBusy(true); setErr(null);
    try { await messagingGatewayService.createGateway(form); setShowAdd(false); setForm({ channel: 'sms', provider: 'twilio', sender_id: '' }); reload(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'تعذّر الحفظ'); } finally { setBusy(false); }
  };
  const connect = async (id: string) => { setBusy(true); try { await messagingGatewayService.connect(id); reload(); } catch { /* noop */ } finally { setBusy(false); } };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{loading ? 'جارٍ التحميل…' : `${gateways.length} بوابة`}</p>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 bg-fuchsia-600 text-white text-sm px-4 py-2 rounded-xl hover:bg-fuchsia-700"><Plus size={16} /> بوابة جديدة</button>
      </div>

      {gateways.length === 0 && !loading ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center"><Radio size={34} className="mx-auto text-slate-300" /><p className="text-slate-500 mt-3 font-semibold">لا بوابات مراسلة</p><p className="text-xs text-slate-400 mt-1">اربط Twilio أو MessageBird أو Meta Cloud API للإرسال الفعلي.</p></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {gateways.map((g) => (
            <div key={g.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <div><p className="font-black text-slate-800">{PROVIDER_LABEL[g.provider]}</p><p className="text-xs text-slate-400">{CHANNEL_LABEL[g.channel]} · {g.sender_id || '—'}</p></div>
                {g.is_connected ? <span className="text-emerald-600 text-xs font-bold flex items-center gap-1"><CheckCircle2 size={13} /> متصل</span> : <span className="text-slate-400 text-xs">غير متصل</span>}
              </div>
              <p className="text-[11px] text-slate-400 mt-3">الحد اليومي: {g.daily_limit.toLocaleString()} · {g.provider === 'simulation' ? 'محاكاة' : 'مزوّد فعلي (بحاجة مفتاح)'}</p>
              {!g.is_connected && <button onClick={() => connect(g.id)} disabled={busy} className="w-full mt-3 text-sm bg-fuchsia-600 text-white rounded-xl py-2 hover:bg-fuchsia-700">ربط (محاكاة)</button>}
            </div>
          ))}
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2 mb-1"><Flame size={18} className="text-orange-500" /><h2 className="font-black text-slate-800">التدرّج الآمن لواتساب (Warm-up)</h2></div>
        <p className="text-xs text-slate-500 mb-4">ابدأ بأحجام صغيرة لتجنّب تعليق الحساب من Meta.</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {warmup.map((w) => (
            <div key={w.week_label} className="rounded-xl border border-slate-100 p-4 text-center">
              <p className="text-xs text-slate-400">{w.week_label}</p>
              <p className="text-lg font-black text-slate-800 mt-1">{w.daily_limit.toLocaleString()}</p>
              <p className="text-[10px] text-slate-400">رسالة/يوم</p>
            </div>
          ))}
        </div>
      </section>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4"><h3 className="font-black text-slate-800">بوابة مراسلة</h3><button onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button></div>
            <div className="space-y-3">
              <div><label className="text-xs text-slate-500">القناة</label><select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value as MessagingChannel })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none"><option value="sms">SMS</option><option value="whatsapp">واتساب</option></select></div>
              <div><label className="text-xs text-slate-500">المزوّد</label><select value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value as MessagingProvider })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none">{PROVIDERS.map((p) => <option key={p} value={p}>{PROVIDER_LABEL[p]}</option>)}</select></div>
              <div><label className="text-xs text-slate-500">Sender ID / رقم المرسل</label><input value={form.sender_id || ''} onChange={(e) => setForm({ ...form, sender_id: e.target.value })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none font-mono" placeholder="Kyvzon أو +9647..." /></div>
              {err && <p className="text-xs text-rose-600">{err}</p>}
            </div>
            <div className="flex gap-2 mt-5"><button onClick={add} disabled={busy} className="flex-1 bg-fuchsia-600 text-white text-sm py-2.5 rounded-xl hover:bg-fuchsia-700 disabled:opacity-60">حفظ</button><button onClick={() => setShowAdd(false)} className="px-4 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">إلغاء</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
