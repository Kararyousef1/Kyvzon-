/**
 * ImmunityPage — المناعة الذاتية: كشف شذوذ + تعليق تلقائي + مسودة تعافٍ + التعليق العام.
 */
import { useState } from 'react';
import { Plus, X, HeartPulse, AlertOctagon, CheckCircle2, ShieldAlert } from 'lucide-react';
import { immuneService, type IncidentType } from '../../../services/sdk';
import { useIncidents, useImmuneSettings, INCIDENT_LABEL, INCIDENT_STATUS_LABEL } from './useImmune';

const TYPES: IncidentType[] = ['unsubscribe_spike', 'complaint_spike', 'bounce_spike', 'broken_link', 'manual'];

export default function ImmunityPage() {
  const { data: incidents, loading, reload } = useIncidents();
  const { data: settings, reload: reloadSettings } = useImmuneSettings();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<{ type: IncidentType; severity: 'warning' | 'critical'; description: string }>({ type: 'unsubscribe_spike', severity: 'critical', description: '' });

  const raise = async () => {
    if (!form.description.trim()) return; setBusy(true);
    try { await immuneService.raise(form.type, form.severity, form.description, 'manual'); setShow(false); setForm({ type: 'unsubscribe_spike', severity: 'critical', description: '' }); reload(); reloadSettings(); }
    catch { /* noop */ } finally { setBusy(false); }
  };
  const resolve = async (id: string) => { setBusy(true); try { await immuneService.resolve(id); reload(); reloadSettings(); } catch { /* noop */ } finally { setBusy(false); } };

  return (
    <div className="space-y-4">
      {settings?.global_promotional_paused && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 flex items-center gap-2">
          <ShieldAlert size={16} /> <b>تعليق عام نشط:</b> {settings.pause_reason || 'كل المحتوى الترويجي مُعلَّق'} — يُطبَّق تلقائياً على الوحدات الست.
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{loading ? 'جارٍ التحميل…' : `${incidents.length} حادث`}</p>
        <button onClick={() => setShow(true)} className="flex items-center gap-1.5 bg-fuchsia-600 text-white text-sm px-4 py-2 rounded-xl hover:bg-fuchsia-700"><Plus size={16} /> تسجيل حادث (محاكاة)</button>
      </div>

      {incidents.length === 0 && !loading ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center"><HeartPulse size={34} className="mx-auto text-slate-300" /><p className="text-slate-500 mt-3 font-semibold">لا حوادث — النظام سليم</p><p className="text-xs text-slate-400 mt-1">يرصد النظام طفرات الإلغاء/الشكاوى ويُعلّق تلقائياً عند الخطر.</p></div>
      ) : (
        <div className="space-y-2">
          {incidents.map((i) => (
            <div key={i.id} className={`rounded-2xl border bg-white p-4 ${i.severity === 'critical' ? 'border-rose-200' : 'border-amber-200'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${i.severity === 'critical' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'}`}><AlertOctagon size={18} /></div>
                  <div>
                    <p className="font-bold text-slate-800">{INCIDENT_LABEL[i.incident_type]}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{i.description}</p>
                    {i.auto_suspended && <p className="text-[11px] text-rose-600 mt-1">⚡ تعليق تلقائي فوري نُفِّذ</p>}
                  </div>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${i.status === 'resolved' ? 'bg-emerald-50 text-emerald-600' : i.status === 'suspended' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'}`}>{INCIDENT_STATUS_LABEL[i.status]}</span>
              </div>
              {i.recovery_draft && (
                <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <p className="text-[10px] text-slate-400 mb-1">مسودة رسالة تعافٍ مقترحة (للمراجعة البشرية):</p>
                  <p className="text-xs text-slate-600 leading-relaxed">{i.recovery_draft}</p>
                </div>
              )}
              {i.status !== 'resolved' && <button onClick={() => resolve(i.id)} disabled={busy} className="mt-3 text-xs bg-emerald-50 text-emerald-600 border border-emerald-200 px-3 py-1.5 rounded-lg hover:bg-emerald-100 inline-flex items-center gap-1"><CheckCircle2 size={12} /> حلّ ورفع التعليق</button>}
            </div>
          ))}
        </div>
      )}

      {show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShow(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4"><h3 className="font-black text-slate-800">تسجيل حادث</h3><button onClick={() => setShow(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button></div>
            <div className="space-y-3">
              <div><label className="text-xs text-slate-500">النوع</label><select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as IncidentType })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none">{TYPES.map((t) => <option key={t} value={t}>{INCIDENT_LABEL[t]}</option>)}</select></div>
              <div><label className="text-xs text-slate-500">الشدة</label><select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value as 'warning' | 'critical' })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none"><option value="warning">تحذير</option><option value="critical">حرج (تعليق تلقائي)</option></select></div>
              <div><label className="text-xs text-slate-500">الوصف</label><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" placeholder="طفرة إلغاء اشتراك خلال 7 دقائق" /></div>
            </div>
            <div className="flex gap-2 mt-5"><button onClick={raise} disabled={busy} className="flex-1 bg-fuchsia-600 text-white text-sm py-2.5 rounded-xl hover:bg-fuchsia-700 disabled:opacity-60">تسجيل</button><button onClick={() => setShow(false)} className="px-4 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">إلغاء</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
