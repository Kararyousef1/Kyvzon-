/**
 * TemplatesPage — قوالب واتساب المعتمدة (Utility/Marketing/Authentication) + حالة موافقة Meta.
 */
import { useState } from 'react';
import { Plus, X, FileCheck, Send, CheckCircle2 } from 'lucide-react';
import { whatsappTemplateService, type WhatsappTemplateInput, type WaCategory } from '../../../services/sdk';
import { useWaTemplates, WA_STATUS_LABEL, WA_STATUS_COLOR, WA_CATEGORY_LABEL } from './useMessaging';

const CATEGORIES: WaCategory[] = ['utility', 'marketing', 'authentication'];

export default function TemplatesPage() {
  const { data: templates, loading, reload } = useWaTemplates();
  const [showAdd, setShowAdd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<WhatsappTemplateInput>({ name: '', category: 'utility', language: 'ar', body: '' });
  const [err, setErr] = useState<string | null>(null);

  const add = async () => {
    if (!form.name.trim() || !form.body.trim()) { setErr('الاسم والنص مطلوبان'); return; }
    setBusy(true); setErr(null);
    try { await whatsappTemplateService.createTemplate(form); setShowAdd(false); setForm({ name: '', category: 'utility', language: 'ar', body: '' }); reload(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'تعذّر الحفظ'); } finally { setBusy(false); }
  };
  const submit = async (id: string) => { setBusy(true); try { await whatsappTemplateService.submitForApproval(id); reload(); } catch { /* noop */ } finally { setBusy(false); } };
  const approve = async (id: string) => { setBusy(true); try { await whatsappTemplateService.approve(id); reload(); } catch { /* noop */ } finally { setBusy(false); } };
  const insert = (p: string) => setForm({ ...form, body: form.body + ' ' + p });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{loading ? 'جارٍ التحميل…' : `${templates.length} قالب`}</p>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 bg-fuchsia-600 text-white text-sm px-4 py-2 rounded-xl hover:bg-fuchsia-700"><Plus size={16} /> قالب واتساب</button>
      </div>

      {templates.length === 0 && !loading ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center"><FileCheck size={34} className="mx-auto text-slate-300" /><p className="text-slate-500 mt-3 font-semibold">لا قوالب</p><p className="text-xs text-slate-400 mt-1">واتساب يتطلب قوالب معتمدة من Meta للإرسال الجماعي.</p></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {templates.map((t) => (
            <div key={t.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold bg-fuchsia-50 text-fuchsia-600 px-2 py-0.5 rounded-full">{WA_CATEGORY_LABEL[t.category]}</span>
                <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full ${WA_STATUS_COLOR[t.approval_status]}`}>{WA_STATUS_LABEL[t.approval_status]}</span>
              </div>
              <h3 className="font-black text-slate-800 mt-2">{t.name}</h3>
              <p className="text-xs text-slate-600 mt-1 line-clamp-3 whitespace-pre-wrap min-h-[3rem]">{t.body}</p>
              <div className="flex gap-2 mt-3">
                {t.approval_status === 'draft' && <button onClick={() => submit(t.id)} disabled={busy} className="flex-1 text-xs bg-fuchsia-600 text-white rounded-lg py-1.5 hover:bg-fuchsia-700 flex items-center justify-center gap-1"><Send size={12} /> تقديم للموافقة</button>}
                {t.approval_status === 'pending' && <button onClick={() => approve(t.id)} disabled={busy} className="flex-1 text-xs bg-emerald-600 text-white rounded-lg py-1.5 hover:bg-emerald-700 flex items-center justify-center gap-1"><CheckCircle2 size={12} /> محاكاة موافقة Meta</button>}
                {t.approval_status === 'approved' && <span className="flex-1 text-xs text-emerald-600 font-bold flex items-center justify-center gap-1"><CheckCircle2 size={13} /> جاهز للاستخدام</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4"><h3 className="font-black text-slate-800">قالب واتساب</h3><button onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button></div>
            <div className="space-y-3">
              <div><label className="text-xs text-slate-500">اسم القالب *</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none font-mono" placeholder="renewal_offer" /></div>
              <div><label className="text-xs text-slate-500">الفئة</label><select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as WaCategory })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none">{CATEGORIES.map((c) => <option key={c} value={c}>{WA_CATEGORY_LABEL[c]}</option>)}</select></div>
              <div>
                <label className="text-xs text-slate-500">نص القالب (استخدم {'{{1}}'} للمتغيّرات)</label>
                <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={5} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" placeholder="مرحباً {{1}}، جدّد اشتراكك قبل {{2}}…" />
                <div className="flex gap-1.5 mt-1">{['{{1}}', '{{2}}', '{{3}}'].map((p) => <button key={p} onClick={() => insert(p)} className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full hover:bg-fuchsia-50 hover:text-fuchsia-600 font-mono">{p}</button>)}</div>
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
