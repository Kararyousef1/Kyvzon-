/**
 * QuotesOverview — تحليلات العروض + تنبيهات تجديد العقود + الموافقات المعلّقة.
 */
import { Link } from 'react-router-dom';
import { FileSignature, Trophy, Percent, Clock, BadgeCheck, ScrollText } from 'lucide-react';
import {
  crmQuoteService, crmContractService,
  type QuoteAnalytics, type ContractRenewalAlert,
  RENEWAL_ALERT_LABEL,
} from '../../../services/sdk';
import { useApprovals, useAsync } from './useQuotes';
import { CRM_BASE } from '../crmCatalog';

const ALERT_COLOR: Record<ContractRenewalAlert['alertLevel'], string> = {
  expired: 'bg-rose-50 text-rose-600 border-rose-200',
  escalate: 'bg-amber-50 text-amber-600 border-amber-200',
  renewal: 'bg-sky-50 text-sky-600 border-sky-200',
  ok: 'bg-slate-100 text-slate-500 border-slate-200',
};

export default function QuotesOverview() {
  const analytics = useAsync<QuoteAnalytics | null>(() => crmQuoteService.analytics(), null);
  const alerts = useAsync<ContractRenewalAlert[]>(() => crmContractService.renewalAlerts(), []);
  const approvals = useApprovals();
  const pending = approvals.data.filter((a) => a.status === 'pending');

  const a = analytics.data;
  const cards = [
    { label: 'إجمالي العروض', value: a?.totalQuotes ?? 0, icon: FileSignature, color: 'text-cyan-600 bg-cyan-50' },
    { label: 'Quote-to-Close', value: `${a?.closeRate ?? 0}%`, icon: Trophy, color: 'text-emerald-600 bg-emerald-50', hint: 'الهدف 30-50%' },
    { label: 'متوسط الخصم', value: `${a?.avgDiscount ?? 0}%`, icon: Percent, color: 'text-amber-600 bg-amber-50', hint: 'الهدف ≤15%' },
    { label: 'متوسط وقت التوقيع', value: `${a?.avgSignDays ?? 0} يوم`, icon: Clock, color: 'text-blue-600 bg-blue-50', hint: 'الهدف <7 أيام' },
  ];

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-slate-200 bg-white p-5">
        <h2 className="font-black text-slate-800 mb-1">مقاييس أداء العروض</h2>
        <p className="text-xs text-slate-400 mb-4">سرعة العرض ودقّته حاسمة في الإغلاق — 76% من فرق B2B يعتبرونها بالغة الأهمية.</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {cards.map((c) => {
            const Icon = c.icon;
            return (
              <div key={c.label} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${c.color}`}><Icon size={17} /></div>
                <p className="text-2xl font-black text-slate-800 mt-2.5">{analytics.loading ? '…' : c.value}</p>
                <p className="text-[11px] text-slate-400">{c.label}</p>
                {c.hint && <p className="text-[10px] text-slate-300 mt-0.5">{c.hint}</p>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pending approvals */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="font-bold text-slate-800 text-sm mb-3 flex items-center gap-2"><BadgeCheck size={16} className="text-amber-500" /> موافقات الخصم المعلّقة ({pending.length})</h3>
          {approvals.loading ? <p className="text-slate-400 text-sm">جارٍ…</p>
            : pending.length === 0 ? <p className="text-slate-400 text-sm py-4 text-center">لا موافقات معلّقة ✓</p>
              : <div className="space-y-2">{pending.slice(0, 5).map((ap) => (
                <Link to={`${CRM_BASE}/quotes/approvals`} key={ap.id} className="flex items-center justify-between p-2.5 rounded-xl border border-slate-100 hover:border-cyan-300">
                  <div><p className="text-sm font-semibold text-slate-700">خصم {ap.discount_pct}%</p><p className="text-xs text-slate-400">{ap.reason || '—'}</p></div>
                  <span className="text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-200 px-2 py-0.5 rounded-full">بانتظار البت</span>
                </Link>
              ))}</div>}
        </div>

        {/* Renewal alerts */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="font-bold text-slate-800 text-sm mb-3 flex items-center gap-2"><ScrollText size={16} className="text-cyan-600" /> تنبيهات تجديد العقود ({alerts.data.length})</h3>
          {alerts.loading ? <p className="text-slate-400 text-sm">جارٍ…</p>
            : alerts.data.length === 0 ? <p className="text-slate-400 text-sm py-4 text-center">لا عقود قاربت على الانتهاء ✓</p>
              : <div className="space-y-2">{alerts.data.slice(0, 5).map((al) => (
                <Link to={`${CRM_BASE}/quotes/contracts`} key={al.contractId} className="flex items-center justify-between p-2.5 rounded-xl border border-slate-100 hover:border-cyan-300">
                  <div><p className="text-sm font-semibold text-slate-700">{al.title}</p><p className="text-xs text-slate-400">{al.daysToEnd} يوم على الانتهاء · {al.endDate}</p></div>
                  <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full ${ALERT_COLOR[al.alertLevel]}`}>{RENEWAL_ALERT_LABEL[al.alertLevel]}</span>
                </Link>
              ))}</div>}
        </div>
      </div>
    </div>
  );
}
