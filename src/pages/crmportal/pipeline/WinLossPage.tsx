/**
 * WinLossPage — تحليل Win/Loss: معدل الفوز الإجمالي + توزيع أسباب الخسارة المجمّعة.
 */
import { useMemo } from 'react';
import { TrendingDown, Trophy, PieChart } from 'lucide-react';
import { useDeals, useLossReasons } from './usePipeline';

export default function WinLossPage() {
  const deals = useDeals(null);
  const reasons = useLossReasons();

  const stats = useMemo(() => {
    const won = deals.data.filter((d) => d.status === 'won');
    const lost = deals.data.filter((d) => d.status === 'lost');
    const closed = won.length + lost.length;
    const winRate = closed > 0 ? Math.round((won.length / closed) * 1000) / 10 : 0;
    const wonValue = won.reduce((s, d) => s + Number(d.amount || 0), 0);
    const lostValue = lost.reduce((s, d) => s + Number(d.amount || 0), 0);

    const byReason: Record<string, number> = {};
    lost.forEach((d) => { const k = d.loss_reason_id || 'unknown'; byReason[k] = (byReason[k] || 0) + 1; });
    const reasonRows = Object.entries(byReason)
      .map(([rid, count]) => ({
        label: reasons.data.find((r) => r.id === rid)?.label || 'غير موثّق',
        count, pct: lost.length > 0 ? Math.round((count / lost.length) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    return { wonCount: won.length, lostCount: lost.length, winRate, wonValue, lostValue, reasonRows };
  }, [deals.data, reasons.data]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4"><div className="w-9 h-9 rounded-xl flex items-center justify-center text-emerald-600 bg-emerald-50"><Trophy size={17} /></div><p className="text-lg font-black text-slate-800 mt-2.5">{stats.wonCount}</p><p className="text-[11px] text-slate-400">صفقات مكسوبة</p></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4"><div className="w-9 h-9 rounded-xl flex items-center justify-center text-rose-600 bg-rose-50"><TrendingDown size={17} /></div><p className="text-lg font-black text-slate-800 mt-2.5">{stats.lostCount}</p><p className="text-[11px] text-slate-400">صفقات خاسرة</p></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4"><div className="w-9 h-9 rounded-xl flex items-center justify-center text-cyan-600 bg-cyan-50"><PieChart size={17} /></div><p className="text-lg font-black text-slate-800 mt-2.5">{stats.winRate}%</p><p className="text-[11px] text-slate-400">معدل الفوز</p></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4"><div className="w-9 h-9 rounded-xl flex items-center justify-center text-emerald-600 bg-emerald-50"><Trophy size={17} /></div><p className="text-lg font-black text-slate-800 mt-2.5">{stats.wonValue.toLocaleString('ar')}</p><p className="text-[11px] text-slate-400">قيمة الصفقات المكسوبة</p></div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-5">
        <h2 className="font-black text-slate-800 mb-1">توزيع أسباب الخسارة</h2>
        <p className="text-xs text-slate-400 mb-4">كل صفقة خُسرت تحمل درساً — التوثيق الإلزامي يحوّل الخسائر إلى استراتيجية.</p>
        {deals.loading ? <p className="text-slate-400 text-sm">جارٍ…</p>
          : stats.reasonRows.length === 0 ? <p className="text-slate-400 text-sm py-6 text-center">لا صفقات خاسرة موثّقة بعد.</p>
            : <div className="space-y-3">{stats.reasonRows.map((r) => (
              <div key={r.label}>
                <div className="flex items-center justify-between text-sm mb-1"><span className="text-slate-700 font-semibold">{r.label}</span><span className="text-slate-400 text-xs">{r.count} صفقة · {r.pct}%</span></div>
                <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-l from-rose-400 to-rose-600" style={{ width: `${r.pct}%` }} /></div>
              </div>
            ))}</div>}
      </div>

      <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4 text-xs text-slate-500 leading-relaxed">
        <b className="text-slate-700">لماذا هذا التحليل مهم؟</b> بعد 50+ صفقة تبدأ الأنماط بالظهور: أين نخسر أكثر؟ في أي مرحلة؟ ضد أي منافس؟ لأي سبب؟ — هذه البيانات تُغيّر استراتيجية المنتج والتسعير والمبيعات.
      </div>
    </div>
  );
}
