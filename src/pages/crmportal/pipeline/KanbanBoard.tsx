/**
 * KanbanBoard — لوحة Kanban البصرية: أعمدة المراحل + بطاقات الصفقات + نقل بين المراحل +
 * إغلاق (win/loss) + إنشاء صفقة. تلوين تحذيري للبطاقات الراكدة/المتأخرة.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, X, Clock, ChevronLeft } from 'lucide-react';
import {
  crmDealService,
  type CrmDeal, type CrmStage, type CrmDealInput,
} from '../../../services/sdk';
import { usePipelines, useStages, useDeals } from './usePipeline';
import CloseDealModal from './CloseDealModal';
import { CRM_BASE } from '../crmCatalog';
import { useContactsData } from './useShared';

function daysSince(d: string): number {
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
}
function cardTone(deal: CrmDeal, stage: CrmStage | undefined): string {
  const overdue = new Date(deal.expected_close_date).getTime() < Date.now();
  const stagnant = stage?.stagnation_days != null && daysSince(deal.last_stage_change_at) > stage.stagnation_days;
  if (overdue) return 'border-r-4 border-r-rose-400';
  if (stagnant) return 'border-r-4 border-r-amber-400';
  return 'border-r-4 border-r-cyan-300';
}

const EMPTY = (pipelineId: string, stageId: string): CrmDealInput => ({
  pipeline_id: pipelineId, stage_id: stageId, name: '', amount: 0,
  expected_close_date: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
});

export default function KanbanBoard() {
  const navigate = useNavigate();
  const pipelines = usePipelines();
  const [pid, setPid] = useState<string | null>(null);
  useEffect(() => {
    if (!pid && pipelines.data.length > 0) {
      setPid((pipelines.data.find((p) => p.is_default) || pipelines.data[0]).id);
    }
  }, [pipelines.data, pid]);

  const stages = useStages(pid);
  const deals = useDeals(pid);
  const { accounts } = useContactsData();

  const [show, setShow] = useState(false);
  const [form, setForm] = useState<CrmDealInput | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [closeDeal, setCloseDeal] = useState<CrmDeal | null>(null);

  const openStages = useMemo(() => stages.data.filter((s) => s.stage_type === 'open'), [stages.data]);
  const dealsByStage = useMemo(() => {
    const map: Record<string, CrmDeal[]> = {};
    deals.data.filter((d) => d.status === 'open').forEach((d) => { (map[d.stage_id] ||= []).push(d); });
    return map;
  }, [deals.data]);
  const accName = useMemo(() => Object.fromEntries(accounts.map((a) => [a.id, a.name])), [accounts]);
  const stageById = useMemo(() => Object.fromEntries(stages.data.map((s) => [s.id, s])), [stages.data]);

  const openNew = (stageId: string) => { if (pid) { setForm(EMPTY(pid, stageId)); setErr(null); setShow(true); } };
  const save = async () => {
    if (!form || !form.name.trim()) { setErr('اسم الصفقة مطلوب'); return; }
    if (!form.expected_close_date) { setErr('تاريخ الإغلاق المتوقع إلزامي'); return; }
    setBusy(true); setErr(null);
    try { await crmDealService.createDeal(form); setShow(false); setForm(null); deals.reload(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'تعذّر الحفظ'); } finally { setBusy(false); }
  };
  const move = async (dealId: string, toStageId: string) => {
    try { await crmDealService.moveStage(dealId, toStageId); deals.reload(); } catch { /* noop */ }
  };

  if (pipelines.loading) return <div className="text-center py-16 text-slate-400">جارٍ التحميل…</div>;
  if (pipelines.data.length === 0) return <div className="text-center py-16 text-slate-400">لا خطوط أنابيب — هيّئ خطاً من "نظرة عامة".</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <select value={pid || ''} onChange={(e) => setPid(e.target.value)} className="py-2 px-3 text-sm rounded-xl border border-slate-200 outline-none">
          {pipelines.data.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-3">
        {openStages.map((stage) => {
          const list = dealsByStage[stage.id] || [];
          const total = list.reduce((s, d) => s + Number(d.amount || 0), 0);
          return (
            <div key={stage.id} className="min-w-[240px] w-[240px] shrink-0 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col">
              <div className="p-3 border-b border-slate-200">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-700">{stage.name}</h3>
                  <span className="text-[10px] bg-white text-slate-500 border border-slate-200 px-1.5 py-0.5 rounded-full">{stage.probability}%</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">{list.length} صفقة · {total.toLocaleString('ar')}</p>
                {stage.exit_criteria && <p className="text-[10px] text-slate-400 mt-1 leading-snug line-clamp-2" title={stage.exit_criteria}>🎯 {stage.exit_criteria}</p>}
              </div>
              <div className="p-2 space-y-2 flex-1 overflow-y-auto max-h-[60vh]">
                {list.map((d) => (
                  <div key={d.id} className={`bg-white rounded-xl border border-slate-200 p-2.5 ${cardTone(d, stage)}`}>
                    <button onClick={() => navigate(`${CRM_BASE}/pipeline/deals/${d.id}`)} className="text-right w-full">
                      <p className="text-sm font-semibold text-slate-800 leading-snug">{d.name}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{d.account_id ? accName[d.account_id] || '—' : '—'}</p>
                      <p className="text-sm font-black text-cyan-700 mt-1">{Number(d.amount).toLocaleString('ar')} <span className="text-[10px] font-normal text-slate-400">{d.currency}</span></p>
                      <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1"><Clock size={10} /> إغلاق: {d.expected_close_date}</p>
                    </button>
                    <div className="flex items-center gap-1 mt-2">
                      <select value={d.stage_id} onChange={(e) => move(d.id, e.target.value)} className="flex-1 text-[11px] py-1 px-1.5 rounded-lg border border-slate-200 outline-none bg-slate-50">
                        {openStages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                      <button onClick={() => setCloseDeal(d)} title="إغلاق الصفقة" className="text-[11px] px-2 py-1 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200"><ChevronLeft size={12} /></button>
                    </div>
                  </div>
                ))}
                <button onClick={() => openNew(stage.id)} className="w-full flex items-center justify-center gap-1 text-xs text-slate-400 hover:text-cyan-600 border border-dashed border-slate-300 rounded-xl py-2 hover:border-cyan-300">
                  <Plus size={13} /> صفقة
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {show && form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShow(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4"><h3 className="font-black text-slate-800">صفقة جديدة</h3><button onClick={() => setShow(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button></div>
            <div className="space-y-3">
              <div><label className="text-xs text-slate-500">اسم الصفقة *</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Kyvzon Enterprise — شركة النخبة" className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" /></div>
              <div><label className="text-xs text-slate-500">الحساب</label><select value={form.account_id || ''} onChange={(e) => setForm({ ...form, account_id: e.target.value || null })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none"><option value="">— بدون حساب —</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-slate-500">القيمة</label><input type="number" value={form.amount ?? 0} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none font-mono" /></div>
                <div><label className="text-xs text-slate-500">تاريخ الإغلاق المتوقع *</label><input type="date" value={form.expected_close_date} onChange={(e) => setForm({ ...form, expected_close_date: e.target.value })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" /></div>
              </div>
              <div><label className="text-xs text-slate-500">المرحلة</label><select value={form.stage_id} onChange={(e) => setForm({ ...form, stage_id: e.target.value })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none">{openStages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
              {err && <p className="text-xs text-rose-600">{err}</p>}
            </div>
            <div className="flex gap-2 mt-5"><button onClick={save} disabled={busy} className="flex-1 bg-cyan-600 text-white text-sm py-2.5 rounded-xl hover:bg-cyan-700 disabled:opacity-60">{busy ? 'جارٍ…' : 'حفظ'}</button><button onClick={() => setShow(false)} className="px-4 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">إلغاء</button></div>
          </div>
        </div>
      )}

      {closeDeal && (
        <CloseDealModal
          deal={closeDeal}
          stageName={stageById[closeDeal.stage_id]?.name || ''}
          onClose={() => setCloseDeal(null)}
          onDone={() => { setCloseDeal(null); deals.reload(); }}
        />
      )}
    </div>
  );
}
