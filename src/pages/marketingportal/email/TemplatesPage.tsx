/**
 * TemplatesPage — القوالب: إنشاء/تحرير قالب RTL + Subject/Preheader مع تحقق الطول
 *  + تخصيص ديناميكي (placeholders) + معاينة.
 */
import { useState } from 'react';
import { Plus, X, LayoutTemplate, Eye } from 'lucide-react';
import { emailTemplateService, type EmailTemplateInput } from '../../../services/sdk';
import { useTemplates } from './useEmail';

const PLACEHOLDERS = ['{{الاسم}}', '{{الشركة}}', '{{المسمى}}', '{{المدينة}}'];

export default function TemplatesPage() {
  const { data: templates, loading, reload } = useTemplates();
  const [showEdit, setShowEdit] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<EmailTemplateInput>({ name: '', subject: '', preheader: '', html: '', is_rtl: true });
  const [err, setErr] = useState<string | null>(null);

  const subjLen = (form.subject || '').length;
  const preLen = (form.preheader || '').length;

  const save = async () => {
    if (!form.name.trim()) { setErr('اسم القالب مطلوب'); return; }
    setBusy(true); setErr(null);
    try { await emailTemplateService.createTemplate(form); setShowEdit(false); setForm({ name: '', subject: '', preheader: '', html: '', is_rtl: true }); reload(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'تعذّر الحفظ'); } finally { setBusy(false); }
  };
  const insert = (p: string) => setForm({ ...form, html: (form.html || '') + ' ' + p });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{loading ? 'جارٍ التحميل…' : `${templates.length} قالب`}</p>
        <button onClick={() => setShowEdit(true)} className="flex items-center gap-1.5 bg-fuchsia-600 text-white text-sm px-4 py-2 rounded-xl hover:bg-fuchsia-700"><Plus size={16} /> قالب جديد</button>
      </div>

      {templates.length === 0 && !loading ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center"><LayoutTemplate size={34} className="mx-auto text-slate-300" /><p className="text-slate-500 mt-3 font-semibold">لا قوالب بعد</p><p className="text-xs text-slate-400 mt-1">أنشئ قالباً لاستخدامه في الحملات.</p></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {templates.map((t) => (
            <div key={t.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-black text-slate-800">{t.name}</h3>
                {t.is_rtl && <span className="text-[10px] font-bold bg-fuchsia-50 text-fuchsia-600 px-2 py-0.5 rounded-full">RTL</span>}
              </div>
              <p className="text-xs text-slate-500 mt-1 truncate">{t.subject || '(بدون عنوان)'}</p>
              <p className="text-[11px] text-slate-400 mt-0.5 truncate">{t.preheader || '—'}</p>
              <button onClick={() => setPreview(t.html || '<p style="color:#94a3b8">لا محتوى</p>')} className="mt-3 w-full text-sm border border-slate-200 rounded-xl py-2 hover:bg-slate-50 text-slate-700 flex items-center justify-center gap-1.5"><Eye size={14} /> معاينة</button>
            </div>
          ))}
        </div>
      )}

      {showEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowEdit(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4"><h3 className="font-black text-slate-800">قالب بريد</h3><button onClick={() => setShowEdit(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button></div>
            <div className="space-y-3">
              <div><label className="text-xs text-slate-500">اسم القالب *</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" /></div>
              <div>
                <div className="flex items-center justify-between"><label className="text-xs text-slate-500">العنوان (Subject)</label><span className={`text-[10px] ${subjLen >= 30 && subjLen <= 50 ? 'text-emerald-600' : 'text-amber-500'}`}>{subjLen}/50 (الأمثل 30-50)</span></div>
                <input value={form.subject || ''} onChange={(e) => setForm({ ...form, subject: e.target.value })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" />
              </div>
              <div>
                <div className="flex items-center justify-between"><label className="text-xs text-slate-500">النص التمهيدي (Preheader)</label><span className={`text-[10px] ${preLen >= 40 && preLen <= 100 ? 'text-emerald-600' : 'text-amber-500'}`}>{preLen}/100 (الأمثل 40-100)</span></div>
                <input value={form.preheader || ''} onChange={(e) => setForm({ ...form, preheader: e.target.value })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" />
              </div>
              <div>
                <label className="text-xs text-slate-500">المحتوى (HTML) — بلوك واحد رئيسي + CTA</label>
                <textarea value={form.html || ''} onChange={(e) => setForm({ ...form, html: e.target.value })} rows={6} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none font-mono" placeholder="<h1>مرحباً {{الاسم}}</h1><a href='#'>احجز استشارتك</a>" />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <span className="text-[10px] text-slate-400">تخصيص ديناميكي:</span>
                  {PLACEHOLDERS.map((p) => <button key={p} onClick={() => insert(p)} className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full hover:bg-fuchsia-50 hover:text-fuchsia-600">{p}</button>)}
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={form.is_rtl} onChange={(e) => setForm({ ...form, is_rtl: e.target.checked })} /> اتجاه RTL (عربي)</label>
              {err && <p className="text-xs text-rose-600">{err}</p>}
            </div>
            <div className="flex gap-2 mt-5"><button onClick={save} disabled={busy} className="flex-1 bg-fuchsia-600 text-white text-sm py-2.5 rounded-xl hover:bg-fuchsia-700 disabled:opacity-60">{busy ? 'جارٍ…' : 'حفظ القالب'}</button><button onClick={() => setShowEdit(false)} className="px-4 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">إلغاء</button></div>
          </div>
        </div>
      )}

      {preview !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setPreview(null)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3"><h3 className="font-black text-slate-800">معاينة</h3><button onClick={() => setPreview(null)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button></div>
            {/* المعاينة: عرض نصّي آمن (بدون حقن HTML خام) */}
            <div dir="rtl" className="rounded-xl border border-slate-200 p-4 text-sm text-slate-700 bg-slate-50 whitespace-pre-wrap break-words">{preview.replace(/<[^>]+>/g, ' ').trim() || '(لا محتوى)'}</div>
            <p className="text-[10px] text-slate-400 mt-2">المعاينة النصية للأمان؛ العرض الكامل بالتنسيق في صندوق بريد المستلم.</p>
          </div>
        </div>
      )}
    </div>
  );
}
