/**
 * ═════════════════════════════════════════════════════════════════════════
 *  IntegrationsPage — ربط المزوّدين (مفاتيح خاصة بالشركة — BYOK)
 *
 *  كل شركة تُدخل مفاتيح مزوّديها (Resend/Twilio/Stripe/...) فترسل بهويتها.
 *  الأسرار محميّة: تُحفظ عبر دوال آمنة، وتُعرَض فقط كـ "مربوط ✓ + آخر 4 أحرف".
 * ═════════════════════════════════════════════════════════════════════════
 */
import { useCallback, useEffect, useState } from 'react';
import { Plug, Check, X, Trash2, ShieldCheck, KeyRound, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  tenantProviderService, SUPPORTED_PROVIDERS,
  type ProviderStatus, type ProviderMeta,
} from '../../services/sdk';
import { MARKETING_BASE } from './marketingCatalog';

export default function IntegrationsPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<ProviderStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ProviderMeta | null>(null);
  const [secret, setSecret] = useState('');
  const [config, setConfig] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setStatus(await tenantProviderService.listStatus()); }
    catch { setStatus([]); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const statusOf = (m: ProviderMeta) => status.find((s) => s.channel === m.channel && s.provider === m.provider);

  const openEdit = (m: ProviderMeta) => { setEditing(m); setSecret(''); setConfig({}); setMsg(null); };

  const save = async () => {
    if (!editing) return;
    if (secret.trim().length < 4) { setMsg('المفتاح غير صالح'); return; }
    setBusy(true); setMsg(null);
    try {
      await tenantProviderService.setCredential({ channel: editing.channel, provider: editing.provider, secret, config });
      setEditing(null); setMsg('✅ تم حفظ المفتاح بأمان (لن يُعرض مجدداً).'); load();
    } catch (e) { setMsg(e instanceof Error ? e.message : 'تعذّر الحفظ'); } finally { setBusy(false); }
  };

  const remove = async (m: ProviderMeta) => {
    setBusy(true);
    try { await tenantProviderService.deleteCredential(m.channel, m.provider); load(); }
    catch { /* noop */ } finally { setBusy(false); }
  };

  return (
    <div className="space-y-5" dir="rtl">
      <div className="bg-gradient-to-br from-fuchsia-600 via-purple-600 to-indigo-600 rounded-3xl p-6 text-white relative overflow-hidden">
        <div className="absolute -top-10 -left-10 w-40 h-40 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center"><Plug size={24} /></div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black">ربط المزوّدين</h1>
              <p className="text-white/75 text-sm">أدخل مفاتيح شركتك لترسل بهويتك وفاتورتك — الأسرار محميّة بالكامل</p>
            </div>
          </div>
          <button onClick={() => navigate(MARKETING_BASE)} className="flex items-center gap-1.5 text-xs bg-white/15 hover:bg-white/25 px-3 py-2 rounded-xl"><ArrowRight size={14} /> بوابة التسويق</button>
        </div>
      </div>

      <div className="rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-700 px-4 py-2.5 flex items-center gap-2">
        <ShieldCheck size={16} /> مفاتيحك سرّية تماماً: تُحفظ مشفّرة الوصول، لا تظهر للمتصفح، ولا يراها أي مستأجر آخر. بعد الحفظ تُعرَض كـ "مربوط ✓" فقط.
      </div>

      {msg && <div className="rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-600 px-4 py-2.5">{msg}</div>}

      {loading ? <p className="text-slate-400 text-sm text-center py-10">جارٍ التحميل…</p>
        : <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {SUPPORTED_PROVIDERS.map((m) => {
            const st = statusOf(m);
            return (
              <div key={`${m.channel}-${m.provider}`} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${st?.isConfigured ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}><KeyRound size={17} /></div>
                    <div>
                      <p className="font-bold text-slate-800 text-sm">{m.label}</p>
                      {st?.isConfigured
                        ? <p className="text-[11px] text-emerald-600 flex items-center gap-1"><Check size={11} /> مربوط · ينتهي بـ …{st.last4}</p>
                        : <p className="text-[11px] text-slate-400">غير مربوط (يعمل بالمحاكاة)</p>}
                    </div>
                  </div>
                  {st?.isConfigured && <button onClick={() => remove(m)} disabled={busy} className="text-rose-400 hover:text-rose-600"><Trash2 size={15} /></button>}
                </div>
                <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">{m.hint}</p>
                <button onClick={() => openEdit(m)} className="mt-3 w-full text-sm border border-slate-200 rounded-xl py-2 hover:bg-slate-50 text-slate-700">
                  {st?.isConfigured ? 'تحديث المفتاح' : 'ربط المزوّد'}
                </button>
              </div>
            );
          })}
        </div>}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1"><h3 className="font-black text-slate-800">{editing.label}</h3><button onClick={() => setEditing(null)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button></div>
            <p className="text-xs text-slate-400 mb-4">{editing.hint}</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-500">{editing.secretLabel} *</label>
                <input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none font-mono" placeholder="••••••••••••" />
              </div>
              {editing.configFields?.map((f) => (
                <div key={f.key}>
                  <label className="text-xs text-slate-500">{f.label}</label>
                  <input value={config[f.key] || ''} onChange={(e) => setConfig({ ...config, [f.key]: e.target.value })} placeholder={f.placeholder} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" />
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={save} disabled={busy} className="flex-1 bg-fuchsia-600 text-white text-sm py-2.5 rounded-xl hover:bg-fuchsia-700 disabled:opacity-60">{busy ? 'جارٍ…' : 'حفظ بأمان'}</button>
              <button onClick={() => setEditing(null)} className="px-4 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
