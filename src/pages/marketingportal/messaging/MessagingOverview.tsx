/**
 * MessagingOverview — نظرة عامة: KPIs لكل قناة + أنواع SMS + مقارنة SMS/WhatsApp.
 */
import { Smartphone, MessageCircle } from 'lucide-react';
import { SMS_TYPE_META, SMS_VS_WA, type SmsType } from '../../../services/sdk';
import { useSmsKpis, useWaKpis } from './useMessaging';

export default function MessagingOverview() {
  const { data: sms, loading: sLoad } = useSmsKpis();
  const { data: wa, loading: wLoad } = useWaKpis();
  const smsTypes = Object.entries(SMS_TYPE_META) as Array<[SmsType, { label: string; desc: string }]>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[
          { icon: Smartphone, title: 'SMS', k: sms, loading: sLoad },
          { icon: MessageCircle, title: 'واتساب', k: wa, loading: wLoad },
        ].map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.title} className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex items-center gap-2 mb-4"><div className="w-9 h-9 rounded-xl bg-fuchsia-50 text-fuchsia-600 flex items-center justify-center"><Icon size={18} /></div><h2 className="font-black text-slate-800">{c.title}</h2></div>
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center"><p className="text-xl font-black text-slate-800">{c.loading ? '…' : c.k.sent}</p><p className="text-[11px] text-slate-500">مُرسل</p></div>
                <div className="text-center"><p className="text-xl font-black text-slate-800">{c.loading ? '…' : `${c.k.deliveryRate}%`}</p><p className="text-[11px] text-slate-500">تسليم</p></div>
                <div className="text-center"><p className="text-xl font-black text-slate-800">{c.loading ? '…' : `${c.k.optOutRate}%`}</p><p className="text-[11px] text-slate-500">إلغاء</p></div>
              </div>
            </div>
          );
        })}
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="font-black text-slate-800 mb-1">أنواع رسائل SMS الأربعة</h2>
        <p className="text-xs text-slate-500 mb-4">كل نوع له قواعد توقيت وامتثال مختلفة.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {smsTypes.map(([k, m]) => (
            <div key={k} className="rounded-xl border border-slate-100 p-4">
              <p className="font-bold text-slate-800">{m.label}</p>
              <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">{m.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="font-black text-slate-800 mb-4">SMS مقابل WhatsApp</h2>
        <table className="w-full text-sm">
          <thead className="text-xs text-slate-400"><tr><th className="text-right pb-2">المعيار</th><th className="text-center pb-2">SMS</th><th className="text-center pb-2">WhatsApp</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {SMS_VS_WA.map((r) => (
              <tr key={r.metric}><td className="py-2 font-semibold text-slate-700">{r.metric}</td><td className="py-2 text-center text-slate-600">{r.sms}</td><td className="py-2 text-center text-slate-600">{r.wa}</td></tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
