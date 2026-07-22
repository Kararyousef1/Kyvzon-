/**
 * ExecOverview — لوحة الإدارة التنفيذية: مؤشرات الإيراد + الأهداف + المخاطر.
 */
import { Users, Sparkles, GitBranch, Gauge, Trophy, AlertTriangle, Clock } from 'lucide-react';
import { crmAnalytics, type ExecKpis, CRM_KPI_TARGETS } from '../../../services/sdk';
import { useAsync } from './useAnalytics';

export default function ExecOverview() {
  const kpis = useAsync<ExecKpis | null>(() => crmAnalytics.execKpis(), null);
  const k = kpis.data;

  const cards = [
    { label: 'العملاء الفعليون', value: k?.totalCustomers ?? 0, icon: Users, color: 'text-cyan-600 bg-cyan-50' },
    { label: 'إجمالي قيمة الحسابات', value: `${(k?.totalLtv ?? 0).toLocaleString('ar')}`, icon: Sparkles, color: 'text-emerald-600 bg-emerald-50' },
    { label: 'Pipeline المفتوح', value: `${(k?.openPipeline ?? 0).toLocaleString('ar')}`, icon: GitBranch, color: 'text-blue-600 bg-blue-50' },
    { label: 'التنبؤ المرجّح', value: `${(k?.weightedForecast ?? 0).toLocaleString('ar')}`, icon: Gauge, color: 'text-violet-600 bg-violet-50' },
    { label: 'مكسوب هذا الشهر', value: `${(k?.wonThisMonth ?? 0).toLocaleString('ar')}`, icon: Trophy, color: 'text-emerald-600 bg-emerald-50' },
    { label: 'حسابات في خطر', value: k?.atRiskAccounts ?? 0, icon: AlertTriangle, color: 'text-rose-600 bg-rose-50' },
    { label: 'متوسط دورة البيع', value: `${k?.avgSalesCycleDays ?? 0} يوم`, icon: Clock, color: 'text-amber-600 bg-amber-50' },
  ];

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-slate-200 bg-white p-5">
        <h2 className="font-black text-slate-800 mb-1">ملخص الإيراد التنفيذي</h2>
        <p className="text-xs text-slate-400 mb-4">الشركات ذات دقة التنبؤ العالية تحقق نمواً سنوياً أعلى بـ 7.3% — القرار الأفضل يبدأ من الرقم الصحيح.</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {cards.map((c) => {
            const Icon = c.icon;
            return (
              <div key={c.label} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${c.color}`}><Icon size={17} /></div>
                <p className="text-xl font-black text-slate-800 mt-2.5">{kpis.loading ? '…' : c.value}</p>
                <p className="text-[11px] text-slate-400">{c.label}</p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="font-bold text-slate-800 text-sm mb-3">مؤشرات الأداء المرجعية (الأهداف)</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          {[
            ['Lead → Customer', CRM_KPI_TARGETS.leadToCustomer],
            ['دورة البيع', CRM_KPI_TARGETS.salesCycle],
            ['NRR', CRM_KPI_TARGETS.nrr],
            ['الاحتفاظ الإجمالي', CRM_KPI_TARGETS.grossRetention],
            ['Churn', CRM_KPI_TARGETS.churn],
            ['CLV ÷ CAC', CRM_KPI_TARGETS.clvCacRatio],
            ['تغطية Pipeline', CRM_KPI_TARGETS.pipelineCoverage],
            ['دقة التنبؤ', CRM_KPI_TARGETS.forecastAccuracy],
          ].map(([label, val]) => (
            <div key={label} className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
              <p className="text-[11px] text-slate-400">{label}</p>
              <p className="text-sm font-bold text-slate-700 mt-0.5">{val}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4 text-xs text-slate-500 leading-relaxed">
        <b className="text-slate-700">المنظومة الكاملة:</b> جهات اتصال 360° ↔ Pipeline ↔ أنشطة وأتمتة ↔ عروض وعقود ↔ دعم وتذاكر ↔ <b className="text-cyan-600">تحليلات وتنبؤ</b> = مركز إيرادات متوقّع وقابل للتحكم. هذا ما يجعل Kyvzon CRM محرك إيرادات يعمل بذكاء.
      </div>
    </div>
  );
}
