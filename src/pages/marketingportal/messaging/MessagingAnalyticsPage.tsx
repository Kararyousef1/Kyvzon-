/**
 * MessagingAnalyticsPage — تحليلات SMS و WhatsApp (Delivery/Open/Click/Opt-out) مع الأهداف.
 */
import { Smartphone, MessageCircle } from 'lucide-react';
import { MESSAGING_KPI_TARGETS, type MessagingKpis } from '../../../services/sdk';
import { useSmsKpis, useWaKpis } from './useMessaging';

function Panel({ icon: Icon, title, k, loading }: { icon: typeof Smartphone; title: string; k: MessagingKpis; loading: boolean }) {
  const rows = [
    { l: 'مُرسل', v: loading ? '…' : String(k.sent) },
    { l: 'نسبة التسليم', v: loading ? '…' : `${k.deliveryRate}%`, t: MESSAGING_KPI_TARGETS.deliveryRate },
    { l: 'قُرئ', v: loading ? '…' : String(k.read) },
    { l: 'نقرات', v: loading ? '…' : String(k.clicked) },
    { l: 'نسبة النقر', v: loading ? '…' : `${k.clickRate}%`, t: MESSAGING_KPI_TARGETS.clickRate },
    { l: 'نسبة الإلغاء (Opt-out)', v: loading ? '…' : `${k.optOutRate}%`, t: MESSAGING_KPI_TARGETS.optOutRate },
  ];
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-2 mb-4"><div className="w-9 h-9 rounded-xl bg-fuchsia-50 text-fuchsia-600 flex items-center justify-center"><Icon size={18} /></div><h2 className="font-black text-slate-800">{title}</h2></div>
      <div className="grid grid-cols-2 gap-3">
        {rows.map((r) => (
          <div key={r.l} className="rounded-xl border border-slate-100 p-3">
            <p className="text-xl font-black text-slate-800">{r.v}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">{r.l}</p>
            {r.t && <p className="text-[10px] text-slate-400 mt-0.5">الهدف: {r.t}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function MessagingAnalyticsPage() {
  const { data: sms, loading: sLoad } = useSmsKpis();
  const { data: wa, loading: wLoad } = useWaKpis();
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel icon={Smartphone} title="SMS" k={sms} loading={sLoad} />
        <Panel icon={MessageCircle} title="واتساب" k={wa} loading={wLoad} />
      </div>
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
        تشمل هذه التحليلات رسائل الحملات + رسائل الأتمتة (الوحدة 1). كل خطوة SMS/واتساب في محرك الأتمتة تُسجَّل هنا تلقائياً، مع احترام الموافقة و opt-out.
      </div>
    </div>
  );
}
