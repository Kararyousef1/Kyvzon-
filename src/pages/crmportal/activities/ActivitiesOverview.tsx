/**
 * ActivitiesOverview — تحليل الأنشطة (مؤشرات قيادية) + فجوات النشاط (صفقات صامتة).
 */
import { Link } from 'react-router-dom';
import { Phone, Users, Mail, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';
import { crmTaskService, type ActivityStats, type ActivityGap } from '../../../services/sdk';
import { useAsync } from './useActivities';
import { CRM_BASE } from '../crmCatalog';

export default function ActivitiesOverview() {
  const stats = useAsync<ActivityStats | null>(() => crmTaskService.activityStats(30), null);
  const gaps = useAsync<ActivityGap[]>(() => crmTaskService.activityGaps(7), []);

  const s = stats.data;
  const cards = [
    { label: 'مكالمات (30 يوم)', value: s?.calls ?? 0, icon: Phone, color: 'text-cyan-600 bg-cyan-50' },
    { label: 'اجتماعات', value: s?.meetings ?? 0, icon: Users, color: 'text-blue-600 bg-blue-50' },
    { label: 'رسائل بريد', value: s?.emails ?? 0, icon: Mail, color: 'text-violet-600 bg-violet-50' },
    { label: 'مهام منتهية', value: s?.tasksCompleted ?? 0, icon: CheckCircle2, color: 'text-emerald-600 bg-emerald-50' },
  ];

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-slate-200 bg-white p-5">
        <h2 className="font-black text-slate-800 mb-1">المؤشرات القيادية (Leading Indicators)</h2>
        <p className="text-xs text-slate-400 mb-4">تُخبرك بما سيحدث غداً، لا ما حدث أمس — النشاط اليوم يصنع إيراد الغد.</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {cards.map((c) => {
            const Icon = c.icon;
            return (
              <div key={c.label} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${c.color}`}><Icon size={17} /></div>
                <p className="text-2xl font-black text-slate-800 mt-2.5">{stats.loading ? '…' : c.value}</p>
                <p className="text-[11px] text-slate-400">{c.label}</p>
              </div>
            );
          })}
        </div>
        {(s?.tasksOverdue ?? 0) > 0 && (
          <div className="mt-3 flex items-center gap-2 text-sm bg-rose-50 text-rose-600 border border-rose-200 px-4 py-2.5 rounded-xl">
            <AlertTriangle size={16} /> لديك {s?.tasksOverdue} مهمة متأخرة — <Link to={`${CRM_BASE}/activities/tasks`} className="underline">راجعها الآن</Link>
          </div>
        )}
      </div>

      {/* Activity Gaps */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="font-bold text-slate-800 text-sm mb-1 flex items-center gap-2"><Clock size={16} className="text-amber-500" /> فجوات النشاط (صفقات تموت صامتة)</h3>
        <p className="text-xs text-slate-400 mb-3">صفقات مفتوحة بلا تواصل منذ 7+ أيام — تحتاج تدخّلاً عاجلاً.</p>
        {gaps.loading ? <p className="text-slate-400 text-sm">جارٍ…</p>
          : gaps.data.length === 0 ? <p className="text-slate-400 text-sm py-4 text-center">لا فجوات — كل الصفقات نشطة ✓</p>
            : <div className="space-y-2">{gaps.data.map((g) => (
              <Link to={`${CRM_BASE}/pipeline/deals/${g.dealId}`} key={g.dealId} className="flex items-center justify-between p-2.5 rounded-xl border border-slate-100 hover:border-cyan-300">
                <div><p className="text-sm font-semibold text-slate-700">{g.dealName}</p><p className="text-xs text-slate-400">صامتة منذ {g.daysSilent} يوم · {g.amount.toLocaleString('ar')}</p></div>
                <span className="text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-200 px-2 py-0.5 rounded-full">تواصل الآن</span>
              </Link>
            ))}</div>}
      </div>

      <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4 text-xs text-slate-500 leading-relaxed">
        <b className="text-slate-700">لماذا الأتمتة؟</b> موظفو المبيعات يقضون 28% من أسبوعهم في مهام إدارية. أتمتة الأنشطة (التسجيل التلقائي، سلاسل المتابعة، قواعد If-Then، الإسناد التلقائي) تسترجع هذه الساعات وتضعها في خدمة الإيراد.
      </div>
    </div>
  );
}
