/**
 * SupportOverview — مؤشرات الدعم + تنبيهات خطر المغادرة + مرجع الـ SLA.
 */
import { Ticket, ShieldCheck, Star, AlertTriangle, Clock } from 'lucide-react';
import {
  crmTicketService, type SupportKpis, type ChurnRiskAccount,
  SLA_REFERENCE, TICKET_PRIORITY_LABEL,
} from '../../../services/sdk';
import { useAsync } from './useSupport';

export default function SupportOverview() {
  const kpis = useAsync<SupportKpis | null>(() => crmTicketService.kpis(), null);
  const churn = useAsync<ChurnRiskAccount[]>(() => crmTicketService.churnRisk(), []);

  const k = kpis.data;
  const cards = [
    { label: 'تذاكر مفتوحة', value: k?.openTickets ?? 0, icon: Ticket, color: 'text-cyan-600 bg-cyan-50' },
    { label: 'التزام SLA', value: `${k?.slaCompliance ?? 0}%`, icon: ShieldCheck, color: 'text-emerald-600 bg-emerald-50', hint: 'الهدف 95%+' },
    { label: 'متوسط CSAT', value: `${k?.avgCsat ?? 0}/5`, icon: Star, color: 'text-amber-600 bg-amber-50', hint: 'الهدف 4.2+' },
    { label: 'متوسط وقت الحل', value: `${k?.avgTtrHours ?? 0} س`, icon: Clock, color: 'text-blue-600 bg-blue-50' },
  ];

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-slate-200 bg-white p-5">
        <h2 className="font-black text-slate-800 mb-1">مؤشرات أداء الدعم</h2>
        <p className="text-xs text-slate-400 mb-4">89% من العملاء يغادرون بسبب تجربة دعم سيئة — لا بسبب المنتج نفسه.</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {cards.map((c) => {
            const Icon = c.icon;
            return (
              <div key={c.label} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${c.color}`}><Icon size={17} /></div>
                <p className="text-2xl font-black text-slate-800 mt-2.5">{kpis.loading ? '…' : c.value}</p>
                <p className="text-[11px] text-slate-400">{c.label}</p>
                {c.hint && <p className="text-[10px] text-slate-300 mt-0.5">{c.hint}</p>}
              </div>
            );
          })}
        </div>
        {(k?.breached ?? 0) > 0 && (
          <div className="mt-3 flex items-center gap-2 text-sm bg-rose-50 text-rose-600 border border-rose-200 px-4 py-2.5 rounded-xl">
            <AlertTriangle size={16} /> {k?.breached} تذكرة كسرت الـ SLA — راجعها فوراً
          </div>
        )}
      </div>

      {/* Churn risk */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="font-bold text-slate-800 text-sm mb-1 flex items-center gap-2"><AlertTriangle size={16} className="text-rose-500" /> تنبيه خطر المغادرة (Churn Risk)</h3>
        <p className="text-xs text-slate-400 mb-3">حسابات: أكثر من 5 تذاكر/30 يوم · أو CSAT&lt;3 · أو تذكرة P1 كسرت الـ SLA.</p>
        {churn.loading ? <p className="text-slate-400 text-sm">جارٍ…</p>
          : churn.data.length === 0 ? <p className="text-slate-400 text-sm py-4 text-center">لا حسابات في خطر ✓</p>
            : <div className="space-y-2">{churn.data.map((c) => (
              <div key={c.accountId} className="flex items-center justify-between p-2.5 rounded-xl border border-rose-100 bg-rose-50/40">
                <div><p className="text-sm font-semibold text-slate-700">{c.accountName}</p><p className="text-xs text-slate-400">{c.tickets30d} تذكرة/30يوم · CSAT {c.avgRecentCsat} · {c.riskReason}</p></div>
                <span className="text-[10px] font-bold bg-rose-50 text-rose-600 border border-rose-200 px-2 py-0.5 rounded-full">At Risk</span>
              </div>
            ))}</div>}
      </div>

      {/* SLA reference */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="font-bold text-slate-800 text-sm mb-3">مرجع الـ SLA حسب الأولوية</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {(['p1', 'p2', 'p3', 'p4'] as const).map((p) => (
            <div key={p} className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
              <p className="text-sm font-bold text-slate-700">{TICKET_PRIORITY_LABEL[p]}</p>
              <p className="text-xs text-slate-500 mt-1">رد أول: {SLA_REFERENCE[p].frt >= 60 ? `${SLA_REFERENCE[p].frt / 60} ساعة` : `${SLA_REFERENCE[p].frt} دقيقة`}</p>
              <p className="text-xs text-slate-500">الحل: {SLA_REFERENCE[p].ttr >= 60 ? `${SLA_REFERENCE[p].ttr / 60} ساعة` : `${SLA_REFERENCE[p].ttr} دقيقة`}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
