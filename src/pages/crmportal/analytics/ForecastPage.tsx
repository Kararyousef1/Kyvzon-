/**
 * ForecastPage — التنبؤ المرجّح + قمع التحويل + سرعة المراحل.
 */
import { useMemo } from 'react';
import { TrendingUp, Filter, Timer } from 'lucide-react';
import {
  crmAnalytics, type WeightedForecastRow, type FunnelRow, type VelocityRow,
} from '../../../services/sdk';
import { useAsync } from './useAnalytics';

export default function ForecastPage() {
  const forecast = useAsync<WeightedForecastRow[]>(() => crmAnalytics.weightedForecast(), []);
  const funnel = useAsync<FunnelRow[]>(() => crmAnalytics.conversionFunnel(), []);
  const velocity = useAsync<VelocityRow[]>(() => crmAnalytics.pipelineVelocity(), []);

  const totalWeighted = useMemo(() => forecast.data.reduce((s, r) => s + r.weightedValue, 0), [forecast.data]);
  const totalPipeline = useMemo(() => forecast.data.reduce((s, r) => s + r.totalValue, 0), [forecast.data]);
  const maxFunnel = useMemo(() => Math.max(1, ...funnel.data.map((f) => f.reachedCount)), [funnel.data]);

  return (
    <div className="space-y-5">
      {/* Weighted forecast */}
      <div className="rounded-3xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2 mb-1"><TrendingUp size={18} className="text-cyan-600" /><h2 className="font-black text-slate-800">التنبؤ المرجّح (Weighted Pipeline)</h2></div>
        <p className="text-xs text-slate-400 mb-4">القيمة المرجّحة = قيمة المرحلة × احتماليتها.</p>
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs"><tr><th className="text-right px-4 py-2">المرحلة</th><th className="text-center px-4 py-2">الصفقات</th><th className="text-center px-4 py-2">القيمة</th><th className="text-center px-4 py-2">الاحتمالية</th><th className="text-center px-4 py-2">القيمة المرجّحة</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {forecast.loading ? <tr><td colSpan={5} className="text-center py-8 text-slate-400">جارٍ…</td></tr>
                : forecast.data.length === 0 ? <tr><td colSpan={5} className="text-center py-8 text-slate-400">لا صفقات مفتوحة.</td></tr>
                  : forecast.data.map((r) => (
                    <tr key={r.stageName}><td className="px-4 py-2 text-slate-700">{r.stageName}</td><td className="px-4 py-2 text-center text-slate-600">{r.dealsCount}</td><td className="px-4 py-2 text-center font-mono text-slate-600">{r.totalValue.toLocaleString('ar')}</td><td className="px-4 py-2 text-center text-slate-500">{r.probability}%</td><td className="px-4 py-2 text-center font-mono font-semibold text-cyan-700">{r.weightedValue.toLocaleString('ar')}</td></tr>
                  ))}
            </tbody>
            {forecast.data.length > 0 && (
              <tfoot className="bg-slate-50 font-bold"><tr><td className="px-4 py-2 text-slate-700">المجموع</td><td></td><td className="px-4 py-2 text-center font-mono text-slate-700">{totalPipeline.toLocaleString('ar')}</td><td></td><td className="px-4 py-2 text-center font-mono text-cyan-700">{totalWeighted.toLocaleString('ar')}</td></tr></tfoot>
            )}
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Conversion funnel */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="font-bold text-slate-800 text-sm mb-3 flex items-center gap-2"><Filter size={16} className="text-cyan-600" /> قمع التحويل</h3>
          {funnel.loading ? <p className="text-slate-400 text-sm">جارٍ…</p>
            : funnel.data.length === 0 ? <p className="text-slate-400 text-sm py-4 text-center">لا بيانات كافية.</p>
              : <div className="space-y-2">{funnel.data.map((f, i) => {
                const prev = i > 0 ? funnel.data[i - 1].reachedCount : f.reachedCount;
                const rate = prev > 0 ? Math.round((f.reachedCount / prev) * 100) : 100;
                return (
                  <div key={f.stageName}>
                    <div className="flex items-center justify-between text-xs mb-1"><span className="text-slate-700 font-semibold">{f.stageName}</span><span className="text-slate-400">{f.reachedCount}{i > 0 ? ` · ${rate}%` : ''}</span></div>
                    <div className="h-6 rounded-lg bg-slate-100 overflow-hidden"><div className="h-full rounded-lg bg-gradient-to-l from-cyan-400 to-blue-600 flex items-center justify-start px-2" style={{ width: `${Math.max(8, (f.reachedCount / maxFunnel) * 100)}%` }} /></div>
                  </div>
                );
              })}</div>}
        </div>

        {/* Velocity */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="font-bold text-slate-800 text-sm mb-3 flex items-center gap-2"><Timer size={16} className="text-cyan-600" /> سرعة المراحل (متوسط الأيام)</h3>
          {velocity.loading ? <p className="text-slate-400 text-sm">جارٍ…</p>
            : velocity.data.length === 0 ? <p className="text-slate-400 text-sm py-4 text-center">لا بيانات كافية — تُحسب من سجل حركة الصفقات.</p>
              : <div className="space-y-2">{velocity.data.map((v) => (
                <div key={v.stageName} className="flex items-center justify-between p-2.5 rounded-xl border border-slate-100">
                  <div><p className="text-sm font-semibold text-slate-700">{v.stageName}</p><p className="text-[11px] text-slate-400">{v.dealsMeasured} صفقة مُقاسة</p></div>
                  <span className={`text-sm font-black ${v.avgDaysInStage > 25 ? 'text-rose-600' : v.avgDaysInStage > 15 ? 'text-amber-600' : 'text-emerald-600'}`}>{v.avgDaysInStage} يوم</span>
                </div>
              ))}</div>}
        </div>
      </div>
    </div>
  );
}
