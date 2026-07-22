/**
 * DealDetailPage — سجل الصفقة الكامل: البيانات + السياق التنافسي + تأهيل BANT +
 * إغلاق (win/loss). يعرض تفاصيل الخسارة عند إغلاق الصفقة كخسارة.
 */
import { useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowRight, Briefcase, Building2, Trophy, TrendingDown, ShieldCheck, AlertTriangle, Users, Swords, Save,
} from 'lucide-react';
import {
  crmDealService,
  type CrmDeal,
  DEAL_STATUS_LABEL, DEAL_STATUS_COLOR, DEAL_VALUE_TYPE_LABEL,
} from '../../../services/sdk';
import { useAsync } from './usePipeline';
import { useContactsData } from './useShared';
import CloseDealModal from './CloseDealModal';
import { CRM_BASE } from '../crmCatalog';

function BantChip({ label, val }: { label: string; val: boolean | null }) {
  const tone = val === true ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
    : val === false ? 'bg-rose-50 text-rose-500 border-rose-200'
      : 'bg-slate-100 text-slate-400 border-slate-200';
  return <span className={`text-[11px] font-bold border px-2.5 py-1 rounded-lg ${tone}`}>{label}: {val === true ? '✓' : val === false ? '✗' : '؟'}</span>;
}

export default function DealDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const deal = useAsync<CrmDeal | null>(() => crmDealService.findById(id), null, [id]);
  const { accounts, contacts } = useContactsData();
  const [showClose, setShowClose] = useState(false);
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState<Partial<CrmDeal>>({});
  const [busy, setBusy] = useState(false);
  const [linking, setLinking] = useState(false);
  const [linkMsg, setLinkMsg] = useState<string | null>(null);

  const accName = useMemo(() => Object.fromEntries(accounts.map((a) => [a.id, a.name])), [accounts]);

  const linkFinance = async () => {
    setLinking(true); setLinkMsg(null);
    try {
      const cid = await crmDealService.linkToFinance(id);
      if (cid) { setLinkMsg('✅ تم إنشاء/ربط عميل مالي بنجاح'); deal.reload(); }
      else setLinkMsg('لا كيان قانوني افتراضي — أنشئ كياناً في النظام المالي أولاً.');
    } catch (e) { setLinkMsg(e instanceof Error ? e.message : 'تعذّر الربط'); } finally { setLinking(false); }
  };

  const startEdit = () => { if (deal.data) { setForm({ ...deal.data }); setEdit(true); } };
  const saveEdit = async () => {
    setBusy(true);
    try {
      await crmDealService.updateDeal(id, {
        our_strengths: form.our_strengths ?? null, risks: form.risks ?? null,
        champions: form.champions ?? null, detractors: form.detractors ?? null,
        bant_budget: form.bant_budget ?? null, bant_authority: form.bant_authority ?? null,
        bant_need: form.bant_need ?? null, bant_timeline: form.bant_timeline ?? null,
        competitors: form.competitors ?? [], notes: form.notes ?? null,
      });
      setEdit(false); deal.reload();
    } catch { /* noop */ } finally { setBusy(false); }
  };

  if (deal.loading) return <div className="text-center py-16 text-slate-400">جارٍ التحميل…</div>;
  if (!deal.data) return (
    <div className="text-center py-16"><p className="text-slate-400">الصفقة غير موجودة.</p><Link to={`${CRM_BASE}/pipeline/list`} className="text-cyan-600 text-sm mt-2 inline-block">← عودة</Link></div>
  );

  const d = deal.data;
  const contactName = contacts.find((c) => c.id === d.primary_contact_id)?.full_name;

  return (
    <div className="space-y-5">
      <button onClick={() => navigate(`${CRM_BASE}/pipeline/list`)} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700"><ArrowRight size={14} /> كل الصفقات</button>

      <div className="rounded-3xl border border-slate-200 bg-white p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-cyan-50 text-cyan-600 flex items-center justify-center"><Briefcase size={28} /></div>
            <div>
              <h1 className="text-xl font-black text-slate-800">{d.name}</h1>
              <p className="text-sm text-slate-400 flex items-center gap-1.5 mt-0.5">
                {d.account_id && <><Building2 size={13} /> {accName[d.account_id] || '—'}</>}
                {contactName && <span>· {contactName}</span>}
              </p>
              <div className="flex items-center gap-2 mt-2">
                <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full ${DEAL_STATUS_COLOR[d.status]}`}>{DEAL_STATUS_LABEL[d.status]}</span>
                <span className="text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200 px-2 py-0.5 rounded-full">{d.probability}% احتمالية</span>
              </div>
            </div>
          </div>
          <div className="text-left">
            <p className="text-xs text-slate-400">قيمة الصفقة ({DEAL_VALUE_TYPE_LABEL[d.value_type]})</p>
            <p className="text-2xl font-black text-cyan-700">{Number(d.amount).toLocaleString('ar')} <span className="text-sm">{d.currency}</span></p>
            <p className="text-[11px] text-slate-400 mt-1">إغلاق متوقع: {d.expected_close_date}</p>
            {d.status === 'open' && (
              <button onClick={() => setShowClose(true)} className="mt-2 inline-flex items-center gap-1.5 text-xs bg-slate-800 text-white px-3 py-1.5 rounded-lg hover:bg-slate-900"><Trophy size={13} /> إغلاق الصفقة</button>
            )}
            {d.status === 'won' && (
              <div className="mt-2">
                {d.finance_customer_id
                  ? <span className="inline-flex items-center gap-1.5 text-[11px] bg-emerald-50 text-emerald-600 border border-emerald-200 px-2.5 py-1 rounded-lg"><Trophy size={12} /> مربوطة بالنظام المالي ✓</span>
                  : <button onClick={linkFinance} disabled={linking} className="inline-flex items-center gap-1.5 text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-700 disabled:opacity-60"><Trophy size={13} /> {linking ? 'جارٍ الربط…' : 'ربط بالنظام المالي'}</button>}
                {linkMsg && <p className="text-[11px] text-slate-500 mt-1">{linkMsg}</p>}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* تفاصيل الخسارة (تحليل Win/Loss) */}
      {d.status === 'lost' && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-4">
          <h3 className="font-bold text-rose-700 text-sm mb-2 flex items-center gap-2"><TrendingDown size={16} /> تحليل الخسارة</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <div><p className="text-[11px] text-slate-400">من فاز بدلاً منا</p><p className="text-slate-700">{d.loss_competitor || '—'}</p></div>
            <div className="md:col-span-2"><p className="text-[11px] text-slate-400">ماذا كان يمكن فعله</p><p className="text-slate-700">{d.loss_learning || '—'}</p></div>
          </div>
        </div>
      )}

      {/* السياق التنافسي + BANT */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2"><Swords size={16} className="text-cyan-600" /> السياق التنافسي</h3>
            {!edit && <button onClick={startEdit} className="text-xs text-cyan-600 hover:underline">تعديل</button>}
          </div>
          {edit ? (
            <div className="space-y-3">
              <div><label className="text-xs text-slate-500 flex items-center gap-1"><ShieldCheck size={12} /> نقاط قوتنا</label><textarea value={form.our_strengths || ''} onChange={(e) => setForm({ ...form, our_strengths: e.target.value })} rows={2} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none resize-none" /></div>
              <div><label className="text-xs text-slate-500 flex items-center gap-1"><AlertTriangle size={12} /> المخاطر</label><textarea value={form.risks || ''} onChange={(e) => setForm({ ...form, risks: e.target.value })} rows={2} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none resize-none" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-slate-500 flex items-center gap-1"><Users size={12} /> المؤيدون</label><input value={form.champions || ''} onChange={(e) => setForm({ ...form, champions: e.target.value })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" /></div>
                <div><label className="text-xs text-slate-500">المعارضون</label><input value={form.detractors || ''} onChange={(e) => setForm({ ...form, detractors: e.target.value })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" /></div>
              </div>
              <div><label className="text-xs text-slate-500">المنافسون (مفصولون بفاصلة)</label><input value={(form.competitors || []).join('، ')} onChange={(e) => setForm({ ...form, competitors: e.target.value.split(/[،,]/).map((s) => s.trim()).filter(Boolean) })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" /></div>
            </div>
          ) : (
            <div className="space-y-2.5 text-sm">
              <div><p className="text-[11px] text-slate-400 flex items-center gap-1"><ShieldCheck size={12} /> نقاط قوتنا</p><p className="text-slate-700">{d.our_strengths || '—'}</p></div>
              <div><p className="text-[11px] text-slate-400 flex items-center gap-1"><AlertTriangle size={12} /> المخاطر</p><p className="text-slate-700">{d.risks || '—'}</p></div>
              <div className="grid grid-cols-2 gap-2">
                <div><p className="text-[11px] text-slate-400">المؤيدون</p><p className="text-slate-700">{d.champions || '—'}</p></div>
                <div><p className="text-[11px] text-slate-400">المعارضون</p><p className="text-slate-700">{d.detractors || '—'}</p></div>
              </div>
              <div><p className="text-[11px] text-slate-400">المنافسون</p><p className="text-slate-700">{d.competitors.length ? d.competitors.join('، ') : '—'}</p></div>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="font-bold text-slate-800 text-sm mb-3">تأهيل BANT</h3>
          {edit ? (
            <div className="space-y-2">
              {([['bant_budget', 'ميزانية (Budget)'], ['bant_authority', 'صلاحية (Authority)'], ['bant_need', 'حاجة (Need)'], ['bant_timeline', 'توقيت (Timeline)']] as const).map(([k, label]) => (
                <div key={k} className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">{label}</span>
                  <select value={form[k] === true ? 'yes' : form[k] === false ? 'no' : ''} onChange={(e) => setForm({ ...form, [k]: e.target.value === 'yes' ? true : e.target.value === 'no' ? false : null })} className="text-xs py-1 px-2 rounded-lg border border-slate-200 outline-none">
                    <option value="">غير محدد</option><option value="yes">نعم</option><option value="no">لا</option>
                  </select>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <BantChip label="ميزانية" val={d.bant_budget} />
              <BantChip label="صلاحية" val={d.bant_authority} />
              <BantChip label="حاجة" val={d.bant_need} />
              <BantChip label="توقيت" val={d.bant_timeline} />
            </div>
          )}
          {!edit && <div className="mt-4"><p className="text-[11px] text-slate-400">ملاحظات</p><p className="text-sm text-slate-700">{d.notes || '—'}</p></div>}
        </div>
      </div>

      {edit && (
        <div className="flex gap-2">
          <button onClick={saveEdit} disabled={busy} className="flex items-center gap-1.5 bg-cyan-600 text-white text-sm px-5 py-2.5 rounded-xl hover:bg-cyan-700 disabled:opacity-60"><Save size={15} /> {busy ? 'جارٍ…' : 'حفظ التغييرات'}</button>
          <button onClick={() => setEdit(false)} className="px-4 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">إلغاء</button>
        </div>
      )}

      {showClose && (
        <CloseDealModal deal={d} stageName="" onClose={() => setShowClose(false)} onDone={() => { setShowClose(false); deal.reload(); }} />
      )}
    </div>
  );
}
