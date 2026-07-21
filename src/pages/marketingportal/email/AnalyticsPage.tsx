/**
 * AnalyticsPage — تحليلات البريد الإجمالية (كل المصادر: حملات + أتمتة) مع مقارنة بالأهداف.
 */
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { KPI_TARGETS } from '../../../services/sdk';
import { useOverallKpis } from './useEmail';

type Metric = { key: string; label: string; value: number; target: string; healthy: boolean; formula: string };

export default function AnalyticsPage() {
  const { data: k, loading } = useOverallKpis();

  const metrics: Metric[] = [
    { key: 'open', label: 'معدل الفتح (Open Rate)', value: k.openRate, target: KPI_TARGETS.openRate, healthy: k.openRate >= 20, formula: '(فُتح ÷ تم توصيله) × 100' },
    { key: 'ctor', label: 'النقر إلى الفتح (CTOR)', value: k.ctor, target: KPI_TARGETS.ctor, healthy: k.ctor >= 15, formula: '(ضغطات ÷ مفتوح) × 100' },
    { key: 'ctr', label: 'معدل النقر (CTR)', value: k.ctr, target: KPI_TARGETS.ctr, healthy: k.ctr >= 2, formula: '(ضغطات ÷ تم إرساله) × 100' },
    { key: 'unsub', label: 'إلغاء الاشتراك', value: k.unsubscribeRate, target: KPI_TARGETS.unsubscribeRate, healthy: k.unsubscribeRate < 0.5, formula: '(إلغاء ÷ تم توصيله) × 100' },
    { key: 'spam', label: 'شكاوى الإسبام', value: k.spamRate, target: KPI_TARGETS.spamRate, healthy: k.spamRate < 0.1, formula: '(إبلاغ ÷ تم إرساله) × 100' },
    { key: 'bounce', label: 'الارتداد (Bounce)', value: k.bounceRate, target: KPI_TARGETS.bounceRate, healthy: k.bounceRate < 2, formula: '(مرتد ÷ تم إرساله) × 100' },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[{ l: 'مُرسل', v: k.sent }, { l: 'وُصِّل', v: k.delivered }, { l: 'مفتوح', v: k.opened }, { l: 'نقرات', v: k.clicked }].map((s) => (
          <div key={s.l} className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-2xl font-black text-slate-800">{loading ? '…' : s.v.toLocaleString()}</p><p className="text-xs text-slate-500 mt-0.5">{s.l}</p></div>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100"><h3 className="font-black text-slate-800">مؤشرات الأداء (بمعادلات التقرير)</h3></div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs">
            <tr><th className="text-right px-5 py-2.5">المؤشر</th><th className="text-right px-5 py-2.5">المعادلة</th><th className="text-center px-5 py-2.5">القيمة</th><th className="text-center px-5 py-2.5">الهدف</th><th className="text-center px-5 py-2.5">الحالة</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {metrics.map((m) => (
              <tr key={m.key} className="hover:bg-slate-50/60">
                <td className="px-5 py-3 font-semibold text-slate-700">{m.label}</td>
                <td className="px-5 py-3 text-xs text-slate-400">{m.formula}</td>
                <td className="px-5 py-3 text-center font-black text-slate-800">{m.value}%</td>
                <td className="px-5 py-3 text-center text-xs text-slate-500">{m.target}</td>
                <td className="px-5 py-3 text-center">
                  {m.healthy
                    ? <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 font-bold"><CheckCircle2 size={13} /> صحي</span>
                    : <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 font-bold"><AlertTriangle size={13} /> يحتاج انتباهاً</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
        تشمل هذه التحليلات كل رسائل البريد (حملات + أتمتة الوحدة 1). كل بريد يُرسله محرك الأتمتة يُسجَّل هنا تلقائياً عبر نقطة الربط الموحّدة.
      </div>
    </div>
  );
}
