/**
 * CampaignsPage — الحملات: إنشاء (عادية أو A/B) + جدولة + إرسال (محاكاة) + KPIs + حسم A/B.
 */
import { useState } from 'react';
import { Plus, X, Send, ChevronLeft, Beaker, Trophy, Calendar } from 'lucide-react';
import {
  emailCampaignService, campaignVariantService,
  type EmailCampaignInput, type EmailCampaign,
} from '../../../services/sdk';
import { useCampaigns, useLists, CAMPAIGN_STATUS_LABEL, CAMPAIGN_STATUS_COLOR } from './useEmail';
import CampaignDetail from './CampaignDetail';

export default function CampaignsPage() {
  const { data: campaigns, loading, reload } = useCampaigns();
  const { data: lists } = useLists();
  const [selected, setSelected] = useState<EmailCampaign | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<EmailCampaignInput & { subjectA: string; subjectB: string }>({
    name: '', list_id: null, is_ab_test: false, scheduled_at: null, subjectA: '', subjectB: '',
  });
  const [err, setErr] = useState<string | null>(null);

  const create = async () => {
    if (!form.name.trim()) { setErr('اسم الحملة مطلوب'); return; }
    setBusy(true); setErr(null);
    try {
      const { subjectA, subjectB, ...rest } = form;
      const camp = await emailCampaignService.createCampaign({ ...rest, status: rest.scheduled_at ? 'scheduled' : 'draft' });
      await campaignVariantService.createVariant({ campaign_id: camp.id, variant_label: 'A', subject: subjectA || form.name, sample_pct: form.is_ab_test ? 50 : 100 });
      if (form.is_ab_test) await campaignVariantService.createVariant({ campaign_id: camp.id, variant_label: 'B', subject: subjectB || form.name, sample_pct: 50 });
      setShowCreate(false); reload(); setSelected(camp);
      setForm({ name: '', list_id: null, is_ab_test: false, scheduled_at: null, subjectA: '', subjectB: '' });
    } catch (e) { setErr(e instanceof Error ? e.message : 'تعذّر الإنشاء'); } finally { setBusy(false); }
  };

  if (selected) {
    return (
      <div className="space-y-4">
        <button onClick={() => { setSelected(null); reload(); }} className="flex items-center gap-1 text-sm text-fuchsia-600 hover:underline"><ChevronLeft size={16} /> رجوع لقائمة الحملات</button>
        <CampaignDetail campaign={selected} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{loading ? 'جارٍ التحميل…' : `${campaigns.length} حملة`}</p>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 bg-fuchsia-600 text-white text-sm px-4 py-2 rounded-xl hover:bg-fuchsia-700"><Plus size={16} /> حملة جديدة</button>
      </div>

      {campaigns.length === 0 && !loading ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center"><Send size={34} className="mx-auto text-slate-300" /><p className="text-slate-500 mt-3 font-semibold">لا حملات بعد</p></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {campaigns.map((c) => (
            <div key={c.id} className="rounded-2xl border border-slate-200 bg-white p-4 hover:border-fuchsia-200 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${CAMPAIGN_STATUS_COLOR[c.status]}`}>{CAMPAIGN_STATUS_LABEL[c.status]}</span>
                {c.is_ab_test && <span className="text-[10px] font-bold bg-violet-50 text-violet-600 px-2 py-0.5 rounded-full flex items-center gap-1"><Beaker size={10} /> A/B</span>}
              </div>
              <h3 className="font-black text-slate-800 mt-2">{c.name}</h3>
              {c.scheduled_at && <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1"><Calendar size={11} /> {new Date(c.scheduled_at).toLocaleString('ar')}</p>}
              {c.ab_winner_variant && <p className="text-[11px] text-emerald-600 mt-1 flex items-center gap-1"><Trophy size={11} /> تم حسم الفائز</p>}
              <button onClick={() => setSelected(c)} className="w-full mt-3 text-sm border border-slate-200 rounded-xl py-2 hover:bg-slate-50 text-slate-700">فتح الحملة</button>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4"><h3 className="font-black text-slate-800">حملة جديدة</h3><button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button></div>
            <div className="space-y-3">
              <div><label className="text-xs text-slate-500">اسم الحملة *</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" /></div>
              <div><label className="text-xs text-slate-500">القائمة المستهدفة</label>
                <select value={form.list_id || ''} onChange={(e) => setForm({ ...form, list_id: e.target.value || null })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none">
                  <option value="">— اختر قائمة —</option>
                  {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={form.is_ab_test} onChange={(e) => setForm({ ...form, is_ab_test: e.target.checked })} /> اختبار A/B (نسختان بعينة 50/50)</label>
              <div><label className="text-xs text-slate-500">عنوان النسخة A</label><input value={form.subjectA} onChange={(e) => setForm({ ...form, subjectA: e.target.value })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" /></div>
              {form.is_ab_test && <div><label className="text-xs text-slate-500">عنوان النسخة B</label><input value={form.subjectB} onChange={(e) => setForm({ ...form, subjectB: e.target.value })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" /></div>}
              <div><label className="text-xs text-slate-500">جدولة (اختياري) — اتركه فارغاً للإرسال اليدوي</label><input type="datetime-local" value={form.scheduled_at || ''} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value || null })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" /></div>
              {err && <p className="text-xs text-rose-600">{err}</p>}
            </div>
            <div className="flex gap-2 mt-5"><button onClick={create} disabled={busy} className="flex-1 bg-fuchsia-600 text-white text-sm py-2.5 rounded-xl hover:bg-fuchsia-700 disabled:opacity-60">{busy ? 'جارٍ…' : 'إنشاء الحملة'}</button><button onClick={() => setShowCreate(false)} className="px-4 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">إلغاء</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
