/**
 * ApprovalsPage — موافقات الخصم: البتّ (موافقة/رفض) مع سبب الطلب وبيانات الصفقة.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck, Check, X } from 'lucide-react';
import {
  crmApprovalService, type CrmDiscountApproval,
  APPROVAL_LEVEL_LABEL,
} from '../../../services/sdk';
import { useApprovals } from './useQuotes';
import { CRM_BASE } from '../crmCatalog';

const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-600 border-amber-200',
  approved: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  rejected: 'bg-rose-50 text-rose-600 border-rose-200',
};
const STATUS_LABEL: Record<string, string> = { pending: 'معلّق', approved: 'موافق عليه', rejected: 'مرفوض' };

export default function ApprovalsPage() {
  const { data: approvals, loading, reload } = useApprovals();
  const [busy, setBusy] = useState<string | null>(null);

  const decide = async (a: CrmDiscountApproval, approve: boolean) => {
    setBusy(a.id);
    try { await crmApprovalService.decide(a.id, approve); reload(); } catch { /* noop */ } finally { setBusy(null); }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">حوكمة الخصومات: كل خصم فوق 10% يمرّ عبر موافقة حسب النسبة (≤20% مدير المبيعات · ≤35% المدير التجاري + CEO · فوق 35% ممنوع).</p>

      {loading ? <p className="text-slate-400 text-sm text-center py-10">جارٍ التحميل…</p>
        : approvals.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center"><BadgeCheck size={32} className="mx-auto text-slate-300" /><p className="text-slate-500 mt-3 font-semibold">لا طلبات موافقة</p></div>
          : <div className="space-y-2">{approvals.map((a) => (
            <div key={a.id} className="bg-white rounded-2xl border border-slate-200 p-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-black text-slate-800">خصم {a.discount_pct}%</p>
                    <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full ${STATUS_COLOR[a.status]}`}>{STATUS_LABEL[a.status]}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">المستوى المطلوب: {APPROVAL_LEVEL_LABEL[a.required_level]}{a.deal_value ? ` · قيمة الصفقة ${Number(a.deal_value).toLocaleString('ar')}` : ''}</p>
                  {a.reason && <p className="text-sm text-slate-600 mt-1">السبب: {a.reason}</p>}
                  <Link to={`${CRM_BASE}/quotes/detail/${a.quote_id}`} className="text-xs text-cyan-600 hover:underline mt-1 inline-block">عرض العرض ←</Link>
                </div>
                {a.status === 'pending' && (
                  <div className="flex gap-2">
                    <button onClick={() => decide(a, true)} disabled={busy === a.id} className="flex items-center gap-1 text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-700 disabled:opacity-60"><Check size={13} /> موافقة</button>
                    <button onClick={() => decide(a, false)} disabled={busy === a.id} className="flex items-center gap-1 text-xs bg-rose-50 text-rose-600 border border-rose-200 px-3 py-1.5 rounded-lg hover:bg-rose-100 disabled:opacity-60"><X size={13} /> رفض</button>
                  </div>
                )}
              </div>
            </div>
          ))}</div>}
    </div>
  );
}
