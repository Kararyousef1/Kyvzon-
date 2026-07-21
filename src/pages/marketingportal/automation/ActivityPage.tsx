/**
 * ═════════════════════════════════════════════════════════════════════════
 *  ActivityPage — النشاط والتحليلات (Action Log + KPIs)
 *  KPIs (Open/CTR/Completion/Unsubscribe) · توزيع التصنيف والـ pipeline ·
 *  سجل تنفيذ الإجراءات (Action Center) مع حالة كل إجراء.
 * ═════════════════════════════════════════════════════════════════════════
 */

import { Mail, MessageSquare, Bell, ArrowLeftRight, Tag, Database } from 'lucide-react';
import { useActionLog, useKpis, ACTION_LABEL, TEMPERATURE_LABEL, PIPELINE_LABEL } from './useAutomation';

const CHANNEL_ICON: Record<string, typeof Mail> = {
  email: Mail, sms: MessageSquare, whatsapp: MessageSquare, internal: Bell, crm: Database,
};
const ACTION_ICON: Record<string, typeof Mail> = {
  send_email: Mail, send_sms: MessageSquare, send_whatsapp: MessageSquare,
  add_tag: Tag, remove_tag: Tag, change_pipeline_stage: ArrowLeftRight, internal_notification: Bell,
};
const STATUS_LABEL: Record<string, string> = {
  simulated: 'محاكاة (بانتظار الربط)', queued: 'في الطابور', sent: 'أُرسل', delivered: 'وُصِّل',
  opened: 'فُتح', clicked: 'نُقر', bounced: 'ارتد', unsubscribed: 'إلغاء اشتراك', failed: 'فشل',
};
const STATUS_COLOR: Record<string, string> = {
  simulated: 'bg-violet-50 text-violet-600 border-violet-200',
  sent: 'bg-sky-50 text-sky-600 border-sky-200',
  delivered: 'bg-sky-50 text-sky-600 border-sky-200',
  opened: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  clicked: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  bounced: 'bg-rose-50 text-rose-600 border-rose-200',
  failed: 'bg-rose-50 text-rose-600 border-rose-200',
  unsubscribed: 'bg-amber-50 text-amber-600 border-amber-200',
};
const TEMP_BAR: Record<string, string> = {
  cold: 'bg-sky-400', warm: 'bg-amber-400', hot: 'bg-orange-400', sales_ready: 'bg-emerald-500',
};

function Kpi({ label, value, target }: { label: string; value: string; target?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-2xl font-black text-slate-800">{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
      {target && <p className="text-[10px] text-slate-400 mt-1">الهدف المرجعي: {target}</p>}
    </div>
  );
}

export default function ActivityPage() {
  const { data: kpi, loading: kLoading } = useKpis();
  const { data: log, loading: lLoading } = useActionLog();

  const tempTotal = Object.values(kpi.byTemperature).reduce((a, b) => a + b, 0) || 1;
  const pipeTotal = Object.values(kpi.byPipeline).reduce((a, b) => a + b, 0) || 1;

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="معدل الفتح (Open Rate)" value={kLoading ? '…' : `${kpi.openRate}%`} target="20-30%" />
        <Kpi label="معدل النقر (CTR)" value={kLoading ? '…' : `${kpi.clickThroughRate}%`} target="2-5%" />
        <Kpi label="إكمال الرحلات" value={kLoading ? '…' : `${kpi.workflowCompletionRate}%`} target="50-70%" />
        <Kpi label="إلغاء الاشتراك" value={kLoading ? '…' : `${kpi.unsubscribeRate}%`} target="< 0.5%" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* توزيع التصنيف */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="font-black text-slate-800 mb-4">توزيع العملاء حسب التصنيف</h3>
          <div className="space-y-3">
            {(['sales_ready', 'hot', 'warm', 'cold'] as const).map((t) => {
              const v = kpi.byTemperature[t];
              return (
                <div key={t}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-600">{TEMPERATURE_LABEL[t]}</span>
                    <span className="text-slate-400">{v}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className={`h-full ${TEMP_BAR[t]}`} style={{ width: `${(v / tempTotal) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* توزيع الـ pipeline */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="font-black text-slate-800 mb-4">مراحل الـ Pipeline (CRM)</h3>
          <div className="space-y-3">
            {(['not_contacted', 'contacted', 'negotiation', 'won', 'lost'] as const).map((p) => {
              const v = kpi.byPipeline[p];
              return (
                <div key={p}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-600">{PIPELINE_LABEL[p]}</span>
                    <span className="text-slate-400">{v}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full bg-fuchsia-500" style={{ width: `${(v / pipeTotal) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* سجل الإجراءات */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-black text-slate-800">سجل تنفيذ الإجراءات (Action Center)</h3>
          <span className="text-xs text-slate-400">{log.length} إجراء</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs">
              <tr>
                <th className="text-right font-semibold px-5 py-2.5">الإجراء</th>
                <th className="text-right font-semibold px-5 py-2.5">القناة</th>
                <th className="text-center font-semibold px-5 py-2.5">الحالة</th>
                <th className="text-right font-semibold px-5 py-2.5">الوقت</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lLoading ? (
                <tr><td colSpan={4} className="text-center py-8 text-slate-400">جارٍ التحميل…</td></tr>
              ) : log.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-8 text-slate-400">لا نشاط بعد — شغّل رحلة لعميل لرؤية الإجراءات هنا.</td></tr>
              ) : log.map((a) => {
                const AIcon = ACTION_ICON[a.action_type] || Database;
                const CIcon = a.channel ? CHANNEL_ICON[a.channel] : Database;
                return (
                  <tr key={a.id} className="hover:bg-slate-50/60">
                    <td className="px-5 py-2.5">
                      <div className="flex items-center gap-2">
                        <AIcon size={15} className="text-slate-400" />
                        <span className="text-slate-700">{ACTION_LABEL[a.action_type] || a.action_type}</span>
                      </div>
                    </td>
                    <td className="px-5 py-2.5 text-slate-500 text-xs">
                      <span className="inline-flex items-center gap-1">
                        {CIcon && <CIcon size={13} />} {a.channel || '—'}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 text-center">
                      <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full ${STATUS_COLOR[a.status] || 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                        {STATUS_LABEL[a.status] || a.status}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 text-xs text-slate-400">{new Date(a.created_at).toLocaleString('ar')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
