/**
 * EmailOverview — نظرة عامة على وحدة البريد: KPIs + أفضل الأوقات + جدول المصادقة.
 */
import { useNavigate } from 'react-router-dom';
import { Send, Eye, MousePointerClick, ShieldAlert, CalendarClock, Clock } from 'lucide-react';
import { BEST_SEND_TIMES, AUTH_DELIVERABILITY } from '../../../services/sdk';
import { useOverallKpis } from './useEmail';
import { MARKETING_BASE } from '../marketingCatalog';

function Stat({ icon: Icon, label, value, target }: { icon: typeof Send; label: string; value: string; target?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="w-9 h-9 rounded-xl bg-fuchsia-50 text-fuchsia-600 flex items-center justify-center"><Icon size={18} /></div>
      <p className="text-2xl font-black text-slate-800 mt-3">{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
      {target && <p className="text-[10px] text-slate-400 mt-1">الهدف: {target}</p>}
    </div>
  );
}

export default function EmailOverview() {
  const { data: k, loading } = useOverallKpis();
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat icon={Send} label="رسائل مُرسلة" value={loading ? '…' : String(k.sent)} />
        <Stat icon={Eye} label="معدل الفتح (Open Rate)" value={loading ? '…' : `${k.openRate}%`} target="20-35%" />
        <Stat icon={MousePointerClick} label="النقر إلى الفتح (CTOR)" value={loading ? '…' : `${k.ctor}%`} target="15-25%" />
        <Stat icon={ShieldAlert} label="إلغاء الاشتراك" value={loading ? '…' : `${k.unsubscribeRate}%`} target="< 0.5%" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2 mb-1"><CalendarClock size={18} className="text-fuchsia-600" /><h2 className="font-black text-slate-800">أفضل أيام الإرسال</h2></div>
          <p className="text-xs text-slate-500 mb-4">بيانات مجمّعة 2023-2025.</p>
          <div className="space-y-2">
            {BEST_SEND_TIMES.days.map((d) => (
              <div key={d.day} className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-fuchsia-600 text-white text-xs font-bold flex items-center justify-center">{d.rank}</span>
                  <span className="text-sm font-semibold text-slate-700">{d.day}</span>
                </div>
                <span className="text-xs text-slate-400">{d.note}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2 mb-1"><Clock size={18} className="text-fuchsia-600" /><h2 className="font-black text-slate-800">الأوقات المثلى</h2></div>
          <p className="text-xs text-slate-500 mb-4">حسب نوع الجمهور.</p>
          <div className="space-y-2">
            {BEST_SEND_TIMES.windows.map((w) => (
              <div key={w.audience} className="rounded-xl border border-slate-100 px-3 py-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-700">{w.audience}</span>
                  <span className="text-sm text-fuchsia-600 font-semibold">{w.time}</span>
                </div>
                {w.note && <p className="text-[11px] text-slate-400 mt-0.5">{w.note}</p>}
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="font-black text-slate-800 mb-1">أثر المصادقة على وصول الرسائل</h2>
        <p className="text-xs text-slate-500 mb-4">SPF + DKIM + DMARC يرفعون الوصول لصندوق الوارد إلى ~98%.</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {AUTH_DELIVERABILITY.map((a, i) => (
            <div key={a.scenario} className={`rounded-xl border p-4 ${i === 3 ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-100'}`}>
              <p className="text-2xl font-black text-slate-800">{a.rate}</p>
              <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">{a.scenario}</p>
            </div>
          ))}
        </div>
        <button onClick={() => navigate(`${MARKETING_BASE}/email/infra`)}
          className="mt-4 text-sm bg-fuchsia-600 text-white px-4 py-2 rounded-xl hover:bg-fuchsia-700">إعداد البنية التقنية</button>
      </section>
    </div>
  );
}
