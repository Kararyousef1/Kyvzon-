/**
 * InfraPage — البنية التقنية: نطاقات الإرسال + SPF/DKIM/DMARC/BIMI + تدفئة النطاق.
 */
import { useEffect, useState } from 'react';
import { Plus, X, ShieldCheck, CheckCircle2, Flame } from 'lucide-react';
import { senderDomainService, type SenderDomainInput, type WarmupWeek } from '../../../services/sdk';
import { useDomains, AUTH_LABEL, AUTH_COLOR } from './useEmail';

export default function InfraPage() {
  const { data: domains, loading, reload } = useDomains();
  const [warmup, setWarmup] = useState<WarmupWeek[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<SenderDomainInput>({ domain: '', from_name: '', from_email: '' });
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { senderDomainService.warmupSchedule().then(setWarmup).catch(() => {}); }, []);

  const add = async () => {
    if (!form.domain.trim()) { setErr('النطاق مطلوب'); return; }
    setBusy(true); setErr(null);
    try { await senderDomainService.createDomain(form); setShowAdd(false); setForm({ domain: '', from_name: '', from_email: '' }); reload(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'تعذّر الحفظ'); } finally { setBusy(false); }
  };
  const verify = async (id: string) => { setBusy(true); try { await senderDomainService.verify(id); reload(); } catch { /* noop */ } finally { setBusy(false); } };

  const AuthPill = ({ label, status }: { label: string; status: string }) => (
    <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full ${AUTH_COLOR[status] || 'bg-slate-100 text-slate-500'}`}>
      {label}: {AUTH_LABEL[status] || status}
    </span>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{loading ? 'جارٍ التحميل…' : `${domains.length} نطاق إرسال`}</p>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 bg-fuchsia-600 text-white text-sm px-4 py-2 rounded-xl hover:bg-fuchsia-700"><Plus size={16} /> نطاق جديد</button>
      </div>

      {domains.length === 0 && !loading ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <ShieldCheck size={34} className="mx-auto text-slate-300" />
          <p className="text-slate-500 mt-3 font-semibold">لا نطاقات إرسال بعد</p>
          <p className="text-xs text-slate-400 mt-1">أضف نطاقك ثم وثّق SPF/DKIM/DMARC لضمان وصول رسائلك.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {domains.map((d) => {
            const allVerified = d.spf_status === 'verified' && d.dkim_status === 'verified' && d.dmarc_status === 'verified';
            return (
              <div key={d.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-black text-slate-800">{d.domain}</p>
                    <p className="text-xs text-slate-400">{d.from_name || '—'} · {d.from_email || '—'}</p>
                  </div>
                  {allVerified
                    ? <span className="text-emerald-600 text-xs font-bold flex items-center gap-1"><CheckCircle2 size={14} /> جاهز</span>
                    : <button onClick={() => verify(d.id)} disabled={busy} className="text-xs bg-fuchsia-50 text-fuchsia-600 border border-fuchsia-200 px-3 py-1.5 rounded-lg hover:bg-fuchsia-100">فحص المصادقة</button>}
                </div>
                <div className="flex flex-wrap gap-1.5 mt-3">
                  <AuthPill label="SPF" status={d.spf_status} />
                  <AuthPill label="DKIM" status={d.dkim_status} />
                  <AuthPill label="DMARC" status={d.dmarc_status} />
                  <span className="text-[10px] font-bold border border-slate-200 bg-slate-50 text-slate-500 px-2 py-0.5 rounded-full">سياسة DMARC: {d.dmarc_policy}</span>
                  <span className="text-[10px] font-bold border border-slate-200 bg-slate-50 text-slate-500 px-2 py-0.5 rounded-full">المزوّد: {d.provider === 'simulation' ? 'محاكاة' : d.provider}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* تدفئة النطاق */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2 mb-1"><Flame size={18} className="text-orange-500" /><h2 className="font-black text-slate-800">جدول تدفئة النطاق (Warm-up)</h2></div>
        <p className="text-xs text-slate-500 mb-4">ابدأ بأكثر المشتركين تفاعلاً وزد الحجم تدريجياً لبناء سمعة النطاق.</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {warmup.map((w) => (
            <div key={w.week_no} className="rounded-xl border border-slate-100 p-4 text-center">
              <p className="text-xs text-slate-400">الأسبوع {w.week_no}</p>
              <p className="text-lg font-black text-slate-800 mt-1">{w.daily_limit_min.toLocaleString()}–{w.daily_limit_max.toLocaleString()}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">رسالة/يوم</p>
            </div>
          ))}
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 text-center">
            <p className="text-xs text-emerald-600">بعد 30 يوماً</p>
            <p className="text-lg font-black text-emerald-700 mt-1">الحجم الكامل</p>
          </div>
        </div>
      </section>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4"><h3 className="font-black text-slate-800">نطاق إرسال جديد</h3><button onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button></div>
            <div className="space-y-3">
              <div><label className="text-xs text-slate-500">النطاق (domain) *</label><input value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none font-mono" placeholder="mail.company.com" /></div>
              <div><label className="text-xs text-slate-500">اسم المرسل</label><input value={form.from_name || ''} onChange={(e) => setForm({ ...form, from_name: e.target.value })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" /></div>
              <div><label className="text-xs text-slate-500">بريد المرسل</label><input value={form.from_email || ''} onChange={(e) => setForm({ ...form, from_email: e.target.value })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none font-mono" placeholder="news@company.com" /></div>
              {err && <p className="text-xs text-rose-600">{err}</p>}
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={add} disabled={busy} className="flex-1 bg-fuchsia-600 text-white text-sm py-2.5 rounded-xl hover:bg-fuchsia-700 disabled:opacity-60">{busy ? 'جارٍ…' : 'حفظ'}</button>
              <button onClick={() => setShowAdd(false)} className="px-4 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
