/**
 * RevenuePage — حركة MRR الشهرية + أداء الموظفين مقابل الأهداف + تسجيل هدف/لقطة MRR.
 */
import { useMemo, useState } from 'react';
import { Plus, X, DollarSign, Users } from 'lucide-react';
import {
  crmAnalytics, crmMrrService, crmAccountService,
  type MrrMovementRow, type RepPerformanceRow, type CrmMrrSnapshotInput, type CrmAccount,
} from '../../../services/sdk';
import { useAsync } from './useAnalytics';

const monthStart = () => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

export default function RevenuePage() {
  const mrr = useAsync<MrrMovementRow[]>(() => crmAnalytics.mrrMovement(), []);
  const reps = useAsync<RepPerformanceRow[]>(() => crmAnalytics.repPerformance(), []);
  const accounts = useAsync<CrmAccount[]>(() => crmAccountService.listAccounts(), []); // للاستخدام المستقبلي في تسمية المالكين
  void accounts;
  const [showMrr, setShowMrr] = useState(false);
  const [mrrForm, setMrrForm] = useState<CrmMrrSnapshotInput>({ period_month: monthStart(), starting_mrr: 0, new_business: 0, expansion: 0, churn: 0, contraction: 0 });
  const [busy, setBusy] = useState(false);

  const latest = mrr.data[0];
  const growth = useMemo(() => {
    if (!latest || latest.startingMrr === 0) return 0;
    return Math.round(((latest.endingMrr - latest.startingMrr) / latest.startingMrr) * 1000) / 10;
  }, [latest]);

  const saveMrr = async () => {
    setBusy(true);
    try { await crmMrrService.createSnapshot(mrrForm); setShowMrr(false); mrr.reload(); } catch { /* noop */ } finally { setBusy(false); }
  };

  return (
    <div className="space-y-5">
      {/* MRR movement */}
      <div className="rounded-3xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2"><DollarSign size={18} className="text-cyan-600" /><h2 className="font-black text-slate-800">حركة الإيراد الشهري (MRR Movement)</h2></div>
          <button onClick={() => { setMrrForm({ period_month: monthStart(), starting_mrr: latest?.endingMrr ?? 0, new_business: 0, expansion: 0, churn: 0, contraction: 0 }); setShowMrr(true); }} className="flex items-center gap-1 text-xs bg-cyan-600 text-white px-3 py-1.5 rounded-lg hover:bg-cyan-700"><Plus size={13} /> لقطة</button>
        </div>
        {latest && (
          <div className="rounded-2xl bg-gradient-to-br from-cyan-600 to-blue-700 text-white p-4 my-3 flex items-center justify-between flex-wrap gap-3">
            <div><p className="text-xs text-white/70">MRR نهاية الشهر ({latest.periodMonth})</p><p className="text-3xl font-black">{latest.endingMrr.toLocaleString('ar')}</p></div>
            <div className="text-left"><p className="text-xs text-white/70">النمو</p><p className={`text-xl font-black ${growth >= 0 ? 'text-emerald-200' : 'text-rose-200'}`}>{growth >= 0 ? '+' : ''}{growth}%</p></div>
          </div>
        )}
        {mrr.loading ? <p className="text-slate-400 text-sm">جارٍ…</p>
          : mrr.data.length === 0 ? <p className="text-slate-400 text-sm py-4 text-center">لا لقطات MRR بعد — أضف لقطة شهرية لتتبّع حركة الإيراد.</p>
            : <div className="rounded-xl border border-slate-200 overflow-hidden"><table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs"><tr><th className="text-right px-3 py-2">الشهر</th><th className="text-center px-3 py-2">البداية</th><th className="text-center px-3 py-2">جديد</th><th className="text-center px-3 py-2">توسّع</th><th className="text-center px-3 py-2">Churn</th><th className="text-center px-3 py-2">تقليص</th><th className="text-center px-3 py-2">النهاية</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{mrr.data.map((m) => (
                <tr key={m.periodMonth}><td className="px-3 py-2 text-slate-600">{m.periodMonth}</td><td className="px-3 py-2 text-center font-mono text-slate-600">{m.startingMrr.toLocaleString('ar')}</td><td className="px-3 py-2 text-center font-mono text-emerald-600">+{m.newBusiness.toLocaleString('ar')}</td><td className="px-3 py-2 text-center font-mono text-emerald-600">+{m.expansion.toLocaleString('ar')}</td><td className="px-3 py-2 text-center font-mono text-rose-500">-{m.churn.toLocaleString('ar')}</td><td className="px-3 py-2 text-center font-mono text-rose-500">-{m.contraction.toLocaleString('ar')}</td><td className="px-3 py-2 text-center font-mono font-bold text-cyan-700">{m.endingMrr.toLocaleString('ar')}</td></tr>
              ))}</tbody>
            </table></div>}
      </div>

      {/* Rep performance */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="font-bold text-slate-800 text-sm mb-3 flex items-center gap-2"><Users size={16} className="text-cyan-600" /> أداء الموظفين مقابل الأهداف</h3>
        {reps.loading ? <p className="text-slate-400 text-sm">جارٍ…</p>
          : reps.data.length === 0 ? <p className="text-slate-400 text-sm py-4 text-center">لا أهداف مسجّلة لهذا الشهر — سجّل هدفاً لكل موظف من إعدادات الأهداف.</p>
            : <div className="space-y-3">{reps.data.map((r) => (
              <div key={r.ownerId}>
                <div className="flex items-center justify-between text-sm mb-1"><span className="text-slate-700 font-semibold font-mono">{r.ownerId.slice(0, 8)}…</span><span className="text-slate-400 text-xs">{r.achieved.toLocaleString('ar')} / {r.targetAmount.toLocaleString('ar')} · {r.attainmentPct}%</span></div>
                <div className="h-3 rounded-full bg-slate-100 overflow-hidden"><div className={`h-full rounded-full ${r.attainmentPct >= 100 ? 'bg-emerald-500' : r.attainmentPct >= 60 ? 'bg-cyan-500' : 'bg-amber-500'}`} style={{ width: `${Math.min(100, r.attainmentPct)}%` }} /></div>
              </div>
            ))}</div>}
      </div>

      {showMrr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowMrr(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4"><h3 className="font-black text-slate-800">لقطة MRR شهرية</h3><button onClick={() => setShowMrr(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button></div>
            <div className="space-y-3">
              <div><label className="text-xs text-slate-500">الشهر</label><input type="date" value={mrrForm.period_month} onChange={(e) => setMrrForm({ ...mrrForm, period_month: e.target.value })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-slate-500">MRR البداية</label><input type="number" value={mrrForm.starting_mrr ?? 0} onChange={(e) => setMrrForm({ ...mrrForm, starting_mrr: Number(e.target.value) })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none font-mono" /></div>
                <div><label className="text-xs text-slate-500">أعمال جديدة</label><input type="number" value={mrrForm.new_business ?? 0} onChange={(e) => setMrrForm({ ...mrrForm, new_business: Number(e.target.value) })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none font-mono" /></div>
                <div><label className="text-xs text-slate-500">توسّع</label><input type="number" value={mrrForm.expansion ?? 0} onChange={(e) => setMrrForm({ ...mrrForm, expansion: Number(e.target.value) })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none font-mono" /></div>
                <div><label className="text-xs text-slate-500">Churn</label><input type="number" value={mrrForm.churn ?? 0} onChange={(e) => setMrrForm({ ...mrrForm, churn: Number(e.target.value) })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none font-mono" /></div>
                <div><label className="text-xs text-slate-500">تقليص</label><input type="number" value={mrrForm.contraction ?? 0} onChange={(e) => setMrrForm({ ...mrrForm, contraction: Number(e.target.value) })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none font-mono" /></div>
              </div>
            </div>
            <div className="flex gap-2 mt-5"><button onClick={saveMrr} disabled={busy} className="flex-1 bg-cyan-600 text-white text-sm py-2.5 rounded-xl hover:bg-cyan-700 disabled:opacity-60">{busy ? 'جارٍ…' : 'حفظ'}</button><button onClick={() => setShowMrr(false)} className="px-4 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">إلغاء</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
