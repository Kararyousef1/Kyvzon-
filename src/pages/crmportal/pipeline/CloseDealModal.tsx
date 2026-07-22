/**
 * CloseDealModal — إغلاق صفقة (فوز/خسارة). عند الخسارة: نموذج تحليل Win/Loss إلزامي
 * (السبب + من فاز بدلاً منا + ماذا كان يمكن فعله).
 */
import { useState } from 'react';
import { X, Trophy, TrendingDown } from 'lucide-react';
import { crmDealService, type CrmDeal } from '../../../services/sdk';
import { useLossReasons } from './usePipeline';

interface Props {
  deal: CrmDeal;
  stageName: string;
  onClose: () => void;
  onDone: () => void;
}

export default function CloseDealModal({ deal, stageName, onClose, onDone }: Props) {
  const reasons = useLossReasons();
  const [outcome, setOutcome] = useState<'won' | 'lost'>('won');
  const [reasonId, setReasonId] = useState('');
  const [competitor, setCompetitor] = useState('');
  const [learning, setLearning] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (outcome === 'lost' && !reasonId) { setErr('توثيق سبب الخسارة إلزامي (تحليل Win/Loss)'); return; }
    setBusy(true); setErr(null);
    try {
      await crmDealService.close({
        dealId: deal.id, outcome,
        lossReasonId: outcome === 'lost' ? reasonId : null,
        lossCompetitor: outcome === 'lost' ? competitor : null,
        lossLearning: outcome === 'lost' ? learning : null,
      });
      onDone();
    } catch (e) { setErr(e instanceof Error ? e.message : 'تعذّر الإغلاق'); } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1"><h3 className="font-black text-slate-800">إغلاق الصفقة</h3><button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button></div>
        <p className="text-xs text-slate-400 mb-4">{deal.name} · {stageName}</p>

        <div className="grid grid-cols-2 gap-2 mb-4">
          <button onClick={() => setOutcome('won')} className={`flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold border transition-all ${outcome === 'won' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-200'}`}><Trophy size={16} /> فوز</button>
          <button onClick={() => setOutcome('lost')} className={`flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold border transition-all ${outcome === 'lost' ? 'bg-rose-600 text-white border-rose-600' : 'bg-white text-slate-600 border-slate-200'}`}><TrendingDown size={16} /> خسارة</button>
        </div>

        {outcome === 'won' ? (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-700 p-3">
            سيتم رفع قيمة الصفقة إلى إجمالي قيمة الحساب (LTV) وتحويله إلى "عميل فعلي" وتسجيل الفوز في الجدول الزمني.
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-slate-500">السبب الرئيسي للخسارة *</label>
              <select value={reasonId} onChange={(e) => setReasonId(e.target.value)} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none">
                <option value="">— اختر السبب —</option>
                {reasons.data.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </div>
            <div><label className="text-xs text-slate-500">من اختاروه بدلاً منا؟</label><input value={competitor} onChange={(e) => setCompetitor(e.target.value)} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" /></div>
            <div><label className="text-xs text-slate-500">ماذا كان يمكننا فعله بشكل مختلف؟</label><textarea value={learning} onChange={(e) => setLearning(e.target.value)} rows={2} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none resize-none" /></div>
          </div>
        )}

        {err && <p className="text-xs text-rose-600 mt-3">{err}</p>}
        <div className="flex gap-2 mt-5">
          <button onClick={submit} disabled={busy} className={`flex-1 text-white text-sm py-2.5 rounded-xl disabled:opacity-60 ${outcome === 'won' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'}`}>{busy ? 'جارٍ…' : 'تأكيد الإغلاق'}</button>
          <button onClick={onClose} className="px-4 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">إلغاء</button>
        </div>
      </div>
    </div>
  );
}
