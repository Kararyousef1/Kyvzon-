/**
 * UtmPage — مولّد روابط UTM + جدول الروابط مع الإسناد (نقرات/تحويلات/إيراد).
 */
import { useState } from 'react';
import { Copy, Check, Tag } from 'lucide-react';
import { socialUtmService } from '../../../services/sdk';
import { useUtmLinks, PLATFORM_LABEL } from './useSocial';

export default function UtmPage() {
  const { data: links, loading, reload } = useUtmLinks();
  const [form, setForm] = useState({ base: '', source: 'instagram', campaign: '', content: '', term: '' });
  const [generated, setGenerated] = useState('');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const generate = async () => {
    if (!form.base.trim()) return; setBusy(true);
    try {
      const url = await socialUtmService.buildUrl({ base: form.base, source: form.source, campaign: form.campaign || undefined, content: form.content || undefined, term: form.term || undefined });
      setGenerated(url);
    } catch { /* noop */ } finally { setBusy(false); }
  };
  const saveLink = async () => {
    if (!generated) return; setBusy(true);
    try {
      await socialUtmService.createLink({ base_url: form.base, utm_source: form.source, utm_campaign: form.campaign || null, utm_content: form.content || null, utm_term: form.term || null, full_url: generated });
      setGenerated(''); setForm({ base: '', source: 'instagram', campaign: '', content: '', term: '' }); reload();
    } catch { /* noop */ } finally { setBusy(false); }
  };
  const copy = () => { navigator.clipboard?.writeText(generated); setCopied(true); setTimeout(() => setCopied(false), 1500); };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2 mb-1"><Tag size={18} className="text-fuchsia-600" /><h2 className="font-black text-slate-800">مولّد روابط UTM</h2></div>
        <p className="text-xs text-slate-500 mb-4">المعاملات الخمسة لتتبع مصدر كل زيارة وربط الإيراد بالمنشور.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="text-xs text-slate-500">الرابط الأساسي *</label><input value={form.base} onChange={(e) => setForm({ ...form, base: e.target.value })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none font-mono" placeholder="https://kyvzon.com/pricing" /></div>
          <div><label className="text-xs text-slate-500">utm_source (المنصة)</label><select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none"><option value="instagram">instagram</option><option value="facebook">facebook</option><option value="linkedin">linkedin</option><option value="x">x</option></select></div>
          <div><label className="text-xs text-slate-500">utm_campaign</label><input value={form.campaign} onChange={(e) => setForm({ ...form, campaign: e.target.value })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none font-mono" placeholder="q1-2026-launch" /></div>
          <div><label className="text-xs text-slate-500">utm_content</label><input value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none font-mono" placeholder="reel-pricing" /></div>
        </div>
        <button onClick={generate} disabled={busy} className="mt-3 bg-fuchsia-600 text-white text-sm px-4 py-2 rounded-xl hover:bg-fuchsia-700">توليد الرابط</button>
        {generated && (
          <div className="mt-3 rounded-xl border border-fuchsia-200 bg-fuchsia-50 p-3">
            <p className="text-xs text-slate-700 font-mono break-all">{generated}</p>
            <div className="flex gap-2 mt-2">
              <button onClick={copy} className="text-xs bg-white border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 flex items-center gap-1">{copied ? <><Check size={12} /> نُسخ</> : <><Copy size={12} /> نسخ</>}</button>
              <button onClick={saveLink} disabled={busy} className="text-xs bg-fuchsia-600 text-white px-3 py-1.5 rounded-lg hover:bg-fuchsia-700">حفظ للإسناد</button>
            </div>
          </div>
        )}
      </section>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100"><h3 className="font-black text-slate-800">روابط الإسناد (Attribution)</h3></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs"><tr><th className="text-right px-5 py-2.5">المصدر</th><th className="text-right px-5 py-2.5">الحملة</th><th className="text-center px-5 py-2.5">نقرات</th><th className="text-center px-5 py-2.5">تحويلات</th><th className="text-center px-5 py-2.5">إيراد مُنسب</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? <tr><td colSpan={5} className="text-center py-8 text-slate-400">جارٍ التحميل…</td></tr>
                : links.length === 0 ? <tr><td colSpan={5} className="text-center py-8 text-slate-400">لا روابط بعد — ولّد رابطاً واحفظه.</td></tr>
                  : links.map((l) => (
                    <tr key={l.id} className="hover:bg-slate-50/60">
                      <td className="px-5 py-3 font-semibold text-slate-700">{PLATFORM_LABEL[l.utm_source] || l.utm_source}</td>
                      <td className="px-5 py-3 text-xs text-slate-500 font-mono">{l.utm_campaign || '—'}</td>
                      <td className="px-5 py-3 text-center">{l.clicks}</td>
                      <td className="px-5 py-3 text-center">{l.conversions}</td>
                      <td className="px-5 py-3 text-center font-black text-emerald-600">${Number(l.attributed_revenue).toLocaleString()}</td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
