/**
 * CulturalPage — التقويم الثقافي/الزمني: القواعد المرجعية + المناسبات القابلة للتحديث.
 */
import { useState } from 'react';
import { Plus, X, Moon, CalendarClock } from 'lucide-react';
import { culturalCalendarService, CULTURAL_RULES, type CulturalOccasionInput, type OccasionType, type OccasionEffect } from '../../../services/sdk';
import { useOccasions, OCCASION_LABEL, EFFECT_LABEL } from './useImmune';

const TYPES: OccasionType[] = ['ramadan', 'prayer_window', 'national_day', 'weekend', 'mourning', 'custom'];
const EFFECTS: OccasionEffect[] = ['reduce', 'defer', 'suspend_promotional', 'suspend_all'];

export default function CulturalPage() {
  const { data: occasions, loading, reload } = useOccasions();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<CulturalOccasionInput>({ name: '', occasion_type: 'national_day', effect: 'suspend_promotional', country: '', starts_at: null, ends_at: null });
  const [err, setErr] = useState<string | null>(null);

  const add = async () => {
    if (!form.name.trim()) { setErr('الاسم مطلوب'); return; }
    setBusy(true); setErr(null);
    try { await culturalCalendarService.createOccasion(form); setShow(false); setForm({ name: '', occasion_type: 'national_day', effect: 'suspend_promotional', country: '', starts_at: null, ends_at: null }); reload(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'تعذّر الحفظ'); } finally { setBusy(false); }
  };
  const toggle = async (id: string, active: boolean) => { setBusy(true); try { await culturalCalendarService.toggle(id, !active); reload(); } catch { /* noop */ } finally { setBusy(false); } };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2 mb-1"><Moon size={18} className="text-fuchsia-600" /><h2 className="font-black text-slate-800">القواعد الثقافية/الزمنية</h2></div>
        <p className="text-xs text-slate-500 mb-4">وعي إقليمي خليجي مبني في المحرك — يحتاج ربطاً بمصدر تقويم أم القرى وأوقات الصلاة في الإنتاج.</p>
        <div className="space-y-2">
          {CULTURAL_RULES.map((r) => (
            <div key={r.trigger} className="flex items-start gap-3 rounded-xl border border-slate-100 p-3"><CalendarClock size={16} className="text-fuchsia-500 mt-0.5 flex-shrink-0" /><div><p className="text-sm font-bold text-slate-700">{r.trigger}</p><p className="text-[11px] text-slate-500 mt-0.5">{r.action}</p></div></div>
          ))}
        </div>
      </section>

      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{loading ? 'جارٍ التحميل…' : `${occasions.length} مناسبة`}</p>
        <button onClick={() => setShow(true)} className="flex items-center gap-1.5 bg-fuchsia-600 text-white text-sm px-4 py-2 rounded-xl hover:bg-fuchsia-700"><Plus size={16} /> مناسبة</button>
      </div>

      {occasions.length === 0 && !loading ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-400 text-sm">لا مناسبات مُضافة — أضف يوماً وطنياً أو حداداً ليُطبَّق تلقائياً على الوحدات الست.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {occasions.map((o) => (
            <div key={o.id} className={`rounded-2xl border bg-white p-4 ${o.is_active ? 'border-slate-200' : 'border-slate-100 opacity-60'}`}>
              <div className="flex items-center justify-between"><span className="text-[10px] font-bold bg-fuchsia-50 text-fuchsia-600 px-2 py-0.5 rounded-full">{OCCASION_LABEL[o.occasion_type]}</span><button onClick={() => toggle(o.id, o.is_active)} disabled={busy} className="text-xs text-slate-400 hover:text-fuchsia-600">{o.is_active ? 'إيقاف' : 'تفعيل'}</button></div>
              <h3 className="font-black text-slate-800 mt-2">{o.name}</h3>
              <p className="text-[11px] text-slate-500 mt-1">{EFFECT_LABEL[o.effect]}{o.country ? ` · ${o.country}` : ''}</p>
              {o.starts_at && <p className="text-[10px] text-slate-400 mt-1">{new Date(o.starts_at).toLocaleDateString('ar')}{o.ends_at ? ` — ${new Date(o.ends_at).toLocaleDateString('ar')}` : ''}</p>}
            </div>
          ))}
        </div>
      )}

      {show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShow(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4"><h3 className="font-black text-slate-800">مناسبة ثقافية</h3><button onClick={() => setShow(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button></div>
            <div className="space-y-3">
              <div><label className="text-xs text-slate-500">الاسم *</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" placeholder="اليوم الوطني السعودي" /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-xs text-slate-500">النوع</label><select value={form.occasion_type} onChange={(e) => setForm({ ...form, occasion_type: e.target.value as OccasionType })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none">{TYPES.map((t) => <option key={t} value={t}>{OCCASION_LABEL[t]}</option>)}</select></div>
                <div><label className="text-xs text-slate-500">الأثر</label><select value={form.effect} onChange={(e) => setForm({ ...form, effect: e.target.value as OccasionEffect })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none">{EFFECTS.map((t) => <option key={t} value={t}>{EFFECT_LABEL[t]}</option>)}</select></div>
              </div>
              <div><label className="text-xs text-slate-500">الدولة (اختياري)</label><input value={form.country || ''} onChange={(e) => setForm({ ...form, country: e.target.value })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" placeholder="SA / AE / KW…" /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-xs text-slate-500">من</label><input type="datetime-local" value={form.starts_at || ''} onChange={(e) => setForm({ ...form, starts_at: e.target.value || null })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" /></div>
                <div><label className="text-xs text-slate-500">إلى</label><input type="datetime-local" value={form.ends_at || ''} onChange={(e) => setForm({ ...form, ends_at: e.target.value || null })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" /></div>
              </div>
              {err && <p className="text-xs text-rose-600">{err}</p>}
            </div>
            <div className="flex gap-2 mt-5"><button onClick={add} disabled={busy} className="flex-1 bg-fuchsia-600 text-white text-sm py-2.5 rounded-xl hover:bg-fuchsia-700 disabled:opacity-60">حفظ</button><button onClick={() => setShow(false)} className="px-4 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">إلغاء</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
